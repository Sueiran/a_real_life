import type { ChoiceLogEntry, ReplayData, ReplaySource, SimInputs } from '../simulation/types';
import { createReplayData, SIMULATION_RULES_VERSION } from '../simulation/replaySignature';
import { EVENT_POOL } from '../events/definitions';
import { choiceLog, replay } from '../simulation/engine';

const HASH_PREFIX = '#r=';
const MAX_HASH_LENGTH = 16384;
const MAX_CHOICES = 200;
const MAX_SEED_LENGTH = 128;

export type DecodeResult = { ok: true; data: ReplayData } | { ok: false; message: string };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateInputs(raw: unknown): SimInputs | string {
  if (typeof raw !== 'object' || raw === null) return '初始信息格式不正确';
  const o = raw as Record<string, unknown>;
  const { startAge, startYear, initialAssets, annualIncome, annualExpenses, endAge, goal } = o;
  if (!isFiniteNumber(startAge) || !Number.isInteger(startAge) || startAge < 18 || startAge > 70)
    return '起始年龄需在 18–70 之间';
  if (!isFiniteNumber(endAge) || !Number.isInteger(endAge) || endAge <= startAge || endAge > 120)
    return '终点年龄不合法';
  if (!isFiniteNumber(startYear) || !Number.isInteger(startYear) || startYear < 1900 || startYear > 2200)
    return '起始年份不合法';
  if (!isFiniteNumber(initialAssets) || initialAssets < 0 || initialAssets > 1e12)
    return '资产金额超出范围';
  if (!isFiniteNumber(annualIncome) || annualIncome < 0 || annualIncome > 1e10)
    return '收入金额超出范围';
  if (!isFiniteNumber(annualExpenses) || annualExpenses <= 0 || annualExpenses > 1e10)
    return '支出金额超出范围';
  if (typeof goal !== 'object' || goal === null) return '目标格式不正确';
  const g = goal as Record<string, unknown>;
  if (g.mode === 'auto') return { startAge, startYear, initialAssets, annualIncome, annualExpenses, endAge, goal: { mode: 'auto' } };
  if (g.mode === 'manual' && isFiniteNumber(g.amount) && g.amount > annualExpenses * 5 && g.amount <= 1e12)
    return { startAge, startYear, initialAssets, annualIncome, annualExpenses, endAge, goal: { mode: 'manual', amount: g.amount } };
  return '目标金额不合法';
}

function validateChoices(raw: unknown, inputs: SimInputs): ChoiceLogEntry[] | string {
  if (!Array.isArray(raw)) return '选择日志格式不正确';
  if (raw.length > MAX_CHOICES) return '选择日志过长';
  const maxYears = inputs.endAge - inputs.startAge;
  const out: ChoiceLogEntry[] = [];
  let prevYear = -1;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return '选择日志条目不合法';
    const { yearIndex, eventId, choiceId } = item as Record<string, unknown>;
    if (!isFiniteNumber(yearIndex) || !Number.isInteger(yearIndex) || yearIndex < 0 || yearIndex >= maxYears)
      return '选择年份超出范围';
    if (yearIndex <= prevYear) return '选择日志存在重复或乱序年份';
    if (typeof eventId !== 'string' || typeof choiceId !== 'string') return '选择日志缺少事件或选项';
    const def = EVENT_POOL.find((e) => e.id === eventId);
    if (!def) return '包含未知事件';
    if (!def.choices.some((c) => c.id === choiceId)) return '包含未知选项';
    prevYear = yearIndex;
    out.push({ yearIndex, eventId, choiceId });
  }
  return out;
}

export function validateReplaySource(raw: unknown): ReplaySource | string {
  if (typeof raw !== 'object' || raw === null) return '数据格式不正确';
  const o = raw as Record<string, unknown>;
  if (typeof o.seed !== 'string' || o.seed.length === 0 || o.seed.length > MAX_SEED_LENGTH)
    return '种子不合法';
  const inputs = validateInputs(o.inputs);
  if (typeof inputs === 'string') return inputs;
  const choices = validateChoices(o.choices, inputs);
  if (typeof choices === 'string') return choices;
  return { inputs, seed: o.seed, choices };
}

