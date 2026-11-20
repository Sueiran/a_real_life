import { describe, expect, it } from 'vitest';
import { isBankrupt, isFire } from '../simulation/endings';
import { createInitialState, replay, stepYear } from '../simulation/engine';
import { baseInputs, flatConfig, makeEvent } from './fixtures';
import { EVENT_POOL } from '../events/definitions';
import { compareMoney, decimalUnits, moneyUnits } from '../simulation/money';
import { calculateFinancialYear } from '../simulation/engine';
import { pickEvent } from '../events/matcher';

function adjacent(value: number, direction: bigint): number {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value);
  buffer.setBigUint64(0, buffer.getBigUint64(0) + direction);
  return buffer.getFloat64(0);
}

const boundary = baseInputs({ startAge: 28, initialAssets: 1000000, annualIncome: 200000, annualExpenses: 100000, goal: { mode: 'manual', amount: 1037259.3769049707 } });

describe('十进制货币规范化', () => {
  it.each([
    [1.005, 101n], [-1.005, -101n], [-0.005, -1n], [-0.0049, 0n], [-0, 0n],
    [1e-7, 0n], [1e21, 100000000000000000000000n],
    [Number.MAX_SAFE_INTEGER, 900719925474099100n], [1e16 - 2, 999999999999999800n],
  ] as const)('%s 转为固定分单位 %s', (amount, units) => {
    expect(moneyUnits(amount)).toBe(units);
  });
  it('极大有限数不经Number乘100溢出，极小数归零', () => {
    expect(moneyUnits(Number.MAX_VALUE)).toBe(17976931348623157n * 10n ** 294n);
    expect(moneyUnits(Number.MIN_VALUE)).toBe(0n);
  });
  it.each([NaN, Infinity, -Infinity])('拒绝非有限值%s', (value) => {
    expect(() => moneyUnits(value)).toThrow(RangeError);
  });
  it('比率固定12位，金额固定2位且比较对称', () => {
    expect(decimalUnits(0.1234567890125, 12)).toBe(123456789013n);
    expect(compareMoney(-1.005, -1)).toBe(-1);
    expect(compareMoney(-1, -1.005)).toBe(1);
    expect(compareMoney(-0, 0)).toBe(0);
  });
});

