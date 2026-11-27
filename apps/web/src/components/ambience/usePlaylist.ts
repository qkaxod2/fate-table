'use client';

import type { Command, Music, RoomEvent } from '@fate/rules-engine';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { onYoutube } from '@/fx/music';
import {
  getPlaylist,
  nextInPlaylist,
  serverPlaylist,
  setPlaylist,
  subscribePlaylist,
} from '@/lib/playlist';

export function usePlaylist() {
  return useSyncExternalStore(subscribePlaylist, getPlaylist, serverPlaylist);
}

/**
 * GM 화면에서만: 유튜브 곡이 끝나면 (이어 틀기를 켰으면) 목록의 다음 곡을 모두에게 틀고,
 * 플레이어가 알려 준 제목을 이름 없는 곡에 붙인다. 음악 판을 닫아 두어도 돈다.
 */
export function usePlaylistChain(
  enabled: boolean,
  music: Music | undefined,
  run: (cmd: Command) => Promise<RoomEvent[]>,
): void {
  const nowId = music && 'youtube' in music ? music.youtube : undefined;
  const latest = useRef({ nowId, run });
  useEffect(() => {
    latest.current = { nowId, run };
  });
  useEffect(() => {
    if (!enabled) return;
    return onYoutube((n) => {
      const { items, chain } = getPlaylist();
      if (n.kind === 'title') {
        if (items.some((t) => t.id === n.id && !t.title))
          setPlaylist({
            items: items.map((t) => (t.id === n.id && !t.title ? { ...t, title: n.title } : t)),
          });
        return;
      }
      if (n.kind !== 'ended' || !chain || n.id !== latest.current.nowId) return;
      const next = nextInPlaylist(items, n.id);
      if (next)
        void latest.current.run({
          type: 'music.set',
          payload: { youtube: next.id, ...(next.title ? { title: next.title } : {}) },
        });
    });
  }, [enabled]);
}
