import type { SimConfig, SimInputs } from './types';

export function goalForYear(
  inputs: SimInputs,
  config: SimConfig,
  yearIndex: number,
  expenses: number,
): number {
  if (inputs.goal.mode === 'auto') return expenses * config.withdrawalMultiple;
  return inputs.goal.amount * Math.pow(1 + config.inflation, yearIndex);
}

export function initialGoal(inputs: SimInputs, config: SimConfig): number {
  return goalForYear(inputs, config, 0, inputs.annualExpenses);
}
