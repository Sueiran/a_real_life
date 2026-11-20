import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSimStore, type Speed } from '../../store/simStore';
import { useUiStore } from '../../store/uiStore';
import { initialGoal } from '../../simulation/goals';
import { formatMoney, toReal } from '../../lib/format';
import AssetCounter from './AssetCounter';
import WealthChart from './WealthChart';
import EventCard from './EventCard';
import HistoryDrawer from './HistoryDrawer';
import WealthChartGuide from '../../components/WealthChartGuide';

const SPEEDS: Speed[] = [1, 2, 4];

export default function SimulationView({ firstVisit, onIntroSeen }: { firstVisit: boolean; onIntroSeen: () => void }) {
  const sim = useSimStore((s) => s.sim);
  const runId = useSimStore((s) => s.runId);
  const playback = useSimStore((s) => s.playback);
  const speed = useSimStore((s) => s.speed);
  const togglePause = useSimStore((s) => s.togglePause);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const restart = useSimStore((s) => s.restart);
  const replaying = useSimStore((s) => s.replayChoices !== null);
  const historyOpen = useUiStore((s) => s.historyOpen);
  const setHistoryOpen = useUiStore((s) => s.setHistoryOpen);
  const [introRunId] = useState(firstVisit && !replaying ? runId : null);
  useEffect(() => { onIntroSeen(); }, [onIntroSeen]);

  if (!sim) return null;
  const { inputs, config, years, pending } = sim;
  const latest = years[years.length - 1];
  // 事件待决年：HUD 显示暂记年（未入历史），数字/曲线冻结。
  const current = pending ? pending.year : latest;
  const assets = current ? current.assets : inputs.initialAssets;
  const year = current ? current.calendarYear : inputs.startYear;
  const age = current ? current.age : inputs.startAge;
  const goal = current ? current.goalAmount : initialGoal(inputs, config);
  const yearIndex = current ? current.yearIndex : 0;
  const progress = Math.max(0, Math.min(1, assets / goal));
  const gap = goal - assets;
  const eventPending = playback === 'eventPending';
  const frozen = playback !== 'playing';

  return (
    <div className="relative flex h-screen flex-col overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#0b1424_0%,#04070e_65%)] px-4 pt-5 pb-4 sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-3xl font-semibold text-zinc-50 sm:text-4xl">{year}</span>
          <span className="text-sm text-zinc-400">{age} 岁</span>
          {replaying && (
            <span className="rounded-full border border-tide-400/30 px-2 py-0.5 text-xs text-tide-300">重播中</span>
          )}
        </div>

        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>财富自由进度</span>
            <span className="tnum text-wealth-300">{(progress * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-abyss-700/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-wealth-500 to-tide-400 transition-[width] duration-700"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <button
            type="button"
            onClick={togglePause}
            disabled={eventPending}
            data-playback-control
            aria-label={playback === 'playing' ? '暂停' : '继续'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-abyss-600/70 text-zinc-200 transition-colors hover:border-wealth-400/50 hover:text-wealth-300 disabled:opacity-30"
          >
            {playback === 'playing' ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11c0 .8.9 1.3 1.6.9l8-5.5c.6-.4.6-1.4 0-1.8l-8-5.5C3.9.2 3 .7 3 1.5z" /></svg>
            )}
          </button>
          <div className="flex rounded-full border border-abyss-600/70 p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`tnum min-h-11 min-w-11 rounded-full text-xs transition-colors ${
                  speed === s ? 'bg-wealth-500/20 text-wealth-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { if (playback === 'playing') togglePause(); setHistoryOpen(true); }}
            aria-label="人生回顾"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-abyss-600/70 text-zinc-400 transition-colors hover:border-tide-400/50 hover:text-tide-300"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 4v4l2.5 2.5" /><circle cx="8" cy="8" r="6" /></svg>
          </button>
          <button
            type="button"
            onClick={restart}
            aria-label="重新开始"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-abyss-600/70 text-zinc-400 transition-colors hover:border-flare-400/50 hover:text-flare-400"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9" /><path d="M2.5 12.5v-4h4" /></svg>
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
        {introRunId === runId && !replaying && !years.some((y) => y.choiceId !== null) && (
          <div className="mt-4 shrink-0 text-center text-sm leading-6 text-zinc-400">
            <p>时间正在向前推进，看看你的财富何时追上目标。</p>
            <p>遇到人生事件时，由你做出选择。</p>
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center sm:py-10">
          <AssetCounter value={assets} speed={speed} frozen={frozen} />
          <div className="mt-3 h-5">
            <AnimatePresence mode="popLayout">
              {current && !pending && (
                <motion.p
                  key={current.yearIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className={`tnum text-sm ${
                    current.assets >= current.assetsStart ? 'text-wealth-400/90' : 'text-flare-400/90'
                  }`}
                >
                  {current.assets >= current.assetsStart ? '本年 +' : '本年 -'}
                  {formatMoney(Math.abs(current.assets - current.assetsStart))}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <p className="tnum mt-2 text-sm text-zinc-400">
            实际购买力 <span className="text-tide-300">{formatMoney(toReal(assets, yearIndex, config.inflation))}</span>
            <span className="mx-2 text-zinc-600">·</span>
            {gap > 0 ? (
              <>距财富自由还差 <span className="text-gold-300">{formatMoney(gap)}</span></>
            ) : (
              <span className="text-wealth-300">已达成财富自由</span>
            )}
          </p>
        </div>

        <div className="glass flex min-h-[380px] flex-1 flex-col rounded-2xl p-2 sm:min-h-[400px] sm:p-3">
          <WealthChartGuide goalMode={inputs.goal.mode} />
          <WealthChart sim={sim} runId={runId} frozen={frozen} />
        </div>
      </main>

      <AnimatePresence>
        {pending && eventPending && <EventCard key="event" event={pending.event} year={pending.year} />}
      </AnimatePresence>
      <AnimatePresence>
        {historyOpen && <HistoryDrawer key="history" sim={sim} />}
      </AnimatePresence>
    </div>
  );
}
