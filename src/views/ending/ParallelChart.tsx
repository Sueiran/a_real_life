import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LegacyGridContainLabel } from 'echarts/features';
import { formatMoney } from '../../lib/format';
import { axisMoney, type ParallelChartPoint } from './parallelData';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer, LegacyGridContainLabel]);

export default function ParallelChart({ points }: { points: ParallelChartPoint[] }) {
  const element = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const reduced = useReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex === null ? null : points[Math.min(selectedIndex, points.length - 1)];

  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current);
    chartRef.current = chart;
    chart.on('click', (params) => setSelectedIndex(params.dataIndex));
    const observer = new ResizeObserver(([entry]) => chart.resize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element.current);
    if (import.meta.env.DEV) (window as unknown as { __parallelChart: echarts.ECharts }).__parallelChart = chart;
    return () => { observer.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({
      animation: !reduced,
      animationDuration: 450,
      animationDurationUpdate: 450,
      animationEasingUpdate: 'cubicOut',
      grid: { left: 4, right: 12, top: 20, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category', boundaryGap: false,
        data: points.map((point) => `${point.calendarYear}${point.phase === 'initial' ? ' · 开局' : ' · 年末'}`),
        axisLine: { lineStyle: { color: '#26364b' } }, axisTick: { show: false },
        axisLabel: {
          color: '#91a0b5', fontSize: 12, hideOverlap: true,
          formatter: (value: string, index: number) => index === 0 ? `${points[0].calendarYear}\n开局` : value.slice(0, 4),
        },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: '#91a0b5', fontSize: 12, formatter: axisMoney },
        splitLine: { lineStyle: { color: 'rgba(80,110,140,0.12)' } },
      },
      tooltip: {
        trigger: 'axis', confine: true,
        backgroundColor: 'rgba(7,13,24,0.97)', borderColor: '#284b51',
        textStyle: { color: '#e6edf7', fontSize: 12 },
        extraCssText: 'max-width: 270px; white-space: normal; overflow-wrap: anywhere;',
        formatter: (params: unknown) => {
          const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0;
          const point = points[index];
          return `<b>${point.calendarYear} 年${point.phase === 'initial' ? '开局' : '末'} · ${point.age} 岁</b><br/>`
            + `真实人生：${point.actual === null ? '已结束' : formatMoney(point.actual)}<br/>`
            + `10% 分位：${formatMoney(point.p10)}<br/>中位数：${formatMoney(point.p50)}<br/>`
            + `90% 分位：${formatMoney(point.p90)}<br/>基线目标：${formatMoney(point.goalAmount)}`;
        },
      },
      series: [
        {
          id: 'lower', type: 'line', stack: 'band', stackStrategy: 'all',
          data: points.map((p) => p.p10), symbol: 'none', silent: true,
          lineStyle: { opacity: 0 }, tooltip: { show: false },
        },
        {
          id: 'band', name: '10%–90% 区间', type: 'line', stack: 'band', stackStrategy: 'all',
          data: points.map((p) => p.p90 - p.p10), symbol: 'none', silent: true,
          lineStyle: { opacity: 0 }, areaStyle: { color: '#2dd4bf', opacity: 0.16 },
        },
        {
          id: 'median', name: '中位数', type: 'line', data: points.map((p) => p.p50), symbol: 'none',
          lineStyle: { color: '#5eead4', width: 2 }, itemStyle: { color: '#5eead4' }, z: 3,
        },
        {
          id: 'goal', name: '基线目标', type: 'line', data: points.map((p) => p.goalAmount), symbol: 'none',
          lineStyle: { color: '#94a3b8', width: 1.2, type: 'dashed', opacity: 0.7 }, z: 2,
        },
        {
          id: 'actual', name: '真实人生', type: 'line', data: points.map((p) => p.actual), connectNulls: false,
          showSymbol: points.filter((p) => p.actual !== null).length === 1,
          symbolSize: 7, lineStyle: { color: '#f0b77e', width: 3 }, itemStyle: { color: '#f0b77e' }, z: 4,
        },
      ],
    });
  }, [points, reduced]);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400" aria-label="图例">
        <span><i className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-tide-400/25" />10%–90% 区间</span>
        <span className="text-tide-300">— 中位数</span>
        <span className="text-[#f0b77e]">— 真实人生</span>
        <span>┄ 基线目标</span>
      </div>
      <div ref={element} className="mt-2 h-[260px] w-full sm:h-[320px]" role="img" aria-label="平行宇宙资产区间；可使用下方逐年查看读取数值" />
      <button type="button" className="min-h-11 text-xs text-tide-300 hover:text-tide-200" aria-expanded={selected !== null} onClick={() => setSelectedIndex(selected === null ? 0 : null)}>
        {selected === null ? '逐年查看' : '收起年份详情'}
      </button>
      {selected && (
        <div className="rounded-xl border border-abyss-600/50 bg-abyss-950/40 p-4 text-xs">
          <label className="block text-zinc-300">
            {selected.calendarYear} 年{selected.phase === 'initial' ? '开局' : '末'} · {selected.age} 岁
            <input type="range" min={0} max={points.length - 1} value={Math.min(selectedIndex ?? 0, points.length - 1)} onChange={(event) => setSelectedIndex(Number(event.target.value))} aria-label="查看年份" className="my-3 block w-full" />
          </label>
          <dl className="tnum space-y-2 [overflow-wrap:anywhere]">
            {[
              ['真实人生', selected.actual === null ? '已结束' : formatMoney(selected.actual)],
              ['10% 分位', formatMoney(selected.p10)], ['中位数', formatMoney(selected.p50)],
              ['90% 分位', formatMoney(selected.p90)], ['基线目标', formatMoney(selected.goalAmount)],
            ].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="shrink-0 text-zinc-400">{label}</dt><dd className="text-right text-zinc-200">{value}</dd></div>)}
          </dl>
        </div>
      )}
    </div>
  );
}
