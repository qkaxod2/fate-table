import { describe, expect, it } from 'vitest';
import { replay, validate } from '../src/index';
import { GM, P1, pc, Table, withCharacters } from './helpers';

const URL_A = 'https://x.supabase.co/storage/v1/object/public/portraits/u1/a.png';
const URL_B = 'https://x.supabase.co/storage/v1/object/public/portraits/u1/b.png';

function table() {
  return new Table(
    withCharacters(pc('a', 'u1'), pc('b', 'u2'), pc('npc', 'gm', { isNpc: true, ownerId: null })),
  );
}

describe('media.attach', () => {
  it('puts a standing sprite per expression and lets the owner switch faces', () => {
    const t = table();
    t.run(P1, { type: 'media.attach', payload: { kind: 'standing', target: 'a', url: URL_A } });
    t.run(P1, {
      type: 'media.attach',
      payload: { kind: 'standing', target: 'a', url: URL_B, expression: 'angry' },
    });
    expect(t.state.characters.a!.standing).toEqual({ neutral: URL_A, angry: URL_B });
    t.run(P1, { type: 'character.expression', payload: { characterId: 'a', expression: 'angry' } });
    expect(t.state.characters.a!.expression).toBe('angry');
    t.run(P1, { type: 'character.expression', payload: { characterId: 'a', expression: null } });
    expect(t.state.characters.a!.expression).toBeUndefined();
    expect(
      validate(
        t.state,
        { type: 'character.expression', payload: { characterId: 'a', expression: 'sad' } },
        P1,
      ),
    ).toMatchObject({ code: 'INVALID' });
  });

  it('only the owner or GM changes a character, only the GM changes the scene', () => {
    const t = table();
    const standing = { kind: 'standing', target: 'b', url: URL_A } as const;
    expect(validate(t.state, { type: 'media.attach', payload: standing }, P1)).toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    t.run(GM, { type: 'media.attach', payload: { kind: 'portrait', target: 'npc', url: URL_A } });
    expect(t.state.characters.npc!.portraitUrl).toBe(URL_A);

    t.run(GM, { type: 'scene.start', payload: { name: '곡물 창고' } });
    const sceneId = t.state.scene!.id;
    const bg = { kind: 'scene', target: sceneId, url: URL_B } as const;
    expect(validate(t.state, { type: 'media.attach', payload: bg }, P1)).toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });
    t.run(GM, { type: 'media.attach', payload: bg });
    expect(t.state.scene!.backgroundUrl).toBe(URL_B);
  });

  it('undo takes the background off again', () => {
    const t = table();
    t.run(GM, { type: 'scene.start', payload: { name: '숲' } });
    const [attached] = t.run(GM, {
      type: 'media.attach',
      payload: { kind: 'scene', target: t.state.scene!.id, url: URL_A },
    });
    t.run(GM, { type: 'event.undo', payload: { targetSeq: attached!.seq } });
    expect(t.state.scene!.backgroundUrl).toBeUndefined();
    expect(replay(t.log).scene!.backgroundUrl).toBeUndefined();
  });
});
