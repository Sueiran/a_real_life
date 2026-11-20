import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, INVESTMENT_STRATEGIES, MONTE_CARLO_MAX_PATHS } from '../simulation/config';
import { createInitialState, replay, stepYear } from '../simulation/engine';
import { isBankrupt, isFire } from '../simulation/endings';
import { runMonteCarlo, runStrategyComparison } from '../simulation/montecarlo';
import { createRng } from '../simulation/rng';
import { toReal } from '../lib/format';
import { baseInputs, flatConfig } from './fixtures';

const inputs = baseInputs({ startAge: 28 });
const seed = 'p4a-example-2026';
const result = runMonteCarlo(inputs, seed);

describe('Monte Carlo 路径与分布', () => {
  it('同输入同 seed 深相等且连续运行 JSON 完全一致', () => {
    const a = runMonteCarlo(inputs, seed, 3);
    const b = runMonteCarlo(inputs, seed, 3);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('不同 seed 产生不同资产与市场路径', () => {
    const a = runMonteCarlo(inputs, 'a', 1).paths[0];
    const b = runMonteCarlo(inputs, 'b', 1).paths[0];
    expect(a.years.map((y) => y.assets)).not.toEqual(b.years.map((y) => y.assets));
    expect(a.years.map((y) => y.marketReturn)).not.toEqual(b.years.map((y) => y.marketReturn));
  });

  it('默认 300 条独立命名种子，全部结算完整年限', () => {
    expect(result.totalPaths).toBe(300);
    expect(result.paths).toHaveLength(300);
    expect(new Set(result.paths.map((p) => p.seed)).size).toBe(300);
    result.paths.forEach((p, i) => {
      expect(p.seed).toBe(`${seed}:mc:${i}`);
      expect(p.years).toHaveLength(62);
      expect(p.years[61].age).toBe(89);
    });
    expect(result.years).toHaveLength(62);
  });

  it('每年 300 样本含全部路径且数值升序，p10 ≤ p50 ≤ p90', () => {
    for (const y of result.years) {
      expect(y.sortedAssets).toEqual(result.paths.map((p) => p.years[y.yearIndex].assets).sort((a, b) => a - b));
      expect(y.sortedAssets).toHaveLength(300);
      expect(y.p10).toBeLessThanOrEqual(y.p50);
      expect(y.p50).toBeLessThanOrEqual(y.p90);
      const expected = (p: number) => {
        const pos = 299 * p;
        return y.sortedAssets[Math.floor(pos)] * (1 - (pos % 1)) + y.sortedAssets[Math.ceil(pos)] * (pos % 1);
      };
      expect(y.p10).toBeCloseTo(expected(0.1), 5);
      expect(y.p50).toBeCloseTo(expected(0.5), 5);
      expect(y.p90).toBeCloseTo(expected(0.9), 5);
    }
  });

  it('FIRE 概率在 [0,1] 内且成功失败数量守恒', () => {
    expect(result.fireRate).toBeGreaterThanOrEqual(0);
    expect(result.fireRate).toBeLessThanOrEqual(1);
    expect(result.fireCount + result.nonFireCount).toBe(300);
    expect(result.fireRate + result.nonFireRate).toBeCloseTo(1, 15);
    expect(result.fireCount).toBe(result.paths.filter((p) => p.firstFire).length);
    expect(result.firstFireDistribution.reduce((n, b) => n + b.count, 0)).toBe(result.fireCount);
    expect(result.firstFireDistribution.reduce((p, b) => p + b.proportion, 0)).toBeCloseTo(result.fireRate, 14);
  });

  it('短年限含成功与失败时，分布不遗漏失败样本，中位数只取成功者', () => {
    const r = runMonteCarlo({ ...inputs, endAge: 50 }, seed);
    expect(r.fireCount).toBeGreaterThan(0);
    expect(r.nonFireCount).toBeGreaterThan(0);
    expect(r.fireCount + r.nonFireCount).toBe(300);
    expect(r.years.at(-1)!.sortedAssets).toHaveLength(300);
    const ages = r.paths.flatMap((p) => p.firstFire ? [p.firstFire.age] : []).sort((a, b) => a - b);
    expect(r.medianFireAge).toBe((ages[Math.floor((ages.length - 1) / 2)] + ages[Math.ceil((ages.length - 1) / 2)]) / 2);
    expect(r.firstFireDistribution.reduce((n, b) => n + b.count, 0)).toBe(r.fireCount);
  });

  it('每条路径的首次 FIRE/破产与原引擎到结局完全一致', () => {
    for (let i = 0; i < 12; i++) {
      const path = result.paths[i];
      const original = replay(inputs, path.seed);
      expect(path.years.slice(0, original.years.length)).toEqual(original.years);
      const last = original.years.at(-1)!;
      if (original.status === 'fire') expect(path.firstFire?.yearIndex).toBe(last.yearIndex);
      if (original.status === 'bankrupt') {
        expect(path.firstFire).toBeNull();
        expect(path.firstBankruptcy?.yearIndex).toBe(last.yearIndex);
      }
    }
  });

  it('所有路径的首次时点及年龄中位数由真实逐年阈值产生', () => {
    const ages: number[] = [];
    for (const p of result.paths) {
      let negatives = 0;
      let firstFire: number | null = null;
      let firstBankrupt: number | null = null;
      for (const y of p.years) {
        negatives = y.assets < 0 ? negatives + 1 : 0;
        if (firstFire === null && firstBankrupt === null && isFire(y.assets, y.goalAmount)) firstFire = y.yearIndex;
        if (firstBankrupt === null && isBankrupt(y.assets, y.expenses, negatives, DEFAULT_CONFIG)) firstBankrupt = y.yearIndex;
      }
      expect(p.firstFire?.yearIndex ?? null).toBe(firstFire);
      expect(p.firstBankruptcy?.yearIndex ?? null).toBe(firstBankrupt);
      if (firstFire !== null) ages.push(inputs.startAge + firstFire);
    }
    ages.sort((a, b) => a - b);
    expect(result.medianFireAge).toBe((ages[Math.floor((ages.length - 1) / 2)] + ages[Math.ceil((ages.length - 1) / 2)]) / 2);
  });

  it('关闭所有事件，包括救援，不生成效果、现金或选项', () => {
    const poor = runMonteCarlo(baseInputs({ initialAssets: 0, annualIncome: 0 }), seed, 2);
    for (const p of [...result.paths.slice(0, 2), ...poor.paths]) {
      for (const y of p.years) {
        expect(y.eventId).toBeNull();
        expect(y.choiceId).toBeNull();
        expect(y.eventCash).toBeUndefined();
        expect(y.scheduledCashApplied).toBeUndefined();
      }
    }
  });

  it('单路径三分位线相等', () => {
    const single = runMonteCarlo(inputs, seed, 1);
    for (const y of single.years) expect([y.p10, y.p50, y.p90]).toEqual(Array(3).fill(single.paths[0].years[y.yearIndex].assets));
  });

  it('两路径小样本采用线性插值而不是取整索引', () => {
    const small = runMonteCarlo(inputs, seed, 2);
    const y = small.years[0];
    const [lo, hi] = y.sortedAssets;
    expect(y.p10).toBe(lo + (hi - lo) * 0.1);
    expect(y.p50).toBe(lo + (hi - lo) * 0.5);
    expect(y.p90).toBe(lo + (hi - lo) * 0.9);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, MONTE_CARLO_MAX_PATHS + 1])('无效 n=%s 明确拒绝', (n) => {
    expect(() => runMonteCarlo(inputs, seed, n)).toThrow(RangeError);
  });

  it('空、反向和非整数年限不构造空路径', () => {
    for (const endAge of [28, 27, 28.5]) {
      expect(() => runMonteCarlo({ ...inputs, endAge }, seed, 1)).toThrow(RangeError);
    }
  });

  it('不修改 inputs/config，结果快照不跟随调用方后续修改', () => {
    const inp = baseInputs({ goal: { mode: 'manual', amount: 1e7 } });
    const conf = flatConfig();
    const before = JSON.stringify({ inp, conf });
    const r = runMonteCarlo(inp, seed, 1, conf);
    expect(JSON.stringify({ inp, conf })).toBe(before);
    inp.initialAssets = 123;
    if (inp.goal.mode === 'manual') inp.goal.amount = 2e7;
    conf.marketMean = 1;
    expect(r.inputs.initialAssets).toBe(200000);
    expect(r.inputs.goal).toEqual({ mode: 'manual', amount: 1e7 });
    expect(r.config.marketMean).toBe(0);
    expect(r).not.toHaveProperty('elapsedMs');
    expect(r).not.toHaveProperty('duration');
  });
});

describe('年度口径、目标与终止边界', () => {
  it('手算三年财务结果与名义增长一致', () => {
    const r = runMonteCarlo(inputs, seed, 1, { ...DEFAULT_CONFIG, marketStd: 0 });
    [294000, 397580, 511515.6].forEach((expected, t) => {
      expect(r.paths[0].years[t].assets).toBeCloseTo(expected, 6);
    });
  });

  it('首次 FIRE 只记录一次，严格在 endAge 前，继续完整推演', () => {
    const inp = baseInputs({ startAge: 28, endAge: 32, initialAssets: 0, annualIncome: 110, annualExpenses: 10, goal: { mode: 'manual', amount: 300 } });
    const r = runMonteCarlo(inp, seed, 3, flatConfig());
    expect(r.firstFireDistribution).toEqual([{ phase: 'yearEnd', yearIndex: 2, calendarYear: 2028, age: 30, count: 3, proportion: 1 }]);
    expect(r.medianFireAge).toBe(30);
    expect(r.paths[0].years.map((y) => y.assets)).toEqual([100, 200, 300, 400]);
    const late = runMonteCarlo({ ...inp, goal: { mode: 'manual', amount: 500 } }, seed, 1, flatConfig());
    expect(late.fireCount).toBe(0);
  });

  it('开局即 FIRE 独立初始时点，仍产生完整基线', () => {
    const r = runMonteCarlo({ ...inputs, initialAssets: 3000000 }, seed, 3);
    expect(r.fireRate).toBe(1);
    expect(r.medianFireAge).toBe(28);
    expect(r.firstFireDistribution).toEqual([{ phase: 'initial', yearIndex: 0, calendarYear: 2026, age: 28, count: 3, proportion: 1 }]);
    expect(r.initial.sortedAssets).toEqual([3000000, 3000000, 3000000]);
    expect(r.paths[0].years).toHaveLength(62);
    expect(r.years[0].phase).toBe('yearEnd');
    expect(r.years[0].p50).not.toBe(r.initial.p50);
  });

  it('永不 FIRE：概率零、中位年龄 null、分布为空', () => {
    const r = runMonteCarlo({ ...inputs, initialAssets: 0, annualIncome: 120000 }, seed, 3, flatConfig());
    expect(r.fireRate).toBe(0);
    expect(r.nonFireRate).toBe(1);
    expect(r.medianFireAge).toBeNull();
    expect(r.firstFireDistribution).toEqual([]);
    expect(r.paths.every((p) => p.firstFire === null)).toBe(true);
  });

  it('auto/manual 相同目标线时逐年完全一致', () => {
    const auto = runMonteCarlo(inputs, seed, 3);
    const manual = runMonteCarlo({ ...inputs, goal: { mode: 'manual', amount: 3000000 } }, seed, 3);
    auto.years.forEach((y, t) => expect(y.goalAmount).toBeCloseTo(manual.years[t].goalAmount, 7));
    expect(auto.paths.map((p) => p.years.map((y) => y.assets))).toEqual(manual.paths.map((p) => p.years.map((y) => y.assets)));
    expect(auto.firstFireDistribution).toEqual(manual.firstFireDistribution);
  });

  it('高通胀的手动目标动态上升，实际购买力转换只在 format 完成', () => {
    const conf = flatConfig({ inflation: 0.1 });
    const r = runMonteCarlo({ ...inputs, goal: { mode: 'manual', amount: 5e6 } }, seed, 1, conf);
    for (const y of r.paths[0].years) {
      expect(y.goalAmount).toBe(5e6 * (1 + conf.inflation) ** y.yearIndex);
      expect(toReal(y.goalAmount, y.yearIndex, conf.inflation)).toBeCloseTo(5e6, 6);
      expect(y.expenses).toBe(inputs.annualExpenses * (1 + conf.inflation) ** y.yearIndex);
    }
  });

  it('负债使用 debtRate 而不是市场收益，连续五年破产后仍续算', () => {
    const inp = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100 });
    const conf = flatConfig({ marketMean: 0.5, bankruptDebtMultiple: 1e9 });
    const r = runMonteCarlo(inp, seed, 1, conf);
    const path = r.paths[0];
    expect(path.years[0].assets).toBe(-100);
    expect(path.years[1].assets).toBe(-208);
    expect(path.firstBankruptcy?.yearIndex).toBe(4);
    expect(path.years).toHaveLength(60);
    expect(r.bankruptcyCount).toBe(1);
    const original = replay(inp, path.seed, [], conf);
    expect(path.years.slice(0, 5)).toEqual(original.years);
    expect(path.years[5].assets).toBe(path.years[4].assets * (1 + conf.debtRate) - 100);
  });

  it('债务倍数边界严格小于才破产', () => {
    const r = runMonteCarlo(baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100 }), seed, 1,
      flatConfig({ debtRate: 0, bankruptConsecutiveYears: 100, bankruptDebtMultiple: 2 }));
    expect(r.paths[0].years[1].assets).toBe(-200);
    expect(r.paths[0].firstBankruptcy?.yearIndex).toBe(2);
  });

  it('重新转正重置连续负资产计数', () => {
    const r = runMonteCarlo(baseInputs({ initialAssets: 0, annualIncome: 30, annualExpenses: 100 }), seed, 1,
      flatConfig({ debtRate: 0, incomeGrowth: 1, bankruptConsecutiveYears: 4, bankruptDebtMultiple: 1e9 }));
    expect(r.paths[0].years.slice(0, 4).map((y) => y.assets)).toEqual([-70, -110, -90, 50]);
    expect(r.paths[0].firstBankruptcy).toBeNull();
  });

  it('破产后假设续算翻身不计 FIRE 成功', () => {
    const r = runMonteCarlo(baseInputs({ initialAssets: 0, annualIncome: 30, annualExpenses: 100 }), seed, 1,
      flatConfig({ debtRate: 0, incomeGrowth: 1, bankruptConsecutiveYears: 2, bankruptDebtMultiple: 1e9 }));
    expect(r.paths[0].firstBankruptcy?.yearIndex).toBe(1);
    expect(r.paths[0].years.some((y) => y.assets >= y.goalAmount)).toBe(true);
    expect(r.paths[0].firstFire).toBeNull();
    expect(r.fireRate).toBe(0);
  });

  it('首次 FIRE 后跌破并破产不撤销历史达成，破产数可与成功数重叠', () => {
    const r = runMonteCarlo(baseInputs({ initialAssets: 100, annualIncome: 0, annualExpenses: 1000, goal: { mode: 'manual', amount: 100 } }), seed, 1, flatConfig());
    expect(r.fireCount).toBe(1);
    expect(r.nonFireCount).toBe(0);
    expect(r.bankruptcyCount).toBe(1);
    expect(r.paths[0].years[0].assets).toBe(-900);
  });

  it('收益率下限复用引擎规则，正资产不能乘以负增长因子', () => {
    const r = runMonteCarlo(inputs, seed, 1, flatConfig({ marketMean: -2 }));
    expect(r.paths[0].years[0].marketReturn).toBe(DEFAULT_CONFIG.returnFloor);
    expect(r.paths[0].years[0].assets).toBeCloseTo(90000, 7);
  });

  it('普通引擎未终止时，逐年快照与单路径完全相同', () => {
    const r = runMonteCarlo(inputs, seed, 1);
    let state = createInitialState(inputs, `${seed}:mc:0`);
    while (state.status === 'running') {
      state = stepYear(state).state;
      const year = state.years.at(-1)!;
      expect(year).toEqual(r.paths[0].years[year.yearIndex]);
    }
    expect(() => stepYear(state)).toThrow('不能继续步进');
  });

  it('最大合法金额、最长合法年限与三策略均保持有限数', () => {
    const extremes = [
      baseInputs({ startAge: 18, endAge: 120, initialAssets: 1e12, annualIncome: 1e10, annualExpenses: 1e10, goal: { mode: 'manual', amount: 1e12 } }),
      baseInputs({ startAge: 18, endAge: 120, initialAssets: 0, annualIncome: 0, annualExpenses: 1e10 }),
      baseInputs({ startAge: 18, endAge: 120, initialAssets: 1e12, annualIncome: 1e10, annualExpenses: 0.01 }),
    ];
    for (const inp of extremes) {
      for (const { result: r } of runStrategyComparison(inp, seed, 3)) {
        for (const p of r.paths) for (const y of p.years) {
          for (const value of Object.values(y)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
        }
        for (const y of r.years) expect([y.p10, y.p50, y.p90].every(Number.isFinite)).toBe(true);
        expect(JSON.stringify(r)).not.toContain('Infinity');
      }
    }
  });

  it('不支持的数值溢出明确报错而不是伪造有限金额', () => {
    expect(() => runMonteCarlo(inputs, seed, 1, { ...DEFAULT_CONFIG, incomeGrowth: Number.MAX_VALUE })).toThrow(RangeError);
  });
});

