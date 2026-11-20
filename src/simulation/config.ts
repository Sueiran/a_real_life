import type { InvestmentStrategy, SimConfig } from './types';

export const DEFAULT_CONFIG: SimConfig = {
  inflation: 0.025,
  incomeGrowth: 0.03,
  marketMean: 0.07,
  marketStd: 0.15,
  withdrawalMultiple: 25,
  debtRate: 0.08,
  returnFloor: -0.95,
  bankruptConsecutiveYears: 5,
  bankruptDebtMultiple: 5,
};

export const INVESTMENT_STRATEGIES: readonly InvestmentStrategy[] = [
  { id: 'aggressive', label: '进取', marketMean: 0.09, marketStd: 0.22 },
  { id: 'balanced', label: '平衡', marketMean: DEFAULT_CONFIG.marketMean, marketStd: DEFAULT_CONFIG.marketStd },
  { id: 'conservative', label: '保守', marketMean: 0.045, marketStd: 0.08 },
];

export const MONTE_CARLO_DEFAULT_PATHS = 300;
export const MONTE_CARLO_MAX_PATHS = 10000;
