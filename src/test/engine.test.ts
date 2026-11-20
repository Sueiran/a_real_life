import { describe, expect, it } from 'vitest';
import { createInitialState, replay, stepYear } from '../simulation/engine';
import { summarizeEnding } from '../simulation/endings';
import { toReal } from '../lib/format';
import { DEFAULT_CONFIG } from '../simulation/config';
import { baseInputs, flatConfig, simulateAll } from './fixtures';

const SEED = 'demo-seed-2026';

describe('确定性重播', () => {
  it('相同 inputs + seed 两次 replay 逐年深相等', () => {
    const a = replay(baseInputs(), SEED);
    const b = replay(baseInputs(), SEED);
    expect(a.years).toEqual(b.years);
    expect(a.status).toBe(b.status);
  });

  it('不同 seed 产生不同市场轨迹', () => {
    const a = replay(baseInputs(), 'seed-a');
    const b = replay(baseInputs(), 'seed-b');
    const returnsA = a.years.map((y) => y.marketReturn);
    const returnsB = b.years.map((y) => y.marketReturn);
    expect(returnsA).not.toEqual(returnsB);
  });

  it('日历年由 startYear 注入且重播保留', () => {
    const state = replay(baseInputs({ startYear: 2030 }), SEED);
    expect(state.years[0].calendarYear).toBe(2030);
    expect(state.years[5].calendarYear).toBe(2035);
  });
});

describe('现金流守恒', () => {
  it('正资产年：W_next = W*(1+r) + income - expenses', () => {
    const state = replay(baseInputs(), SEED);
    for (const year of state.years.slice(0, 10)) {
      expect(year.assetsStart).toBeGreaterThanOrEqual(0);
      const expected = year.assetsStart * (1 + year.marketReturn) + year.income - year.expenses;
      expect(year.assets).toBeCloseTo(expected, 6);
    }
  });

  it('负债年：使用负债利率而非市场收益', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const config = flatConfig({ marketMean: 0.5 });
    const state = simulateAll(inputs, SEED, { config });
    expect(state.years[0].assets).toBeCloseTo(-100000, 6);
    // 若错误使用市场收益 50%，第二年将为 -250000；正确负债分支为 -208000。
    expect(state.years[1].assets).toBeCloseTo(-100000 * 1.08 - 100000, 6);
    expect(state.years[1].assets).not.toBeCloseTo(-250000, 6);
  });

  it('收入与支出按名义增长率递增', () => {
    const state = replay(baseInputs(), SEED);
    const y = state.years[3];
    expect(y.income).toBeCloseTo(200000 * Math.pow(1.03, 3), 6);
    expect(y.expenses).toBeCloseTo(120000 * Math.pow(1.025, 3), 6);
  });
});

describe('财富自由目标', () => {
  it('auto：目标线 = 当年支出 × 25，随通胀动态抬升', () => {
    const state = replay(baseInputs(), SEED);
    for (const year of state.years.slice(0, 5)) {
      expect(year.goalAmount).toBeCloseTo(year.expenses * 25, 6);
    }
  });

  it('manual：目标线 = amount × (1+π)^t', () => {
    const inputs = baseInputs({ goal: { mode: 'manual', amount: 5000000 } });
    const state = replay(inputs, SEED);
    expect(state.years[0].goalAmount).toBeCloseTo(5000000, 6);
    expect(state.years[4].goalAmount).toBeCloseTo(5000000 * Math.pow(1.025, 4), 6);
  });

  it('实际购买力换算：toReal(nominal) × (1+π)^t == nominal', () => {
    for (const t of [0, 1, 10, 40]) {
      const nominal = 1234567.89;
      const real = toReal(nominal, t, DEFAULT_CONFIG.inflation);
      expect(real * Math.pow(1 + DEFAULT_CONFIG.inflation, t)).toBeCloseTo(nominal, 6);
    }
  });
});