describe('配对策略', () => {
  const strategies = runStrategyComparison(inputs, seed, 3);

  it('三策略保持声明顺序及配置，不按成功率强制排序', () => {
    expect(strategies.map((s) => s.strategy)).toEqual(INVESTMENT_STRATEGIES);
    for (const { strategy, result: r } of strategies) {
      expect(r.config.marketMean).toBe(strategy.marketMean);
      expect(r.config.marketStd).toBe(strategy.marketStd);
      expect(r.fireRate + r.nonFireRate).toBeCloseTo(1, 15);
    }
    const reversed = [...INVESTMENT_STRATEGIES].reverse();
    expect(runStrategyComparison(inputs, seed, 1, DEFAULT_CONFIG, reversed).map((s) => s.strategy)).toEqual(reversed);
  });

  it('每条路径每年采用相同标准正态冲击（不是策略名派生 seed）', () => {
    for (let i = 0; i < 3; i++) for (let t = 0; t < 62; t++) {
      const z = createRng(`${seed}:mc:${i}`, `market:${t}`).normal();
      for (const { strategy, result: r } of strategies) {
        const y = r.paths[i].years[t];
        expect(r.paths[i].seed).toBe(`${seed}:mc:${i}`);
        expect(y.marketReturn).toBe(Math.max(strategy.marketMean + strategy.marketStd * z, DEFAULT_CONFIG.returnFloor));
        if (y.marketReturn > DEFAULT_CONFIG.returnFloor) {
          expect((y.marketReturn - strategy.marketMean) / strategy.marketStd).toBeCloseTo(z, 13);
        }
      }
    }
  });

  it('三策略相同参数时，完整结果和 JSON 完全一致', () => {
    const equal = INVESTMENT_STRATEGIES.map((s) => ({ ...s, marketMean: DEFAULT_CONFIG.marketMean, marketStd: DEFAULT_CONFIG.marketStd }));
    const results = runStrategyComparison(inputs, seed, 3, DEFAULT_CONFIG, equal).map((s) => s.result);
    expect(results[0]).toEqual(results[1]);
    expect(JSON.stringify(results[1])).toBe(JSON.stringify(results[2]));
  });

  it('平衡策略与默认 Monte Carlo 逐字节一致，其他财务假设被保留', () => {
    expect(strategies[1].result).toEqual(runMonteCarlo(inputs, seed, 3));
    const conf = flatConfig({ inflation: 0.06, debtRate: 0.15 });
    for (const s of runStrategyComparison(inputs, seed, 1, conf)) {
      expect(s.result.config.inflation).toBe(conf.inflation);
      expect(s.result.config.debtRate).toBe(conf.debtRate);
    }
  });
});
