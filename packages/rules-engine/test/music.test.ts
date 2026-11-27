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

  it('plays a YouTube video stamped with the server time so everyone hears the same moment', () => {
    const t = new Table(withCharacters());
    t.run(GM, { type: 'music.set', payload: { youtube: 'dQw4w9WgXcQ', title: '여름 밤' } });
    expect(t.state.music).toEqual({
      youtube: 'dQw4w9WgXcQ',
      title: '여름 밤',
      at: 1_700_000_000_000,
    });
    t.run(GM, { type: 'music.set', payload: { track: 'calm' } });
    expect(t.state.music).toEqual({ track: 'calm' });
    expect(
      CommandSchema.safeParse({ type: 'music.set', payload: { youtube: 'not a video id' } })
        .success,
    ).toBe(false);
  });

  it('pauses and resumes YouTube for everyone, shifting the start by the paused time', () => {
    const t = new Table(withCharacters());
    expect(() => t.run(GM, { type: 'music.pause', payload: { paused: true } })).toThrow(
      CommandError,
    );
    t.run(GM, { type: 'music.set', payload: { youtube: 'dQw4w9WgXcQ' } });
    let now = 1_700_000_000_000;
    t.now = () => (now += 10_000);
    t.run(GM, { type: 'music.pause', payload: { paused: true } });
    expect(t.state.music).toMatchObject({ at: 1_700_000_000_000, pausedAt: 1_700_000_010_000 });
    expect(() => t.run(GM, { type: 'music.pause', payload: { paused: true } })).toThrow(
      CommandError,
    );
    t.run(GM, { type: 'music.pause', payload: { paused: false } });
    // 10초 멈춰 있었으니 시작 시각이 10초 뒤로 밀린다
    expect(t.state.music).toEqual({ youtube: 'dQw4w9WgXcQ', at: 1_700_000_010_000 });
    expect(() => t.run(P1, { type: 'music.pause', payload: { paused: true } })).toThrow(
      CommandError,
    );
  });

  it('players cannot change the music', () => {
    const t = new Table(withCharacters());
    expect(() => t.run(P1, { type: 'music.set', payload: { track: 'calm' } })).toThrow(
      CommandError,
    );
  });
});
