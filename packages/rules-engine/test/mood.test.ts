import { describe, expect, it } from 'vitest';
import { replay, validate } from '../src/index';
import { GM, P1, pc, Table, withCharacters } from './helpers';

const URL_A = 'https://x.supabase.co/storage/v1/object/public/portraits/u1/a.png';

function table() {
  const t = new Table(withCharacters(pc('a', 'u1')));
  t.run(GM, { type: 'scene.start', payload: { name: '부두' } });
  return t;
}

describe('scene.mood', () => {
  it('sets a backdrop and ambience, keeping what is not mentioned', () => {
    const t = table();
    t.run(GM, { type: 'scene.mood', payload: { backdrop: 'harbor', time: 'night' } });
    expect(t.state.scene!.backdrop).toBe('harbor');
    expect(t.state.scene!.ambience).toEqual({ time: 'night', weather: 'clear', conditions: [] });
    t.run(GM, { type: 'scene.mood', payload: { weather: 'rain', conditions: ['fog', 'fog'] } });
    expect(t.state.scene!.backdrop).toBe('harbor');
    expect(t.state.scene!.ambience).toEqual({
      time: 'night',
      weather: 'rain',
      conditions: ['fog'],
    });
  });

  it('the later of a drawn background and a backdrop wins', () => {
    const t = table();
    const sceneId = t.state.scene!.id;
    t.run(GM, { type: 'media.attach', payload: { kind: 'scene', target: sceneId, url: URL_A } });
    t.run(GM, { type: 'scene.mood', payload: { backdrop: 'forest' } });
    expect(t.state.scene!.backgroundUrl).toBeUndefined();
    expect(t.state.scene!.backdrop).toBe('forest');
    t.run(GM, { type: 'media.attach', payload: { kind: 'scene', target: sceneId, url: URL_A } });
    expect(t.state.scene!.backdrop).toBeUndefined();
    expect(t.state.scene!.backgroundUrl).toBe(URL_A);
    t.run(GM, { type: 'scene.mood', payload: { backdrop: null } });
    expect(t.state.scene!.backgroundUrl).toBeUndefined();
  });

  it('is GM only, needs a scene, and undoes cleanly', () => {
    const t = table();
    expect(validate(t.state, { type: 'scene.mood', payload: { time: 'dusk' } }, P1)).toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    const [set] = t.run(GM, { type: 'scene.mood', payload: { conditions: ['fire'] } });
    t.run(GM, { type: 'event.undo', payload: { targetSeq: set!.seq } });
    expect(t.state.scene!.ambience).toBeUndefined();
    expect(replay(t.log).scene!.ambience).toBeUndefined();
    t.run(GM, { type: 'scene.end', payload: {} });
    expect(validate(t.state, { type: 'scene.mood', payload: { time: 'dusk' } }, GM)).toMatchObject({
      code: 'NO_ACTIVE_SCENE',
    });
  });

  it('GM can pick the background sound, turn it off, or go back to auto', () => {
    const t = table();
    t.run(GM, { type: 'scene.mood', payload: { backdrop: 'forest', time: 'night' } });
    t.run(GM, { type: 'scene.mood', payload: { sound: 'tavern' } });
    expect(t.state.scene!.sound).toBe('tavern');
    // 소리만 바꿔도 배경과 분위기는 그대로
    expect(t.state.scene!.backdrop).toBe('forest');
    expect(t.state.scene!.ambience?.time).toBe('night');
    t.run(GM, { type: 'scene.mood', payload: { sound: 'none' } });
    expect(t.state.scene!.sound).toBe('none');
    t.run(GM, { type: 'scene.mood', payload: { sound: null } });
    expect(t.state.scene!.sound).toBeUndefined();
    expect(
      validate(t.state, { type: 'scene.mood', payload: { sound: 'opera' as never } }, GM),
    ).toBeTruthy();
  });
});
