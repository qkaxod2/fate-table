'use client';

import type { Command, RoomEvent } from '@fate/rules-engine';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type CharacterDraft, listMyCharacters, loadMyCharacters } from '@/lib/myCharacters';
import styles from './room.module.css';

interface Props {
  run: (cmd: Command) => Promise<RoomEvent[]>;
  has: boolean;
}

/** 캐릭터 만들기에서 저장한 캐릭터(계정 보관함 포함)를 이 방에 데려온다 */
export function BringCharacter({ run, has }: Props) {
  const [open, setOpen] = useState(!has);
  const [drafts, setDrafts] = useState<CharacterDraft[]>(loadMyCharacters);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listMyCharacters().then((list) => alive && setDrafts(list));
    return () => {
      alive = false;
    };
  }, [open]);
  if (!open)
    return (
      <button type="button" className={styles.ghost} onClick={() => setOpen(true)}>
        + 캐릭터 데려오기
      </button>
    );
  return (
    <section className={styles.panel} aria-label="캐릭터 데려오기">
      <div className={styles.panelHead}>
        내 캐릭터 데려오기
        {has && (
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="닫기"
          >
            ×
          </button>
        )}
      </div>
      {drafts.length === 0 && <p className={styles.muted}>저장한 캐릭터가 없어요.</p>}
      <ul className={styles.drafts}>
        {drafts.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              className={styles.draft}
              onClick={async () => {
                const { key: _k, savedAt: _s, ...payload } = d;
                const evs = await run({ type: 'character.create', payload });
                if (evs.length) setOpen(false);
              }}
            >
              {d.portraitUrl && <img src={d.portraitUrl} alt="" />}
              <span>
                <b>{d.name}</b>
                <small>{d.highConcept}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Link href="/create/" target="_blank" className={styles.link}>
        새 캐릭터 만들기 (새 탭) →
      </Link>
    </section>
  );
}
