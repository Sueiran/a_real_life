import { motion } from 'motion/react';
import type { SimState } from '../../simulation/types';
import { eventById } from '../../events/definitions';
import { formatMoney } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';
import { useModalDialog } from '../../lib/useModalDialog';

export default function HistoryDrawer({ sim }: { sim: SimState }) {
  const dialogRef = useModalDialog();
  const setHistoryOpen = useUiStore((s) => s.setHistoryOpen);
  const entries = sim.years.filter((y) => y.eventId !== null);

  return (
    <motion.dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="人生回顾"
      tabIndex={-1}
      onCancel={(e) => { e.preventDefault(); setHistoryOpen(false); }}
      className="fixed inset-0 z-40 m-0 flex h-full max-h-none w-full max-w-none justify-end border-0 bg-abyss-950/60 p-0 backdrop-blur-sm not-open:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setHistoryOpen(false)}
    >
      <motion.aside
        className="flex h-full w-full max-w-sm flex-col border-l border-abyss-600/50 bg-abyss-900/95"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-abyss-700/50 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">人生回顾</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setHistoryOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-abyss-700/50 hover:text-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="mt-10 text-center text-sm text-zinc-400">还没有发生故事，继续向前走。</p>
          ) : (
            <ol className="relative flex flex-col gap-5 border-l border-abyss-600/60 pl-4">
              {entries.map((y) => {
                const def = eventById(y.eventId!);
                const choice = def?.choices.find((c) => c.id === y.choiceId);
                return (
                  <li key={y.yearIndex} className="relative">
                    <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-wealth-400/80" />
                    <p className="tnum text-xs text-zinc-400">
                      {y.calendarYear} · {y.age} 岁
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{def?.title ?? y.eventId}</p>
                    {choice && <p className="mt-0.5 text-xs text-wealth-300/90">选择了「{choice.label}」</p>}
                    {y.eventCash !== undefined && y.eventCash !== 0 && (
                      <p className={`tnum mt-1 text-xs ${y.eventCash >= 0 ? 'text-wealth-400/80' : 'text-flare-400/80'}`}>
                        当年现金 {y.eventCash >= 0 ? '+' : ''}
                        {formatMoney(y.eventCash)}
                      </p>
                    )}
                    {y.scheduledCashApplied !== undefined && y.scheduledCashApplied !== 0 && (
                      <p className="tnum mt-1 text-xs text-tide-300/80">
                        昔日投入兑现 +{formatMoney(y.scheduledCashApplied)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="border-t border-abyss-700/50 px-5 py-3 text-xs break-all text-zinc-400">
          种子 {sim.seed}
        </p>
      </motion.aside>
    </motion.dialog>
  );
}
