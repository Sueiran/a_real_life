import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, stepYear } from '../simulation/engine';
import type { ParallelRequest, ParallelResponse, ParallelData } from '../playback/parallelCalculation';
import type { ParallelSnapshot } from '../playback/parallel';
import { baseInputs } from './fixtures';

const sim = createInitialState(baseInputs(), 'cache');
const data: ParallelData = {
  totalPaths: 300, fireCount: 0, medianFireAge: null, firstFireDistribution: [],
  initial: { phase: 'initial', yearIndex: 0, calendarYear: 2026, age: 30, goalAmount: 3000000, p10: 200000, p50: 200000, p90: 200000 },
  years: [], comparison: null,
};
class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: ParallelRequest[] = [];
  onmessage: ((event: MessageEvent<ParallelResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: ParallelRequest) { this.messages.push(request); }
  terminate() { this.terminated = true; }
  emit(strategyId: string, responseData = data) {
    this.onmessage?.({ data: { strategyId, data: responseData, elapsedMs: 10 } } as MessageEvent<ParallelResponse>);
  }
}
let service: typeof import('../playback/parallel');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  service = await import('../playback/parallel');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function start(runId = 1) {
  const snapshots: ParallelSnapshot[] = [];
  const unsubscribe = service.subscribeParallel(sim, runId, (s) => snapshots.push(s));
  vi.runOnlyPendingTimers();
  return { worker: FakeWorker.instances.at(-1)!, snapshots, unsubscribe };
}
function complete(worker: FakeWorker) {
  for (const strategy of ['balanced', 'aggressive', 'conservative']) { worker.emit(strategy); vi.runOnlyPendingTimers(); }
}

describe('平行宇宙会话调度', () => {
  it('导入服务不启动 Worker；订阅之后才异步计算', () => {
    expect(FakeWorker.instances).toHaveLength(0);
    service.subscribeParallel(sim, 1, () => {});
    expect(FakeWorker.instances).toHaveLength(0);
    vi.runOnlyPendingTimers();
    expect(FakeWorker.instances[0].messages[0].strategyId).toBe('balanced');
  });
  it('基线先完成，另两策略分别在后续任务调用，完成后释放 Worker', () => {
    const { worker, snapshots } = start();
    worker.emit('balanced');
    expect(worker.messages).toHaveLength(1);
    expect(snapshots.at(-1)?.results.balanced).toEqual(data);
    vi.runOnlyPendingTimers();
    expect(worker.messages[1].strategyId).toBe('aggressive');
    worker.emit('aggressive'); vi.runOnlyPendingTimers();
    expect(worker.messages[2].strategyId).toBe('conservative');
    worker.emit('conservative');
    expect(worker.terminated).toBe(true);
    expect(Object.keys(snapshots.at(-1)!.results)).toHaveLength(3);
  });
  it('StrictMode 订阅/退订/订阅不重复任务', () => {
    const unsubscribe = service.subscribeParallel(sim, 1, () => {});
    unsubscribe();
    service.subscribeParallel(sim, 1, () => {});
    vi.runOnlyPendingTimers();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].messages).toHaveLength(1);
  });
  it('多个订阅共享同一 Worker 和结果', () => {
    const { worker } = start();
    const received = vi.fn();
    service.subscribeParallel(sim, 1, received);
    vi.runOnlyPendingTimers();
    worker.emit('balanced');
    expect(FakeWorker.instances).toHaveLength(1);
    expect(received.mock.lastCall![0].results.balanced).toEqual(data);
  });
  it('收起后再展开直接复用三个完成结果，不再计算', () => {
    const { worker, unsubscribe } = start();
    complete(worker); unsubscribe(); vi.runOnlyPendingTimers();
    const listener = vi.fn();
    service.subscribeParallel(sim, 1, listener); vi.runOnlyPendingTimers();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(Object.keys(listener.mock.lastCall![0].results)).toHaveLength(3);
  });
  it('收起取消进行中的任务，只保留已完成策略', () => {
    const { worker, unsubscribe } = start();
    worker.emit('balanced'); vi.runOnlyPendingTimers();
    unsubscribe(); vi.runOnlyPendingTimers();
    expect(worker.terminated).toBe(true);
    service.subscribeParallel(sim, 1, () => {}); vi.runOnlyPendingTimers();
    expect(FakeWorker.instances[1].messages[0].strategyId).toBe('aggressive');
  });
  it('新局和重播 runId 隔离，旧响应不能污染新局', () => {
    const first = start(1);
    const second = start(2);
    first.worker.emit('balanced');
    expect(first.worker.terminated).toBe(true);
    expect(second.snapshots.at(-1)!.results).toEqual({});
    second.worker.emit('balanced');
    expect(second.snapshots.at(-1)!.results.balanced).toEqual(data);
  });
  it('改变输入、种子、配置或真实历史使缓存失效', () => {
    const key = service.parallelKey(sim, 1);
    expect(service.parallelKey({ ...sim }, 1)).toBe(key);
    expect(service.parallelKey({ ...sim, seed: 'other' }, 1)).not.toBe(key);
    expect(service.parallelKey({ ...sim, inputs: { ...sim.inputs, annualIncome: 12345 } }, 1)).not.toBe(key);
    expect(service.parallelKey({ ...sim, config: { ...sim.config, inflation: 0 } }, 1)).not.toBe(key);
    expect(service.parallelKey(stepYear(sim).state, 1)).not.toBe(key);
    expect(service.parallelKey(sim, 2)).not.toBe(key);
  });
  it('相同 runId 改种子也终止旧 Worker 并清空结果', () => {
    const { worker } = start();
    worker.emit('balanced');
    const listener = vi.fn();
    service.subscribeParallel({ ...sim, seed: 'new' }, 1, listener);
    expect(worker.terminated).toBe(true);
    expect(listener.mock.lastCall![0].results).toEqual({});
  });
  it('拒绝策略不匹配的响应', () => {
    const { worker, snapshots } = start();
    worker.emit('conservative');
    expect(snapshots.at(-1)!.results).toEqual({});
    expect(snapshots.at(-1)!.computing).toBe('balanced');
  });
  it('错误停止计算，重试继续缺失策略而非丢弃缓存', () => {
    const { worker, snapshots } = start();
    worker.emit('balanced'); vi.runOnlyPendingTimers();
    worker.onerror?.();
    expect(snapshots.at(-1)!.error).toBeTruthy();
    expect(worker.terminated).toBe(true);
    service.retryParallel(sim, 1); vi.runOnlyPendingTimers();
    expect(FakeWorker.instances[1].messages[0].strategyId).toBe('aggressive');
    expect(snapshots.at(-1)!.results.balanced).toEqual(data);
  });
  it('旧局的重试不干扰当前局', () => {
    const { worker } = start(2);
    worker.onerror?.();
    service.retryParallel(sim, 1); vi.runOnlyPendingTimers();
    expect(FakeWorker.instances).toHaveLength(1);
  });
});
