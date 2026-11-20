import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Backdrop from '../../components/Backdrop';
import { useSimStore } from '../../store/simStore';
import { summarizeEnding } from '../../simulation/endings';
import { createReplayData } from '../../simulation/replaySignature';
import { formatAssetMoney, formatMoney, toReal } from '../../lib/format';
import { buildShareUrl } from '../../lib/share';
import { buildNarrative } from './narrative';
import EndingChart from './EndingChart';
import RewindPanel from './RewindPanel';
import ParallelUniverses from './ParallelUniverses';

export default function EndingView() {
  const sim = useSimStore((s) => s.sim);
  const inputs = useSimStore((s) => s.inputs);
  const runId = useSimStore((s) => s.runId);
  const start = useSimStore((s) => s.start);
  const restart = useSimStore((s) => s.restart);
  const replayCurrent = useSimStore((s) => s.replayCurrent);
  const [rewindOpen, setRewindOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualShareUrl, setManualShareUrl] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
  }, []);

  if (!sim || !inputs) return null;
  const ending = summarizeEnding(sim);
  if (!ending) return null;

  const last = sim.years[sim.years.length - 1];
  const yearIndex = last ? last.yearIndex : 0;
  const fired = ending.status === 'fire';
  const initFire = fired && sim.years.length === 0;
  const narrative = buildNarrative(sim, ending);
  const eventCount = sim.years.filter((y) => y.eventId !== null).length;
  const hasChoices = eventCount > 0;

  const accent = fired
    ? 'text-gold-300'
    : ending.status === 'bankrupt'
      ? 'text-flare-400'
      : 'text-tide-300';
  const statusLabel = initFire
    ? '隐藏结局'
    : fired
      ? '财富自由达成'
      : ending.status === 'bankrupt'
        ? '财务崩溃'
        : '人生终点';

  const handleShare = async () => {
    const url = buildShareUrl(createReplayData(sim));
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      if (useSimStore.getState().runId !== runId) return;
      setCopied(false);
      setManualShareUrl(url);
      return;
    }
    if (useSimStore.getState().runId !== runId) return;
    setManualShareUrl('');
    setCopied(true);
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="relative min-h-screen overflow-y-auto px-4 py-10 sm:px-6">
      <Backdrop dim={!fired} />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto w-full max-w-2xl"
      >
        <div className="text-center">
          <p className="text-sm text-zinc-500">你的人生最终走向了哪里？</p>
          <h1 className={`mt-3 text-4xl font-semibold tracking-tight sm:text-5xl ${fired ? 'text-gold-200' : 'text-zinc-50'}`}>
            {ending.title}
          </h1>
          <p className="tnum mt-3 text-sm text-zinc-400">
            {ending.calendarYear} 年 · {ending.age} 岁
            <span className="mx-2 text-zinc-600">·</span>
            <span className={accent}>{statusLabel}</span>
          </p>
        </div>

        <div className={`glass mt-8 rounded-3xl p-6 text-center sm:p-8 ${fired ? 'shadow-[0_0_80px_-20px_rgba(252,211,77,0.25)]' : ''}`}>
          <p className="text-xs tracking-widest text-zinc-500">最终资产</p>
          <p className={`tnum mt-2 text-4xl font-semibold sm:text-5xl ${accent}`} title={formatMoney(ending.finalAssets)} aria-label={`最终资产 ${formatMoney(ending.finalAssets)}`}>
            {formatAssetMoney(ending.finalAssets)}
          </p>
          <p className="tnum mt-2 text-sm text-zinc-400">
            实际购买力 {formatMoney(toReal(ending.finalAssets, yearIndex, sim.config.inflation))}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-abyss-600/50 pt-5 text-sm">
            <div>
              <p className="text-xs text-zinc-500">目标</p>
              <p className="tnum mt-1 break-all text-zinc-200">{formatAssetMoney(ending.goalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">经历年数</p>
              <p className="tnum mt-1 break-all text-zinc-200">{sim.years.length}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">人生事件</p>
              <p className="tnum mt-1 break-all text-zinc-200">{eventCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-abyss-600/40 bg-abyss-900/40 p-6 sm:p-7">
          <p className="text-sm leading-relaxed text-zinc-300">{narrative.opening}</p>
          {narrative.turningText && (
            <p className={`mt-3 border-l-2 pl-3 text-sm leading-relaxed text-zinc-200 ${fired ? 'border-gold-400/60' : ending.status === 'bankrupt' ? 'border-flare-400/60' : 'border-tide-400/60'}`}>
              {narrative.turningText}
            </p>
          )}
          {narrative.story.length > 0 && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{narrative.story.join('')}</p>
          )}
          <p className={`mt-3 text-sm leading-relaxed ${accent}`}>{narrative.closing}</p>
        </div>

        <div className="glass mt-6 rounded-3xl p-3 sm:p-4">
          <EndingChart sim={sim} status={ending.status} />
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => start(inputs)}
            className="flex-1 rounded-xl bg-gradient-to-r from-wealth-500 to-tide-500 py-3.5 font-semibold text-abyss-950 shadow-[0_8px_30px_rgba(16,185,129,0.3)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            换一种人生
          </button>
          {hasChoices && (
            <button
              type="button"
              onClick={() => setRewindOpen(true)}
              className="flex-1 rounded-xl border border-gold-400/40 py-3.5 font-medium text-gold-300 transition-colors hover:bg-gold-400/10"
            >
              回到过去，改变命运
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={replayCurrent}
            className="min-h-11 rounded-xl border border-abyss-600/60 py-2.5 text-sm text-zinc-400 transition-colors hover:border-tide-400/40 hover:text-tide-300"
          >
            重看这一生
          </button>
          <button
            type="button"
            onClick={handleShare}
            className={`min-h-11 rounded-xl border py-2.5 text-sm transition-colors ${copied ? 'border-wealth-400/50 text-wealth-300' : 'border-abyss-600/60 text-zinc-400 hover:border-wealth-400/40 hover:text-wealth-300'}`}
          >
            {copied ? '已复制链接' : '分享我的人生'}
          </button>
          <button
            type="button"
            onClick={restart}
            className="min-h-11 rounded-xl border border-abyss-600/60 py-2.5 text-sm text-zinc-400 transition-colors hover:border-flare-400/40 hover:text-flare-300"
          >
            修改初始信息
          </button>
        </div>
        {manualShareUrl && <div className="mt-3 rounded-xl border border-gold-400/30 p-4">
          <p role="alert" className="text-sm text-gold-300">复制失败，请手动复制下方链接。</p>
          <input aria-label="人生分享链接" readOnly value={manualShareUrl} onFocus={(event) => event.target.select()} className="mt-2 min-h-11 w-full min-w-0 rounded-lg bg-abyss-950 px-3 text-base text-zinc-200" />
        </div>}
        <ParallelUniverses key={runId} sim={sim} runId={runId} />
      </motion.div>

      <AnimatePresence>
        {rewindOpen && <RewindPanel key="rewind" sim={sim} onClose={() => setRewindOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}