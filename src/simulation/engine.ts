import { createRng } from './rng';
import { compareMoney } from './money';
import { goalForYear, initialGoal } from './goals';
import { isBankrupt, isFire } from './endings';
import { DEFAULT_CONFIG } from './config';
import { pickEvent } from '../events/matcher';
import type {
  ChoiceLogEntry,
  EventDef,
  Modifier,
  SimConfig,
  SimInputs,
  SimState,
  SimStatus,
  YearState,
} from './types';

export function createInitialState(
  inputs: SimInputs,
  seed: string,
  config: SimConfig = DEFAULT_CONFIG,
  eventPool: readonly EventDef[] = [],
): SimState {
  if (inputs.endAge <= inputs.startAge) throw new Error('endAge 必须大于 startAge');
  const fireAtStart = isFire(inputs.initialAssets, initialGoal(inputs, config));
  return {
    inputs,
    config,
    seed,
    years: [],
    modifiers: [],
    flags: new Set<string>(),
    flagTimers: [],
    status: fireAtStart ? 'fire' : 'running',
    negativeYears: 0,
    pending: null,
    eventPool,
    scheduledEvents: [],
    scheduledCash: [],
  };
}

export interface StepResult {
  state: SimState;
  year: YearState;
  pendingEvent: EventDef | null;
}

export function stepYear(state: SimState, choice?: ChoiceLogEntry): StepResult {
  if (state.status !== 'running') {
    throw new Error(`模拟已结束（${state.status}），不能继续步进`);
  }
  if (state.pending) {
    if (!choice) throw new Error('存在待决策事件，必须提供 choice 才能完成该年');
    return finalizeEventYear(state, choice);
  }
  return computeYear(state);
}

function terminalStatus(
  inputs: SimInputs,
  config: SimConfig,
  year: YearState,
  negativeYears: number,
): SimStatus {
  if (isFire(year.assets, year.goalAmount)) return 'fire';
  if (isBankrupt(year.assets, year.expenses, negativeYears, config)) return 'bankrupt';
  if (inputs.startAge + year.yearIndex + 1 >= inputs.endAge) return 'end';
  return 'running';
}

export function calculateFinancialYear(
  inputs: SimInputs,
  config: SimConfig,
  seed: string,
  t: number,
  assetsStart: number,
  modifiers: readonly Modifier[] = [],
): YearState {
  const incomeMult = modifiers
    .filter((m) => m.kind === 'incomeMult')
    .reduce((acc, m) => acc * m.factor, 1);
  const expenseMult = modifiers
    .filter((m) => m.kind === 'expenseMult')
    .reduce((acc, m) => acc * m.factor, 1);
  const returnDelta = modifiers
    .filter((m) => m.kind === 'returnDelta')
    .reduce((acc, m) => acc + m.factor, 0);
  const income = inputs.annualIncome * Math.pow(1 + config.incomeGrowth, t) * incomeMult;
  const expenses = inputs.annualExpenses * Math.pow(1 + config.inflation, t) * expenseMult;
  const sample = createRng(seed, `market:${t}`).normal();
  const marketReturn = Math.max(
    config.marketMean + config.marketStd * sample + returnDelta,
    config.returnFloor,
  );
  const rate = compareMoney(assetsStart, 0) >= 0 ? marketReturn : config.debtRate;
  const assets = assetsStart * (1 + rate) + income - expenses;
  return {
    yearIndex: t,
    age: inputs.startAge + t,
    calendarYear: inputs.startYear + t,
    assetsStart,
    assets,
    income,
    expenses,
    marketReturn,
    goalAmount: goalForYear(inputs, config, t, expenses),
    eventId: null,
    choiceId: null,
  };
}

