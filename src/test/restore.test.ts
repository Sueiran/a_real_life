import { afterEach, describe, expect, it, vi } from 'vitest';
import { rebuildTo } from '../playback/restore';
import { choiceLog, replay } from '../simulation/engine';
import { DEFAULT_CONFIG } from '../simulation/config';
import { EVENT_POOL } from '../events/definitions';
import { clearRun, loadLastInputs, loadRun, saveLastInputs, saveRun, type SavedRun } from '../lib/storage';
import { baseInputs, simulateAll } from './fixtures';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});

afterEach(() => mem.clear());

const SEED = 'restore-seed';

function fullRun() {
  return simulateAll(baseInputs(), SEED, { pool: EVENT_POOL });
}

describe('rebuildTo 游标重建', () => {
  it('中途游标：重建历史与完整重播前缀逐年深相等', () => {
    const full = fullRun();
    const k = 12;
    const rebuilt = rebuildTo(baseInputs(), SEED, choiceLog(full), k);
    expect(rebuilt.years.length).toBe(k);
    expect(rebuilt.years).toEqual(full.years.slice(0, k));
    expect(rebuilt.status).toBe('running');
  });

  it('待决事件游标：保留 pending，事件与完整运行一致', () => {
    const full = fullRun();
    const target = choiceLog(full)[1];
    const rebuilt = rebuildTo(baseInputs(), SEED, choiceLog(full), target.yearIndex, DEFAULT_CONFIG, EVENT_POOL, true);
    expect(rebuilt.years.length).toBe(target.yearIndex);
    expect(rebuilt.pending?.event.id).toBe(target.eventId);
    expect(rebuilt.pending?.year.yearIndex).toBe(target.yearIndex);
    expect(rebuilt.years).toEqual(full.years.slice(0, target.yearIndex));
  });

  it('选择之后刷新：游标包含刚结算的事件年', () => {
    const full = fullRun();
    const target = choiceLog(full)[0];
    const rebuilt = rebuildTo(baseInputs(), SEED, choiceLog(full), target.yearIndex + 1);
    expect(rebuilt.years.length).toBe(target.yearIndex + 1);
    expect(rebuilt.years[target.yearIndex]).toEqual(full.years[target.yearIndex]);
    expect(rebuilt.pending).toBeNull();
  });

  it('游标 0 返回初始状态', () => {
    const rebuilt = rebuildTo(baseInputs(), SEED, [], 0);
    expect(rebuilt.years.length).toBe(0);
    expect(rebuilt.status).toBe('running');
  });

  it('游标超过终局：得到完整结局状态', () => {
    const full = fullRun();
    const rebuilt = rebuildTo(baseInputs(), SEED, choiceLog(full), 999);
    expect(rebuilt.status).toBe(full.status);
    expect(rebuilt.years).toEqual(full.years);
  });

  it('截断 choices 后重建停在待决事件，不套用后续选择', () => {
    const full = fullRun();
    const log = choiceLog(full);
    const prefix = log.slice(0, 1);
    const rebuilt = rebuildTo(baseInputs(), SEED, prefix, 999);
    expect(rebuilt.pending?.year.yearIndex).toBe(log[1].yearIndex);
    expect(rebuilt.years).toEqual(full.years.slice(0, log[1].yearIndex));
  });
});

describe('localStorage 存档读写', () => {
  function saved(overrides: Partial<SavedRun> = {}): SavedRun {
    return {
      v: 1,
      inputs: baseInputs(),
      seed: SEED,
      choices: [],
      nextYearIndex: 3,
      playback: 'playing',
      speed: 2,
      ...overrides,
    };
  }

  it('saveRun / loadRun 往返一致', () => {
    const run = saved();
    saveRun(run);
    expect(loadRun()).toEqual(run);
  });

  it('损坏 JSON 与版本不匹配返回 null', () => {
    mem.set('wealth-life:run', '{broken');
    expect(loadRun()).toBeNull();
    mem.set('wealth-life:run', JSON.stringify({ ...saved(), v: 9 }));
    expect(loadRun()).toBeNull();
  });

  it('非法游标 / 播放状态 / 速度返回 null', () => {
    saveRun(saved({ nextYearIndex: -1 }));
    expect(loadRun()).toBeNull();
    saveRun(saved({ nextYearIndex: 61 }));
    expect(loadRun()).toBeNull();
    saveRun(saved({ playback: 'idle' as SavedRun['playback'] }));
    expect(loadRun()).toBeNull();
    saveRun(saved({ speed: 3 as SavedRun['speed'] }));
    expect(loadRun()).toBeNull();
  });

  it('选择年份达到或超过游标的存档被拒绝', () => {
    saveRun(saved({ choices: [{ yearIndex: 3, eventId: 'promotion', choiceId: 'accept' }] }));
    expect(loadRun()).toBeNull();
  });

  it('clearRun 后无存档', () => {
    saveRun(saved());
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('lastInputs 往返与非法数据拒绝', () => {
    saveLastInputs(baseInputs({ annualIncome: 300000 }));
    expect(loadLastInputs()?.annualIncome).toBe(300000);
    mem.set('wealth-life:last-inputs', JSON.stringify({ startAge: 5 }));
    expect(loadLastInputs()).toBeNull();
    mem.set('wealth-life:last-inputs', 'not json');
    expect(loadLastInputs()).toBeNull();
  });
});

describe('存档与重播等价', () => {
  it('按存档重建的状态与 replay 到同游标完全一致', () => {
    const full = fullRun();
    const log = choiceLog(full);
    const k = log.length > 1 ? log[1].yearIndex : 5;
    const viaRebuild = rebuildTo(baseInputs(), SEED, log, k, DEFAULT_CONFIG, EVENT_POOL, true);
    const viaReplay = replay(baseInputs(), SEED, log.filter((c) => c.yearIndex < k), DEFAULT_CONFIG, EVENT_POOL);
    expect(viaRebuild.years).toEqual(viaReplay.years);
    expect(viaRebuild.pending?.event.id ?? null).toBe(viaReplay.pending?.event.id ?? null);
  });
});