import { describe, expect, it } from 'vitest';
import { createInitialState, stepYear } from '../simulation/engine';
import { simulateAll, baseInputs, flatConfig, makeEvent } from './fixtures';

const SEED = 'demo-seed-2026';

// 杠杆：+8% 收益 3 年 + leveraged flag 3 年；暴跌惩罚只在 flag 有效期内翻倍。
const leverage = makeEvent({
  id: 'leverage',
  once: true,
  choices: [
    {
      id: 'a',
      label: 'A',
      hint: '',
      effects: [
        { type: 'returnDelta', delta: 0.08, durationYears: 3 },
        { type: 'setFlag', flag: 'leveraged', durationYears: 3 },
      ],
    },
  ],
});

const crashAt = (minAge: number) =>
  makeEvent({
    id: `crash-${minAge}`,
    once: true,
    minAge,
    choices: [
      {
        id: 'a',
        label: 'A',
        hint: '',
        effects: [
          { type: 'cash', amount: -1000 },
          { type: 'cash', amount: -1000, condition: { requiresFlags: ['leveraged'] } },
        ],
      },
    ],
  });

describe('限期 flag 与修正同生命周期', () => {
  it('leveraged 在收益加成有效期内使惩罚翻倍', () => {
    // leverage 强制首事件 t=2（30 岁）；crash minAge 33 → t≥3，在 [3,5] 有效期内。
    const state = simulateAll(baseInputs(), SEED, {
      config: flatConfig(),
      pool: [leverage, crashAt(33)],
    });
    const crash = state.years.find((y) => y.eventId === 'crash-33')!;
    expect(crash.yearIndex).toBeLessThanOrEqual(5);
    expect(crash.eventCash).toBe(-2000);
  });

  it('收益加成到期后 flag 同步失效，惩罚不再翻倍', () => {
    // crash minAge 37 → t≥7，杠杆 [3,5] 已到期。
    const state = simulateAll(baseInputs(), SEED, {
      config: flatConfig(),
      pool: [leverage, crashAt(37)],
    });
    const crash = state.years.find((y) => y.eventId === 'crash-37')!;
    expect(crash.yearIndex).toBeGreaterThanOrEqual(7);
    expect(crash.eventCash).toBe(-1000);
    expect(state.flags.has('leveraged')).toBe(false);
  });

  it('flagTimers 到期年 = t + d + 1，与 returnDelta 的 expiresAtYear 一致', () => {
    let state = createInitialState(baseInputs(), SEED, flatConfig(), [leverage]);
    state = stepYear(state).state;
    state = stepYear(state).state;
    const phase1 = stepYear(state);
    state = stepYear(phase1.state, { yearIndex: 2, eventId: 'leverage', choiceId: 'a' }).state;
    expect(state.flagTimers[0]).toEqual({ flag: 'leveraged', expiresAtYear: 6 });
    const mod = state.modifiers.find((m) => m.sourceEventId === 'leverage')!;
    expect(mod.expiresAtYear).toBe(6);
  });

  it('无 durationYears 的 setFlag 永久存在', () => {
    const permanent = makeEvent({
      id: 'perm-flag',
      once: true,
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'setFlag', flag: 'x' }] }],
    });
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool: [permanent] });
    expect(state.flags.has('x')).toBe(true);
    expect(state.flagTimers).toHaveLength(0);
  });

  it('clearFlag 同时移除限期计时器', () => {
    const setter = makeEvent({
      id: 'setter',
      once: true,
      choices: [
        { id: 'a', label: 'A', hint: '', effects: [{ type: 'setFlag', flag: 'x', durationYears: 5 }] },
      ],
    });
    const clearer = makeEvent({
      id: 'clearer',
      once: true,
      minAge: 33,
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'clearFlag', flag: 'x' }] }],
    });
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool: [setter, clearer] });
    expect(state.flags.has('x')).toBe(false);
    expect(state.flagTimers).toHaveLength(0);
  });
});
