import { motion } from 'motion/react';
import type { SimState } from '../../simulation/types';
import { eventById } from '../../events/definitions';
import { choiceLog } from '../../simulation/engine';
import { useSimStore } from '../../store/simStore';
import { useModalDialog } from '../../lib/useModalDialog';

export default function RewindPanel({ sim, onClose }: { sim: SimState; onClose: () => void }) {
  const dialogRef = useModalDialog();
  const rewindTo = useSimStore((s) => s.rewindTo);
  const entries = choiceLog(sim);

  return (
    <motion.dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="回到关键抉择"
      tabIndex={-1}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="fixed inset-0 z-40 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center overflow-y-auto border-0 bg-abyss-950/70 p-4 backdrop-blur-md not-open:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        className="glass my-auto flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl p-6 sm:p-7"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-50">回到关键抉择</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-abyss-700/50 hover:text-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">选择一个年份重新抉择，之前的岁月保持不变。</p>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <ol className="flex flex-col gap-2">
            {entries.map((entry) => {
              const y = sim.years.find((v) => v.yearIndex === entry.yearIndex);
              const def = eventById(entry.eventId);
              const choice = def?.choices.find((c) => c.id === entry.choiceId);
              if (!y || !def || !choice) return null;
              return (
                <li key={entry.yearIndex}>
                  <button
                    type="button"
                    onClick={() => {
                      rewindTo(entry.yearIndex);
                      onClose();
                    }}
                    className="group w-full rounded-2xl border border-abyss-500/50 bg-abyss-800/40 px-4 py-3 text-left transition-all hover:border-tide-400/40 hover:bg-tide-500/10 active:scale-[0.985]"
                  >
                    <span className="tnum block text-xs text-zinc-400">
                      {y.calendarYear} · {y.age} 岁
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-zinc-100 group-hover:text-tide-200">
                      {def.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      当时选择「{choice.label}」
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </motion.div>
    </motion.dialog>
  );
}