import { motion } from 'motion/react';
import Backdrop from '../../components/Backdrop';
import { useSimStore } from '../../store/simStore';
import { useUiStore } from '../../store/uiStore';
import { formatMoney } from '../../lib/format';

export default function SharedView() {
  const data = useUiStore((s) => s.sharedData);
  const startReplay = useSimStore((s) => s.startReplay);
  const start = useSimStore((s) => s.start);

  if (!data) return null;
  const { inputs } = data;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md text-center"
      >
        <p className="text-sm tracking-[0.25em] text-tide-300">平行人生来信</p>
        <h1 className="mt-4 text-2xl font-semibold leading-relaxed tracking-tight text-zinc-50 sm:text-3xl">
          你收到了一段来自
          <br />
          另一个平行人生的故事。
        </h1>

        <div className="glass mt-8 rounded-3xl p-6 text-left">
          <p className="tnum text-sm text-zinc-400">
            {inputs.startYear} 年 · {inputs.startAge} 岁出发
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">起点资产</span>
              <span className="tnum text-zinc-200">{formatMoney(inputs.initialAssets)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">年收入</span>
              <span className="tnum text-zinc-200">{formatMoney(inputs.annualIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">年支出</span>
              <span className="tnum text-zinc-200">{formatMoney(inputs.annualExpenses)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => startReplay(data)}
            className="w-full rounded-xl bg-gradient-to-r from-wealth-500 to-tide-500 py-3.5 text-base font-semibold text-abyss-950 shadow-[0_8px_30px_rgba(16,185,129,0.35)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            观看 TA 的人生
          </button>
          <button
            type="button"
            onClick={() => start(inputs)}
            className="w-full rounded-xl border border-abyss-600/70 py-3 text-sm text-zinc-300 transition-colors hover:border-tide-400/40 hover:text-tide-300"
          >
            相同起点，我来试试
          </button>
        </div>
      </motion.div>
    </div>
  );
}