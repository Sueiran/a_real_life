import { INVESTMENT_STRATEGIES, MONTE_CARLO_DEFAULT_PATHS } from '../simulation/config';
import { compareWithParallelLives, runMonteCarlo, runStrategyComparison } from '../simulation/montecarlo';
import type { AssetDistribution, FirstFireBucket, ParallelLifeComparison, SimState } from '../simulation/types';

export type ParallelPoint = Omit<AssetDistribution, 'sortedAssets'>;
export interface ParallelData {
  totalPaths: number;
  fireCount: number;
  medianFireAge: number | null;
  firstFireDistribution: readonly FirstFireBucket[];
  initial: ParallelPoint;
  years: readonly ParallelPoint[];
  comparison: ParallelLifeComparison | null;
}
export interface ParallelRequest { sim: SimState; strategyId: string }
export type ParallelResponse =
  | { strategyId: string; data: ParallelData; elapsedMs: number }
  | { strategyId: string; error: string };

function projectPoint(point: AssetDistribution): ParallelPoint {
  const { phase, yearIndex, calendarYear, age, goalAmount, p10, p50, p90 } = point;
  return { phase, yearIndex, calendarYear, age, goalAmount, p10, p50, p90 };
}

export function calculateParallel({ sim, strategyId }: ParallelRequest): ParallelData {
  const strategy = INVESTMENT_STRATEGIES.find((item) => item.id === strategyId);
  if (!strategy) throw new Error('未知策略');
  const result = strategyId === 'balanced'
    ? runMonteCarlo(sim.inputs, sim.seed, MONTE_CARLO_DEFAULT_PATHS, sim.config)
    : runStrategyComparison(sim.inputs, sim.seed, MONTE_CARLO_DEFAULT_PATHS, sim.config, [strategy])[0].result;
  return {
    totalPaths: result.totalPaths,
    fireCount: result.fireCount,
    medianFireAge: result.medianFireAge,
    firstFireDistribution: result.firstFireDistribution,
    initial: projectPoint(result.initial),
    years: result.years.map(projectPoint),
    comparison: compareWithParallelLives(sim, result),
  };
}
