import type { SimConfig, SimState, SimStatus } from './types';
import { initialGoal } from './goals';
import { compareMoney, moneyUnits } from './money';

export function isFire(assets: number, goalAmount: number): boolean {
  const balance = moneyUnits(assets);
  return balance > 0n && balance >= moneyUnits(goalAmount);
}

export function isBankrupt(
  assets: number,
  expenses: number,
  consecutiveNegativeYears: number,
  config: SimConfig,
): boolean {
  return (
    consecutiveNegativeYears >= config.bankruptConsecutiveYears ||
    compareMoney(assets, -config.bankruptDebtMultiple * expenses) < 0
  );
}

export interface EndingSummary {
  status: Exclude<SimStatus, 'running'>;
  title: string;
  age: number;
  calendarYear: number;
  finalAssets: number;
  goalAmount: number;
  ratio: number | null;
}

export function summarizeEnding(state: SimState): EndingSummary | null {
  if (state.status === 'running') return null;
  const { inputs } = state;
  const last = state.years[state.years.length - 1];
  const finalAssets = last ? last.assets : inputs.initialAssets;
  const goalAmount = last ? last.goalAmount : initialGoal(inputs, state.config);

  if (state.status === 'fire') {
    // 达成时点口径：当年快照的年份与年龄；空历史 = 开局即 FIRE（SIMULATION 4.4）。
    const age = last ? last.age : inputs.startAge;
    const calendarYear = last ? last.calendarYear : inputs.startYear;
    const title = !last
      ? '你本来就自由了'
      : age < 40
        ? '传奇提前退休'
        : age <= 50
          ? '黄金自由'
          : '大器晚成';
    return { status: 'fire', title, age, calendarYear, finalAssets, goalAmount, ratio: null };
  }

  if (state.status === 'bankrupt') {
    return {
      status: 'bankrupt',
      title: '财务重启',
      age: last!.age,
      calendarYear: last!.calendarYear,
      finalAssets,
      goalAmount,
      ratio: null,
    };
  }

  // 终点口径：跨入 endAge 的终止节点。
  const age = inputs.endAge;
  const calendarYear = inputs.startYear + (inputs.endAge - inputs.startAge);
  // 同一年名义值之比等于实际购买力之比，无需在此做通胀换算。
  const ratio = finalAssets / goalAmount;
  const title =
    compareMoney(finalAssets, goalAmount * 0.8) >= 0 ? '差一步的赶路人'
      : compareMoney(finalAssets, goalAmount * 0.5) >= 0 ? '稳健的长跑者'
        : compareMoney(finalAssets, goalAmount * 0.25) >= 0 ? '平凡而真实' : '被生活暴击的人';
  return { status: 'end', title, age, calendarYear, finalAssets, goalAmount, ratio };
}