function computeYear(state: SimState): StepResult {
  const { inputs, config, seed } = state;
  const t = state.years.length;
  const assetsStart = t === 0 ? inputs.initialAssets : state.years[t - 1].assets;
  const modifiers = state.modifiers.filter((m) => m.expiresAtYear === null || m.expiresAtYear > t);
  const flagTimers = state.flagTimers.filter((ft) => ft.expiresAtYear > t);
  const expiredFlags = new Set(
    state.flagTimers.filter((ft) => ft.expiresAtYear <= t).map((ft) => ft.flag),
  );
  const flags =
    expiredFlags.size > 0
      ? new Set([...state.flags].filter((f) => !expiredFlags.has(f)))
      : state.flags;

  const financialYear = calculateFinancialYear(inputs, config, seed, t, assetsStart, modifiers);
  let assets = financialYear.assets;

  // 延迟现金在当年现金流之后、结局判定之前到账，体现在当年曲线点。
  let scheduledCashApplied = 0;
  const remainingCash = [];
  for (const sc of state.scheduledCash) {
    if (sc.dueYear > t) {
      remainingCash.push(sc);
      continue;
    }
    const roll = createRng(seed, `event:${t}:scheduled:${sc.sourceEventId}`).next();
    if (roll < sc.probability) scheduledCashApplied += sc.amount;
  }
  assets += scheduledCashApplied;

  const negativeYears = compareMoney(assets, 0) < 0 ? state.negativeYears + 1 : 0;

  const year: YearState = {
    ...financialYear,
    assets,
    ...(scheduledCashApplied !== 0 ? { scheduledCashApplied } : {}),
  };

  const withScheduled = { ...state, modifiers, flags, flagTimers, negativeYears, scheduledCash: remainingCash };
  const makePending = (event: EventDef): StepResult => {
    const pendingYear = { ...year, eventId: event.id };
    return {
      state: { ...withScheduled, pending: { year: pendingYear, event } },
      year: pendingYear,
      pendingEvent: event,
    };
  };

  // 首次负资产：先给债务救援机会，判定推迟到选择之后（SIMULATION 4.2 / 5.3）。
  const rescue = state.eventPool.find((d) => d.id === 'debt-crisis');
  const rescueUsed = state.years.some((y) => y.eventId === 'debt-crisis');
  if (compareMoney(assets, 0) < 0 && rescue && !rescueUsed) {
    return makePending(rescue);
  }

  const status = terminalStatus(inputs, config, year, negativeYears);
  if (status === 'running') {
    // 延迟剧情事件绕过普通概率，到期强制触发。
    const dueIndex = state.scheduledEvents.findIndex((se) => se.dueYear <= t);
    if (dueIndex >= 0) {
      const due = state.scheduledEvents[dueIndex];
      const def = state.eventPool.find((d) => d.id === due.eventId);
      const scheduledEvents = state.scheduledEvents.filter((_, i) => i !== dueIndex);
      if (def) {
        const result = makePending(def);
        return { ...result, state: { ...result.state, scheduledEvents } };
      }
      return {
        state: { ...withScheduled, scheduledEvents, years: [...state.years, year], status },
        year,
        pendingEvent: null,
      };
    }
    const event = pickEvent(withScheduled, year);
    if (event) return makePending(event);
  }

  return {
    state: { ...withScheduled, years: [...state.years, year], status },
    year,
    pendingEvent: null,
  };
}

