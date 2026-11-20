import { runMonteCarlo, runStrategyComparison, compareWithParallelLives } from '../src/simulation/montecarlo';
import { createInitialState, stepYear, choiceLog } from '../src/simulation/engine';
import { summarizeEnding } from '../src/simulation/endings';
import { EVENT_POOL } from '../src/events/definitions';
import type { SimInputs } from '../src/simulation/types';

const inputs: SimInputs = {
  startYear: 2026, startAge: 28, endAge: 90,
  initialAssets: 200000, annualIncome: 200000, annualExpenses: 120000,
  goal: { mode: 'auto' },
};
const baseSeed = 'p4a-example-2026';
const start = performance.now();
const result = runMonteCarlo(inputs, baseSeed);
const elapsedMs = performance.now() - start;
const strategyStart = performance.now();
const strategies = runStrategyComparison(inputs, baseSeed);
const strategyElapsedMs = performance.now() - strategyStart;

let actual = createInitialState(inputs, `${baseSeed}:actual`, undefined, EVENT_POOL);
while (actual.status === 'running') {
  const pending = actual.pending;
  actual = stepYear(actual, pending ? {
    yearIndex: pending.year.yearIndex,
    eventId: pending.event.id,
    choiceId: pending.event.choices[0].id,
  } : undefined).state;
}

const timings72: number[] = [];
for (let i = 0; i < 7; i++) {
  const start = performance.now();
  runMonteCarlo({ ...inputs, startAge: 18 }, baseSeed);
  timings72.push(performance.now() - start);
}

console.log(JSON.stringify({
  environment: 'Node.js; browser timings recorded separately',
  inputs, baseSeed, totalPaths: result.totalPaths,
  model: result.model,
  fireCount: result.fireCount, nonFireCount: result.nonFireCount,
  fireRate: result.fireRate, nonFireRate: result.nonFireRate,
  medianFireAge: result.medianFireAge, bankruptcyCount: result.bankruptcyCount,
  ages: result.years.filter((y) => [35, 45, 55, 65].includes(y.age)).map(({ age, calendarYear, p10, p50, p90 }) => ({ age, calendarYear, p10, p50, p90 })),
  firstFireDistribution: result.firstFireDistribution,
  strategies: strategies.map(({ strategy, result: r }) => ({
    id: strategy.id, label: strategy.label, fireRate: r.fireRate, nonFireRate: r.nonFireRate,
    fireCount: r.fireCount, medianFireAge: r.medianFireAge,
    lastYear: r.years.at(-1)!.calendarYear, lastAge: r.years.at(-1)!.age,
    p10: r.years.at(-1)!.p10, p50: r.years.at(-1)!.p50, p90: r.years.at(-1)!.p90,
  })),
  actual: {
    seed: actual.seed, choicePolicy: '每个真实事件选第一个选项（固定可复现策略，不代表最优）',
    ending: summarizeEnding(actual), choices: choiceLog(actual),
    comparison: compareWithParallelLives(actual, result),
  },
  elapsedMs, strategyElapsedMs, timings72,
}, null, 2));
