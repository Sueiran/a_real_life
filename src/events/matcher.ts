import { createRng, type Rng } from '../simulation/rng';
import { compareMoney } from '../simulation/money';
import type { EventDef, SimState, YearState } from '../simulation/types';

const FIRST_EVENT_MIN_YEAR = 2;
const FIRST_EVENT_MAX_YEAR = 4;
const MIN_EVENT_GAP = 2;

export function pickEvent(state: SimState, year: YearState): EventDef | null {
  const t = year.yearIndex;
  const candidates = state.eventPool.filter(
    (def) => !def.forcedOnly && isEligible(def, state, year),
  );
  const rng = createRng(state.seed, `event:${t}`);

  let lastEventYear: number | null = null;
  for (const y of state.years) {
    if (y.eventId !== null) lastEventYear = y.yearIndex;
  }

  if (lastEventYear === null) {
    if (t < FIRST_EVENT_MIN_YEAR) return null;
    if (t <= FIRST_EVENT_MAX_YEAR) {
      // 首事件窗口：优先职业池建立代入感，无合格职业事件时回退到全部合格事件。
      const career = candidates.filter((d) => d.category === 'career');
      const pool = career.length > 0 ? career : candidates;
      return pool.length > 0 ? weightedDraw(pool, rng, state) : null;
    }
  } else if (t - lastEventYear < MIN_EVENT_GAP) {
    return null;
  }

  const gap = lastEventYear === null ? t : t - lastEventYear;
  const probability = Math.min(0.15 + 0.05 * gap, 0.5);
  if (rng.next() >= probability) return null;
  return candidates.length > 0 ? weightedDraw(candidates, rng, state) : null;
}

function weightedDraw(pool: readonly EventDef[], rng: Rng, state: SimState): EventDef {
  const weights = pool.map((def) => {
    let weight = def.weight;
    for (const mod of def.weightModifiers ?? []) {
      if (state.flags.has(mod.flag)) weight *= mod.multiplier;
    }
    return weight;
  });
  const total = weights.reduce((acc, w) => acc + w, 0);
  if (total <= 0) return pool[pool.length - 1];

  let roll = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function isEligible(def: EventDef, state: SimState, year: YearState): boolean {
  if (year.age < def.minAge || year.age > def.maxAge) return false;
  if (def.minAssets !== undefined && compareMoney(year.assets, def.minAssets) < 0) return false;
  if (def.maxAssets !== undefined && compareMoney(year.assets, def.maxAssets) > 0) return false;
  if (def.minMarketReturn !== undefined && year.marketReturn < def.minMarketReturn) return false;
  if (def.maxMarketReturn !== undefined && year.marketReturn > def.maxMarketReturn) return false;
  if (def.requiresFlags?.some((flag) => !state.flags.has(flag))) return false;
  if (def.excludesFlags?.some((flag) => state.flags.has(flag))) return false;

  const occurrences = state.years.filter((y) => y.eventId === def.id);
  if (def.once && occurrences.length > 0) return false;
  if (occurrences.length > 0) {
    const lastYear = occurrences[occurrences.length - 1].yearIndex;
    if (year.yearIndex - lastYear < def.cooldownYears) return false;
  }
  return true;
}
