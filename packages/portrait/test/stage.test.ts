import { describe, expect, it } from 'vitest';
import {
  EXPRESSIONS,
  SCENE_SIZE,
  buildPortraitRequest,
  buildSceneRequest,
  buildStandingRequest,
  matteBackground,
  standingCaption,
} from '../src';

describe('standing', () => {
  it('frames a full body on white and swaps the face for the chosen expression', () => {
    const cap = standingCaption('1girl, silver hair, smile, armor', 'angry');
    expect(cap.startsWith('solo, full body, standing')).toBe(true);
    expect(cap).toContain('white background');
    expect(cap).toContain('silver hair');
    expect(cap).toContain('angry');
    expect(cap.split(', ')).not.toContain('smile');
  });

  it('has unique expression ids', () => {
    expect(new Set(EXPRESSIONS.map((e) => e.id)).size).toBe(EXPRESSIONS.length);
  });

  it('uses img2img only for expression variants', () => {
    const base = { presetId: 'cel', tags: '1boy, cloak', guidance: 5, seed: 7 };
    expect(buildStandingRequest(base).action).toBe('generate');
    const v = buildStandingRequest({ ...base, expression: 'sad', baseImage: 'AAAA' });
    expect(v.action).toBe('img2img');
    expect(v.parameters).toMatchObject({ image: 'AAAA', strength: 0.5, seed: 7 });
  });
});

describe('scene', () => {
  it('draws landscape scenery without people', () => {
    const body = buildSceneRequest({
      presetId: 'watercolor',
      tags: 'barn, fire, night',
      guidance: 5,
      seed: 1,
    });
    expect(body.parameters.width).toBe(SCENE_SIZE.width);
    expect(body.parameters.characterPrompts).toHaveLength(0);
    expect(
      body.parameters.v4_prompt.caption.base_caption.startsWith('barn, fire, night, no humans'),
    ).toBe(true);
    expect(body.parameters.negative_prompt).toContain('1girl');
  });

  it('accepts longer LLM tags than the hand-typed limit', () => {
    const tags = Array.from({ length: 120 }, (_, i) => `tag${i}`).join(', ');
    expect(() =>
      buildPortraitRequest({ presetId: 'cel', appearance: tags, guidance: 5, seed: 1 }),
    ).toThrow();
    expect(() => buildSceneRequest({ presetId: 'cel', tags, guidance: 5, seed: 1 })).not.toThrow();
  });
});

describe('matteBackground', () => {
  /** 흰 바탕 가운데에 검은 테두리 사각형, 안쪽은 흰색(옷 하이라이트 같은 것) */
  function sample(w = 40, h = 60) {
    const px = new Uint8Array(w * h * 3).fill(255);
    const set = (x: number, y: number, v: number) =>
      px.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
    for (let y = 10; y < h; y++)
      for (let x = 10; x < 30; x++) {
        const border = x === 10 || x === 29 || y === 10;
        set(x, y, border ? 0 : y < 30 ? 250 : 120);
      }
    return { px, w, h };
  }

  it('clears the outside, keeps enclosed light areas, and crops to the figure', () => {
    const { px, w, h } = sample();
    const out = matteBackground(px, w, h, 3, { pad: 0 });
    expect(out.width).toBe(20);
    expect(out.height).toBe(50);
    const alpha = (x: number, y: number) => out.data[(y * out.width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(255); // 테두리
    expect(alpha(5, 5)).toBe(255); // 안쪽 밝은 칸은 그대로
    expect(alpha(5, 40)).toBe(255);
  });

  it('removes flat background islands not touching the edge', () => {
    const w = 50;
    const h = 50;
    const px = new Uint8Array(w * h * 3).fill(255);
    // 바깥과 끊긴 고리: 안쪽 흰 구멍은 배경으로 지운다
    for (let y = 5; y < 45; y++)
      for (let x = 5; x < 45; x++) {
        const ring = x < 15 || x >= 35 || y < 15 || y >= 35;
        if (ring) px.fill(40, (y * w + x) * 3, (y * w + x) * 3 + 3);
      }
    const out = matteBackground(px, w, h, 3, { pad: 0, holeMin: 50 });
    expect(out.data[(20 * out.width + 20) * 4 + 3]).toBe(0);
    expect(out.data[(2 * out.width + 2) * 4 + 3]).toBe(255);
  });
});
