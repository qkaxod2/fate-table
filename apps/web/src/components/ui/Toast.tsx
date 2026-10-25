'use client';

import { type CSSProperties, useSyncExternalStore } from 'react';
import { EXIT_MS, reducedMotion } from '@/lib/motion';
import styles from './Toast.module.css';

export interface ToastInput {
  text: string;
  tone?: 'info' | 'error' | 'success';
  /** 알림 안의 버튼 (예: 되돌리기) */
  action?: { label: string; run: () => void };
  /** 같은 key의 알림은 새로 쌓지 않고 바꿔 끼운다 */
  key?: string;
  ms?: number;
}

interface Item extends ToastInput {
  id: number;
  /** 사라지는 중: 흐려지며 올라간 뒤 목록에서 빠진다 */
  leaving?: boolean;
  /** 저절로 사라지기까지 남은 시간(ms). 아래 줄어드는 막대에 쓴다 */
  life: number;
}

let items: Item[] = [];
let ids = 0;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function emit() {
  for (const fn of listeners) fn();
}

function remove(id: number) {
  items = items.filter((t) => t.id !== id);
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  emit();
}

/** 알림을 닫는다. 잠깐 흐려지며 올라간 뒤 빠진다 (움직임 줄이기면 바로) */
export function dismissToast(id: number) {
  const item = items.find((t) => t.id === id);
  if (!item || item.leaving) return;
  if (reducedMotion()) return remove(id);
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  window.clearTimeout(timers.get(id));
  timers.set(
    id,
    window.setTimeout(() => remove(id), EXIT_MS),
  );
  emit();
}

/** 화면 위쪽에 잠깐 떴다 사라지는 알림 */
export function toast(input: ToastInput): number {
  const id = ++ids;
  const old = input.key ? items.find((t) => t.key === input.key) : undefined;
  // 같은 알림을 바꿔 끼울 때는 흐려지지 않고 바로 자리를 내준다
  if (old) remove(old.id);
  const ms = input.ms ?? (input.action ? 5000 : input.tone === 'error' ? 3600 : 2200);
  items = [...items.slice(-3), { ...input, id, life: ms }];
  timers.set(
    id,
    window.setTimeout(() => dismissToast(id), ms),
  );
  emit();
  return id;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => items;
const empty: Item[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={styles.toast}
          data-tone={t.tone ?? 'info'}
          data-leaving={t.leaving || undefined}
          style={{ '--life': `${t.life}ms` } as CSSProperties}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
