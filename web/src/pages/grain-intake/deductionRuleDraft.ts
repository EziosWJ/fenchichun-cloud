export interface RangeValues {
  minValue: string | null;
  maxValue: string | null;
  ratePercent: number | null;
}

const decimal = /^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;

export function checkRanges(ranges: RangeValues[]) {
  const gaps: string[] = [];
  let error: string | undefined;
  let complete = ranges.length > 0;
  for (const [index, range] of ranges.entries()) {
    const min = range.minValue?.trim();
    const max = range.maxValue?.trim();
    const number = index + 1;
    const previous = ranges[index - 1];
    if (!min || range.ratePercent == null) complete = false;
    if ((min && !decimal.test(min)) || (max && !decimal.test(max))) {
      error = `区间 ${number} 的边界须为非负数，整数和小数部分各最多 6 位。`;
    } else if (min && max && Number(max) <= Number(min)) {
      error = `区间 ${number} 的终点须大于起点。`;
    } else if (range.ratePercent != null && (range.ratePercent < 0 || range.ratePercent > 100)) {
      error = `区间 ${number} 的扣减比例须在 0 至 100% 之间。`;
    } else if (min && !max && index < ranges.length - 1) {
      error = `区间 ${number} 缺少终点，只有最后一个区间可以不限终点。`;
    } else if (min && previous?.minValue && Number(min) < Number(previous.minValue)) {
      error = `区间 ${number} 的起点小于上一区间的起点，请按起点从小到大排列。`;
    } else if (min && previous?.maxValue && Number(min) < Number(previous.maxValue)) {
      error = `区间 ${number - 1} 与区间 ${number} 重叠，请调整边界。`;
    } else if (min && previous?.maxValue && Number(min) > Number(previous.maxValue)) {
      gaps.push(`[${previous.maxValue}%, ${min}%)`);
    }
    if (error) break;
  }
  return { error, complete, gaps };
}

export function matchRange(ranges: RangeValues[], moisture: number) {
  return ranges.findIndex(({ minValue, maxValue }) =>
    moisture >= Number(minValue) && (!maxValue || moisture < Number(maxValue)));
}

export function deductionMilliTonnes(netTonnes: number, percent: number) {
  const net = BigInt(Math.round(netTonnes * 1000));
  const rate = BigInt(Math.round(percent * 100));
  return Number((net * rate + 5000n) / 10000n);
}
