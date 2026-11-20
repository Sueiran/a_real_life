import type { SimInputs } from '../simulation/types';

export default function WealthChartGuide({ goalMode }: { goalMode: SimInputs['goal']['mode'] }) {
  return (
    <div data-wealth-guide className="shrink-0 px-3 pt-2 text-left">
      <ul aria-label="财富曲线图例" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
        <li className="flex items-center gap-2 text-wealth-400">
          <span aria-hidden="true" className="w-6 shrink-0 border-t-2 border-solid" />
          <span>你的财富</span>
        </li>
        <li className="flex items-center gap-2 text-gold-400">
          <span aria-hidden="true" className="w-6 shrink-0 border-t-2 border-dashed" />
          <span>财富自由目标</span>
        </li>
      </ul>
      <div className="mt-2 space-y-1 text-xs leading-5 text-balance text-zinc-400">
        <p>绿色财富线达到或超过黄色目标线，就表示在当前模拟假设下实现财富自由。</p>
        <p>{goalMode === 'auto'
          ? '黄色目标线随生活支出调整，可能因通胀或支出增加而上升。'
          : '黄色目标线按你设定的目标随通胀上升，不随生活支出调整。'}</p>
      </div>
    </div>
  );
}
