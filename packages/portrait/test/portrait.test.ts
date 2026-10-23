import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_MODEL,
  PORTRAIT_PRESETS,
  buildPortraitRequest,
  checkAppearance,
  clampGuidance,
  normalizeAppearance,
} from '../src';

describe('portrait presets', () => {
  it('has six presets with unique ids', () => {
    expect(PORTRAIT_PRESETS).toHaveLength(6);
    expect(new Set(PORTRAIT_PRESETS.map((p) => p.id)).size).toBe(6);
  });

  it('never asks the model for censored-off output', () => {
    for (const p of PORTRAIT_PRESETS) expect(p.prompt).not.toMatch(/censored/);
  });
});

describe('appearance', () => {
  it('rejects artist tags and explicit tags', () => {
    expect(checkAppearance('1girl, artist:foo')).toBe('BLOCKED_TAG');
    expect(checkAppearance('1girl, nude')).toBe('BLOCKED_TAG');
    expect(checkAppearance('  ')).toBe('EMPTY');
    expect(checkAppearance('x'.repeat(601))).toBe('TOO_LONG');
    expect(checkAppearance('1girl, knight, armor')).toBeNull();
  });

  it('adds solo and tidies separators', () => {
    expect(normalizeAppearance('1girl,\n armor,, smile')).toBe('solo, 1girl, armor, smile');
    expect(normalizeAppearance('solo, 1boy')).toBe('solo, 1boy');
  });

  it('clamps guidance to one decimal in range', () => {
    expect(clampGuidance(10)).toBe(8);
    expect(clampGuidance(1)).toBe(3);
    expect(clampGuidance(5.66)).toBe(5.7);
    expect(clampGuidance(Number.NaN)).toBe(5);
  });
});

describe('buildPortraitRequest', () => {
  it('uses V5 medium with the preset as base caption and appearance as character', () => {
    const body = buildPortraitRequest({
      presetId: 'cel',
      appearance: '1boy, armor',
      guidance: 9,
      seed: 42,
    });
    expect(body.model).toBe(PORTRAIT_MODEL);
    expect(body.parameters.steps).toBe(14);
    expect(body.parameters.scale).toBe(8);
    expect(body.parameters.v4_prompt.caption.base_caption).toContain('artist:qiandaiyiyu');
    expect(body.parameters.v4_prompt.caption.char_captions[0]?.char_caption).toBe(
      'solo, 1boy, armor',
    );
    expect(body.parameters.negative_prompt.startsWith('nsfw')).toBe(true);
  });

  it('throws on unknown preset or bad appearance', () => {
    expect(() =>
      buildPortraitRequest({ presetId: 'x', appearance: '1girl', guidance: 5, seed: 1 }),
    ).toThrow('UNKNOWN_PRESET');
    expect(() =>
      buildPortraitRequest({ presetId: 'cel', appearance: 'artist:x', guidance: 5, seed: 1 }),
    ).toThrow('BLOCKED_TAG');
  });
});
