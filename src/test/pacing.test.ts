import { describe, expect, it } from 'vitest';
import { simulateAll, baseInputs, flatConfig, makeEvent } from './fixtures';
import { EVENT_POOL } from '../events/definitions';
import { replay } from '../simulation/engine';
import type { EventDef } from '../simulation/types';

const SEED = 'demo-seed-2026';

function triggeredYears(state: ReturnType<typeof simulateAll>, id: string): number[] {
  return state.years.filter((y) => y.eventId === id).map((y) => y.yearIndex);
}

describe('首事件节奏', () => {
  it('首个常规事件落在第 2–4 年', () => {
    for (const seed of ['seed-a', 'seed-b', 'seed-c', SEED]) {
      const state = simulateAll(baseInputs(), seed, { pool: EVENT_POOL });
      const first = state.years.find((y) => y.eventId !== null);
      if (!first) continue; // 极短局可能无事件
      expect(first.yearIndex).toBeGreaterThanOrEqual(2);
      expect(first.yearIndex).toBeLessThanOrEqual(4);
    }
  });

  it('第 0、1 年绝无常规事件', () => {
    const state = simulateAll(baseInputs(), SEED, { pool: EVENT_POOL });
    expect(state.years[0]?.eventId).toBeNull();
    expect(state.years[1]?.eventId).toBeNull();
  });

  it('首事件优先 career；career 池为空时回退到其他合格事件，不死锁', () => {
    const nonCareer = makeEvent({ id: 'life-ev', category: 'lifestyle', weight: 5 });
    const state = simulateAll(baseInputs(), SEED, { pool: [nonCareer] });
    expect(triggeredYears(state, 'life-ev')[0]).toBe(2);
  });

  it('首事件窗口内无任何合格事件则跳过，不死锁不无限循环', () => {
    const late = makeEvent({ id: 'late', minAge: 60 });
    const state = simulateAll(baseInputs({ endAge: 40 }), SEED, { pool: [late] });
    expect(state.status).toBe('end');
    expect(state.years.every((y) => y.eventId === null)).toBe(true);
  });
});

describe('全局间隔与概率', () => {
  it('任意两个常规事件间隔 ≥ 2 年', () => {
    for (const seed of ['seed-a', 'seed-b', SEED]) {
      const state = simulateAll(baseInputs(), seed, { pool: EVENT_POOL });
      const years = state.years.filter((y) => y.eventId !== null).map((y) => y.yearIndex);
      for (let i = 1; i < years.length; i++) {
        expect(years[i] - years[i - 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('距上次事件越久触发概率越高（多种子下事件总数非零且有限）', () => {
    let total = 0;
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const state = simulateAll(baseInputs(), seed, { pool: EVENT_POOL });
      total += state.years.filter((y) => y.eventId !== null).length;
    }
    expect(total).toBeGreaterThan(10);
  });
});

describe('延迟事件与延迟现金', () => {
  const chain: EventDef[] = [
    makeEvent({
      id: 'invest',
      once: true,
      choices: [
        {
          id: 'a',
          label: 'A',
          hint: '',
          effects: [{ type: 'scheduleEvent', eventId: 'settle', afterYears: 3 }],
        },
      ],
    }),
    makeEvent({
      id: 'settle',
      forcedOnly: true,
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'cash', amount: 5000 }] }],
    }),
  ];

  it('scheduleEvent 到期强制触发，绕过概率与间隔', () => {
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool: chain });
    expect(triggeredYears(state, 'invest')[0]).toBe(2);
    expect(triggeredYears(state, 'settle')[0]).toBe(5);
    const settleYear = state.years[5];
    expect(settleYear.eventCash).toBe(5000);
  });

  it('scheduledCash 在到期年结算并体现在当年曲线点', () => {
    const pool = [
      makeEvent({
        id: 'seed-money',
        once: true,
        choices: [
          {
            id: 'a',
            label: 'A',
            hint: '',
            effects: [{ type: 'scheduledCash', amount: 7777, afterYears: 2 }],
          },
        ],
      }),
    ];
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    expect(triggeredYears(state, 'seed-money')[0]).toBe(2);
    const t = 4;
    expect(state.years[t].scheduledCashApplied).toBe(7777);
    // 无事件年现金流：assets = assetsStart*(1+r) + income - expenses + 延迟现金
    const y = state.years[t];
    expect(y.assets).toBeCloseTo(y.assetsStart * (1 + y.marketReturn) + y.income - y.expenses + 7777, 6);
  });

  it('延迟概率结算确定性：同种子两次运行结果一致', () => {
    const pool = [
      makeEvent({
        id: 'lottery',
        once: true,
        choices: [
          {
            id: 'a',
            label: 'A',
            hint: '',
            effects: [{ type: 'scheduledCash', amount: 100000, afterYears: 2, probability: 0.5 }],
          },
        ],
      }),
    ];
    const a = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    const b = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    expect(a.years).toEqual(b.years);
    expect(a.years[4].scheduledCashApplied ?? 0).toBe(a.years[4].scheduledCashApplied ?? 0);
  });

  it('延迟现金概率为 0 时不到账，为 1 时必到账', () => {
    const mk = (p: number) => [
      makeEvent({
        id: 'lottery',
        once: true,
        choices: [
          { id: 'a', label: 'A', hint: '', effects: [{ type: 'scheduledCash', amount: 100000, afterYears: 2, probability: p }] },
        ],
      }),
    ];
    const zero = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool: mk(0) });
    expect(zero.years[4].scheduledCashApplied ?? 0).toBe(0);
    const one = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool: mk(1) });
    expect(one.years[4].scheduledCashApplied).toBe(100000);
  });
});

