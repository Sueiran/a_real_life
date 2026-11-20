import type { SimState } from '../simulation/types';
import type { ParallelData, ParallelRequest, ParallelResponse } from './parallelCalculation';

export interface ParallelSnapshot {
  results: Readonly<Record<string, ParallelData>>;
  timings: Readonly<Record<string, number>>;
  computing: string | null;
  error: string | null;
}
type Listener = (snapshot: ParallelSnapshot) => void;
interface Entry {
  key: string;
  sim: SimState;
  snapshot: ParallelSnapshot;
  listeners: Set<Listener>;
  worker: Worker | null;
  task: ReturnType<typeof setTimeout> | null;
  cancel: ReturnType<typeof setTimeout> | null;
}
const order = ['balanced', 'aggressive', 'conservative'];
let current: Entry | null = null;

export function parallelKey(sim: SimState, runId: number): string {
  return JSON.stringify([runId, sim.inputs, sim.seed, sim.config, sim.years]);
}

function publish(entry: Entry) {
  for (const listener of entry.listeners) listener(entry.snapshot);
}

function stop(entry: Entry) {
  if (entry.task !== null) clearTimeout(entry.task);
  if (entry.cancel !== null) clearTimeout(entry.cancel);
  entry.worker?.terminate();
  entry.worker = null;
  entry.task = null;
  entry.cancel = null;
  entry.snapshot = { ...entry.snapshot, computing: null };
}

function schedule(entry: Entry) {
  if (entry.task !== null || entry.snapshot.computing || entry.snapshot.error) return;
  const strategyId = order.find((id) => !entry.snapshot.results[id]);
  if (!strategyId) {
    stop(entry);
    return;
  }
  entry.task = setTimeout(() => {
    entry.task = null;
    if (current !== entry || entry.listeners.size === 0) return;
    entry.snapshot = { ...entry.snapshot, computing: strategyId };
    publish(entry);
    try {
      if (!entry.worker) {
        const worker = new Worker(new URL('./parallel.worker.ts', import.meta.url), { type: 'module' });
        entry.worker = worker;
        const fail = (message: string) => {
          if (current !== entry || entry.worker !== worker) return;
          stop(entry);
          entry.snapshot = { ...entry.snapshot, error: message };
          publish(entry);
        };
        worker.onerror = () => fail('平行宇宙暂时无法计算');
        worker.onmessageerror = () => fail('计算结果无法读取');
        worker.onmessage = (event: MessageEvent<ParallelResponse>) => {
          if (current !== entry || entry.worker !== worker) return;
          const response = event.data;
          if (response.strategyId !== entry.snapshot.computing) return;
          if ('error' in response) { fail(response.error); return; }
          entry.snapshot = {
            results: { ...entry.snapshot.results, [response.strategyId]: response.data },
            timings: { ...entry.snapshot.timings, [response.strategyId]: response.elapsedMs },
            computing: null,
            error: null,
          };
          publish(entry);
          schedule(entry);
        };
      }
      entry.worker.postMessage({ sim: entry.sim, strategyId } satisfies ParallelRequest);
    } catch {
      stop(entry);
      entry.snapshot = { ...entry.snapshot, error: '平行宇宙暂时无法启动' };
      publish(entry);
    }
  }, 0);
}

export function subscribeParallel(sim: SimState, runId: number, listener: Listener): () => void {
  const key = parallelKey(sim, runId);
  if (!current || current.key !== key) {
    if (current) stop(current);
    current = {
      key, sim, listeners: new Set(), worker: null, task: null, cancel: null,
      snapshot: { results: {}, timings: {}, computing: null, error: null },
    };
  }
  const entry = current;
  if (entry.cancel !== null) clearTimeout(entry.cancel);
  entry.cancel = null;
  entry.listeners.add(listener);
  listener(entry.snapshot);
  schedule(entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) entry.cancel = setTimeout(() => stop(entry), 0);
  };
}

export function retryParallel(sim: SimState, runId: number) {
  if (!current || current.key !== parallelKey(sim, runId)) return;
  current.snapshot = { ...current.snapshot, error: null };
  publish(current);
  schedule(current);
}
