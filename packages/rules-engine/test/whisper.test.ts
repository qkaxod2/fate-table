import { describe, expect, it } from 'vitest';
import { CommandError } from '../src/index';
import { GM, P1, Table, withCharacters } from './helpers';

const SPECTATOR = { userId: 's1', role: 'spectator' as const };

describe('whisper, OOC and secret rolls', () => {
  it('a player whisper is visible to the sender and the GM only', () => {
    const t = new Table(withCharacters());
    const [e] = t.run(P1, {
      type: 'chat.post',
      payload: { text: '몰래 문을 연다', whisper: 'gm' },
    });
    expect(e).toMatchObject({ visibility: 'owner', ownerId: 'u1' });
  });

  it('a GM whisper goes to the chosen player', () => {
    const t = new Table(withCharacters());
    const [e] = t.run(GM, { type: 'chat.post', payload: { text: '너만 안다', whisper: 'u2' } });
    expect(e).toMatchObject({ visibility: 'owner', ownerId: 'u2' });
  });

  it('spectators cannot whisper, OOC chat stays public', () => {
    const t = new Table(withCharacters());
    expect(() =>
      t.run(SPECTATOR, { type: 'chat.post', payload: { text: '쉿', whisper: 'gm' } }),
    ).toThrow(CommandError);
    const [e] = t.run(P1, { type: 'chat.post', payload: { text: '잠깐 화장실', ooc: true } });
    expect(e).toMatchObject({ visibility: 'public', payload: { ooc: true } });
  });

  it('secret rolls are GM only and hidden from players', () => {
    const t = new Table(withCharacters());
    expect(() => t.run(P1, { type: 'dice.secret', payload: { modifier: 0 } })).toThrow(
      CommandError,
    );
    const [e] = t.nextDice(1, 1, 0, -1).run(GM, {
      type: 'dice.secret',
      payload: { modifier: 2, label: '경비가 눈치챘나' },
    });
    expect(e).toMatchObject({
      type: 'dice.secret_rolled',
      visibility: 'gm',
      payload: { dice: [1, 1, 0, -1], modifier: 2, label: '경비가 눈치챘나' },
    });
  });
});
