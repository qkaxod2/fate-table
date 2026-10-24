'use client';

import { useSyncExternalStore } from 'react';
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
}

let items: Item[] = [];
let ids = 0;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function emit() {
  for (const fn of listeners) fn();
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  emit();
}

/** 화면 위쪽에 잠깐 떴다 사라지는 알림 */
export function toast(input: ToastInput): number {
  const id = ++ids;
  const old = input.key ? items.find((t) => t.key === input.key) : undefined;
  if (old) dismissToast(old.id);
  items = [...items.slice(-3), { ...input, id }];
  const ms = input.ms ?? (input.action ? 5000 : input.tone === 'error' ? 3600 : 2200);
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
        <div key={t.id} className={styles.toast} data-tone={t.tone ?? 'info'}>
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
