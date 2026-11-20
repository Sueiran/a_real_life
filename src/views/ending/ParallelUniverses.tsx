import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { INVESTMENT_STRATEGIES } from '../../simulation/config';
import type { SimState } from '../../simulation/types';
import { retryParallel, subscribeParallel, type ParallelSnapshot } from '../../playback/parallel';
import { fireBeforeAges, formatPathRate, parallelPoints } from './parallelData';

const ParallelChart = lazy(() => import('./ParallelChart'));
const descriptions: Record<string, string> = {
  aggressive: '较高收益假设 · 较高波动',
  balanced: '中等收益假设 · 中等波动',
  conservative: '较低收益假设 · 较低波动',
};
const empty: ParallelSnapshot = { results: {}, timings: {}, computing: null, error: null };

export default function ParallelUniverses({ sim, runId }: { sim: SimState; runId: number }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(empty);
  const [strategyId, setStrategyId] = useState('balanced');
  const [full, setFull] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    return subscribeParallel(sim, runId, setSnapshot);
  }, [open, sim, runId]);

  const data = snapshot.results[strategyId];
  const points = useMemo(() => data ? parallelPoints(data, sim, full) : [], [data, sim, full]);
  const milestones = data ? fireBeforeAges(data, sim.inputs.startAge, sim.inputs.endAge) : [];
  const comparison = data?.comparison;

  return (
    <section className="parallel-universes mt-10 overflow-hidden rounded-3xl border border-tide-400/20 bg-gradient-to-br from-tide-500/[0.06] via-abyss-900/70 to-abyss-900/40" aria-label="平行宇宙">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight text-zinc-100 sm:text-xl">如果人生可以重来 300 次……</h2>
          {open && <button type="button" className="-my-2 min-h-11 shrink-0 text-xs text-zinc-400 hover:text-tide-200" onClick={() => setOpen(false)} aria-expanded="true" aria-controls="parallel-content">收起</button>}
        </div>
        {!open && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">同样的起点，不同的市场走势，会通向怎样的未来？</p>
            <button type="button" className="mt-5 min-h-11 w-full rounded-xl border border-tide-400/30 bg-tide-400/[0.07] px-4 py-3 text-sm font-medium text-tide-200 transition-colors hover:bg-tide-400/15" onClick={() => setOpen(true)} aria-expanded="false" aria-controls="parallel-content">看看我的平行宇宙<span className="ml-2" aria-hidden="true">↗</span></button>
          </>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="parallel-content" key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.28 }}>
            <div className="px-5 pb-6 sm:px-7 sm:pb-7">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-abyss-600/60 bg-abyss-950/50 p-1" role="group" aria-label="投资策略">
                {INVESTMENT_STRATEGIES.map((strategy) => (
                  <button key={strategy.id} type="button" aria-pressed={strategyId === strategy.id} onClick={() => setStrategyId(strategy.id)} className={`min-h-11 rounded-lg text-sm transition-colors ${strategyId === strategy.id ? 'bg-tide-400/15 text-tide-200' : 'text-zinc-400 hover:text-zinc-200'}`}>
                    {strategy.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <span>{descriptions[strategyId]}</span>
                {data && <button type="button" className="min-h-11 text-tide-300 hover:text-tide-200" onClick={() => setFull(!full)}>{full ? '聚焦这一生' : '查看完整年限'}</button>}
              </div>
              <div className="sr-only" role="status" aria-live="polite">{data ? `${INVESTMENT_STRATEGIES.find((s) => s.id === strategyId)?.label}策略已就绪` : '正在计算平行路径'}</div>
              {snapshot.error && <div role="alert" className="my-4 text-sm text-gold-300">{snapshot.error}<button type="button" onClick={() => retryParallel(sim, runId)} className="ml-3 min-h-11 underline">重试</button></div>}
              {!data ? (
                <div className="flex h-[260px] items-center justify-center gap-3 text-sm text-zinc-400 sm:h-[320px]" role="status">
                  {!snapshot.error && <><span className="h-4 w-4 animate-spin rounded-full border border-tide-300/25 border-t-tide-300" />正在展开 300 条人生……</>}
                </div>
              ) : (
                <>
                  <Suspense fallback={<div className="h-[320px] py-12 text-center text-sm text-zinc-400">正在绘制平行宇宙……</div>}><ParallelChart points={points} /></Suspense>
                  <div className="mt-4 border-t border-abyss-600/60 pt-5">
                    <h3 className="text-sm font-medium text-zinc-200">有多少条人生，提前抵达了自由？</h3>
                    <div className="mt-4 space-y-3" aria-label="各年龄前累计达成">
                      {milestones.map(({ age, count }) => (
                        <div key={age} className="grid grid-cols-[4.2rem_1fr] items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-zinc-400">{age} 岁前</span>
                          <div className="flex justify-between gap-2"><span className="tnum text-zinc-200">{count} <span className="text-zinc-500">/ {data.totalPaths} 条</span></span><span className="tnum text-zinc-400">{formatPathRate(count, data.totalPaths)}</span></div>
                          <div className="col-start-2 h-1.5 overflow-hidden rounded-full bg-abyss-700"><motion.div className="h-full rounded-full bg-gradient-to-r from-wealth-500/70 to-tide-300/80" initial={false} animate={{ width: `${count / data.totalPaths * 100}%` }} transition={{ duration: reduced ? 0 : 0.4 }} /></div>
                        </div>
                      ))}
                      {milestones.length === 0 && <p className="text-sm text-zinc-300">终点前达成 {data.fireCount} / {data.totalPaths} 条</p>}
                    </div>
                    <p className="mt-4 text-xs text-zinc-400">{data.medianFireAge === null ? '这些路径中，尚无人生达成自由。' : <>达成人生的中位年龄 <span className="tnum text-tide-200">{data.medianFireAge} 岁</span></>}</p>
                  </div>
                  <div className="mt-5 rounded-2xl border border-[#f0b77e]/15 bg-[#f0b77e]/[0.035] p-4">
                    {comparison ? <p className="text-sm leading-relaxed text-zinc-300">在 {comparison.calendarYear} 年{comparison.phase === 'initial' ? '开局' : '末'}的 {comparison.sampleCount} 条平行路径中，你超过了 <strong className="tnum font-medium text-[#f0b77e]">{comparison.belowCount}</strong> 条。{comparison.equalCount > 0 && <span className="mt-1 block text-xs text-zinc-400">另有 {comparison.equalCount} 条与你相同，不计为超过。</span>}</p> : <p className="text-sm text-zinc-400">参数或年份不一致，无法进行同年比较。</p>}
                  </div>
                </>
              )}
              <p className="mt-5 text-xs leading-relaxed text-zinc-400">无人生事件、持续工作并投资的模型基线。你的真实人生包含事件。区间并非保证，也不是投资建议。</p>
              <details className="mt-2 text-xs leading-relaxed text-zinc-400"><summary className="min-h-11 cursor-pointer py-1 text-zinc-500 hover:text-zinc-300">模型口径</summary><p>达成后仍继续工作；破产后仅作债务数学续算，不代表可以继续借款。首次破产后才达成不计入达成数。年龄门槛不含当岁；区间覆盖模型中间 80% 的路径，不是上下限。所有金额为当年名义人民币。</p></details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
