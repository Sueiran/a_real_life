import { describe, expect, it } from 'vitest';
import { decodeShareHash, encodeShareHash, validateReplayData } from '../lib/share';
import type { ReplayData } from '../simulation/types';
import { baseInputs } from './fixtures';

function sample(overrides: Partial<ReplayData> = {}): ReplayData {
  return {
    v: 2,
    rulesVersion: 'wealth-life-2',
    outcome: { status: 'fire', years: 6, calendarYear: 2031, age: 35 },
    fingerprint: '0123456789abcdef0123456789abcdef',
    inputs: baseInputs(),
    seed: '平行人生-🌱-seed',
    choices: [
      { yearIndex: 2, eventId: 'startup-invite', choiceId: 'invest' },
      { yearIndex: 5, eventId: 'startup-exit', choiceId: 'close' },
    ],
    ...overrides,
  };
}

describe('分享链接编解码', () => {
  it('含中文与 emoji 的 ReplayData 往返深相等', () => {
    const data = sample();
    const result = decodeShareHash(encodeShareHash(data));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(data);
  });

  it('hash 以 #r= 开头且仅含 base64url 字符', () => {
    const hash = encodeShareHash(sample());
    expect(hash.startsWith('#r=')).toBe(true);
    expect(hash.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('同一数据编码结果稳定，解码不依赖运行环境状态', () => {
    const data = sample();
    const h1 = encodeShareHash(data);
    const h2 = encodeShareHash(data);
    expect(h1).toBe(h2);
    const r1 = decodeShareHash(h1);
    const r2 = decodeShareHash(h2);
    expect(r1).toEqual(r2);
  });

  it('manual 目标往返保留金额', () => {
    const data = sample({ inputs: baseInputs({ goal: { mode: 'manual', amount: 8000000 } }) });
    const result = decodeShareHash(encodeShareHash(data));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.inputs.goal).toEqual({ mode: 'manual', amount: 8000000 });
  });

  it('解码只保留契约字段，丢弃多余注入字段', () => {
    const raw = { ...sample(), evil: '<script>', inputs: { ...baseInputs(), extra: 1 } };
    const result = validateReplayData(raw);
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(Object.keys(result).sort()).toEqual(['choices', 'fingerprint', 'inputs', 'outcome', 'rulesVersion', 'seed', 'v']);
      expect('extra' in result.inputs).toBe(false);
    }
  });
});

describe('分享链接拒绝非法数据', () => {
  it('版本不匹配被拒绝并提示版本', () => {
    const result = validateReplayData({ ...sample(), v: 3 });
    expect(typeof result).toBe('string');
    expect(result as string).toContain('版本');
  });

  it('非法金额被拒绝', () => {
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ initialAssets: -1 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ initialAssets: 1e13 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ annualExpenses: 0 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ annualIncome: 1e11 }) }))).toBe('string');
  });

  it('外部手动目标与开局表单使用相同下限', () => {
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ goal: { mode: 'manual', amount: 600000 } }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ goal: { mode: 'manual', amount: 600001 } }) }))).not.toBe('string');
  });

  it('非法年龄与年份被拒绝', () => {
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ startAge: 17 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ startAge: 71 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ startAge: 30.5 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ endAge: 30 }) }))).toBe('string');
    expect(typeof validateReplayData(sample({ inputs: baseInputs({ startYear: 1899 }) }))).toBe('string');
  });

  it('过长或空种子被拒绝', () => {
    expect(typeof validateReplayData(sample({ seed: 'x'.repeat(129) }))).toBe('string');
    expect(typeof validateReplayData(sample({ seed: '' }))).toBe('string');
    expect(typeof validateReplayData(sample({ seed: 123 as unknown as string }))).toBe('string');
  });

  it('未知事件或未知选项被拒绝', () => {
    expect(
      typeof validateReplayData(sample({ choices: [{ yearIndex: 2, eventId: 'not-an-event', choiceId: 'invest' }] })),
    ).toBe('string');
    expect(
      typeof validateReplayData(sample({ choices: [{ yearIndex: 2, eventId: 'startup-invite', choiceId: 'bogus' }] })),
    ).toBe('string');
  });

  it('重复、乱序或越界年份被拒绝', () => {
    const dup = [
      { yearIndex: 2, eventId: 'promotion', choiceId: 'accept' },
      { yearIndex: 2, eventId: 'marriage', choiceId: 'marry' },
    ];
    expect(typeof validateReplayData(sample({ choices: dup }))).toBe('string');
    const desc = [
      { yearIndex: 5, eventId: 'promotion', choiceId: 'accept' },
      { yearIndex: 2, eventId: 'marriage', choiceId: 'marry' },
    ];
    expect(typeof validateReplayData(sample({ choices: desc }))).toBe('string');
    expect(
      typeof validateReplayData(sample({ choices: [{ yearIndex: 60, eventId: 'promotion', choiceId: 'accept' }] })),
    ).toBe('string');
    expect(
      typeof validateReplayData(sample({ choices: [{ yearIndex: -1, eventId: 'promotion', choiceId: 'accept' }] })),
    ).toBe('string');
  });

  it('超长选择日志被拒绝', () => {
    const choices = Array.from({ length: 201 }, (_, i) => ({
      yearIndex: i,
      eventId: 'promotion',
      choiceId: 'accept',
    }));
    expect(typeof validateReplayData(sample({ choices }))).toBe('string');
  });

  it('损坏的 base64 / JSON 载荷安全拒绝，不抛异常', () => {
    expect(decodeShareHash('#r=!!!not-base64!!!').ok).toBe(false);
    const truncated = encodeShareHash(sample()).slice(0, 20);
    expect(decodeShareHash(truncated).ok).toBe(false);
    expect(decodeShareHash('#r=').ok).toBe(false);
    expect(decodeShareHash('#other=abc').ok).toBe(false);
  });

  it('超长 hash 被拒绝', () => {
    expect(decodeShareHash('#r=' + 'A'.repeat(16385)).ok).toBe(false);
  });

  it('非法目标金额被拒绝', () => {
    expect(
      typeof validateReplayData(sample({ inputs: baseInputs({ goal: { mode: 'manual', amount: 0 } }) })),
    ).toBe('string');
    expect(
      typeof validateReplayData(sample({ inputs: baseInputs({ goal: { mode: 'manual', amount: 1e13 } }) })),
    ).toBe('string');
  });
});