function finalizeEventYear(state: SimState, choice: ChoiceLogEntry): StepResult {
  const pending = state.pending!;
  const { year, event } = pending;
  if (choice.yearIndex !== year.yearIndex || choice.eventId !== event.id) {
    throw new Error(`choice 与待决策事件不匹配：${choice.eventId}@${choice.yearIndex}`);
  }
  const eventChoice = event.choices.find((c) => c.id === choice.choiceId);
  if (!eventChoice) throw new Error(`事件 ${event.id} 不存在选项 ${choice.choiceId}`);

  const t = year.yearIndex;
  const effectRng = createRng(state.seed, `event:${t}:effects`);
  let cash = 0;
  const newModifiers: Modifier[] = [];
  const flags = new Set(state.flags);
  let flagTimers = [...state.flagTimers];
  const scheduledEvents = [...state.scheduledEvents];
  const scheduledCash = [...state.scheduledCash];

  for (const effect of eventChoice.effects) {
    if (effect.condition?.requiresFlags?.some((f) => !flags.has(f))) continue;
    if (effect.condition?.excludesFlags?.some((f) => flags.has(f))) continue;
    switch (effect.type) {
      case 'cash':
        if (effect.probability === undefined || effectRng.next() < effect.probability) {
          cash += effect.amount;
        }
        break;
      case 'cashRelative': {
        if (effect.probability !== undefined && effectRng.next() >= effect.probability) break;
        const basis =
          effect.basis === 'assetsNow'
            ? year.assets
            : effect.basis === 'annualIncome'
              ? year.income
              : state.inputs.initialAssets;
        cash += basis * effect.ratio;
        break;
      }
      case 'incomeMult':
      case 'expenseMult':
      case 'returnDelta':
        newModifiers.push({
          kind: effect.type,
          factor: effect.type === 'returnDelta' ? effect.delta : effect.factor,
          // 生效区间 [t+1, t+d]，在 t+d+1 年的修正结算步骤被移除。
          expiresAtYear: effect.durationYears === 'permanent' ? null : t + effect.durationYears + 1,
          sourceEventId: event.id,
        });
        break;
      case 'setFlag':
        flags.add(effect.flag);
        flagTimers = flagTimers.filter((ft) => ft.flag !== effect.flag);
        if (effect.durationYears !== undefined) {
          flagTimers.push({ flag: effect.flag, expiresAtYear: t + effect.durationYears + 1 });
        }
        break;
      case 'clearFlag':
        flags.delete(effect.flag);
        flagTimers = flagTimers.filter((ft) => ft.flag !== effect.flag);
        break;
      case 'scheduleEvent':
        scheduledEvents.push({ eventId: effect.eventId, dueYear: t + effect.afterYears });
        break;
      case 'scheduledCash':
        scheduledCash.push({
          dueYear: t + effect.afterYears,
          amount: effect.amount,
          probability: effect.probability ?? 1,
          sourceEventId: event.id,
        });
        break;
    }
  }

  const assets = year.assets + cash;
  let negativeYears = 0;
  if (compareMoney(assets, 0) < 0) {
    negativeYears = 1;
    for (let i = state.years.length - 1; i >= 0 && compareMoney(state.years[i].assets, 0) < 0; i--) negativeYears++;
  }
  const finalYear: YearState = { ...year, assets, choiceId: choice.choiceId, eventCash: cash };
  let status = terminalStatus(state.inputs, state.config, finalYear, negativeYears);
  const rescueAvailable = event.id !== 'debt-crisis'
    && state.eventPool.some((item) => item.id === 'debt-crisis')
    && !state.years.some((item) => item.eventId === 'debt-crisis');
  // 一年仅一个事件，首次救援机会留到次年，不能在此提前破产。
  if (status === 'bankrupt' && rescueAvailable) status = 'running';

  return {
    state: {
      ...state,
      years: [...state.years, finalYear],
      modifiers: [...state.modifiers, ...newModifiers],
      flags,
      flagTimers,
      negativeYears,
      status,
      pending: null,
      scheduledEvents,
      scheduledCash,
    },
    year: finalYear,
    pendingEvent: null,
  };
}

export function replay(
  inputs: SimInputs,
  seed: string,
  choices: readonly ChoiceLogEntry[] = [],
  config: SimConfig = DEFAULT_CONFIG,
  eventPool: readonly EventDef[] = [],
): SimState {
  let state = createInitialState(inputs, seed, config, eventPool);
  while (state.status === 'running') {
    if (state.pending) {
      // 同时校验 yearIndex 与 eventId：错误日志不得应用到不匹配的事件。
      const choice = choices.find(
        (c) =>
          c.yearIndex === state.pending!.year.yearIndex &&
          c.eventId === state.pending!.event.id,
      );
      if (!choice) break;
      if (!state.pending.event.choices.some((c) => c.id === choice.choiceId)) break;
      state = stepYear(state, choice).state;
    } else {
      state = stepYear(state).state;
    }
  }
  return state;
}

export function choiceLog(state: SimState): ChoiceLogEntry[] {
  return state.years
    .filter((y) => y.eventId !== null && y.choiceId !== null)
    .map((y) => ({ yearIndex: y.yearIndex, eventId: y.eventId!, choiceId: y.choiceId! }));
}
