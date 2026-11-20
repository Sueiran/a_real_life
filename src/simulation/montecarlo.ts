import {
  DEFAULT_CONFIG,
  INVESTMENT_STRATEGIES,
  MONTE_CARLO_DEFAULT_PATHS,
  MONTE_CARLO_MAX_PATHS,
} from './config';
import { calculateFinancialYear } from './engine';
import { isBankrupt, isFire } from './endings';
import { initialGoal } from './goals';
import { compareMoney } from './money';
import type {
  AssetDistribution,
  FirstFireBucket,
  InvestmentStrategy,
  MonteCarloPath,
  MonteCarloResult,
  ParallelLifeComparison,
  SimConfig,
  SimInputs,
  SimState,
  SimulationPoint,
  StrategyComparison,
  YearState,
} from './types';

function quantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const low = Math.floor(h);
  return sorted[low] + (sorted[Math.ceil(h)] - sorted[low]) * (h - low);
}

function distribution(
  point: SimulationPoint,
  goalAmount: number,
  assets: number[],
): AssetDistribution {
  const sortedAssets = assets.sort((a, b) => a - b);
  return {
    ...point,
    goalAmount,
    sortedAssets,
    p10: quantile(sortedAssets, 0.1),
    p50: quantile(sortedAssets, 0.5),
    p90: quantile(sortedAssets, 0.9),
  };
}

export function runMonteCarlo(
  inputs: SimInputs,
  baseSeed: string,
  n = MONTE_CARLO_DEFAULT_PATHS,
  config: SimConfig = DEFAULT_CONFIG,
): MonteCarloResult {
  if (!Number.isInteger(n) || n < 1 || n > MONTE_CARLO_MAX_PATHS) {
    throw new RangeError(`n 必须为 1…${MONTE_CARLO_MAX_PATHS} 的整数`);
  }
  const horizon = inputs.endAge - inputs.startAge;
  if (!Number.isSafeInteger(horizon) || horizon <= 0) {
    throw new RangeError('endAge − startAge 必须为正整数');
  }
  const start: SimulationPoint = {
    phase: 'initial', yearIndex: 0, calendarYear: inputs.startYear, age: inputs.startAge,
  };
  const goal = initialGoal(inputs, config);
  const fireAtStart = isFire(inputs.initialAssets, goal);
  const paths: MonteCarloPath[] = [];
  for (let i = 0; i < n; i++) {
    const seed = `${baseSeed}:mc:${i}`;
    const years: YearState[] = [];
    let assets = inputs.initialAssets;
    let negativeYears = 0;
    let firstFire: SimulationPoint | null = fireAtStart ? { ...start } : null;
    let firstBankruptcy: SimulationPoint | null = null;
    for (let t = 0; t < horizon; t++) {
      const year = calculateFinancialYear(inputs, config, seed, t, assets);
      if (![year.assets, year.income, year.expenses, year.goalAmount, year.marketReturn].every(Number.isFinite)) {
        throw new RangeError(`路径 ${i} 年份 ${t} 的财务值超出有限数范围`);
      }
      assets = year.assets;
      negativeYears = compareMoney(assets, 0) < 0 ? negativeYears + 1 : 0;
      const point: SimulationPoint = {
        phase: 'yearEnd', yearIndex: t, calendarYear: year.calendarYear, age: year.age,
      };
      if (!firstFire && !firstBankruptcy && isFire(assets, year.goalAmount)) firstFire = point;
      if (!firstBankruptcy && isBankrupt(assets, year.expenses, negativeYears, config)) {
        firstBankruptcy = point;
      }
      years.push(year);
    }
    paths.push({ seed, years, firstFire, firstBankruptcy });
  }

  const initial = distribution(start, goal, paths.map(() => inputs.initialAssets));
  const years = paths[0].years.map((year) => distribution(
    { phase: 'yearEnd', yearIndex: year.yearIndex, calendarYear: year.calendarYear, age: year.age },
    year.goalAmount,
    paths.map((path) => path.years[year.yearIndex].assets),
  ));
  const fireAges = paths.flatMap((path) => path.firstFire ? [path.firstFire.age] : []).sort((a, b) => a - b);
  const firstFireDistribution: FirstFireBucket[] = [];
  for (const point of [initial, ...years]) {
    const count = paths.filter((path) => path.firstFire?.phase === point.phase
      && path.firstFire.yearIndex === point.yearIndex).length;
    if (count > 0) {
      firstFireDistribution.push({
        phase: point.phase, yearIndex: point.yearIndex, calendarYear: point.calendarYear,
        age: point.age, count, proportion: count / n,
      });
    }
  }
  return {
    model: 'continued-work-no-events',
    inputs: { ...inputs, goal: { ...inputs.goal } },
    config: { ...config },
    baseSeed,
    totalPaths: n,
    paths,
    initial,
    years,
    fireCount: fireAges.length,
    nonFireCount: n - fireAges.length,
    fireRate: fireAges.length / n,
    nonFireRate: (n - fireAges.length) / n,
    medianFireAge: fireAges.length ? quantile(fireAges, 0.5) : null,
    firstFireDistribution,
    bankruptcyCount: paths.filter((path) => path.firstBankruptcy !== null).length,
  };
}

export function runStrategyComparison(
  inputs: SimInputs,
  baseSeed: string,
  n = MONTE_CARLO_DEFAULT_PATHS,
  config: SimConfig = DEFAULT_CONFIG,
  strategies: readonly InvestmentStrategy[] = INVESTMENT_STRATEGIES,
): StrategyComparison[] {
  return strategies.map((strategy) => ({
    strategy: { ...strategy },
    result: runMonteCarlo(inputs, baseSeed, n, {
      ...config, marketMean: strategy.marketMean, marketStd: strategy.marketStd,
    }),
  }));
}

export function compareWithParallelLives(
  actual: SimState,
  result: MonteCarloResult,
): ParallelLifeComparison | null {
  const a = actual.inputs;
  const b = result.inputs;
  if (a.startAge !== b.startAge || a.startYear !== b.startYear || a.endAge !== b.endAge
    || a.initialAssets !== b.initialAssets || a.annualIncome !== b.annualIncome
    || a.annualExpenses !== b.annualExpenses || a.goal.mode !== b.goal.mode
    || (a.goal.mode === 'manual' && b.goal.mode === 'manual' && a.goal.amount !== b.goal.amount)) {
    return null;
  }
  const last = actual.years[actual.years.length - 1];
  const point: SimulationPoint = last
    ? { phase: 'yearEnd', yearIndex: last.yearIndex, calendarYear: last.calendarYear, age: last.age }
    : { phase: 'initial', yearIndex: 0, calendarYear: a.startYear, age: a.startAge };
  const baseline = last ? result.years.find((year) => year.yearIndex === point.yearIndex) : result.initial;
  if (!baseline || baseline.phase !== point.phase || baseline.calendarYear !== point.calendarYear
    || baseline.age !== point.age || baseline.sortedAssets.length === 0) return null;
  const actualAssets = last ? last.assets : a.initialAssets;
  const comparisons = baseline.sortedAssets.map((assets) => compareMoney(assets, actualAssets));
  const belowCount = comparisons.filter((value) => value < 0).length;
  const equalCount = comparisons.filter((value) => value === 0).length;
  const sampleCount = baseline.sortedAssets.length;
  return {
    ...point,
    actualAssets,
    sampleCount,
    belowCount,
    equalCount,
    percentile: 100 * (belowCount + equalCount / 2) / sampleCount,
    strictlyBelowRate: belowCount / sampleCount,
    p10: baseline.p10,
    p50: baseline.p50,
    p90: baseline.p90,
  };
}
