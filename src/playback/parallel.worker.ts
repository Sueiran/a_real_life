import { calculateParallel, type ParallelRequest, type ParallelResponse } from './parallelCalculation';

self.onmessage = (event: MessageEvent<ParallelRequest>) => {
  const { strategyId } = event.data;
  let response: ParallelResponse;
  try {
    const start = performance.now();
    const data = calculateParallel(event.data);
    response = { strategyId, data, elapsedMs: performance.now() - start };
  } catch (error) {
    response = { strategyId, error: error instanceof Error ? error.message : '计算失败' };
  }
  self.postMessage(response);
};
