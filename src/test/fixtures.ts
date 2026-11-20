import { DEFAULT_CONFIG } from '../simulation/config';
import { createInitialState, stepYear } from '../simulation/engine';
import type { EventDef, SimConfig, SimInputs, SimState, YearState } from '../simulation/types';

export function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
  return {
    startAge: 30,
    startYear: 2026,
    initialAssets: 200000,
    annualIncome: 200000,
    annualExpenses: 120000,
    goal: { mode: 'auto' },
    endAge: 90,
    ...overrides,
  };
}

// 确定性数学用配置：无市场波动、无增长，便于手算断言。
export function flatConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    marketMean: 0,
    marketStd: 0,
    incomeGrowth: 0,
    inflation: 0,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<EventDef> = {}): EventDef {
  return {
    id: 'ev',
    category: 'career',
    weight: 1,
    minAge: 0,
    maxAge: 200,
    cooldownYears: 0,
    once: false,
    title: '测试事件',
    description: '测试用',
    choices: [{ id: 'a', label: 'A', hint: '', effects: [] }],
    ...overrides,
  };
}

export function simulateAll(
  inputs: SimInputs,
  seed: string,
  opts: {
    config?: SimConfig;
    pool?: EventDef[];
    choose?: (event: EventDef, year: YearState) => string;
  } = {},
): SimState {
  let state = createInitialState(inputs, seed, opts.config, opts.pool ?? []);
  let guard = 0;
  while (state.status === 'running' && guard++ < 500) {
    if (state.pending) {
      const { event, year } = state.pending;
      const choiceId = opts.choose?.(event, year) ?? event.choices[0].id;
      state = stepYear(state, { yearIndex: year.yearIndex, eventId: event.id, choiceId }).state;
    } else {
      state = stepYear(state).state;
    }
  }
  if (guard >= 500) throw new Error('模拟未在预期内终止');
  return state;
}
