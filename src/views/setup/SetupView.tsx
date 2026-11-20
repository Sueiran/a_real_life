import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import Backdrop from '../../components/Backdrop';
import { useSimStore } from '../../store/simStore';
import { useUiStore } from '../../store/uiStore';
import { formatMoney } from '../../lib/format';
import { loadLastInputs } from '../../lib/storage';
import type { SimInputs } from '../../simulation/types';
import { DEFAULT_CONFIG } from '../../simulation/config';
import { createRng } from '../../simulation/rng';

const LIMITS = { assets: 1e12, income: 1e10, expenses: 1e10, goal: 1e12 };

function wan(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)} 万`;
  return `${v}`;
}

function AmountInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!focused && Number.isFinite(value)) setRaw(String(value));
  }, [value, focused]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs tracking-widest text-zinc-400">{label}</span>
      <div
        className={`flex items-center rounded-xl border bg-abyss-900/60 px-4 transition-colors focus-within:border-wealth-400/60 ${
          error ? 'border-flare-500/60' : 'border-abyss-600/60'
        }`}
      >
        <span className="mr-2 text-lg text-zinc-500">¥</span>
        <input
          className="tnum w-full bg-transparent py-3 text-lg text-zinc-100 outline-none"
          inputMode="numeric"
          aria-invalid={Boolean(error)}
          value={focused || !Number.isFinite(value) ? raw : value.toLocaleString('zh-CN')}
          onFocus={() => {
            setFocused(true);
            if (Number.isFinite(value)) setRaw(String(value));
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const rawValue = e.target.value;
            const amount = rawValue.trim();
            setRaw(rawValue);
            onChange(amount === '' ? 0 : /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(amount)
              ? Number(amount.replace(/,/g, '')) : Number.NaN);
          }}
        />
      </div>
      <span className={`mt-1 block h-4 text-xs ${error ? 'text-flare-400' : 'text-zinc-500'}`}>
        {error ?? `≈ ${wan(value)}`}
      </span>
    </label>
  );
}

function randomInputs(): { age: number; assets: number; income: number; expenses: number } {
  const rng = createRng(crypto.randomUUID(), 'setup');
  const age = 22 + Math.floor(rng.next() * 24);
  const income = Math.round((80000 + rng.next() * 520000) / 10000) * 10000;
  return {
    age,
    assets: Math.round((rng.next() * 800000) / 10000) * 10000,
    income,
    expenses: Math.round((income * (0.4 + rng.next() * 0.35)) / 10000) * 10000,
  };
}

export default function SetupView() {
  const start = useSimStore((s) => s.start);
  const lastInputs = useSimStore((s) => s.inputs) ?? loadLastInputs();
  const shareError = useUiStore((s) => s.shareError);
  const setShareError = useUiStore((s) => s.setShareError);

  const [age, setAge] = useState(lastInputs?.startAge ?? 28);
  const [assets, setAssets] = useState(lastInputs?.initialAssets ?? 200000);
  const [income, setIncome] = useState(lastInputs?.annualIncome ?? 200000);
  const [expenses, setExpenses] = useState(lastInputs?.annualExpenses ?? 120000);
  const [goalMode, setGoalMode] = useState<'auto' | 'manual'>(lastInputs?.goal.mode ?? 'auto');
  const [manualGoal, setManualGoal] = useState(
    lastInputs?.goal.mode === 'manual' ? lastInputs.goal.amount : 5000000,
  );

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!Number.isFinite(assets) || assets < 0 || assets > LIMITS.assets) e.assets = '资产需在 0 到 1 万亿之间';
    if (!Number.isFinite(income) || income < 0 || income > LIMITS.income) e.income = '收入需在 0 到 100 亿之间';
    if (!Number.isFinite(expenses) || expenses <= 0 || expenses > LIMITS.expenses) e.expenses = '支出需大于 0 且不超过 100 亿';
    if (goalMode === 'manual' && (!Number.isFinite(manualGoal) || manualGoal <= expenses * 5)) e.goal = '目标需大于年支出的 5 倍';
    if (goalMode === 'manual' && manualGoal > LIMITS.goal) e.goal = '目标超出上限';
    return e;
  }, [assets, income, expenses, goalMode, manualGoal]);

  const valid = Object.keys(errors).length === 0;
  const autoGoal = Number.isFinite(expenses) ? expenses * DEFAULT_CONFIG.withdrawalMultiple : 0;

  const handleStart = () => {
    if (!valid) return;
    const inputs: SimInputs = {
      startAge: age,
      startYear: new Date().getFullYear(),
      initialAssets: assets,
      annualIncome: income,
      annualExpenses: expenses,
      goal: goalMode === 'auto' ? { mode: 'auto' } : { mode: 'manual', amount: manualGoal },
      endAge: 90,
    };
    start(inputs);
  };

  const handleRandom = () => {
    const r = randomInputs();
    setAge(r.age);
    setAssets(r.assets);
    setIncome(r.income);
    setExpenses(r.expenses);
    setGoalMode('auto');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg"
      >
        <div className="mb-8 text-center">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            <span className="block">你会在几岁</span>
            <span className="block text-wealth-400">实现财富自由？</span>
          </h1>
          <p className="mt-4 text-sm leading-6 text-balance text-zinc-400">
            输入现在的收入和存款，看看未来几十年的财富如何变化。遇到人生转折，你还可以亲自做出选择，改变未来。
          </p>
        </div>

        {shareError && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-left">
            <p className="text-sm text-gold-300">分享的链接无法读取：{shareError}。你仍可以开启自己的人生。</p>
            <button
              type="button"
              onClick={() => setShareError(null)}
              className="shrink-0 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              aria-label="关闭提示"
            >
              关闭
            </button>
          </div>
        )}

        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="mb-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs tracking-widest text-zinc-400">当前年龄</span>
              <span className="tnum text-2xl font-semibold text-wealth-300">{age}</span>
            </div>
            <input
              type="range"
              min={18}
              max={70}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-full"
              style={{ ['--fill' as string]: `${((age - 18) / 52) * 100}%` }}
              aria-label="当前年龄"
            />
          </div>

          <div className="space-y-3">
            <AmountInput label="当前可投资资产" value={assets} onChange={setAssets} error={errors.assets} />
            <AmountInput label="年税后收入" value={income} onChange={setIncome} error={errors.income} />
            <AmountInput label="年生活支出" value={expenses} onChange={setExpenses} error={errors.expenses} />
          </div>

          <div className="mt-4">
            <span className="mb-1.5 block text-xs tracking-widest text-zinc-400">财富自由目标</span>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-abyss-600/60 bg-abyss-900/60 p-1">
              {(['auto', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGoalMode(mode)}
                  aria-pressed={goalMode === mode}
                  className={`rounded-lg py-2 text-sm transition-colors ${
                    goalMode === mode
                      ? 'bg-wealth-500/15 text-wealth-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode === 'auto' ? `自动 · 支出 × ${DEFAULT_CONFIG.withdrawalMultiple}` : '自定义目标'}
                </button>
              ))}
            </div>
            {goalMode === 'auto' ? (
              <p className="mt-2 text-sm text-zinc-400">
                目标 <span className="tnum text-wealth-300">{formatMoney(autoGoal)}</span>
                <span className="ml-2 text-xs text-zinc-400">随生活支出调整</span>
              </p>
            ) : (
              <div className="mt-2">
                <AmountInput label="自定义目标金额" value={manualGoal} onChange={setManualGoal} error={errors.goal} />
              </div>
            )}
            <div className="mt-2 space-y-1 text-xs leading-5 text-balance text-zinc-400">
              <p>
                {goalMode === 'auto'
                  ? `可投资资产达到约 ${DEFAULT_CONFIG.withdrawalMultiple} 倍年度生活支出，即达到游戏的自动目标。`
                  : '可投资资产达到你设定的目标，即达到游戏的财富自由目标；目标随通胀逐年上升。'}
              </p>
              <p>这只是简化的模拟规则，不代表现实中一定可以安全退休。</p>
            </div>
          </div>

          {expenses > income && (
            <p className="mt-3 text-xs text-gold-300/90">支出高于收入，这会是艰难的一局。</p>
          )}

          <button
            type="button"
            disabled={!valid}
            onClick={handleStart}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-wealth-500 to-tide-500 py-3.5 text-base font-semibold text-abyss-950 shadow-[0_8px_30px_rgba(16,185,129,0.35)] transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            开启我的财富人生
          </button>
          <button
            type="button"
            onClick={handleRandom}
            className="mt-3 w-full rounded-xl border border-abyss-600/60 py-2.5 text-sm text-zinc-400 transition-colors hover:border-tide-400/40 hover:text-tide-300"
          >
            随机人生
          </button>
        </div>
      </motion.div>
    </div>
  );
}
