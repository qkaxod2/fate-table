'use client';

import type { Command, RoomEvent } from '@fate/rules-engine';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { roomHref } from '@/lib/lobby';
import { type CharacterDraft, listMyCharacters, loadMyCharacters } from '@/lib/myCharacters';
import styles from './room.module.css';

interface Props {
  run: (cmd: Command) => Promise<RoomEvent[]>;
  has: boolean;
  /** 이 방에 이미 데려온 초안 키 */
  brought: Set<string>;
}

/** 캐릭터 만들기에서 저장한 캐릭터(계정 보관함 포함)를 이 방에 데려온다 */
export function BringCharacter({ run, has, brought }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get('id') ?? '';
  const [open, setOpen] = useState(!has);
  /** 데려오는 중인 초안 키. 응답이 오기 전에 다시 누르면 무시한다 */
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [drafts, setDrafts] = useState<CharacterDraft[]>(loadMyCharacters);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listMyCharacters().then((list) => alive && setDrafts(list));
    return () => {
      alive = false;
    };
  }, [open]);

  async function bring(d: CharacterDraft) {
    if (busyRef.current || brought.has(d.key)) return;
    busyRef.current = true;
    setBusy(d.key);
    try {
      const { key, savedAt: _s, ...payload } = d;
      const evs = await run({ type: 'character.create', payload: { ...payload, sourceKey: key } });
      if (evs.length) setOpen(false);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  // 캐릭터 만들기에서 막 돌아왔다면 (?bring=초안키) 그 캐릭터를 바로 데려온다
  const bringKey = params.get('bring');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!bringKey || handled.current === bringKey) return;
    handled.current = bringKey;
    router.replace(roomHref(roomId));
    void listMyCharacters().then((list) => {
      const d = list.find((x) => x.key === bringKey);
      if (d) void bring(d);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bringKey]);

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
        {drafts.map((d) => {
          const here = brought.has(d.key);
          return (
            <li key={d.key}>
              <button
                type="button"
                className={styles.draft}
                disabled={busy !== null || here}
                aria-busy={busy === d.key || undefined}
                onClick={() => void bring(d)}
              >
                {d.portraitUrl && <img src={d.portraitUrl} alt="" />}
                <span>
                  <b>{d.name}</b>
                  <small>
                    {here ? '이미 이 방에 있어요' : busy === d.key ? '데려오는 중…' : d.highConcept}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Link href={`/create/?room=${encodeURIComponent(roomId)}`} className={styles.link}>
        새 캐릭터 만들기 →
      </Link>
    </section>
  );
}
