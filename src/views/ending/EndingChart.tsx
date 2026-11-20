import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkPointComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LegacyGridContainLabel } from 'echarts/features';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { initialGoal } from '../../simulation/goals';
import { eventById } from '../../events/definitions';
import { formatMoney } from '../../lib/format';
import type { SimState, SimStatus, YearState } from '../../simulation/types';
import WealthChartGuide from '../../components/WealthChartGuide';

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, MarkPointComponent, CanvasRenderer, LegacyGridContainLabel]);

function axisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${Math.round(v / 1e4)}万`;
  return `${v}`;
}

const TERMINAL: Record<Exclude<SimStatus, 'running'>, { color: string; label: string }> = {
  fire: { color: '#fcd34d', label: '自由' },
  bankrupt: { color: '#fb7185', label: '崩溃' },
  end: { color: '#67e8f9', label: '终点' },
};

export default function EndingChart({ sim, status }: { sim: SimState; status: Exclude<SimStatus, 'running'> }) {
  const reduced = useReducedMotion();
  const elRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<YearState | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    const { inputs, config, years } = sim;
    const xs = ['开局', ...years.map((y) => String(y.calendarYear))];
    const assets = [inputs.initialAssets, ...years.map((y) => y.assets)];
    const goals = [initialGoal(inputs, config), ...years.map((y) => y.goalAmount)];
    const lastIdx = years.length;
    const terminal = TERMINAL[status];

    const markers = years
      .map((y, i) => ({ y, idx: i + 1 }))
      .filter(({ y }) => y.eventId !== null)
      .map(({ y, idx }) => {
        const impact = (y.eventCash ?? 0) + (y.scheduledCashApplied ?? 0);
        return {
          value: [idx, y.assets],
          yearIndex: y.yearIndex,
          itemStyle: { color: impact > 0 ? '#34d399' : impact < 0 ? '#fb7185' : '#67e8f9' },
        };
      });

    chart.setOption({
      backgroundColor: 'transparent',
      animation: !reduced,
      animationDuration: 900,
      animationEasing: 'cubicOut',
      grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xs,
        axisLine: { lineStyle: { color: 'rgba(27,48,80,0.8)' } },
        axisTick: { show: false },
        axisLabel: { color: '#91a0b5', fontSize: 12 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#91a0b5', fontSize: 12, formatter: axisMoney },
        splitLine: { lineStyle: { color: 'rgba(27,48,80,0.35)' } },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        extraCssText: 'max-width: 270px; white-space: normal; overflow-wrap: anywhere;',
        backgroundColor: 'rgba(7,13,24,0.94)',
        borderColor: 'rgba(103,232,249,0.2)',
        textStyle: { color: '#e6edf7', fontSize: 12 },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[];
          const idx = list[0]?.dataIndex ?? 0;
          if (idx === 0) return `开局<br/>你的财富 ${formatMoney(inputs.initialAssets)}`;
          const y = years[idx - 1];
          if (!y) return '';
          const lines = [
            `${y.calendarYear} · ${y.age} 岁`,
            `你的财富 ${formatMoney(y.assets)}`,
            `财富自由目标 ${formatMoney(y.goalAmount)}`,
          ];
          if (y.eventId) {
            const def = eventById(y.eventId);
            const choice = def?.choices.find((c) => c.id === y.choiceId);
            if (def) lines.push(`${def.title}${choice ? ` · 「${choice.label}」` : ''}`);
            const impact = (y.eventCash ?? 0) + (y.scheduledCashApplied ?? 0);
            if (impact !== 0) lines.push(`当年现金 ${impact > 0 ? '+' : ''}${formatMoney(impact)}`);
          }
          return lines.join('<br/>');
        },
      },
      series: [
        {
          name: '财富自由目标',
          type: 'line',
          data: goals,
          symbol: 'none',
          silent: true,
          lineStyle: { color: '#fbbf24', width: 1.5, type: 'dashed', opacity: 0.6 },
          z: 1,
        },
        {
          name: '你的财富',
          type: 'line',
          data: assets,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { color: '#34d399', width: 2.5, shadowColor: 'rgba(52,211,153,0.5)', shadowBlur: 12 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(52,211,153,0.25)' },
              { offset: 1, color: 'rgba(52,211,153,0)' },
            ]),
          },
          markPoint: {
            silent: true,
            data: [
              {
                coord: [lastIdx, assets[lastIdx]],
                symbol: 'circle',
                symbolSize: 13,
                itemStyle: { color: terminal.color, borderColor: '#04070e', borderWidth: 2 },
                label: { show: true, formatter: terminal.label, position: 'top', color: terminal.color, fontSize: 11 },
              },
            ],
          },
          z: 2,
        },
        {
          name: '事件',
          type: 'scatter',
          data: markers,
          symbolSize: 9,
          itemStyle: { borderColor: '#04070e', borderWidth: 1.5 },
          z: 3,
        },
      ],
    });

    chart.on('click', (params) => {
      if (params.seriesType !== 'scatter') return;
      const yearIndex = (params.data as { yearIndex?: number }).yearIndex;
      const y = years.find((v) => v.yearIndex === yearIndex);
      if (y) setSelected(y);
    });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      chart.resize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [sim, status, reduced]);

  const def = selected?.eventId ? eventById(selected.eventId) : undefined;
  const choice = def?.choices.find((c) => c.id === selected?.choiceId);
  const impact = selected ? (selected.eventCash ?? 0) + (selected.scheduledCashApplied ?? 0) : 0;

  return (
    <div>
      <WealthChartGuide goalMode={sim.inputs.goal.mode} />
      <div ref={elRef} role="img" aria-label="你的财富（绿色实线）与财富自由目标（黄色虚线）的人生曲线；逐年数据见下方" className="h-[240px] w-full sm:h-[300px]" />
      <details className="mt-2 text-left text-xs text-zinc-400">
        <summary className="flex min-h-11 cursor-pointer items-center">查看人生逐年数据</summary>
        <ol className="max-h-64 space-y-3 overflow-y-auto py-2">
          <li>开局 · 资产 {formatMoney(sim.inputs.initialAssets)} · 目标 {formatMoney(initialGoal(sim.inputs, sim.config))}</li>
          {sim.years.map((year) => <li key={year.yearIndex}>
            {year.calendarYear} · {year.age} 岁 · 资产 {formatMoney(year.assets)} · 目标 {formatMoney(year.goalAmount)}
            {year.eventId && <button type="button" onClick={() => setSelected(year)} className="block min-h-11 text-tide-300">
              {eventById(year.eventId)?.title} · 查看选择
            </button>}
          </li>)}
        </ol>
      </details>
      <AnimatePresence>
        {selected && def && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-abyss-600/60 bg-abyss-900/70 px-4 py-3 text-left"
          >
            <div>
              <p className="tnum text-xs text-zinc-500">
                {selected.calendarYear} · {selected.age} 岁
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-100">{def.title}</p>
              {choice && <p className="mt-0.5 text-xs text-wealth-300/90">选择了「{choice.label}」</p>}
              {impact !== 0 && (
                <p className={`tnum mt-0.5 text-xs ${impact > 0 ? 'text-wealth-400/80' : 'text-flare-400/80'}`}>
                  当年现金 {impact > 0 ? '+' : ''}
                  {formatMoney(impact)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="关闭事件详情"
              className="min-h-11 min-w-11 shrink-0 text-xs text-zinc-400 transition-colors hover:text-zinc-300"
            >
              关闭
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}