export function validateReplayData(raw: unknown): ReplayData | string {
  if (typeof raw !== 'object' || raw === null) return '数据格式不正确';
  const o = raw as Record<string, unknown>;
  if (o.v === 1) return '旧版分享无法验证原始人生，请使用新版本重新分享';
  if (o.v !== 2) return '分享格式版本不兼容，请重新获取链接';
  if (o.rulesVersion !== SIMULATION_RULES_VERSION) return '模拟规则版本不兼容，请使用相同版本重新分享';
  const source = validateReplaySource(raw);
  if (typeof source === 'string') return source;
  if (typeof o.outcome !== 'object' || o.outcome === null) return '分享缺少完整结局校验';
  const { status, years, calendarYear, age } = o.outcome as Record<string, unknown>;
  if (status !== 'fire' && status !== 'bankrupt' && status !== 'end') return '分享结局状态不合法';
  const horizon = source.inputs.endAge - source.inputs.startAge;
  if (!isFiniteNumber(years) || !Number.isInteger(years) || years < 0 || years > horizon
    || (status !== 'fire' && years === 0) || (status === 'end' && years !== horizon)) return '分享结局年数不合法';
  const offset = status === 'end' ? horizon : Math.max(0, years - 1);
  if (age !== source.inputs.startAge + offset || calendarYear !== source.inputs.startYear + offset)
    return '分享结局年份或年龄不合法';
  if (typeof o.fingerprint !== 'string' || !/^[0-9a-f]{32}$/.test(o.fingerprint)) return '分享轨迹校验数据不合法';
  return { v: 2, rulesVersion: SIMULATION_RULES_VERSION, ...source,
    outcome: { status, years, calendarYear: calendarYear as number, age: age as number }, fingerprint: o.fingerprint };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeShareHash(data: ReplayData): string {
  const json = JSON.stringify(data);
  return HASH_PREFIX + toBase64Url(new TextEncoder().encode(json));
}

export function decodeShareHash(hash: string): DecodeResult {
  if (!hash.startsWith(HASH_PREFIX)) return { ok: false, message: '链接不含人生数据' };
  const payload = hash.slice(HASH_PREFIX.length);
  if (payload.length === 0 || payload.length > MAX_HASH_LENGTH)
    return { ok: false, message: '链接数据长度不合法' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return { ok: false, message: '链接数据已损坏，无法读取' };
  }
  const result = validateReplayData(parsed);
  if (typeof result === 'string') return { ok: false, message: result };
  return { ok: true, data: result };
}

export function decodeCompleteShareHash(hash: string): DecodeResult {
  const result = decodeShareHash(hash);
  return result.ok ? validateCompleteReplayData(result.data) : result;
}

export function validateCompleteReplayData(raw: unknown): DecodeResult {
  const data = validateReplayData(raw);
  if (typeof data === 'string') return { ok: false, message: data };
  const result = { ok: true as const, data };
  try {
    const { inputs, seed, choices } = result.data;
    const state = replay(inputs, seed, choices, undefined, EVENT_POOL);
    if (state.status === 'running' || JSON.stringify(choiceLog(state)) !== JSON.stringify(choices)) {
      return { ok: false, message: '这段人生的选择记录无法完整复现，请重新获取链接' };
    }
    const actual = createReplayData(state);
    const expected = result.data;
    if (actual.outcome.status !== expected.outcome.status || actual.outcome.years !== expected.outcome.years
      || actual.outcome.calendarYear !== expected.outcome.calendarYear || actual.outcome.age !== expected.outcome.age
      || actual.fingerprint !== expected.fingerprint) {
      return { ok: false, message: '当前浏览器无法复现原始人生的结果，请重新获取链接或正常开局' };
    }
    return result;
  } catch {
    return { ok: false, message: '这段人生无法复现，请重新获取链接' };
  }
}

export function buildShareUrl(data: ReplayData): string {
  return `${location.origin}${location.pathname}${encodeShareHash(data)}`;
}
