export function decimalUnits(value: number, places: number): bigint {
  if (!Number.isFinite(value)) throw new RangeError('金额或比率超出有限数范围');
  const [coefficient, exponent = '0'] = Math.abs(value).toString().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = BigInt(whole + fraction);
  const shift = Number(exponent) + places - fraction.length;
  let units: bigint;
  if (shift >= 0) units = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    units = digits / divisor + (digits % divisor * 2n >= divisor ? 1n : 0n);
  }
  return value < 0 ? -units : units;
}

export function moneyUnits(value: number): bigint {
  return decimalUnits(value, 2);
}

export function compareMoney(a: number, b: number): -1 | 0 | 1 {
  const left = moneyUnits(a);
  const right = moneyUnits(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
