import { choiceLog } from './engine';
import { summarizeEnding } from './endings';
import { initialGoal } from './goals';
import { decimalUnits, moneyUnits } from './money';
import type { ReplayData, SimState } from './types';

export const SIMULATION_RULES_VERSION = 'wealth-life-2';

function fingerprint(text: string): string {
  let hash = 144066263297769815596495629667062367629n;
  const prime = 309485009821345068724781371n;
  const mask = (1n << 128n) - 1n;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    hash = ((hash ^ BigInt(code & 255)) * prime) & mask;
    hash = ((hash ^ BigInt(code >>> 8)) * prime) & mask;
  }
  return hash.toString(16).padStart(32, '0');
}

export function createReplayData(state: SimState): ReplayData {
  const ending = summarizeEnding(state);
  if (!ending || state.pending) throw new Error('只能分享完整结局');
  const { inputs: i, config: c } = state;
  const choices = choiceLog(state);
  const outcome = { status: ending.status, years: state.years.length, calendarYear: ending.calendarYear, age: ending.age };
  const money = (value: number) => moneyUnits(value).toString();
  const canonical = [
    2, SIMULATION_RULES_VERSION,
    [i.startAge, i.startYear, i.endAge, i.initialAssets, i.annualIncome, i.annualExpenses,
      i.goal.mode, i.goal.mode === 'manual' ? i.goal.amount : null],
    state.seed,
    [c.inflation, c.incomeGrowth, c.marketMean, c.marketStd, c.withdrawalMultiple,
      c.debtRate, c.returnFloor, c.bankruptConsecutiveYears, c.bankruptDebtMultiple],
    choices.map((choice) => [choice.yearIndex, choice.eventId, choice.choiceId]),
    [money(i.initialAssets), money(initialGoal(i, c))],
    state.years.map((year) => [year.yearIndex, year.calendarYear, year.age,
      money(year.assetsStart), money(year.assets), money(year.income), money(year.expenses),
      money(year.goalAmount), money(year.eventCash ?? 0), money(year.scheduledCashApplied ?? 0),
      decimalUnits(year.marketReturn, 12).toString(), year.eventId, year.choiceId]),
    [outcome.status, outcome.years, outcome.calendarYear, outcome.age, ending.title],
  ];
  return {
    v: 2, rulesVersion: SIMULATION_RULES_VERSION,
    inputs: { ...i, goal: { ...i.goal } }, seed: state.seed, choices, outcome,
    fingerprint: fingerprint(JSON.stringify(canonical)),
  };
}
