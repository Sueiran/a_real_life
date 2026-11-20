import { describe, expect, it } from 'vitest';
import { createInitialState, replay, stepYear } from '../simulation/engine';
import { summarizeEnding } from '../simulation/endings';
import { compareWithParallelLives, runMonteCarlo } from '../simulation/montecarlo';
import type { MonteCarloResult, SimState } from '../simulation/types';
import { baseInputs, flatConfig, makeEvent } from './fixtures';

const inputs = baseInputs({ endAge: 35 });
const baseline = runMonteCarlo(inputs, 'percentile', 5, flatConfig());
const initial = createInitialState(inputs, 'actual', flatConfig());
const settled = stepYear(initial).state;

function compareSample(assets: number, sortedAssets: number[]) {
  const actual: SimState = { ...settled, years: [{ ...settled.years[0], assets }] };
  const distribution: MonteCarloResult = {
    ...baseline,
    years: [{ ...baseline.years[0], sortedAssets, p10: -160, p50: 0, p90: 120 }],
  };
  return compareWithParallelLives(actual, distribution);
}

describe('同年模型内相对比较', () => {
  it('负资产样本和平局采用中位秩，严格超过比例不包含平局', () => {
    const r = compareSample(0, [-200, -100, 0, 0, 200])!;
    expect(r.belowCount).toBe(2);
    expect(r.equalCount).toBe(2);
    expect(r.percentile).toBe(60);
    expect(r.strictlyBelowRate).toBe(0.4);
    expect(r.sampleCount).toBe(5);
    expect(r.p10).toBe(-160);
    expect(r.actualAssets).toBe(0);
  });

  it('严格负资产比较不钳制为零', () => {
    const r = compareSample(-100, [-200, -100, 0, 0, 200])!;
    expect(r.percentile).toBe(30);
    expect(r.strictlyBelowRate).toBe(0.2);
  });

  it('低于全部/高于全部分别为 0/100 百分位', () => {
    expect(compareSample(-201, [-200, -100, 0, 0, 200])!.percentile).toBe(0);
    expect(compareSample(201, [-200, -100, 0, 0, 200])!.percentile).toBe(100);
  });

  it('全体平局是第 50 百分位而不是跑赢全部', () => {
    const r = compareSample(100, [100, 100, 100])!;
    expect(r.percentile).toBe(50);
    expect(r.strictlyBelowRate).toBe(0);
  });

  it('单样本相等为第 50 百分位', () => {
    expect(compareSample(100, [100])!.percentile).toBe(50);
  });

  it('空分布返回 null 而不是 NaN', () => {
    expect(compareSample(100, [])).toBeNull();
    expect(compareWithParallelLives(initial, { ...baseline, initial: { ...baseline.initial, sortedAssets: [] } })).toBeNull();
  });

  it('未结算空历史比较 initial 而不是 t=0 年末', () => {
    const r = compareWithParallelLives(initial, baseline)!;
    expect(r.phase).toBe('initial');
    expect(r.actualAssets).toBe(inputs.initialAssets);
    expect(r.p50).toBe(inputs.initialAssets);
    expect(r.percentile).toBe(50);
    expect(baseline.years[0].p50).not.toBe(r.p50);
  });

  it('开局即 FIRE 比较初始分布，不借用未来年末金额', () => {
    const inp = baseInputs({ initialAssets: 3000000 });
    const actual = createInitialState(inp, 'initial-fire');
    const r = compareWithParallelLives(actual, runMonteCarlo(inp, 'initial-fire', 2))!;
    expect(actual.status).toBe('fire');
    expect(actual.years).toHaveLength(0);
    expect(r.phase).toBe('initial');
    expect(r.percentile).toBe(50);
  });

  it('提前 FIRE 只用实际终止快照同年分布，不比较基线最终资产', () => {
    const inp = baseInputs({ annualIncome: 2e6 });
    const actual = replay(inp, 'actual', [], flatConfig());
    const mc = runMonteCarlo(inp, 'baseline', 3, flatConfig());
    const r = compareWithParallelLives(actual, mc)!;
    const last = actual.years.at(-1)!;
    expect(actual.status).toBe('fire');
    expect(last.yearIndex).toBeLessThan(mc.years.length - 1);
    expect(r.yearIndex).toBe(last.yearIndex);
    expect(r.calendarYear).toBe(last.calendarYear);
    expect(r.p50).toBe(mc.years[last.yearIndex].p50);
    expect(r.p50).not.toBe(mc.years.at(-1)!.p50);
    expect(r.percentile).toBe(50);
  });

  it('提前破产按负资产终止快照比较', () => {
    const inp = baseInputs({ initialAssets: 0, annualIncome: 0 });
    const actual = replay(inp, 'actual', [], flatConfig());
    const mc = runMonteCarlo(inp, 'baseline', 3, flatConfig());
    const r = compareWithParallelLives(actual, mc)!;
    expect(actual.status).toBe('bankrupt');
    expect(r.yearIndex).toBe(actual.years.at(-1)!.yearIndex);
    expect(r.actualAssets).toBeLessThan(0);
    expect(r.percentile).toBe(50);
  });

  it('走到终点用最后结算年，不使用 endAge 的展示标签错配下一年', () => {
    const actual = replay(inputs, 'actual', [], flatConfig());
    expect(actual.status).toBe('end');
    expect(summarizeEnding(actual)!.age).toBe(35);
    const r = compareWithParallelLives(actual, baseline)!;
    expect(r.age).toBe(34);
    expect(r.yearIndex).toBe(4);
    expect(r.calendarYear).toBe(2030);
  });

  it('pending 暂记年不当作已发生的资产', () => {
    let actual = createInitialState(inputs, 'pending', flatConfig(), [makeEvent()]);
    for (let t = 0; t < 5 && !actual.pending; t++) actual = stepYear(actual).state;
    expect(actual.pending).not.toBeNull();
    const r = compareWithParallelLives(actual, baseline)!;
    expect(r.yearIndex).toBe(actual.years.at(-1)!.yearIndex);
    expect(r.yearIndex).toBeLessThan(actual.pending!.year.yearIndex);
  });

  it('不同起点输入、年份或目标不比较', () => {
    for (const patch of [{ startYear: 2027 }, { initialAssets: 999 }, { annualExpenses: 10 }, { goal: { mode: 'manual' as const, amount: 3e6 } }]) {
      expect(compareWithParallelLives({ ...settled, inputs: { ...inputs, ...patch } }, baseline)).toBeNull();
    }
  });

  it('同索引但实际日历年、年龄、相位不匹配时拒绝', () => {
    for (const patch of [{ calendarYear: 2099 }, { age: 50 }, { phase: 'initial' as const }]) {
      expect(compareWithParallelLives(settled, { ...baseline, years: [{ ...baseline.years[0], ...patch }] })).toBeNull();
    }
    expect(compareWithParallelLives(settled, { ...baseline, years: [] })).toBeNull();
  });

  it('不修改实际历史或基线分布，返回结果可确定性序列化', () => {
    const before = JSON.stringify({ settled, baseline });
    const a = compareWithParallelLives(settled, baseline);
    const b = compareWithParallelLives(settled, baseline);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify({ settled, baseline })).toBe(before);
  });
});
