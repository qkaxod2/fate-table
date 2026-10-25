'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import styles from './closeGuard.module.css';

/** 한 번 막은 뒤 이 시간 안에 다시 닫으려 하면 그대로 닫는다 */
const ARM_MS = 2500;

type Report = (id: string, dirty: boolean) => void;
interface ScopeValue {
  report: Report;
  /** 적은 내용을 저장했으니 더는 지킬 필요 없다 */
  saved: () => void;
}
const Scope = createContext<ScopeValue | null>(null);

/** 창 안쪽 부품이 '아직 버리면 아까운 것'(그리던 그림 등)을 알릴 때 감싸는 범위 */
export const CloseGuardScope = Scope.Provider;

/** 안쪽 부품에서: 지금 닫히면 잃는 게 있다고 알린다 */
export function useCloseGuardDirty(dirty: boolean) {
  const scope = useContext(Scope);
  const id = useId();
  useEffect(() => {
    scope?.report(id, dirty);
    return () => scope?.report(id, false);
  }, [scope, id, dirty]);
  return scope?.saved;
}

/**
 * 바깥 클릭·Esc로 닫히는 창을 실수로부터 지킨다.
 * - 안에서 누르고 바깥에서 뗀 클릭(글 고르다 끌려 나간 경우)은 닫지 않는다.
 * - 뭔가 적었거나 dirty면 첫 시도는 막고 안내만 띄운다. 곧바로 한 번 더 하면 닫힌다.
 * × 버튼은 분명한 뜻이니 onClose를 그대로 쓴다.
 */
export function useCloseGuard(onClose: () => void, dirty = false) {
  const typed = useRef(false);
  const inner = useRef(new Map<string, boolean>());
  const downOnBackdrop = useRef(false);
  const armedRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const [armed, setArmed] = useState(false);
  const dirtyRef = useRef(dirty);
  const closeRef = useRef(onClose);
  useEffect(() => {
    dirtyRef.current = dirty;
    closeRef.current = onClose;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const scope = useMemo<ScopeValue>(
    () => ({
      report: (id, d) => {
        if (d) inner.current.set(id, true);
        else inner.current.delete(id);
      },
      saved: () => {
        typed.current = false;
      },
    }),
    [],
  );

  const requestClose = useCallback(() => {
    const unsaved = dirtyRef.current || typed.current || inner.current.size > 0;
    if (!unsaved || armedRef.current) {
      closeRef.current();
      return;
    }
    armedRef.current = true;
    setArmed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      armedRef.current = false;
      setArmed(false);
    }, ARM_MS);
  }, []);

  return {
    scope,
    requestClose,
    armed,
    backdrop: {
      onPointerDown: (e: PointerEvent) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      },
      onClick: (e: MouseEvent) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) requestClose();
        downOnBackdrop.current = false;
      },
    },
    panel: {
      'data-close-armed': armed || undefined,
      onInput: () => {
        typed.current = true;
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
        // 방 전체 단축키(Esc로 창 닫기)까지 가지 않게
        e.stopPropagation();
        requestClose();
      },
    },
    nudge: armed ? <CloseNudge /> : null,
  };
}

function CloseNudge() {
  return (
    <p className={styles.nudge} role="status">
      작성 중인 내용이 있어요. 닫으려면 한 번 더 눌러 주세요
    </p>
  );
}
