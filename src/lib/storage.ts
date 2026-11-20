import type { ChoiceLogEntry, SimInputs } from '../simulation/types';
import { validateInputs, validateReplaySource } from './share';
import type { Speed } from '../store/simStore';

const RUN_KEY = 'wealth-life:run';
const INPUTS_KEY = 'wealth-life:last-inputs';

export interface SavedRun {
  v: 1;
  inputs: SimInputs;
  seed: string;
  choices: ChoiceLogEntry[];
  // 已结算年数（= 下一个待推进年的 yearIndex）；eventPending 时待决年恰为该游标。
  nextYearIndex: number;
  playback: 'playing' | 'paused' | 'eventPending' | 'finished';
  speed: Speed;
}

export function saveRun(run: SavedRun): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    // 存储不可用（隐私模式/配额）时静默降级为无持久化。
  }
}

export function loadRun(): SavedRun | null {
  let raw: unknown;
  try {
    const text = localStorage.getItem(RUN_KEY);
    if (!text) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const base = validateReplaySource(raw);
  if (typeof base === 'string') return null;
  const maxYears = base.inputs.endAge - base.inputs.startAge;
  if (
    !Number.isInteger(o.nextYearIndex) ||
    (o.nextYearIndex as number) < 0 ||
    (o.nextYearIndex as number) > maxYears
  )
    return null;
  if (!['playing', 'paused', 'eventPending', 'finished'].includes(o.playback as string)) return null;
  if (![1, 2, 4].includes(o.speed as number)) return null;
  if (base.choices.some((c) => c.yearIndex >= (o.nextYearIndex as number))) return null;
  return {
    v: 1,
    inputs: base.inputs,
    seed: base.seed,
    choices: base.choices,
    nextYearIndex: o.nextYearIndex as number,
    playback: o.playback as SavedRun['playback'],
    speed: o.speed as Speed,
  };
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // ignore
  }
}

export function saveLastInputs(inputs: SimInputs): void {
  try {
    localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs));
  } catch {
    // ignore
  }
}

export function loadLastInputs(): SimInputs | null {
  try {
    const text = localStorage.getItem(INPUTS_KEY);
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const result = validateInputs(raw);
    return typeof result === 'string' ? null : result;
  } catch {
    return null;
  }
}