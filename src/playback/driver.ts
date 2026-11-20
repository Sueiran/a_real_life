import { useSimStore } from '../store/simStore';

const YEAR_MS = 1100;

let rafId: number | null = null;
let lastTs: number | null = null;
let acc = 0;

function frame(ts: number) {
  const store = useSimStore.getState();
  if (store.playback !== 'playing') {
    stopDriver();
    return;
  }
  if (lastTs === null) lastTs = ts;
  const interval = YEAR_MS / store.speed;
  acc += Math.min(ts - lastTs, interval);
  lastTs = ts;
  while (acc >= interval) {
    acc -= interval;
    useSimStore.getState().tick();
    if (useSimStore.getState().playback !== 'playing') {
      stopDriver();
      return;
    }
  }
  rafId = requestAnimationFrame(frame);
}

// 幂等同步：StrictMode 双挂载 / 状态切换都不会产生重复计时器。
export function syncDriver() {
  const playing = useSimStore.getState().playback === 'playing';
  if (playing && rafId === null) {
    lastTs = null;
    acc = 0;
    rafId = requestAnimationFrame(frame);
  } else if (!playing) {
    stopDriver();
  }
}

export function stopDriver() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  lastTs = null;
  acc = 0;
}
