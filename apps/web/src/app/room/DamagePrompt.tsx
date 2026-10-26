'use client';

import { term } from '@fate/glossary';
import {
  absorbOptions,
  type Character,
  type Command,
  type ConsequenceSlot,
  type PendingDamage,
  type RoomEvent,
} from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import tryStyles from '../tutorial/try.module.css';
import styles from './room.module.css';
import { josa } from '@/lib/josa';

interface Props {
  damage: PendingDamage;
  character: Character;
  run: (cmd: Command) => Promise<RoomEvent[]>;
  pending: boolean;
}

/** 받은 피해를 스트레스 칸·후유증으로 받아내거나, 받아낼 수 없으면 탈락 */
export function DamagePrompt({ damage, character, run, pending }: Props) {
  const plans = absorbOptions(damage.shifts, character).filter((p) => p.remaining <= 0);
  const [pick, setPick] = useState(0);
  const [names, setNames] = useState<Partial<Record<ConsequenceSlot, string>>>({});
  const plan = plans[pick];
  const ready = !plan || plan.consequences.every((s) => names[s]?.trim());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus({ preventScroll: true }), []);

  return (
    <div
      ref={box}
      className={tryStyles.prompt}
      role="dialog"
      aria-label="피해 받아내기"
      tabIndex={-1}
    >
      <div className={tryStyles.promptHead}>
        {josa(character.name, '이/가')} 피해 {josa(String(damage.shifts), '을/를')} 받았어요
      </div>
      {plans.length === 0 ? (
        <p className={tryStyles.promptHelp}>
          받아낼 칸이 없어요. 이번 갈등에서 {term('takenOut')}해요.
        </p>
      ) : (
        <>
          <p className={tryStyles.promptHelp}>
            어떻게 받아낼지 골라요. {term('consequence')}을 쓰면 다친 곳을 짧게 적어요.
          </p>
          <div className={styles.plans}>
            {plans.map((p, i) => (
              <button
                key={i}
                type="button"
                className={styles.plan}
                aria-pressed={i === pick}
                onClick={() => setPick(i)}
              >
                {[
                  ...(p.stressBox ? [`${term('stress')} ${p.stressBox}번`] : []),
                  ...p.consequences.map((s) => term(s)),
                ].join(' + ') || '피해 없음'}
              </button>
            ))}
          </div>
          {plan?.consequences.map((s) => (
            <input
              key={s}
              className={tryStyles.promptInput}
              aria-label={`${term(s)} 이름`}
              placeholder={`${term(s)} 이름 (예: 삐끗한 발목)`}
              maxLength={40}
              value={names[s] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [s]: e.target.value }))}
            />
          ))}
        </>
      )}
      <div className={tryStyles.promptButtons}>
        <button
          type="submit"
          className={tryStyles.promptOk}
          disabled={pending || !ready}
          onClick={() =>
            void run({
              type: 'damage.absorb',
              payload: plan
                ? {
                    rollId: damage.rollId,
                    takeOut: false,
                    stressBox: plan.stressBox,
                    consequences: plan.consequences.map((slot) => ({
                      slot,
                      text: names[slot]!.trim(),
                    })),
                  }
                : { rollId: damage.rollId, takeOut: true, stressBox: null, consequences: [] },
            })
          }
        >
          {plan ? '받아내기' : term('takenOut')}
        </button>
      </div>
    </div>
  );
}
