import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseInputs, flatConfig, makeEvent, simulateAll } from './fixtures';
import { choiceLog, createInitialState, stepYear } from '../simulation/engine';
import { EVENT_POOL } from '../events/definitions';
import { createReplayData } from '../simulation/replaySignature';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
});
vi.stubGlobal('location', { hash: '', origin: 'http://localhost', pathname: '/', search: '' });
vi.stubGlobal('history', { replaceState: vi.fn() });
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('window', globalThis);
const { useSimStore } = await import('../store/simStore');
const { useUiStore } = await import('../store/uiStore');
const { saveRun } = await import('../lib/storage');

function store() { return useSimStore.getState(); }
afterEach(() => {
  store().restart();
  memory.clear();
  location.hash = '';
  vi.clearAllMocks();
  useUiStore.setState({ view: 'setup', historyOpen: false, shareError: null, sharedData: null });
});

const full = simulateAll(baseInputs(), 'restore-seed', { pool: EVENT_POOL });
const log = choiceLog(full);

describe('页面失败暂停', () => {
  it('暂停正常播放并保存原游标', () => {
    store().start(baseInputs());
    store().tick();
    const years = store().sim!.years;
    store().suspendPlayback();
    expect(store().playback).toBe('paused');
    store().tick();
    expect(store().sim!.years).toEqual(years);
    expect(JSON.parse(memory.get('wealth-life:run')!).playback).toBe('paused');
  });
  it('取消待决重播定时器，不改写自己的存档', () => {
    vi.useFakeTimers();
    try {
      store().startReplay({ inputs: full.inputs, seed: full.seed, choices: log });
      while (store().playback === 'playing') store().tick();
      const pending = store().sim!.pending;
      store().suspendPlayback();
      vi.advanceTimersByTime(5000);
      expect(store().sim!.pending).toBe(pending);
      expect(memory.has('wealth-life:run')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

describe('外部分享与导航', () => {
  it('完整真实人生通过接收校验', async () => {
    const { decodeCompleteShareHash, encodeShareHash } = await import('../lib/share');
    const data = createReplayData(full);
    expect(decodeCompleteShareHash(encodeShareHash(data))).toEqual({ ok: true, data });
  });
  it.each(['missing', 'wrong-year', 'extra'] as const)('拒绝格式合法但轨迹不完整的%s日志', async (kind) => {
    const { decodeCompleteShareHash, encodeShareHash } = await import('../lib/share');
    const choices = kind === 'missing' ? log.slice(0, -1) : kind === 'wrong-year'
      ? log.map((entry, i) => i === 0 ? { ...entry, yearIndex: entry.yearIndex - 1 } : entry)
      : [{ yearIndex: 0, eventId: 'promotion', choiceId: 'accept' }, ...log];
    expect(decodeCompleteShareHash(encodeShareHash({ ...createReplayData(full), choices })).ok).toBe(false);
  });
  it('开局FIRE合法空日志可分享，多余日志必须拒绝', async () => {
    const { decodeCompleteShareHash, encodeShareHash } = await import('../lib/share');
    const data = createReplayData(createInitialState(baseInputs({ initialAssets: 1e12 }), 'instant'));
    expect(decodeCompleteShareHash(encodeShareHash(data)).ok).toBe(true);
    expect(decodeCompleteShareHash(encodeShareHash({ ...data, choices: log })).ok).toBe(false);
  });
  it('分享hash优先于自己的存档，导航清理回顾状态', async () => {
    const { encodeShareHash } = await import('../lib/share');
    store().start(baseInputs());
    const saved = memory.get('wealth-life:run');
    useUiStore.setState({ historyOpen: true });
    location.hash = encodeShareHash(createReplayData(full));
    store().openLocation();
    expect(useUiStore.getState().view).toBe('shared');
    expect(useUiStore.getState().historyOpen).toBe(false);
    expect(store().playback).toBe('idle');
    expect(memory.get('wealth-life:run')).toBe(saved);
    location.hash = '';
    store().openLocation();
    expect(store().sim?.seed).toBe(JSON.parse(saved!).seed);
  });
  it('坏hash不误恢复自己的存档，保留可返回的开局页', () => {
    store().start(baseInputs());
    location.hash = '#r=broken';
    store().openLocation();
    expect(store().sim).toBeNull();
    expect(useUiStore.getState().view).toBe('setup');
    expect(useUiStore.getState().shareError).toBeTruthy();
  });
  it('导航离开自动重播后旧定时器不能继续选择', () => {
    vi.useFakeTimers();
    store().startReplay({ inputs: full.inputs, seed: full.seed, choices: log });
    while (store().playback === 'playing') store().tick();
    location.hash = '#r=broken';
    store().openLocation();
    vi.advanceTimersByTime(3000);
    expect(store().sim).toBeNull();
    vi.useRealTimers();
  });
});

describe('存档轨迹校验', () => {
  it.each(['playing', 'paused', 'eventPending', 'finished'] as const)('拒绝缺少选择却声明更远游标的%s存档', (playback) => {
    saveRun({ v: 1, inputs: full.inputs, seed: full.seed, choices: [], nextYearIndex: 12, playback, speed: 1 });
    expect(store().restoreSaved()).toBe(false);
    expect(store().sim).toBeNull();
  });
  it('拒绝无事件年份伪装的待决状态，不偷偷推进一年', () => {
    saveRun({ v: 1, inputs: full.inputs, seed: full.seed, choices: [], nextYearIndex: 0, playback: 'eventPending', speed: 1 });
    expect(store().restoreSaved()).toBe(false);
  });
  it('拒绝未到结局却声称finished的存档', () => {
    saveRun({ v: 1, inputs: full.inputs, seed: full.seed, choices: [], nextYearIndex: 1, playback: 'finished', speed: 1 });
    expect(store().restoreSaved()).toBe(false);
  });
  it('拒绝早于游标已经结束的存档', () => {
    saveRun({ v: 1, inputs: full.inputs, seed: full.seed, choices: log, nextYearIndex: full.years.length + 1, playback: 'finished', speed: 1 });
    expect(store().restoreSaved()).toBe(false);
  });
  it('拒绝存在未被实际轨迹消费的选择', () => {
    saveRun({ v: 1, inputs: full.inputs, seed: full.seed, choices: [{ yearIndex: 0, eventId: 'promotion', choiceId: 'accept' }], nextYearIndex: 1, playback: 'paused', speed: 1 });
    expect(store().restoreSaved()).toBe(false);
  });
  it('外部重播改选时清除原分享hash，刷新应恢复新分支', () => {
    useSimStore.setState({ sim: full, inputs: full.inputs, playback: 'finished', replayChoices: log });
    location.hash = '#r=original';
    store().rewindTo(log[0].yearIndex);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(store().replayChoices).toBeNull();
  });
});

describe('事件造成首次负债的次年补救', () => {
  function indebted(cash: number) {
    const event = makeEvent({ once: true, choices: [{ id: 'pay', label: '支出', hint: '', effects: [{ type: 'cash', amount: cash }] }] });
    const rescue = EVENT_POOL.find((item) => item.id === 'debt-crisis')!;
    const inputs = baseInputs({ initialAssets: 100, annualIncome: 110, annualExpenses: 100 });
    let sim = createInitialState(inputs, 'defer-rescue', flatConfig(), [event, rescue]);
    sim = stepYear(sim).state;
    sim = stepYear(sim).state;
    sim = stepYear(sim).state;
    return stepYear(sim, { yearIndex: 2, eventId: event.id, choiceId: 'pay' }).state;
  }
  it('首次负债即达到债务失控线，也保留次年救援机会', () => {
    const sim = indebted(-1000);
    expect(sim.years[2].assets).toBe(-870);
    expect(sim.status).toBe('running');
    const next = stepYear(sim).state;
    expect(next.pending?.event.id).toBe('debt-crisis');
    expect(next.years).toHaveLength(3);
  });
  it('优先补救而非随机事件，救援后仍失控可以破产', () => {
    const pending = stepYear(indebted(-1000)).state;
    const result = stepYear(pending, { yearIndex: 3, eventId: 'debt-crisis', choiceId: 'austerity' }).state;
    expect(result.status).toBe('bankrupt');
    expect(result.years.filter((year) => year.eventId === 'debt-crisis')).toHaveLength(1);
  });
  it('次年已经恢复非负资产就不强制救援', () => {
    const result = stepYear(indebted(-135)).state;
    expect(result.years[3].assets).toBeGreaterThan(0);
    expect(result.pending).toBeNull();
  });
  it('补救与选择日志同种子重播完全一致', async () => {
    const { replay } = await import('../simulation/engine');
    const pending = stepYear(indebted(-200)).state;
    const result = stepYear(pending, { yearIndex: 3, eventId: 'debt-crisis', choiceId: 'family' }).state;
    const rebuilt = replay(result.inputs, result.seed, choiceLog(result), result.config, result.eventPool);
    expect(rebuilt.years.slice(0, result.years.length)).toEqual(result.years);
    expect(rebuilt.years.filter((year) => year.eventId === 'debt-crisis')).toHaveLength(1);
  });
});

describe('事件结算的连续负资产边界', () => {
  function recoveringYear() {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 80, annualExpenses: 100 });
    const event = makeEvent({ choices: [
      { id: 'loss', label: '支出', hint: '', effects: [{ type: 'cash', amount: -100 }] },
      { id: 'keep', label: '不支出', hint: '', effects: [] },
    ] });
    let sim = createInitialState(inputs, 'audit-debt', flatConfig({ incomeGrowth: 0.25, debtRate: 0 }), [event]);
    sim = stepYear(sim).state;
    sim = stepYear(sim).state;
    expect(sim.negativeYears).toBe(2);
    const pending = stepYear(sim).state;
    expect(pending.pending?.year.assets).toBe(5);
    return pending;
  }
  it('现金流暂时转正、选择后仍负债时不应中断连续年末负债计数', () => {
    const sim = stepYear(recoveringYear(), { yearIndex: 2, eventId: 'ev', choiceId: 'loss' }).state;
    expect(sim.years.map((year) => year.assets)).toEqual([-20, -20, -95]);
    expect(sim.negativeYears).toBe(3);
  });
  it('选择后确实转正才清零连续负债计数', () => {
    const sim = stepYear(recoveringYear(), { yearIndex: 2, eventId: 'ev', choiceId: 'keep' }).state;
    expect(sim.negativeYears).toBe(0);
  });
});
