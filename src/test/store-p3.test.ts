import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplaySource, SimState } from '../simulation/types';
import { baseInputs } from './fixtures';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('location', { hash: '', origin: 'http://localhost', pathname: '/', search: '' });
vi.stubGlobal('history', { replaceState: vi.fn() });
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});
vi.stubGlobal('window', globalThis);
vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');

const { useSimStore } = await import('../store/simStore');
const { useUiStore } = await import('../store/uiStore');
const { loadRun } = await import('../lib/storage');
const { choiceLog } = await import('../simulation/engine');

afterEach(() => {
  mem.clear();
  vi.useRealTimers();
  useSimStore.setState({ sim: null, inputs: null, playback: 'idle', replayChoices: null, speed: 1 });
  useUiStore.setState({ view: 'setup', historyOpen: false, shareError: null, sharedData: null });
});

function store() {
  return useSimStore.getState();
}

function tickToEvent() {
  let guard = 0;
  while (store().playback === 'playing' && guard++ < 100) store().tick();
  expect(store().playback).toBe('eventPending');
}

function driveToFinish(autoChoose: (s: SimState) => string = (s) => s.pending!.event.choices[0].id) {
  let guard = 0;
  while (store().playback !== 'finished' && guard++ < 500) {
    if (store().playback === 'eventPending') store().choose(autoChoose(store().sim!));
    else store().tick();
  }
  expect(store().playback).toBe('finished');
}

// 模拟刷新：清空内存状态，仅保留 localStorage。
function simulateRefresh() {
  useSimStore.setState({ sim: null, inputs: null, playback: 'idle', replayChoices: null });
  useUiStore.setState({ view: 'setup' });
}

describe('进度持久化与刷新恢复', () => {
  it('开局即写入存档，种子与输入一致', () => {
    store().start(baseInputs());
    const saved = loadRun();
    expect(saved).not.toBeNull();
    expect(saved!.seed).toBe(store().sim!.seed);
    expect(saved!.inputs).toEqual(baseInputs());
    expect(saved!.nextYearIndex).toBe(0);
    expect(saved!.playback).toBe('playing');
  });

  it('播放中途刷新：恢复到相同年份，历史逐年一致', () => {
    store().start(baseInputs());
    store().tick();
    store().tick();
    const years = store().sim!.years;
    const seed = store().sim!.seed;
    simulateRefresh();
    expect(store().restoreSaved()).toBe(true);
    expect(store().sim!.seed).toBe(seed);
    expect(store().sim!.years).toEqual(years);
    expect(store().playback).toBe('playing');
    expect(useUiStore.getState().view).toBe('simulating');
  });

  it('事件卡片打开时刷新：恢复待决事件与相同选项', () => {
    store().start(baseInputs());
    tickToEvent();
    const pending = store().sim!.pending!;
    const years = store().sim!.years;
    simulateRefresh();
    expect(store().restoreSaved()).toBe(true);
    expect(store().playback).toBe('eventPending');
    expect(store().sim!.pending!.event.id).toBe(pending.event.id);
    expect(store().sim!.pending!.year.yearIndex).toBe(pending.year.yearIndex);
    expect(store().sim!.years).toEqual(years);
  });

  it('暂停时刷新：恢复为暂停状态，不自动播放', () => {
    store().start(baseInputs());
    store().tick();
    store().togglePause();
    expect(loadRun()!.playback).toBe('paused');
    simulateRefresh();
    store().restoreSaved();
    expect(store().playback).toBe('paused');
  });

  it('选择之后刷新：已结算事件年与选择日志无丢失', () => {
    store().start(baseInputs());
    tickToEvent();
    const eventId = store().sim!.pending!.event.id;
    store().choose(store().sim!.pending!.event.choices[0].id);
    const log = choiceLog(store().sim!);
    simulateRefresh();
    store().restoreSaved();
    expect(choiceLog(store().sim!)).toEqual(log);
    expect(store().sim!.years.find((y) => y.eventId === eventId)?.choiceId).toBe(log[0].choiceId);
  });

  it('结局后刷新：恢复结局页与完整历史', () => {
    store().start(baseInputs());
    driveToFinish();
    const years = store().sim!.years;
    simulateRefresh();
    store().restoreSaved();
    expect(store().playback).toBe('finished');
    expect(store().sim!.years).toEqual(years);
    expect(useUiStore.getState().view).toBe('ending');
  });

  it('开局即 FIRE：刷新后仍是空历史结局', () => {
    store().start(baseInputs({ initialAssets: 1e9 }));
    expect(store().playback).toBe('finished');
    simulateRefresh();
    store().restoreSaved();
    expect(store().playback).toBe('finished');
    expect(store().sim!.years.length).toBe(0);
    expect(useUiStore.getState().view).toBe('ending');
  });

  it('损坏或版本不匹配的存档被安全拒绝', () => {
    mem.set('wealth-life:run', '{corrupted');
    expect(store().restoreSaved()).toBe(false);
    expect(store().playback).toBe('idle');
    mem.set('wealth-life:run', JSON.stringify({ v: 99, inputs: baseInputs(), seed: 'x', choices: [], nextYearIndex: 0, playback: 'playing', speed: 1 }));
    expect(store().restoreSaved()).toBe(false);
  });

  it('重新开始清空存档，修改初始信息后刷新不复活旧局', () => {
    store().start(baseInputs());
    store().tick();
    store().restart();
    expect(loadRun()).toBeNull();
    simulateRefresh();
    expect(store().restoreSaved()).toBe(false);
  });
});

