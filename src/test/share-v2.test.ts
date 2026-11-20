import { describe, expect, it } from 'vitest';
import { createInitialState } from '../simulation/engine';
import { createReplayData } from '../simulation/replaySignature';
import { decodeCompleteShareHash, encodeShareHash, validateCompleteReplayData, validateReplayData } from '../lib/share';
import { EVENT_POOL } from '../events/definitions';
import { baseInputs, simulateAll } from './fixtures';
import type { ReplayData, SimState } from '../simulation/types';

const regular = simulateAll(baseInputs(), 'restore-seed', { pool: EVENT_POOL });
const original = createReplayData(regular);
function cloneState(): SimState {
  return { ...regular, years: regular.years.map(year => ({ ...year })) };
}
function reject(data: unknown) {
  expect(validateCompleteReplayData(data).ok).toBe(false);
}

describe('分享v2完整结果校验', () => {
  it.each([
    ['普通事件人生', regular],
    ['开局即FIRE', createInitialState(baseInputs({ initialAssets: 1e12 }), 'instant')],
    ['破产', simulateAll(baseInputs({ initialAssets: 0, annualIncome: 0 }), 'serious-debt', { pool: EVENT_POOL })],
    ['无事件终点', simulateAll(baseInputs({ endAge: 31 }), 'short-end', { pool: EVENT_POOL })],
    ['最大合法输入', simulateAll(baseInputs({ startAge: 18, endAge: 120, initialAssets: 1e12, annualIncome: 1e10, annualExpenses: 1e10 }), 'large', { pool: EVENT_POOL })],
  ] as const)('%s在同引擎完整往返', (_, sim) => {
    const data = createReplayData(sim);
    expect(decodeCompleteShareHash(encodeShareHash(data))).toEqual({ ok: true, data });
  });
  it('首次FIRE无事件的原始boundary-194完整分享', () => {
    const sim = simulateAll(baseInputs({ startAge: 28, initialAssets: 1e6, annualIncome: 200000, annualExpenses: 100000, goal: { mode: 'manual', amount: 1037259.3769049707 } }), 'boundary-194', { pool: EVENT_POOL });
    expect(sim.years).toHaveLength(1);
    expect(createReplayData(sim).choices).toEqual([]);
    expect(createReplayData(sim).fingerprint).toBe('9883fbb8ebf5451e594c4f60fdfa9e0e');
    expect(validateCompleteReplayData(createReplayData(sim)).ok).toBe(true);
  });
  it('新发现的半分跨引擎FIRE分歧必须拒绝，不能播放成第1年', () => {
    const sender: ReplayData = {
      v: 2, rulesVersion: 'wealth-life-2',
      inputs: baseInputs({ startAge: 28, initialAssets: 1000000, annualIncome: 804449.0216681306, annualExpenses: 100000, goal: { mode: 'manual', amount: 2037259.88 } }),
      seed: 'boundary-50', choices: [],
      outcome: { status: 'fire', years: 2, calendarYear: 2027, age: 29 },
      fingerprint: '6ee5802f8ac794ef9eb6f7eee1419ca9',
    };
    const current = simulateAll(sender.inputs, sender.seed, { pool: EVENT_POOL });
    expect(current.years).toHaveLength(1);
    expect(current.years[0].assets).toBe(2037259.875);
    reject(sender);
  });
  it('普通人生的目标线跨半分时即使终局相同也拒绝', () => {
    const sim = simulateAll(baseInputs({ startAge: 28, initialAssets: 0, annualIncome: 70000, annualExpenses: 80000 }), 'audit-225', { pool: EVENT_POOL, choose: event => event.choices[225 % event.choices.length].id });
    const changed = { ...sim, years: sim.years.map(year => ({ ...year })) };
    changed.years[4].goalAmount = 1483524.525;
    expect(sim.years[4].goalAmount).toBe(1483524.5249999994);
    expect(createReplayData(changed).outcome).toEqual(createReplayData(sim).outcome);
    reject(createReplayData(changed));
  });
  it('拒绝分享尚未结束或仍待选择的人生', () => {
    expect(() => createReplayData(createInitialState(baseInputs(), 'running'))).toThrow();
  });
  it('终局年数变化即使字段自洽也拒绝', () => {
    const outcome = { ...original.outcome, years: original.outcome.years + 1, age: original.outcome.age + 1, calendarYear: original.outcome.calendarYear + 1 };
    reject({ ...original, outcome });
  });
  it('终局状态不一致拒绝', () => {
    reject({ ...original, outcome: { ...original.outcome, status: original.outcome.status === 'fire' ? 'bankrupt' : 'fire' } });
  });
  it('改变事件选择即使选项合法也拒绝', () => {
    const choices = original.choices.map((choice, index) => index === 0 ? { ...choice, choiceId: EVENT_POOL.find(event => event.id === choice.eventId)!.choices.find(option => option.id !== choice.choiceId)!.id } : choice);
    reject({ ...original, choices });
  });
  it('只改变终点前一年的一分钱轨迹也拒绝', () => {
    const changed = cloneState();
    changed.years[0].assets += 0.01;
    const data = createReplayData(changed);
    expect(data.outcome).toEqual(original.outcome);
    expect(data.fingerprint).not.toBe(original.fingerprint);
    reject(data);
  });
  it('无意义浮点尾数不改变指纹或拒绝普通分享', () => {
    const changed = cloneState();
    changed.years[0].assets += 1e-9;
    changed.years[0].marketReturn += 1e-16;
    expect(changed.years[0].assets).not.toBe(regular.years[0].assets);
    expect(createReplayData(changed)).toEqual(original);
    expect(validateCompleteReplayData(createReplayData(changed)).ok).toBe(true);
  });
  it('同一分内改动输入仍被识别，不掩盖改载荷', () => {
    reject({ ...original, inputs: { ...original.inputs, initialAssets: original.inputs.initialAssets + 0.001 } });
  });
  it('更换种子或指纹被拒绝', () => {
    reject({ ...original, seed: 'another-seed' });
    reject({ ...original, fingerprint: '0'.repeat(32) });
  });
  it('不同属性顺序不影响规范化身份', () => {
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    expect(validateCompleteReplayData(reordered)).toEqual({ ok: true, data: original });
    const changed = { ...regular, inputs: Object.fromEntries(Object.entries(regular.inputs).reverse()) as SimState['inputs'] };
    expect(createReplayData(changed).fingerprint).toBe(original.fingerprint);
  });
  it('自定义模型与默认接收规则不一致则拒绝', () => {
    const changed = { ...regular, config: { ...regular.config, inflation: regular.config.inflation + 0.001 } };
    reject(createReplayData(changed));
  });
  it('v1拒绝并提示重新分享', () => {
    const result = validateCompleteReplayData({ v: 1, inputs: original.inputs, seed: original.seed, choices: original.choices });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('重新分享');
  });
  it.each(['future-rules', '', null])('未知规则版本%s拒绝', (rulesVersion) => {
    reject({ ...original, rulesVersion });
  });
  it.each([null, {}, { ...original.outcome, years: -1 }, { ...original.outcome, years: 1.5 }, { ...original.outcome, age: 999 }, { ...original.outcome, calendarYear: 2020 }, { ...original.outcome, status: 'running' }])('非法终局字段%j拒绝', (outcome) => {
    reject({ ...original, outcome });
  });
  it.each(['', 'a'.repeat(31), 'A'.repeat(32), '<script>', null])('非法指纹%s拒绝', (fingerprint) => {
    expect(typeof validateReplayData({ ...original, fingerprint })).toBe('string');
  });
  it('轨迹校验不是身份认证，修改后重新生成合法人生仍可分享', () => {
    const alternative = simulateAll({ ...regular.inputs, initialAssets: 300000 }, regular.seed, { pool: EVENT_POOL });
    const data: ReplayData = createReplayData(alternative);
    expect(data.fingerprint).not.toBe(original.fingerprint);
    expect(validateCompleteReplayData(data).ok).toBe(true);
  });
});