describe('固定分单位财务判定', () => {
  it('自动目标通胀公式不变，仅达标判定按分', () => {
    const inputs = baseInputs({ annualExpenses: 0.040004, initialAssets: 0 });
    const config = flatConfig({ inflation: 0.1 });
    const year = calculateFinancialYear(inputs, config, 'inflation', 1, 0);
    expect(year.goalAmount).toBe(inputs.annualExpenses * 1.1 * config.withdrawalMultiple);
    expect(isFire(1.1, year.goalAmount)).toBe(true);
    expect(isFire(1.09, year.goalAmount)).toBe(false);
  });
  it('手动目标按原通胀公式增长后再独立规范化', () => {
    const inputs = baseInputs({ goal: { mode: 'manual', amount: 1.0001 } });
    const year = calculateFinancialYear(inputs, flatConfig({ inflation: 0.1 }), 'manual', 1, 0);
    expect(year.goalAmount).toBe(1.0001 * 1.1);
    expect(isFire(1.1, year.goalAmount)).toBe(true);
  });
  it('连续负债计数在不足半分年清零', () => {
    let sim = createInitialState(baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 0.005 }), 'streak', flatConfig({ debtRate: 0 }));
    sim = stepYear(sim).state;
    expect(sim.negativeYears).toBe(1);
    sim = { ...sim, inputs: { ...sim.inputs, annualIncome: 0.01, annualExpenses: 0.0099 } };
    sim = stepYear(sim).state;
    expect(sim.years[1].assets).toBeCloseTo(-0.0049, 12);
    expect(sim.negativeYears).toBe(0);
  });
  it('资产事件门槛与FIRE使用相同分单位', () => {
    const event = makeEvent({ minAssets: 100, maxAssets: 100 });
    const sim = createInitialState(baseInputs(), 'threshold', flatConfig(), [event]);
    const year = calculateFinancialYear(sim.inputs, sim.config, sim.seed, 2, 0);
    expect(pickEvent(sim, { ...year, assets: 99.995 })?.id).toBe(event.id);
    expect(pickEvent(sim, { ...year, assets: adjacent(99.995, -1n) })).toBeNull();
    expect(pickEvent(sim, { ...year, assets: 100.005 })).toBeNull();
  });
  it('保留 boundary-194 两引擎原始第一年资产，货币判定一致', () => {
    expect(isFire(1037259.3769049707, 1037259.3769049707)).toBe(true);
    expect(isFire(1037259.3769049705, 1037259.3769049707)).toBe(true);
    expect(replay(boundary, 'boundary-194', [], undefined, EVENT_POOL).years).toHaveLength(1);
  });
  it('开局同一分达标，不把不足一分的正资产当正余额', () => {
    expect(createInitialState(baseInputs({ initialAssets: 999.999, goal: { mode: 'manual', amount: 1000 } }), 'cent').status).toBe('fire');
    expect(isFire(0.0049, 0.001)).toBe(false);
  });
  it.each([99.9949, adjacent(99.995, -1n)])('低于半分界线 %s 不达标', (assets) => {
    expect(isFire(assets, 100)).toBe(false);
  });
  it.each([99.995, adjacent(99.995, 1n), 99.999, 100])('同一分 %s 达标', (assets) => {
    expect(isFire(assets, 100)).toBe(true);
  });
  it('目标也独立规范化，半分边界不使用EPSILON抹平', () => {
    expect(isFire(100, adjacent(100.005, -1n))).toBe(true);
    expect(isFire(100, 100.005)).toBe(false);
    expect(isFire(100, adjacent(100.005, 1n))).toBe(false);
  });
  it('负债门槛严格按分比较', () => {
    expect(isBankrupt(-500.0049, 100, 0, flatConfig())).toBe(false);
    expect(isBankrupt(-500.005, 100, 0, flatConfig())).toBe(true);
  });
  it('小于半分负余额不触发救援或负债计数，半分触发', () => {
    for (const [expense, expected] of [[0.0049, false], [0.005, true]] as const) {
      const initial = createInitialState(baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: expense }), 'zero', flatConfig(), EVENT_POOL);
      const state = stepYear(initial).state;
      expect(Boolean(state.pending)).toBe(expected);
      expect(state.negativeYears).toBe(expected ? 1 : 0);
    }
  });
  it('不足半分负余额使用货币非负分支但不清零原余额', () => {
    const initial = createInitialState(baseInputs({ initialAssets: -0.004, annualIncome: 0, annualExpenses: 1 }), 'rate', flatConfig({ marketMean: 0.1, debtRate: 0.08 }));
    expect(stepYear(initial).year.assets).toBe(-0.004 * 1.1 - 1);
  });
  it('事件现金后同一分达到FIRE', () => {
    const event = makeEvent({ choices: [{ id: 'cash', label: '现金', hint: '', effects: [{ type: 'cash', amount: 999.999 }] }] });
    let sim = createInitialState(baseInputs({ initialAssets: 0, annualIncome: 100, annualExpenses: 100, goal: { mode: 'manual', amount: 1000 } }), 'cash', flatConfig(), [event]);
    for (let i = 0; i < 3; i++) sim = stepYear(sim).state;
    expect(sim.pending?.event.id).toBe(event.id);
    sim = stepYear(sim, { yearIndex: 2, eventId: event.id, choiceId: 'cash' }).state;
    expect(sim.status).toBe('fire');
    expect(sim.years[2].assets).toBe(999.999);
  });
  it('万亿金额保持分界，不使用随金额增长的容差', () => {
    expect(isFire(1e12 - 0.004, 1e12)).toBe(true);
    expect(isFire(1e12 - 0.006, 1e12)).toBe(false);
    expect(isFire(1e16 - 2, 1e16)).toBe(false);
  });
});
