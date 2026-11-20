import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ playback: 'playing', speed: 1, tick: vi.fn() }));
vi.mock('../store/simStore', () => ({ useSimStore: { getState: () => state } }));
import { stopDriver, syncDriver } from '../playback/driver';
let callback: FrameRequestCallback;
vi.stubGlobal('requestAnimationFrame', vi.fn((fn: FrameRequestCallback) => { callback = fn; return 1; }));
vi.stubGlobal('cancelAnimationFrame', vi.fn());
afterEach(() => { stopDriver(); state.playback = 'playing'; state.speed = 1; vi.clearAllMocks(); });

describe('播放时钟边界', () => {
  it('长时间后台恢复不跳过多个可见年份', () => {
    syncDriver(); callback(0); callback(60000);
    expect(state.tick).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2, 4])('%sx 正常节奏保持年度数量', (speed) => {
    state.speed = speed;
    syncDriver();
    for (let ts = 0; ts <= 2200; ts += 10) callback(ts);
    expect(state.tick).toHaveBeenCalledTimes(speed * 2);
  });
  it('重复同步不产生第二个时钟，暂停不推进', () => {
    syncDriver(); syncDriver();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    state.playback = 'paused'; callback(60000);
    expect(state.tick).not.toHaveBeenCalled();
  });
});
