import { create } from 'zustand';
import { choiceLog, createInitialState, stepYear } from '../simulation/engine';
import { DEFAULT_CONFIG } from '../simulation/config';
import { EVENT_POOL } from '../events/definitions';
import type { ChoiceLogEntry, ReplaySource, SimInputs, SimState } from '../simulation/types';
import { useUiStore } from './uiStore';
import { syncDriver } from '../playback/driver';
import { rebuildTo } from '../playback/restore';
import { clearRun, loadRun, saveLastInputs, saveRun } from '../lib/storage';
import { decodeCompleteShareHash } from '../lib/share';

export type Playback = 'idle' | 'playing' | 'paused' | 'eventPending' | 'finished';
export type Speed = 1 | 2 | 4;

interface SimStore {
  inputs: SimInputs | null;
  sim: SimState | null;
  runId: number;
  playback: Playback;
  speed: Speed;
  // 非空 = 自动重播模式：事件卡片展示原选择并自动推进，不参与持久化。
  replayChoices: ChoiceLogEntry[] | null;
  start: (inputs: SimInputs) => void;
  startReplay: (data: ReplaySource) => void;
  replayCurrent: () => void;
  rewindTo: (yearIndex: number) => void;
  restoreSaved: () => boolean;
  openLocation: () => void;
  tick: () => void;
  choose: (choiceId: string) => void;
  togglePause: () => void;
  suspendPlayback: () => void;
  setSpeed: (speed: Speed) => void;
  restart: () => void;
}

let replayTimer: ReturnType<typeof setTimeout> | null = null;

function clearReplayTimer() {
  if (replayTimer !== null) clearTimeout(replayTimer);
  replayTimer = null;
}

function scheduleReplayAdvance() {
  clearReplayTimer();
  const { sim, playback, replayChoices, speed, runId } = useSimStore.getState();
  if (playback !== 'eventPending' || !sim?.pending || !replayChoices) return;
  const { year, event } = sim.pending;
  const choice = replayChoices.find((c) => c.yearIndex === year.yearIndex && c.eventId === event.id);
  if (!choice || !event.choices.some((c) => c.id === choice.choiceId)) {
    // 日志与当前事件不匹配：交还手动操作，绝不替用户猜测选择。
    useSimStore.setState({ replayChoices: null });
    return;
  }
  replayTimer = setTimeout(() => {
    replayTimer = null;
    const s = useSimStore.getState();
    if (s.runId !== runId || s.playback !== 'eventPending' || !s.sim?.pending) return;
    if (s.sim.pending.year.yearIndex !== year.yearIndex || s.sim.pending.event.id !== event.id) return;
    s.choose(choice.choiceId);
  }, 1600 / speed);
}

function persist() {
  const { sim, inputs, playback, speed, replayChoices } = useSimStore.getState();
  if (!sim || !inputs || replayChoices) return;
  if (playback === 'idle') return;
  saveRun({
    v: 1,
    inputs,
    seed: sim.seed,
    choices: choiceLog(sim),
    nextYearIndex: sim.years.length,
    playback: playback === 'finished' ? 'finished' : playback === 'eventPending' ? 'eventPending' : playback === 'paused' ? 'paused' : 'playing',
    speed,
  });
}

function clearHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

