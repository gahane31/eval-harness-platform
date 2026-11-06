import { canonicalJson, stableConfigHash } from './canonical-json';

describe('canonical JSON hashing', () => {
  it('hashes objects with different property order identically, including nested objects', () => {
    const left = stableConfigHash({
      model: 'gpt-5.4-mini',
      reasoning: 'medium',
      memory: { enabled: false, note: null },
    });
    const right = stableConfigHash({
      reasoning: 'medium',
      memory: { note: null, enabled: false },
      model: 'gpt-5.4-mini',
    });

    expect(left).toBe(right);
    expect(left).toHaveLength(64);
  });

  it('preserves array order and distinguishes null, booleans, strings, and numbers', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(stableConfigHash({ value: null })).not.toBe(stableConfigHash({ value: false }));
    expect(stableConfigHash({ value: false })).not.toBe(stableConfigHash({ value: 0 }));
    expect(stableConfigHash({ value: 0 })).not.toBe(stableConfigHash({ value: '0' }));
    expect(stableConfigHash({ value: '0' })).not.toBe(stableConfigHash({ value: true }));
  });
});
