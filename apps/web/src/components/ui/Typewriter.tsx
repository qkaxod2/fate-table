'use client';

import { useEffect, useState } from 'react';
import { parseRich } from '@fate/rules-engine';
import { reducedMotion } from '@/lib/motion';
import { RichSegments, sliceSegments } from './RichText';
import styles from './Typewriter.module.css';

/** 한 글자에 걸리는 시간. 쉼표·마침표 뒤에서는 조금 더 쉰다 */
const CHAR_MS = 26;
const PAUSE_MS: Record<string, number> = { ',': 120, '.': 220, '!': 220, '?': 220, '…': 260 };

/**
 * GM 대사를 한 글자씩 써 내려간다 (비주얼 노벨처럼). 아직 안 나온 글자도 투명하게 자리를
 * 잡고 있어서 상자 크기가 흔들리지 않는다. 누르면 바로 다 보이고, 다 나오면 ▾가 깜빡인다.
 * 움직임 줄이기 설정이면 처음부터 다 보인다. 꾸밈 표시(**굵게** 등)는 글자로 세지 않는다.
 */
export function Typewriter({ text, fx }: { text: string; fx?: boolean | undefined }) {
  const segs = parseRich(text, { gm: !!fx });
  const plain = segs.map((s) => s.text).join('');
  const chars = Array.from(plain);
  const [shown, setShown] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const n = shown.text === text ? shown.n : 0;
  const done = n >= chars.length;

  useEffect(() => {
    let i = 0;
    let t = 0;
    if (reducedMotion()) {
      t = window.setTimeout(() => setShown({ text, n: Infinity }), 0);
      return () => window.clearTimeout(t);
    }
    const all = Array.from(plain);
    const step = () => {
      i += 1;
      setShown({ text, n: i });
      if (i >= all.length) return;
      t = window.setTimeout(step, CHAR_MS + (PAUSE_MS[all[i - 1]!] ?? 0));
    };
    t = window.setTimeout(step, 120);
    return () => window.clearTimeout(t);
  }, [text, plain]);

  return (
    <span
      className={styles.line}
      data-typing={!done || undefined}
      onClick={() => setShown({ text, n: Infinity })}
      title={done ? undefined : '누르면 바로 다 보여요'}
    >
      <span>
        <RichSegments segs={sliceSegments(segs, 0, n)} />
      </span>
      <span className={styles.rest} aria-hidden>
        <RichSegments segs={sliceSegments(segs, n)} />
      </span>
      {done && text && <span className={styles.next} aria-hidden />}
    </span>
  );
}
