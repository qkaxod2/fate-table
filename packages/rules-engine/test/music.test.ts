import { describe, expect, it } from 'vitest';
import { CommandError, CommandSchema } from '../src/index';
import { GM, P1, Table, withCharacters } from './helpers';

describe('background music', () => {
  it('the GM sets a built-in track, it survives scene changes, and can be turned off', () => {
    const t = new Table(withCharacters());
    t.run(GM, { type: 'music.set', payload: { track: 'tense' } });
    expect(t.state.music).toEqual({ track: 'tense' });
    t.run(GM, { type: 'scene.start', payload: { name: '부두' } });
    expect(t.state.music).toEqual({ track: 'tense' });
    t.run(GM, { type: 'music.set', payload: {} });
    expect(t.state.music).toBeUndefined();
  });

  it('accepts an https music link with a title, never plain http', () => {
    const t = new Table(withCharacters());
    t.run(GM, {
      type: 'music.set',
      payload: { url: 'https://example.com/a.mp3', title: '비 오는 밤' },
    });
    expect(t.state.music).toEqual({ url: 'https://example.com/a.mp3', title: '비 오는 밤' });
    expect(
      CommandSchema.safeParse({ type: 'music.set', payload: { url: 'http://example.com/a.mp3' } })
        .success,
    ).toBe(false);
  });

  it('players cannot change the music', () => {
    const t = new Table(withCharacters());
    expect(() => t.run(P1, { type: 'music.set', payload: { track: 'calm' } })).toThrow(
      CommandError,
    );
  });
});
