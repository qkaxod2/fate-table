import { describe, expect, it } from 'vitest';
import { LADDER_LABELS, term, tip } from '../src/index';

describe('glossary', () => {
  it('returns localized labels', () => {
    expect(term('aspect')).toBe('특성');
    expect(term('forceful')).toBe('완력');
    expect(tip('boost')).toContain('사라지는');
  });

  it('covers the full ladder', () => {
    for (let n = -2; n <= 8; n++) expect(LADDER_LABELS[n]).toBeTruthy();
  });
});
