import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LegacyGridContainLabel } from 'echarts/features';
import { initialGoal } from '../../simulation/goals';
import { formatMoney } from '../../lib/format';
import type { SimState } from '../../simulation/types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer, LegacyGridContainLabel]);

function axisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${Math.round(v / 1e4)}万`;
  return `${v}`;
}

export default function WealthChart({ sim, runId, frozen }: { sim: SimState; runId: number; frozen: boolean }) {
  const reduced = useReducedMotion();
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.setOption({
      backgroundColor: 'transparent',
      animation: !reduced,
      animationDurationUpdate: 600,
      animationEasingUpdate: 'cubicOut',
      grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: [],
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
        backgroundColor: 'rgba(7,13,24,0.92)',
        borderColor: 'rgba(103,232,249,0.2)',
        textStyle: { color: '#e6edf7', fontSize: 12 },
        valueFormatter: (v: unknown) => formatMoney(Number(v)),
      },
      series: [
        {
          name: '目标',
          type: 'line',
          data: [],
          symbol: 'none',
          silent: true,
          lineStyle: { color: '#fbbf24', width: 1.5, type: 'dashed', opacity: 0.65 },
          z: 1,
        },
        {
          name: '资产',
          type: 'line',
          data: [],
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { color: '#34d399', width: 2.5, shadowColor: 'rgba(52,211,153,0.5)', shadowBlur: 12 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(52,211,153,0.28)' },
              { offset: 1, color: 'rgba(52,211,153,0)' },
            ]),
          },
          z: 2,
        },
      ],
    });
    // 用 RO 上报的尺寸：zrender 自行测量时会先隐藏画布， flex 布局下会量到塌陷高度。
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      chart.resize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    if (import.meta.env.DEV) {
      (window as unknown as { __chart: echarts.ECharts }).__chart = chart;
    }
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [runId, reduced]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const { inputs, config, years } = sim;
    // 历史点只追加不改写；同一 run 内逐年增量更新，新 run 整体重建。
    chart.setOption({
      animation: !reduced && !frozen,
      xAxis: { data: ['开局', ...years.map((y) => y.calendarYear)] },
      series: [
        { data: [initialGoal(inputs, config), ...years.map((y) => y.goalAmount)] },
        { data: [inputs.initialAssets, ...years.map((y) => y.assets)] },
      ],
    });
  }, [sim, runId, reduced]);

  useEffect(() => {
    const animation = chartRef.current?.getZr().animation;
    if (frozen) animation?.pause();
    else animation?.resume();
  }, [frozen, runId, reduced]);

  return <div ref={elRef} role="img" aria-label="资产与目标随年份变化的曲线；当前金额见上方" className="min-h-0 w-full flex-1" />;
}
