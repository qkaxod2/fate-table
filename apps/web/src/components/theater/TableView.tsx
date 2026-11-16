'use client';

import { term } from '@fate/glossary';
import type { Aspect, Character } from '@fate/rules-engine';
import { useEffect, type ReactNode } from 'react';
import { Nameplate } from './Nameplate';
import styles from './TableView.module.css';

export interface Seat {
  character: Character;
  image?: string | null | undefined;
  player?: string | undefined;
  me?: boolean;
  /** 이 사람 앞에 놓인 카드 (후유증·부스트 등) */
  aspects: Aspect[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  scene: { name: string; image?: string | null | undefined; note?: string | undefined };
  /** 장면에 깔린 특성 (장면·구역 특성, 주인 없는 부스트) */
  sceneAspects: Aspect[];
  foes: Seat[];
  seats: Seat[];
  gmPool?: number | undefined;
  card: (a: Aspect) => ReactNode;
}

/**
 * 탁자 보기 (design-system.md 32절, 시안 A).
 * 장면 위에 펠트 탁자를 펼쳐 모두의 상태를 한눈에 본다. Tab이나 닫기로 접는다.
 * 카드는 줄 세우지 않고 주인 곁에 겹쳐 흩어 놓는다.
 */
export function TableView({
  open,
  onClose,
  scene,
  sceneAspects,
  foes,
  seats,
  gmPool,
  card,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={styles.layer} data-open={open || undefined} aria-hidden={!open} inert={!open}>
      <div className={styles.dim} onClick={onClose} />
      <section className={styles.felt} role="dialog" aria-label="탁자 보기">
        <header className={styles.head}>
          <h2>탁자 보기</h2>
          {gmPool !== undefined && (
            <span className={styles.pool} title={`GM ${term('fatePoint')}`}>
              GM 풀
              {Array.from({ length: Math.min(gmPool, 8) }, (_, i) => (
                <i key={i} />
              ))}
              {gmPool === 0 && <em>0</em>}
            </span>
          )}
          <button type="button" className={styles.close} onClick={onClose}>
            닫기 <kbd>Tab</kbd>
          </button>
        </header>

        <div className={styles.top}>
          <div className={styles.sceneSide}>
            <div className={styles.scatter}>
              {sceneAspects.map((a) => (
                <div key={a.id} className={styles.drop}>
                  {card(a)}
                </div>
              ))}
            </div>
            <figure className={styles.scene}>
              {scene.image && <img src={scene.image} alt="" />}
              <figcaption>
                <b>{scene.name}</b>
                {scene.note && <small>{scene.note}</small>}
              </figcaption>
            </figure>
          </div>
          <div className={styles.foes}>
            {foes.map((f) => (
              <div key={f.character.id} className={styles.foe}>
                <figure className={styles.foeCard} data-out={f.character.takenOut || undefined}>
                  {f.image && <img src={f.image} alt="" />}
                  <Nameplate character={f.character} />
                </figure>
                <div className={styles.tucked}>
                  {f.aspects.map((a) => (
                    <div key={a.id} className={styles.drop}>
                      {card(a)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.seats}>
          {seats.map((s) => (
            <div key={s.character.id} className={styles.seat} data-me={s.me || undefined}>
              <div className={styles.tucked}>
                {s.aspects.map((a) => (
                  <div key={a.id} className={styles.drop}>
                    {card(a)}
                  </div>
                ))}
              </div>
              <div className={styles.seatCard}>
                {s.image && <img src={s.image} alt="" />}
                <Nameplate
                  character={s.character}
                  sub={s.player ? `플레이어 · ${s.player}` : undefined}
                  me={s.me ?? false}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
