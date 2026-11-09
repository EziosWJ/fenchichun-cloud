import { describe, expect, it } from 'vitest';
import { formatTonnes, subtractTonnes } from '../../src/utils/weight';

describe('weight formatting', () => {
  it('subtracts exact thousandths of a tonne', () => {
    expect(subtractTonnes('30', '10')).toBe('20.000');
    expect(subtractTonnes('30.125', '10.050')).toBe('20.075');
    expect(subtractTonnes('10', '30')).toBe('-20.000');
  });

  it('returns a dash for missing or malformed weights instead of throwing', () => {
    expect(subtractTonnes('abc', '10')).toBe('—');
    expect(subtractTonnes('1.2345', '1')).toBe('—');
    expect(subtractTonnes(' ', '1')).toBe('—');
    expect(subtractTonnes('', '1')).toBe('—');
    expect(subtractTonnes(null, undefined)).toBe('—');
  });

  it('keeps deduction weight separate from actual net weight', () => {
    expect(formatTonnes('19.500')).toBe('19.500');
    expect(formatTonnes('')).toBe('—');
    expect(formatTonnes(undefined)).toBe('—');
    expect(formatTonnes('abc')).toBe('—');
  });
});
