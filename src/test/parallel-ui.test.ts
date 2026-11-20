import { describe, expect, it } from 'vitest';
import { calculateParallel } from '../playback/parallelCalculation';
import { createInitialState, stepYear } from '../simulation/engine';
import { runMonteCarlo, compareWithParallelLives, runStrategyComparison } from '../simulation/montecarlo';
import { INVESTMENT_STRATEGIES } from '../simulation/config';
import { fireBeforeAges, formatPathRate, parallelPoints, axisMoney } from '../views/ending/parallelData';
import { formatAssetMoney, formatMoney } from '../lib/format';
import { baseInputs, flatConfig } from './fixtures';

const sim = createInitialState(baseInputs(), 'parallel-ui');
const data = calculateParallel({ sim, strategyId: 'balanced' });

describe('平行宇宙视图投影', () => {
  it('只传输绘图统计，不复制完整路径或排序样本', () => {
    expect(data).not.toHaveProperty('paths');
    expect(data.initial).not.toHaveProperty('sortedAssets');
    expect(data.years.every((year) => !('sortedAssets' in year))).toBe(true);
    expect(JSON.stringify(data).length).toBeLessThan(25000);
  });
  it('基线与原接口结果一致', () => {
    const expected = runMonteCarlo(sim.inputs, sim.seed, 300, sim.config);
    expect(data.firstFireDistribution).toEqual(expected.firstFireDistribution);
    expect(data.years.map((y) => y.p50)).toEqual(expected.years.map((y) => y.p50));
    expect(data.comparison).toEqual(compareWithParallelLives(sim, expected));
  });
  it.each(['aggressive', 'conservative'])('切换 %s 使用配对策略接口真实结果', (strategyId) => {
    const strategy = INVESTMENT_STRATEGIES.find((s) => s.id === strategyId)!;
    const expected = runStrategyComparison(sim.inputs, sim.seed, 300, sim.config, [strategy])[0].result;
    const result = calculateParallel({ sim, strategyId });
    expect(result.years.map((y) => [y.p10, y.p50, y.p90])).toEqual(expected.years.map((y) => [y.p10, y.p50, y.p90]));
    expect(result.medianFireAge).toBe(expected.medianFireAge);
    expect(result.comparison).toEqual(compareWithParallelLives(sim, expected));
  });
  it('未知策略不能悄悄回退到平衡', () => {
    expect(() => calculateParallel({ sim, strategyId: 'unknown' })).toThrow('未知策略');
  });
  it('门槛严格排除当岁并累计开局达成', () => {
    const custom = { ...data, firstFireDistribution: [
      { ...data.initial, age: 30, count: 1, proportion: 0.1 },
      { ...data.years[0], age: 39, count: 2, proportion: 0.2 },
      { ...data.years[0], age: 40, count: 3, proportion: 0.3 },
      { ...data.years[0], age: 45, count: 4, proportion: 0.4 },
    ] };
    expect(fireBeforeAges(custom, 30, 60)).toEqual([
      { age: 40, count: 3 }, { age: 45, count: 6 }, { age: 50, count: 10 }, { age: 55, count: 10 }, { age: 60, count: 10 },
    ]);
  });
  it('门槛过滤已过去的年龄和模型范围以外年龄', () => {
    expect(fireBeforeAges(data, 45, 55).map((m) => m.age)).toEqual([50, 55]);
    expect(fireBeforeAges(data, 60, 90)).toEqual([]);
    expect(fireBeforeAges(data, 30, 35)).toEqual([]);
  });
  it('开局即 FIRE 为 300 条平局，真实线只有开局', () => {
    const actual = createInitialState(baseInputs({ initialAssets: 1e12 }), 'instant');
    const result = calculateParallel({ sim: actual, strategyId: 'balanced' });
    expect(result.comparison?.phase).toBe('initial');
    expect(result.comparison?.belowCount).toBe(0);
    expect(result.comparison?.equalCount).toBe(300);
    expect(fireBeforeAges(result, 30, 90).every((m) => m.count === 300)).toBe(true);
    expect(parallelPoints(result, actual, false).filter((p) => p.actual !== null)).toHaveLength(1);
  });
  it('无人达成保持零与 null，不伪造中位年龄', () => {
    const actual = createInitialState(baseInputs({ annualIncome: 0, initialAssets: 0 }), 'none', flatConfig());
    const result = calculateParallel({ sim: actual, strategyId: 'balanced' });
    expect(result.medianFireAge).toBeNull();
    expect(result.fireCount).toBe(0);
    expect(fireBeforeAges(result, 30, 90).every((m) => m.count === 0)).toBe(true);
    expect(result.years.at(-1)!.p90).toBeLessThan(0);
  });
  it('开局与首年年末同历年但不同相位，实际值不延长', () => {
    const actual = stepYear(sim).state;
    const result = calculateParallel({ sim: actual, strategyId: 'balanced' });
    const points = parallelPoints(result, actual, true);
    expect(points[0].calendarYear).toBe(points[1].calendarYear);
    expect(points[0].phase).toBe('initial');
    expect(points[1].phase).toBe('yearEnd');
    expect(points[1].actual).toBe(actual.years[0].assets);
    expect(points.slice(2).every((p) => p.actual === null)).toBe(true);
    expect(result.comparison?.actualAssets).toBe(actual.years[0].assets);
  });
  it('不匹配的快照日期不绘入同年曲线', () => {
    const settled = stepYear(sim).state;
    const actual = { ...settled, years: [{ ...settled.years[0], calendarYear: 9999 }] };
    expect(parallelPoints(data, actual, true)[1].actual).toBeNull();
  });
  it('短年限仅绘制真实已有的基线年，不补到十年', () => {
    const actual = createInitialState(baseInputs({ endAge: 31 }), 'short');
    const result = calculateParallel({ sim: actual, strategyId: 'balanced' });
    expect(parallelPoints(result, actual, false)).toHaveLength(2);
  });
  it.each([[0, 300, '0%'], [300, 300, '100%'], [1, 300, '0.3%'], [1, 3, '33.3%'], [2, 3, '66.7%'], [1, 10000, '<0.1%'], [9999, 10000, '>99.9%']])('小样本百分比 %i/%i = %s', (count, total, expected) => {
    expect(formatPathRate(Number(count), Number(total))).toBe(expected);
  });
  it.each([1e12, -1e12, 1e8, -1e8])('资产主数字 %i 紧凑显示，保留单位和符号', (value) => {
    expect(formatAssetMoney(value)).toContain(Math.abs(value) >= 1e12 ? '万亿' : '亿');
    expect(formatAssetMoney(value).length).toBeLessThan(12);
    expect(formatAssetMoney(value).startsWith('-')).toBe(value < 0);
  });
  it('小额资产保持完整金额', () => {
    expect(formatAssetMoney(200000)).toBe(formatMoney(200000));
  });
  it('负数与极大值单位不会变成 NaN 或隐藏负号', () => {
    expect(axisMoney(-123456)).toBe('-12.3万');
    expect(axisMoney(1e12)).toBe('1万亿');
    expect(axisMoney(8e15)).toBe('8000万亿');
    expect(formatMoney(-1e12)).toContain('1,000,000,000,000');
    expect(formatMoney(-1e12).startsWith('-')).toBe(true);
  });
});
