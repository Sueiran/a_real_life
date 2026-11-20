import { motion } from 'motion/react';
import type { EventDef, YearState } from '../../simulation/types';
import { useSimStore } from '../../store/simStore';
import { formatMoney } from '../../lib/format';
import { useModalDialog } from '../../lib/useModalDialog';

const CATEGORY_LABEL: Record<EventDef['category'], string> = {
  career: '事业',
  family: '家庭',
  market: '市场',
  lifestyle: '生活',
  shock: '意外',
  'debt-crisis': '债务危机',
};

const CATEGORY_ACCENT: Record<EventDef['category'], string> = {
  career: 'from-tide-500/25 via-abyss-800/40',
  family: 'from-gold-500/20 via-abyss-800/40',
  market: 'from-wealth-500/25 via-abyss-800/40',
  lifestyle: 'from-tide-400/20 via-abyss-800/40',
  shock: 'from-flare-500/25 via-abyss-800/40',
  'debt-crisis': 'from-flare-600/30 via-abyss-800/40',
};

const CATEGORY_BADGE: Record<EventDef['category'], string> = {
  career: 'border-tide-400/30 text-tide-300',
  family: 'border-gold-400/30 text-gold-300',
  market: 'border-wealth-400/30 text-wealth-300',
  lifestyle: 'border-tide-300/30 text-tide-200',
  shock: 'border-flare-400/30 text-flare-300',
  'debt-crisis': 'border-flare-400/40 text-flare-300',
};

export default function EventCard({ event, year }: { event: EventDef; year: YearState }) {
  const dialogRef = useModalDialog();
  const choose = useSimStore((s) => s.choose);
  const replayChoices = useSimStore((s) => s.replayChoices);
  const replayed = replayChoices !== null;
  const originalChoice = replayChoices?.find(
    (c) => c.yearIndex === year.yearIndex && c.eventId === event.id,
  );

  return (
    <motion.dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
      tabIndex={-1}
      onCancel={(e) => e.preventDefault()}
      className="fixed inset-0 z-40 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center overflow-y-auto border-0 bg-abyss-950/70 p-4 backdrop-blur-md not-open:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className={`glass my-auto w-full max-w-md rounded-3xl border border-abyss-500/40 bg-gradient-to-br ${CATEGORY_ACCENT[event.category]} to-abyss-900/60 p-6 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)] sm:p-7`}
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="flex items-center justify-between">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${CATEGORY_BADGE[event.category]}`}>
            {CATEGORY_LABEL[event.category]}
          </span>
          <span className="tnum text-xs text-zinc-400">
            {replayed && <span className="mr-2 rounded-full border border-tide-400/30 px-2 py-0.5 text-tide-300">重播</span>}
            {year.calendarYear} · {year.age} 岁
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold text-zinc-50 sm:text-2xl">{event.title}</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-zinc-400">{event.description}</p>

        {event.category === 'market' && (
          <p className={`tnum mt-3 text-xs ${year.marketReturn >= 0 ? 'text-wealth-400/80' : 'text-flare-400/80'}`}>
            本年市场收益 {(year.marketReturn * 100).toFixed(1)}%
            <span className="mx-2 text-zinc-600">·</span>
            当前资产 {formatMoney(year.assets)}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {event.choices.map((choice) => {
            const isOriginal = replayed && originalChoice?.choiceId === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={replayed}
                onClick={() => choose(choice.id)}
                className={`group rounded-2xl border px-4 py-3.5 text-left transition-all ${
                  isOriginal
                    ? 'border-wealth-400/50 bg-wealth-500/10'
                    : replayed
                      ? 'border-abyss-500/40 bg-abyss-800/30 opacity-45'
                      : 'border-abyss-500/50 bg-abyss-800/40 hover:border-wealth-400/40 hover:bg-wealth-500/10 active:scale-[0.985]'
                }`}
              >
                <span className={`block text-sm font-medium ${isOriginal ? 'text-wealth-200' : 'text-zinc-100 group-hover:text-wealth-200'}`}>
                  {choice.label}
                  {isOriginal && <span className="ml-2 text-xs font-normal text-wealth-300/90">当时的选择</span>}
                </span>
                {choice.hint && (
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-400 group-hover:text-zinc-400">
                    {choice.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.dialog>
  );
}
