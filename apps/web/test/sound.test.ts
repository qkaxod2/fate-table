import type { Ambience, RoomEvent, Scene } from '@fate/rules-engine';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ambLayers } from '../src/fx/ambience';
import { CUES, sfxForEvents } from '../src/fx/sfx';

const ev = (type: string, payload: unknown) => ({ type, payload }) as unknown as RoomEvent;
const aspect = (hidden = false) => ({ aspect: { id: 'a', hidden } });

describe('사건 소리', () => {
  it('장면이 열리며 깔리는 상황 카드 소리는 장면 전환에 묻힌다', () => {
    const s = sfxForEvents([ev('scene.started', {}), ev('aspect.added', aspect())]);
    expect(s.map(([n]) => n)).toEqual(['scene-transition']);
  });

  it('숨긴 상황은 소리 없이 붙고, 공개될 때 뒤집히는 소리가 난다', () => {
    expect(sfxForEvents([ev('aspect.added', aspect(true))])).toEqual([]);
    expect(sfxForEvents([ev('aspect.revealed', aspect())]).map(([n]) => n)).toEqual([
      'aspect-reveal',
    ]);
  });

  it('GM이 고른 소리만 틀고, 모르는 이름은 무시한다', () => {
    expect(sfxForEvents([ev('sfx.played', { assetId: 'cue-thunder' })])).toEqual([
      ['cue-thunder', undefined],
    ]);
    expect(sfxForEvents([ev('sfx.played', { assetId: '../../etc' })])).toEqual([]);
  });

  it('소리 파일이 모두 있다', () => {
    for (const [n] of CUES) expect(existsSync(`public/sfx/${n}.mp3`)).toBe(true);
  });
});

describe('장면 배경음', () => {
  const scene = (s: Partial<Scene>) => ({ id: 's', name: '', pcIds: [], zones: {}, ...s }) as Scene;

  it('장소와 날씨, 불길을 겹친다', () => {
    expect(
      ambLayers(
        scene({
          backdrop: 'tavern',
          ambience: { time: 'day', weather: 'rain', conditions: ['fire'] },
        }),
      ),
    ).toEqual(['tavern', 'rain', 'fire']);
  });

  it('바깥은 밤이면 풀벌레, 폭풍이 치면 장소 소리는 빠진다', () => {
    const night: Ambience = { time: 'night', weather: 'clear', conditions: [] };
    expect(ambLayers(scene({ backdrop: 'forest', ambience: night }))).toEqual(['night']);
    expect(
      ambLayers(scene({ backdrop: 'forest', ambience: { ...night, weather: 'storm' } })),
    ).toEqual(['storm']);
  });

  it('직접 그린 배경이면 장소 소리는 짐작하지 않는다', () => {
    expect(ambLayers(scene({ backdrop: 'forest', backgroundUrl: 'x.png' }))).toEqual([]);
    expect(ambLayers(null)).toEqual([]);
  });

  it('GM이 고른 소리가 자동보다 앞서고, 끄면 날씨 소리까지 모두 멈춘다', () => {
    const rainy: Ambience = { time: 'day', weather: 'rain', conditions: [] };
    expect(ambLayers(scene({ backdrop: 'forest', ambience: rainy, sound: 'tavern' }))).toEqual([
      'tavern',
      'rain',
    ]);
    expect(ambLayers(scene({ backgroundUrl: 'x.png', sound: 'harbor' }))).toEqual(['harbor']);
    expect(ambLayers(scene({ backdrop: 'forest', ambience: rainy, sound: 'none' }))).toEqual([]);
  });

  it('모든 배경음 파일이 있다', () => {
    for (const n of [
      'indoor',
      'cafe',
      'city',
      'birds',
      'night',
      'tavern',
      'hall',
      'dungeon',
      'harbor',
      'wind',
      'rain',
      'storm',
      'snow',
      'fire',
    ])
      expect(existsSync(`public/amb/${n}.mp3`)).toBe(true);
  });
});
