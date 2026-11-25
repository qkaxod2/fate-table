'use client';

import type { DieFace } from '@fate/rules-engine';
import { useState } from 'react';
import { BrandMark } from '@/components/brand/BrandMark';
import { PageNav } from '@/components/nav/PageNav';
import { Dice3D } from '@/components/roll/Dice3D';
import { DiceGL } from '@/components/roll/DiceGL';
import styles from './lab.module.css';

const FACES: DieFace[] = [-1, 0, 1];

function roll(): { dice: DieFace[]; key: string } {
  const dice = Array.from({ length: 4 }, () => FACES[Math.floor(Math.random() * 3)]!);
  return { dice, key: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
}

const sum = (d: readonly DieFace[]) => d.reduce<number>((a, b) => a + b, 0);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export function DiceLab() {
  const [r, setR] = useState(() => ({ dice: [1, 0, -1, 1] as DieFace[], key: 'lab-first' }));
  const [tone, setTone] = useState<'me' | 'op'>('me');
  return (
    <main className={styles.lab}>
      <PageNav tone="stage" />
      <header className={styles.head}>
        <BrandMark size={44} />
        <div>
          <h1>주사위 실험실</h1>
          <p>같은 굴림을 지금 쓰는 CSS 주사위와 Three.js 시험판으로 나란히 굴려 봐요.</p>
        </div>
      </header>

      <div className={styles.controls}>
        <button type="button" className={styles.roll} onClick={() => setR(roll())}>
          4dF 굴리기
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setTone((t) => (t === 'me' ? 'op' : 'me'))}
        >
          {tone === 'me' ? '상대 주사위로 보기' : '내 주사위로 보기'}
        </button>
        <span className={styles.total} aria-live="polite">
          결과 {signed(sum(r.dice))}
        </span>
      </div>

      <section className={styles.pane}>
        <h2>Three.js 시험판</h2>
        <DiceGL key={`${r.key}-${tone}`} dice={r.dice} rollKey={r.key} tone={tone} />
      </section>

      <section className={styles.pane}>
        <h2>지금 쓰는 CSS 주사위</h2>
        <div className={styles.paper}>
          <Dice3D key={`${r.key}-${tone}`} dice={r.dice} rollKey={r.key} tone={tone} />
        </div>
      </section>
    </main>
  );
}
