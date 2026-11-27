import { describe, expect, it } from 'vitest';
import {
  mergePlaylist,
  nextInPlaylist,
  parseYoutube,
  playlistJson,
  readPlaylist,
} from '@/lib/playlist';

const ID = 'dQw4w9WgXcQ';

describe('playlist', () => {
  it('유튜브 주소 여러 꼴에서 영상 id를 꺼낸다', () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${ID}&t=30s`,
      `https://youtu.be/${ID}?si=abc`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=RD`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      ID,
    ])
      expect(parseYoutube(u)).toBe(ID);
    expect(parseYoutube('https://example.com/a.mp3')).toBeNull();
    expect(parseYoutube('https://www.youtube.com/watch?v=short')).toBeNull();
  });

  it('내려받은 JSON을 다시 올리면 같은 목록이 된다', () => {
    const items = [{ id: ID, title: '여름 밤' }, { id: 'abcdefghijk' }];
    expect(readPlaylist(JSON.parse(playlistJson(items)))).toEqual(items);
  });

  it('여러 모양을 받고, 못 읽는 곡과 겹치는 곡은 건너뛴다', () => {
    expect(
      readPlaylist([
        `https://youtu.be/${ID}`,
        { id: ID },
        { url: 'nope' },
        3,
        { id: 'abcdefghijk' },
      ]),
    ).toEqual([{ id: ID }, { id: 'abcdefghijk' }]);
    expect(readPlaylist({ nothing: true })).toEqual([]);
    expect(mergePlaylist([{ id: ID }], [{ id: ID, title: 'x' }, { id: 'abcdefghijk' }])).toEqual([
      { id: ID },
      { id: 'abcdefghijk' },
    ]);
  });

  it('다음 곡은 목록을 돌아서 처음으로 간다', () => {
    const l = [{ id: ID }, { id: 'abcdefghijk' }];
    expect(nextInPlaylist(l, 'abcdefghijk')).toEqual({ id: ID });
    expect(nextInPlaylist([{ id: ID }], ID)).toBeNull();
  });
});
