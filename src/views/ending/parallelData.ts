import type { SimState } from '../../simulation/types';
import type { ParallelData, ParallelPoint } from '../../playback/parallelCalculation';

export function formatPathRate(count: number, total: number): string {
  const percentage = count / total * 100;
  if (count === 0) return '0%';
  if (count === total) return '100%';
  if (percentage < 0.1) return '<0.1%';
  if (percentage > 99.9) return '>99.9%';
  return `${Number(percentage.toFixed(1))}%`;
}

export function fireBeforeAges(data: ParallelData, startAge: number, endAge: number) {
  return [40, 45, 50, 55, 60]
    .filter((age) => age > startAge && age <= endAge)
    .map((age) => ({
      age,
      count: data.firstFireDistribution.reduce((sum, bucket) => sum + (bucket.age < age ? bucket.count : 0), 0),
    }));
}

export interface ParallelChartPoint extends ParallelPoint {
  actual: number | null;
}

export function parallelPoints(data: ParallelData, sim: SimState, full: boolean): ParallelChartPoint[] {
  const last = sim.years.at(-1);
  const years = full ? data.years : data.years.slice(0, Math.max(10, (last?.yearIndex ?? -1) + 1));
  return [data.initial, ...years].map((point) => {
    const actual = point.phase === 'initial'
      ? sim.inputs.initialAssets
      : sim.years.find((year) => year.yearIndex === point.yearIndex && year.calendarYear === point.calendarYear && year.age === point.age)?.assets ?? null;
    return { ...point, actual };
  });
}

export function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${Number((value / 1e12).toPrecision(3))}万亿`;
  if (abs >= 1e8) return `${Number((value / 1e8).toPrecision(3))}亿`;
  if (abs >= 1e4) return `${Number((value / 1e4).toPrecision(3))}万`;
  return `${Number(value.toFixed(1))}`;
}