export const useSimStore = create<SimStore>((set, get) => ({
  inputs: null,
  sim: null,
  runId: 0,
  playback: 'idle',
  speed: 1,
  replayChoices: null,

  start: (inputs) => {
    clearReplayTimer();
    clearHash();
    const sim = createInitialState(inputs, crypto.randomUUID(), DEFAULT_CONFIG, EVENT_POOL);
    const running = sim.status === 'running';
    set((s) => ({
      inputs,
      sim,
      runId: s.runId + 1,
      playback: running ? 'playing' : 'finished',
      speed: 1,
      replayChoices: null,
    }));
    saveLastInputs(inputs);
    useUiStore.getState().setView(running ? 'simulating' : 'ending');
    persist();
    syncDriver();
  },

  startReplay: (data) => {
    clearReplayTimer();
    const sim = createInitialState(data.inputs, data.seed, DEFAULT_CONFIG, EVENT_POOL);
    const running = sim.status === 'running';
    set((s) => ({
      inputs: data.inputs,
      sim,
      runId: s.runId + 1,
      playback: running ? 'playing' : 'finished',
      speed: 1,
      replayChoices: data.choices,
    }));
    useUiStore.getState().setView(running ? 'simulating' : 'ending');
    syncDriver();
  },

  replayCurrent: () => {
    const { sim, inputs } = get();
    if (!sim || !inputs) return;
    get().startReplay({ inputs, seed: sim.seed, choices: choiceLog(sim) });
  },

  rewindTo: (yearIndex) => {
    const { sim, inputs } = get();
    if (!sim || !inputs) return;
    const log = choiceLog(sim);
    const target = log.find((c) => c.yearIndex === yearIndex);
    if (!target) return;
    const prefix = log.filter((c) => c.yearIndex < yearIndex);
    const state = rebuildTo(inputs, sim.seed, prefix, yearIndex, DEFAULT_CONFIG, EVENT_POOL, true);
    if (!state.pending || state.pending.year.yearIndex !== yearIndex || state.pending.event.id !== target.eventId)
      return;
    clearReplayTimer();
    clearHash();
    set((s) => ({
      sim: state,
      runId: s.runId + 1,
      playback: 'eventPending',
      replayChoices: null,
    }));
    useUiStore.getState().setView('simulating');
    persist();
    syncDriver();
  },

  restoreSaved: () => {
    const saved = loadRun();
    if (!saved) return false;
    const sim = rebuildTo(saved.inputs, saved.seed, saved.choices, saved.nextYearIndex, DEFAULT_CONFIG, EVENT_POOL, saved.playback === 'eventPending');
    const finished = sim.status !== 'running';
    if (sim.years.length !== saved.nextYearIndex
      || finished !== (saved.playback === 'finished')
      || Boolean(sim.pending) !== (saved.playback === 'eventPending')
      || JSON.stringify(choiceLog(sim)) !== JSON.stringify(saved.choices)) return false;
    const playback: Playback = saved.playback;
    clearReplayTimer();
    set((s) => ({
      inputs: saved.inputs,
      sim,
      runId: s.runId + 1,
      playback,
      speed: saved.speed,
      replayChoices: null,
    }));
    useUiStore.getState().setView(finished ? 'ending' : 'simulating');
    syncDriver();
    return true;
  },

  openLocation: () => {
    clearReplayTimer();
    set((s) => ({ sim: null, playback: 'idle', replayChoices: null, runId: s.runId + 1 }));
    syncDriver();
    useUiStore.setState({ view: 'setup', historyOpen: false, sharedData: null, shareError: null });
    if (!location.hash) {
      get().restoreSaved();
      return;
    }
    const result = decodeCompleteShareHash(location.hash);
    if (result.ok) useUiStore.getState().showShared(result.data);
    else {
      useUiStore.getState().setShareError(result.message);
      clearHash();
    }
  },

  tick: () => {
    const { sim, playback } = get();
    if (!sim || playback !== 'playing') return;
    const result = stepYear(sim);
    if (result.pendingEvent) {
      set({ sim: result.state, playback: 'eventPending' });
      persist();
      scheduleReplayAdvance();
      syncDriver();
      return;
    }
    const finished = result.state.status !== 'running';
    set({ sim: result.state, playback: finished ? 'finished' : 'playing' });
    persist();
    if (finished) {
      useUiStore.getState().setView('ending');
      syncDriver();
    }
  },

  choose: (choiceId) => {
    const { sim, playback } = get();
    if (!sim || playback !== 'eventPending' || !sim.pending) return;
    const { year, event } = sim.pending;
    if (!event.choices.some((c) => c.id === choiceId)) return;
    // 同步置回 playing 后再结算，连击第二次会因 playback 已变化而被拦截。
    set({ playback: 'playing' });
    const result = stepYear(sim, { yearIndex: year.yearIndex, eventId: event.id, choiceId });
    const finished = result.state.status !== 'running';
    set({ sim: result.state, playback: finished ? 'finished' : 'playing' });
    persist();
    if (finished) useUiStore.getState().setView('ending');
    syncDriver();
  },

  togglePause: () => {
    const { playback } = get();
    if (playback === 'playing') set({ playback: 'paused' });
    else if (playback === 'paused') set({ playback: 'playing' });
    else return;
    persist();
    syncDriver();
  },

  suspendPlayback: () => {
    clearReplayTimer();
    if (get().playback === 'playing') set({ playback: 'paused' });
    persist();
    syncDriver();
  },

  setSpeed: (speed) => {
    set({ speed });
    persist();
  },

  restart: () => {
    clearReplayTimer();
    // 观看他人人生时不清空自己的存档。
    if (!get().replayChoices) clearRun();
    clearHash();
    set({ sim: null, playback: 'idle', replayChoices: null });
    useUiStore.getState().setView('setup');
    syncDriver();
  },
}));

if (import.meta.env.DEV) {
  (window as unknown as { __sim: typeof useSimStore }).__sim = useSimStore;
}