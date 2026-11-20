export function toReal(nominal: number, yearIndex: number, inflation: number): number {
  return nominal / Math.pow(1 + inflation, yearIndex);
}

export function formatAssetMoney(value: number): string {
  if (Math.abs(value) >= 1e12) return `${formatMoney(value / 1e12, 2)}万亿`;
  if (Math.abs(value) >= 1e8) return `${formatMoney(value / 1e8, 2)}亿`;
  return formatMoney(value);
}

export function formatMoney(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
