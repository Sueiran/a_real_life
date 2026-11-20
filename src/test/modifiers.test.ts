import { describe, expect, it } from 'vitest';
import { createInitialState, stepYear } from '../simulation/engine';
import { baseInputs, flatConfig, makeEvent, simulateAll } from './fixtures';
import type { EventDef } from '../simulation/types';

const SEED = 'demo-seed-2026';

// 收入 100000、支出 100000、无增长无波动：incomeMult 的生效年份可直接从 income 序列读出。
const inputs = baseInputs({
  initialAssets: 0,
  annualIncome: 100000,
  annualExpenses: 100000,
  goal: { mode: 'manual', amount: 1e12 },
});

function incomeEvent(durationYears: number | 'permanent'): EventDef {
  return makeEvent({
    id: 'income-boost',
    once: true,
    choices: [
      { id: 'a', label: 'A', hint: '', effects: [{ type: 'incomeMult', factor: 2, durationYears }] },
    ],
  });
}

function runWithEvent(event: EventDef, years: number) {
  let state = createInitialState(inputs, SEED, flatConfig(), [event]);
  while (state.years.length < years && state.status === 'running') {
    if (state.pending) {
      const { year, event: ev } = state.pending;
      state = stepYear(state, { yearIndex: year.yearIndex, eventId: ev.id, choiceId: 'a' }).state;
    } else {
      state = stepYear(state).state;
    }
  }
  return state;
}

describe('Modifier 生命周期（事件年 t=2，从 t+1 生效）', () => {
  it('持续 1 年：仅第 3 年生效，第 4 年失效', () => {
    const state = runWithEvent(incomeEvent(1), 5);
    expect(state.years.map((y) => y.income)).toEqual([100000, 100000, 100000, 200000, 100000]);
  });

  it('持续 2 年：第 3、4 年生效，第 5 年失效', () => {
    const state = runWithEvent(incomeEvent(2), 5);
    expect(state.years.map((y) => y.income)).toEqual([100000, 100000, 100000, 200000, 200000]);
  });

  it('持续 3 年：第 3、4、5 年生效，第 6 年失效', () => {
    const state = runWithEvent(incomeEvent(3), 6);
    expect(state.years.map((y) => y.income)).toEqual([100000, 100000, 100000, 200000, 200000, 200000]);
  });

  it('expiresAtYear = t + d + 1', () => {
    const state = runWithEvent(incomeEvent(3), 3);
    expect(state.modifiers[0].expiresAtYear).toBe(6);
  });

  it('permanent 永不失效', () => {
    const state = runWithEvent(incomeEvent('permanent'), 5);
    expect(state.modifiers[0].expiresAtYear).toBeNull();
    expect(state.years.map((y) => y.income)).toEqual([100000, 100000, 100000, 200000, 200000]);
  });

  it('事件当年不生效（从次年开始）', () => {
    const state = runWithEvent(incomeEvent(3), 3);
    expect(state.years[2].income).toBe(100000);
  });
});

describe('多个 Modifier 叠加', () => {
  const flagger = makeEvent({
    id: 'flagger',
    once: true,
    choices: [
      {
        id: 'a',
        label: 'A',
        hint: '',
        effects: [
          { type: 'incomeMult', factor: 2, durationYears: 'permanent' },
          { type: 'returnDelta', delta: 0.01, durationYears: 'permanent' },
          { type: 'setFlag', flag: 'x' },
        ],
      },
    ],
  });
  const second = makeEvent({
    id: 'second',
    once: true,
    requiresFlags: ['x'],
    choices: [
      {
        id: 'a',
        label: 'A',
        hint: '',
        effects: [
          { type: 'incomeMult', factor: 3, durationYears: 'permanent' },
          { type: 'returnDelta', delta: 0.02, durationYears: 'permanent' },
          { type: 'expenseMult', factor: 0.5, durationYears: 'permanent' },
        ],
      },
    ],
  });

  it('incomeMult 叠乘（2×3=6）、returnDelta 叠加（+0.03）、expenseMult 叠乘', () => {
    const state = simulateAll(inputs, SEED, {
      config: flatConfig({ marketMean: 0.07 }),
      pool: [flagger, second],
    });
    const flaggerYear = state.years.find((y) => y.eventId === 'flagger')!;
    const secondYear = state.years.find((y) => y.eventId === 'second')!;
    // second 需要 flag x：只能在 flagger 之后触发，且受全局最小间隔约束。
    expect(secondYear.yearIndex - flaggerYear.yearIndex).toBeGreaterThanOrEqual(2);
    const y2 = state.years[secondYear.yearIndex + 1];
    expect(y2.income).toBeCloseTo(100000 * 6, 6);
    expect(y2.expenses).toBeCloseTo(100000 * 0.5, 6);
    expect(y2.marketReturn).toBeCloseTo(0.07 + 0.03, 6);
    expect(y2.income).toBeCloseTo(state.years[secondYear.yearIndex].income * 3, 6);
  });
});