describe('自动重播与交互等价', () => {
  it('观看重播：同种子同选择逐年资产与交互局完全一致，事件自动推进', () => {
    vi.useFakeTimers();
    store().start(baseInputs());
    driveToFinish((s) => s.pending!.event.choices[s.pending!.year.yearIndex % s.pending!.event.choices.length].id);
    const interactive = store().sim!;
    const data: ReplaySource = { inputs: interactive.inputs, seed: interactive.seed, choices: choiceLog(interactive) };

    store().startReplay(data);
    expect(store().replayChoices).toEqual(data.choices);
    let guard = 0;
    while (store().playback !== 'finished' && guard++ < 500) {
      if (store().playback === 'eventPending') {
        vi.advanceTimersByTime(1700);
      } else {
        store().tick();
      }
    }
    expect(store().playback).toBe('finished');
    expect(store().sim!.years).toEqual(interactive.years);
    expect(store().sim!.status).toBe(interactive.status);
  });

  it('重播日志与事件不匹配：交还手动操作，不猜测选择', () => {
    store().start(baseInputs());
    tickToEvent();
    const pending = store().sim!.pending!;
    const bad: ReplaySource = {
      inputs: baseInputs(),
      seed: store().sim!.seed,
      choices: [{ yearIndex: pending.year.yearIndex, eventId: pending.event.id, choiceId: 'nonexistent' }],
    };
    store().startReplay(bad);
    let guard = 0;
    while (store().playback === 'playing' && guard++ < 100) store().tick();
    expect(store().playback).toBe('eventPending');
    expect(store().replayChoices).toBeNull();
    store().choose(store().sim!.pending!.event.choices[0].id);
    expect(store().playback).not.toBe('eventPending');
  });

  it('观看他人人生不覆盖自己的存档', () => {
    store().start(baseInputs());
    store().tick();
    const ownSave = loadRun();
    store().startReplay({ inputs: baseInputs({ initialAssets: 500000 }), seed: 'other-life', choices: [] });
    store().tick();
    expect(loadRun()).toEqual(ownSave);
  });
});

describe('回到关键抉择（store 层）', () => {
  it('rewindTo 停在目标事件，前缀历史不变，改选后未来分歧', () => {
    store().start(baseInputs());
    driveToFinish((s) => s.pending!.event.choices[0].id);
    const original = store().sim!;
    const log = choiceLog(original);
    expect(log.length).toBeGreaterThan(1);
    const target = log[1];
    const originalChoice = original.pending ? '' : log[1].choiceId;

    store().rewindTo(target.yearIndex);
    expect(store().playback).toBe('eventPending');
    expect(store().sim!.pending!.year.yearIndex).toBe(target.yearIndex);
    expect(store().sim!.pending!.event.id).toBe(target.eventId);
    expect(store().sim!.years).toEqual(original.years.slice(0, target.yearIndex));
    expect(store().sim!.seed).toBe(original.seed);

    const def = store().sim!.pending!.event;
    const alt = def.choices.find((c) => c.id !== originalChoice)!;
    store().choose(alt.id);
    driveToFinish();
    const diverged = store().sim!;
    expect(diverged.years.slice(0, target.yearIndex)).toEqual(original.years.slice(0, target.yearIndex));
    const restA = diverged.years.slice(target.yearIndex);
    const restB = original.years.slice(target.yearIndex);
    expect(JSON.stringify(restA)).not.toBe(JSON.stringify(restB));
  });

  it('rewindTo 后存档更新为截断进度，刷新回到同一待决事件', () => {
    store().start(baseInputs());
    driveToFinish();
    const log = choiceLog(store().sim!);
    const target = log[0];
    store().rewindTo(target.yearIndex);
    const saved = loadRun();
    expect(saved!.nextYearIndex).toBe(target.yearIndex);
    expect(saved!.playback).toBe('eventPending');
    expect(saved!.choices.every((c) => c.yearIndex < target.yearIndex)).toBe(true);
    simulateRefresh();
    store().restoreSaved();
    expect(store().sim!.pending!.event.id).toBe(target.eventId);
  });
});