describe('结局判定', () => {
  it('恰好等于目标线判定 FIRE', () => {
    const inputs = baseInputs({
      initialAssets: 50000,
      annualIncome: 50000,
      annualExpenses: 1,
      goal: { mode: 'manual', amount: 99999 },
    });
    const state = simulateAll(inputs, SEED, { config: flatConfig() });
    expect(state.status).toBe('fire');
    expect(state.years).toHaveLength(1);
    expect(state.years[0].assets).toBeCloseTo(99999, 6);
  });

  it('略低于目标线不判定 FIRE', () => {
    const inputs = baseInputs({
      initialAssets: 50000,
      annualIncome: 50000,
      annualExpenses: 1,
      goal: { mode: 'manual', amount: 99999.5 },
    });
    let state = createInitialState(inputs, SEED, flatConfig());
    state = stepYear(state).state;
    expect(state.years[0].assets).toBeCloseTo(99999, 6);
    expect(state.years[0].assets).toBeLessThan(99999.5);
    expect(state.status).toBe('running');
  });

  it('开局已达目标：初始化直接 FIRE，空历史，无年度结算', () => {
    const inputs = baseInputs({ initialAssets: 3000000 }); // auto 目标 = 120000×25 = 3000000
    const state = createInitialState(inputs, SEED);
    expect(state.status).toBe('fire');
    expect(state.years).toHaveLength(0);
    const replayed = replay(inputs, SEED);
    expect(replayed.status).toBe('fire');
    expect(replayed.years).toHaveLength(0);
    const ending = summarizeEnding(replayed)!;
    expect(ending.title).toBe('你本来就自由了');
    expect(ending.age).toBe(30);
    expect(ending.calendarYear).toBe(2026);
    expect(ending.finalAssets).toBe(3000000);
  });

  it('连续 5 年负资产判定破产', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const config = flatConfig({ bankruptDebtMultiple: 1e9 }); // 排除债务失控分支干扰
    const state = simulateAll(inputs, SEED, { config });
    expect(state.status).toBe('bankrupt');
    expect(state.years).toHaveLength(5);
    expect(state.years.every((y) => y.assets < 0)).toBe(true);
  });

  it('前 4 年负资产不破产，正资产年重置连续计数', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const config = flatConfig({ bankruptDebtMultiple: 1e9 });
    let state = createInitialState(inputs, SEED, config);
    for (let i = 0; i < 4; i++) state = stepYear(state).state;
    expect(state.status).toBe('running');
    expect(state.negativeYears).toBe(4);
  });

  it('债务失控：净资产 < −5×当年支出立即破产', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const config = flatConfig({ bankruptConsecutiveYears: 100 }); // 排除连续年数分支干扰
    const state = simulateAll(inputs, SEED, { config });
    expect(state.status).toBe('bankrupt');
    const last = state.years[state.years.length - 1];
    expect(last.assets).toBeLessThan(-5 * last.expenses);
    expect(state.years.length).toBeLessThan(100);
  });

  it('到达 endAge 未 FIRE 判定 end', () => {
    const inputs = baseInputs({ startAge: 88, endAge: 90, initialAssets: 100000 });
    const state = simulateAll(inputs, SEED, { config: flatConfig() });
    expect(state.status).toBe('end');
    expect(state.years).toHaveLength(2);
    expect(state.years[1].age).toBe(89);
    const ending = summarizeEnding(state)!;
    expect(ending.age).toBe(90);
    expect(ending.ratio).toBeCloseTo(state.years[1].assets / state.years[1].goalAmount, 6);
  });

  it('FIRE 结局展示达成时点：当年快照的年份与年龄', () => {
    const inputs = baseInputs({
      initialAssets: 50000,
      annualIncome: 50000,
      annualExpenses: 1,
      goal: { mode: 'manual', amount: 99999 },
    });
    const state = simulateAll(inputs, SEED, { config: flatConfig() });
    const ending = summarizeEnding(state)!;
    const last = state.years[state.years.length - 1];
    expect(ending.age).toBe(last.age);
    expect(ending.calendarYear).toBe(last.calendarYear);
    expect(ending.calendarYear).toBe(2026);
    expect(ending.age).toBe(30);
  });

  it('破产结局展示当年快照的年份与年龄', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const state = simulateAll(inputs, SEED, { config: flatConfig({ bankruptDebtMultiple: 1e9 }) });
    const ending = summarizeEnding(state)!;
    const last = state.years[state.years.length - 1];
    expect(ending.age).toBe(last.age);
    expect(ending.calendarYear).toBe(last.calendarYear);
    expect(ending.calendarYear).toBe(2030); // 第 5 年（t=4）
  });

  it('end 结局为跨入 endAge 的终止节点', () => {
    const inputs = baseInputs({ startAge: 88, startYear: 2030, endAge: 90, initialAssets: 100000 });
    const state = simulateAll(inputs, SEED, { config: flatConfig() });
    const ending = summarizeEnding(state)!;
    expect(ending.age).toBe(90);
    expect(ending.calendarYear).toBe(2032);
  });
});

describe('不可变性', () => {
  it('年度步进不修改上一年度状态与历史快照', () => {
    let state = createInitialState(baseInputs(), SEED);
    state = stepYear(state).state;
    const snapshot = JSON.stringify(state);
    const firstYear = state.years[0];
    const next = stepYear(state).state;
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next.years[0]).toBe(firstYear);
    expect(next.years[0].assets).toBe(firstYear.assets);
    expect(state.years).toHaveLength(1);
    expect(next.years).toHaveLength(2);
  });

  it('步进不修改 modifiers/flags 原引用内容', () => {
    const state = createInitialState(baseInputs(), SEED);
    const flagsBefore = state.flags;
    stepYear(state);
    expect(state.flags).toBe(flagsBefore);
    expect(state.flags.size).toBe(0);
  });
});
