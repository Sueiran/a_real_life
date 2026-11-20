import { describe, expect, it } from 'vitest';
import { choiceLog, replay, stepYear } from '../simulation/engine';
import { rebuildTo } from '../playback/restore';
import { DEFAULT_CONFIG } from '../simulation/config';
import { EVENT_POOL } from '../events/definitions';
import type { EventDef } from '../simulation/types';
import { baseInputs, flatConfig, makeEvent, simulateAll } from './fixtures';

const SEED = 'rewind-seed';

function fullRun(choose?: (event: EventDef) => string) {
  return simulateAll(baseInputs(), SEED, {
    pool: EVENT_POOL,
    choose: choose ? (e) => choose(e) : undefined,
  });
}

describe('截断重播与分歧再生', () => {
  it('截断 choices：分歧点之前逐年一致，停在目标待决事件', () => {
    const full = fullRun();
    const log = choiceLog(full);
    expect(log.length).toBeGreaterThan(2);
    const prefix = replay(baseInputs(), SEED, log.slice(0, 2), DEFAULT_CONFIG, EVENT_POOL);
    expect(prefix.years).toEqual(full.years.slice(0, log[2].yearIndex));
    expect(prefix.pending?.year.yearIndex).toBe(log[2].yearIndex);
    expect(prefix.pending?.event.id).toBe(log[2].eventId);
  });

  it('改选目标事件：前缀不变，目标年起未来重新生成', () => {
    const full = fullRun();
    const log = choiceLog(full);
    const target = log.find((c) => {
      const def = EVENT_POOL.find((e) => e.id === c.eventId)!;
      return def.choices.length > 1;
    })!;
    const def = EVENT_POOL.find((e) => e.id === target.eventId)!;
    const alt = def.choices.find((c) => c.id !== target.choiceId)!;
    const changed = log.map((c) => (c.yearIndex === target.yearIndex ? { ...c, choiceId: alt.id } : c));
    const diverged = replay(baseInputs(), SEED, changed, DEFAULT_CONFIG, EVENT_POOL);
    expect(diverged.years.slice(0, target.yearIndex)).toEqual(full.years.slice(0, target.yearIndex));
    expect(JSON.stringify(diverged.years.slice(target.yearIndex))).not.toBe(
      JSON.stringify(full.years.slice(target.yearIndex)),
    );
  });

  it('改选不影响其他事件年的市场收益子流（前缀事件年逐年深相等）', () => {
    const full = fullRun();
    const log = choiceLog(full);
    const target = log[0];
    const def = EVENT_POOL.find((e) => e.id === target.eventId)!;
    const alt = def.choices.find((c) => c.id !== target.choiceId)!;
    const changed = log.map((c) => (c.yearIndex === target.yearIndex ? { ...c, choiceId: alt.id } : c));
    const diverged = replay(baseInputs(), SEED, changed, DEFAULT_CONFIG, EVENT_POOL);
    for (let i = 0; i < target.yearIndex; i++) {
      expect(diverged.years[i].marketReturn).toBe(full.years[i].marketReturn);
    }
  });

  it('非法 choiceId / 不匹配 eventId：安全停在待决事件，不崩溃不套用', () => {
    const full = fullRun();
    const log = choiceLog(full);
    const t = log[0].yearIndex;
    const badChoice = replay(baseInputs(), SEED, [{ yearIndex: t, eventId: log[0].eventId, choiceId: 'bogus' }], DEFAULT_CONFIG, EVENT_POOL);
    expect(badChoice.pending?.year.yearIndex).toBe(t);
    expect(badChoice.years.length).toBe(t);
    const badEvent = replay(baseInputs(), SEED, [{ yearIndex: t, eventId: 'wrong-event', choiceId: log[0].choiceId }], DEFAULT_CONFIG, EVENT_POOL);
    expect(badEvent.pending?.year.yearIndex).toBe(t);
    expect(badEvent.years.length).toBe(t);
  });
});

// 合成事件池：精确控制延迟剧情，验证改选后调度与 flag 的保留 / 取消。
const branchEvent = makeEvent({
  id: 'branch',
  once: true,
  choices: [
    {
      id: 'invest',
      label: '投入',
      hint: '',
      effects: [
        { type: 'cash', amount: -100000 },
        { type: 'setFlag', flag: 'invested' },
        { type: 'scheduleEvent', eventId: 'payoff', afterYears: 2 },
        { type: 'scheduledCash', amount: 500000, afterYears: 4, probability: 1 },
      ],
    },
    { id: 'walk', label: '离开', hint: '', effects: [] },
  ],
});
const payoffEvent = makeEvent({
  id: 'payoff',
  forcedOnly: true,
  choices: [{ id: 'take', label: '收下', hint: '', effects: [{ type: 'cash', amount: 200000 }] }],
});
const branchPool = [branchEvent, payoffEvent];

function runBranch(firstChoice: 'invest' | 'walk') {
  return simulateAll(baseInputs({ endAge: 45 }), 'branch-seed', {
    config: flatConfig(),
    pool: branchPool,
    choose: (e) => (e.id === 'branch' ? firstChoice : e.choices[0].id),
  });
}

describe('改选后的延迟剧情与状态隔离', () => {
  it('保留前缀选择：延迟事件与延迟现金仍按原调度结算', () => {
    const full = runBranch('invest');
    const log = choiceLog(full);
    const branchYear = log.find((c) => c.eventId === 'branch')!.yearIndex;
    // 重建到 branch 结算后一年：调度必须仍在（尚未到期触发）。
    const mid = rebuildTo(baseInputs({ endAge: 45 }), 'branch-seed', log.filter((c) => c.yearIndex <= branchYear), branchYear + 1, flatConfig(), branchPool);
    expect(mid.scheduledEvents.some((s) => s.eventId === 'payoff')).toBe(true);
    expect(mid.scheduledCash.length).toBe(1);
    expect(mid.flags.has('invested')).toBe(true);
    // 完整运行中延迟事件与现金真实到账。
    expect(full.years.some((y) => y.eventId === 'payoff')).toBe(true);
    expect(full.years.some((y) => y.scheduledCashApplied === 500000)).toBe(true);
  });

  it('改选 walk：延迟事件、延迟现金与 flag 全部取消，无旧分支泄漏', () => {
    const full = runBranch('walk');
    expect(full.years.some((y) => y.eventId === 'payoff')).toBe(false);
    expect(full.years.every((y) => !y.scheduledCashApplied)).toBe(true);
    expect(full.flags.has('invested')).toBe(false);
    expect(full.scheduledEvents.length).toBe(0);
    expect(full.scheduledCash.length).toBe(0);
  });

  it('rewind 式重建：invest 局截断到 branch 待决年，改选 walk 后调度清空', () => {
    const full = runBranch('invest');
    const log = choiceLog(full);
    const branchYear = log.find((c) => c.eventId === 'branch')!.yearIndex;
    const state = rebuildTo(
      baseInputs({ endAge: 45 }),
      'branch-seed',
      log.filter((c) => c.yearIndex < branchYear),
      branchYear,
      flatConfig(),
      branchPool,
      true,
    );
    expect(state.pending?.event.id).toBe('branch');
    const after = stepYear(state, { yearIndex: branchYear, eventId: 'branch', choiceId: 'walk' }).state;
    expect(after.scheduledEvents.length).toBe(0);
    expect(after.scheduledCash.length).toBe(0);
    expect(after.flags.has('invested')).toBe(false);
    expect(after.years.slice(0, branchYear)).toEqual(full.years.slice(0, branchYear));
  });
});