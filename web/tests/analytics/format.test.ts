import { describe, expect, it } from 'vitest';
import { formatMilliTonneCompact, formatTonneCompact } from '../../src/features/analytics/format';

describe('对账页重量格式', () => {
  it('最多保留三位小数并去掉末尾无意义的 0', () => {
    expect(formatMilliTonneCompact(5_348_378)).toBe('5,348.378');
    expect(formatMilliTonneCompact(1_090_420)).toBe('1,090.42');
    expect(formatMilliTonneCompact(22_000)).toBe('22');
    expect(formatMilliTonneCompact(800)).toBe('0.8');
    expect(formatMilliTonneCompact(0)).toBe('0');
    expect(formatTonneCompact(19.5)).toBe('19.5');
    expect(formatTonneCompact(724)).toBe('724');
    expect(formatTonneCompact(1234.05)).toBe('1,234.05');
  });
});
