'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseGuardScope, useCloseGuard } from '@/components/ui/closeGuard';
import { useClosing } from '@/lib/motion';
import styles from './Leaf.module.css';

/**
 * 열린 창 쌓임. 맨 위 창만 Esc·Tab을 받는다.
 * 창이 열려 있는 동안 테이블 단축키(1–4, QWEASD, Space, F/R/Enter …)는 쉬어야 해서 밖에서도 물어본다.
 */
const stack: symbol[] = [];

/** 지금 창(시트·명령 창·GM 도구·그림·나가기)이 하나라도 열려 있는지. 테이블 단축키가 확인한다 */
export function isDialogOpen(): boolean {
  return stack.length > 0;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 창 하나의 키보드 규칙.
 * - 열리면 안쪽으로 초점을 옮기고(자동 초점이 없으면 창 자체), 닫히면 연 자리로 돌려준다.
 * - Esc는 초점이 어디 있든 맨 위 창 하나만 닫는다. (예전에는 창 안에 초점이 있을 때만 Esc가 닿아서,
 *   시트를 연 채 Esc를 누르면 방 단축키가 먼저 받아 아무것도 닫히지 않았다.)
 * - Tab은 창 안에서만 돈다.
 */
export function useDialogKeys(
  panel: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    const id = Symbol('dialog');
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    // 안쪽 자동 초점(autoFocus)은 이미 잡혀 있다. 없으면 창 자체로
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack.at(-1) !== id || !panel.current) return;
      if (e.key === 'Escape') {
        if (e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (x) => x.offsetParent !== null || x === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      const active = document.activeElement;
      const inside = panel.current.contains(active);
      if (e.shiftKey && (active === first || !inside || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    // 캡처 단계에서 먼저 받아, 방 전체 단축키(Esc로 명령 창 닫기 등)보다 앞선다
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [panel]);
}

interface Props {
  /** 머리글 제목. 없으면 머리글 없이 (명령 창처럼) */
  title?: ReactNode;
  /** 제목 위 작은 머리말 */
  kicker?: ReactNode;
  /** 화면 읽기용 이름 (제목이 글자가 아닐 때) */
  label: string;
  onClose: () => void;
  /** 안쪽에서도 닫아야 할 때(할 일을 마치면 닫힘) 바깥에서 만든 useClosing을 넘긴다 */
  closer?: [boolean, () => void];
  /** 적은 것 말고도 닫히면 잃는 게 있을 때 */
  dirty?: boolean;
  /** 폭: 좁은 확인 창 · 보통 · 넓은 그림 창 */
  size?: 'sm' | 'md' | 'lg';
  /** 화면 위쪽에 붙는 창 (명령 창) */
  top?: boolean;
  role?: 'dialog' | 'alertdialog';
  /** 머리글 오른쪽 (× 앞) */
  aside?: ReactNode;
  /** 바닥에 붙는 버튼 줄 */
  footer?: ReactNode;
  /** 일하는 중이라 닫을 수 없음 */
  locked?: boolean;
  children: ReactNode;
}

/**
 * 책의 한 장 (design-system.md 21절). 시트·GM 도구·그림·나가기·명령 창이 모두 이 종이 한 장 위에 열린다.
 * 바깥 누르기·Esc·×로 닫히고, 작성 중이면 한 번 막는다(closeGuard). 좁은 화면에서는 아래에서 올라오는 시트다.
 */
export function Leaf({
  title,
  kicker,
  label,
  onClose,
  closer,
  dirty,
  size = 'md',
  top,
  role = 'dialog',
  aside,
  footer,
  locked,
  children,
}: Props) {
  const own = useClosing(onClose);
  const [closing, close] = closer ?? own;
  const guard = useCloseGuard(() => {
    if (!locked) close();
  }, dirty);
  const panel = useRef<HTMLElement>(null);
  useDialogKeys(panel, guard.requestClose);
  return (
    <div
      className={styles.backdrop}
      data-closing={closing || undefined}
      data-top={top || undefined}
      {...guard.backdrop}
    >
      <section
        ref={panel}
        className={styles.leaf}
        data-size={size}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-close-armed={guard.panel['data-close-armed']}
        onInput={guard.panel.onInput}
      >
        {title !== undefined && (
          <header className={styles.head}>
            <div className={styles.titles}>
              {kicker && <p className={styles.kicker}>{kicker}</p>}
              <h2 className={styles.title}>{title}</h2>
            </div>
            {aside}
            <button
              type="button"
              className={styles.close}
              onClick={close}
              disabled={locked}
              aria-label="닫기"
            >
              ×
            </button>
          </header>
        )}
        <div className={styles.body}>
          <CloseGuardScope value={guard.scope}>{children}</CloseGuardScope>
        </div>
        {footer && <footer className={styles.foot}>{footer}</footer>}
      </section>
      {guard.nudge}
    </div>
  );
}