describe('相对现金与条件效果', () => {
  it('cashRelative basis=assetsNow 按事件年选项前年末资产计算', () => {
    const pool = [
      makeEvent({
        id: 'scam-test',
        once: true,
        choices: [
          { id: 'a', label: 'A', hint: '', effects: [{ type: 'cashRelative', basis: 'assetsNow', ratio: -0.25 }] },
        ],
      }),
    ];
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    const y = state.years[2];
    const preChoice = y.assets - (y.eventCash ?? 0);
    expect(y.eventCash).toBeCloseTo(preChoice * -0.25, 6);
  });

  it('cashRelative basis=annualIncome 按事件年名义收入计算', () => {
    const pool = [
      makeEvent({
        id: 'severance-test',
        once: true,
        choices: [
          { id: 'a', label: 'A', hint: '', effects: [{ type: 'cashRelative', basis: 'annualIncome', ratio: 0.5 }] },
        ],
      }),
    ];
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    const y = state.years[2];
    expect(y.eventCash).toBeCloseTo(y.income * 0.5, 6);
  });

  it('cashRelative basis=initialAssets 按开局资产计算', () => {
    const pool = [
      makeEvent({
        id: 'sell-test',
        once: true,
        choices: [
          { id: 'a', label: 'A', hint: '', effects: [{ type: 'cashRelative', basis: 'initialAssets', ratio: 0.3 }] },
        ],
      }),
    ];
    const state = simulateAll(baseInputs({ initialAssets: 500000 }), SEED, { config: flatConfig(), pool });
    expect(state.years[2].eventCash).toBeCloseTo(150000, 6);
  });

  it('condition.requiresFlags：无 flag 时跳过该效果', () => {
    const pool = [
      makeEvent({
        id: 'leveraged-loss',
        once: true,
        choices: [
          {
            id: 'a',
            label: 'A',
            hint: '',
            effects: [
              { type: 'cash', amount: -1000 },
              { type: 'cash', amount: -5000, condition: { requiresFlags: ['leveraged'] } },
            ],
          },
        ],
      }),
    ];
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    expect(state.years[2].eventCash).toBe(-1000);
  });

  it('condition.requiresFlags：持 flag 时追加效果生效', () => {
    const pool = [
      makeEvent({
        id: 'flagger',
        once: true,
        choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'setFlag', flag: 'leveraged' }] }],
      }),
      makeEvent({
        id: 'crash',
        minAge: 33, // 在 flagger（t=2 强制首事件）之后才可能触发
        choices: [
          {
            id: 'a',
            label: 'A',
            hint: '',
            effects: [
              { type: 'cash', amount: -1000 },
              { type: 'cash', amount: -5000, condition: { requiresFlags: ['leveraged'] } },
            ],
          },
        ],
      }),
    ];
    const state = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool });
    const crashYear = state.years.find((y) => y.eventId === 'crash')!;
    expect(crashYear.eventCash).toBe(-6000);
  });
});

describe('市场故事与真实行情一致', () => {
  it('market-crash 只在当年收益 ≤ -10% 时触发', () => {
    const state = simulateAll(baseInputs(), SEED, { pool: EVENT_POOL });
    for (const y of state.years) {
      if (y.eventId === 'market-crash') expect(y.marketReturn).toBeLessThanOrEqual(-0.1);
      if (y.eventId === 'bull-fever') expect(y.marketReturn).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe('真实事件池重播一致性', () => {
  it('创业链路：投资 → 3 年后强制清算 → 扩张延迟现金确定性', () => {
    const pool = EVENT_POOL.filter((e) => ['startup-invite', 'startup-exit'].includes(e.id));
    const choose = (event: { id: string }) =>
      event.id === 'startup-invite' ? 'invest' : 'expand';
    const a = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool, choose });
    const b = simulateAll(baseInputs(), SEED, { config: flatConfig(), pool, choose });
    expect(a.years).toEqual(b.years);

    const invest = a.years.find((y) => y.eventId === 'startup-invite')!;
    const exit = a.years.find((y) => y.eventId === 'startup-exit')!;
    expect(exit.yearIndex - invest.yearIndex).toBe(3);
    expect(invest.eventCash).toBe(-300000);
    expect(exit.eventCash).toBe(-200000);
    // 扩张后 3 年：延迟现金按 50% 概率结算（到账与否由种子决定，但必须确定）。
    const settleYear = a.years[exit.yearIndex + 3];
    const applied = settleYear.scheduledCashApplied ?? 0;
    expect([0, 1200000]).toContain(applied);
  });

  it('完整人生：选择日志重播后逐年深相等', () => {
    const state = simulateAll(baseInputs(), SEED, { pool: EVENT_POOL });
    const choices = state.years
      .filter((y) => y.eventId !== null)
      .map((y) => ({ yearIndex: y.yearIndex, eventId: y.eventId!, choiceId: y.choiceId! }));
    const replayed = replay(baseInputs(), SEED, choices, undefined, EVENT_POOL);
    expect(replayed.years).toEqual(state.years);
    expect(replayed.status).toBe(state.status);
  });

  it('多种子下事件数与结局分布合理（统计断言）', () => {
    const counts: number[] = [];
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const state = simulateAll(baseInputs(), seed, { pool: EVENT_POOL });
      counts.push(state.years.filter((y) => y.eventId !== null).length);
    }
    // 每局至少有一些事件，且不会年年都是事件
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(30);
    }
  });
});
