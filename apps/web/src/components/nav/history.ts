'use client';

/*
 * 브라우저 기록 위에 "이 사이트 안에서 몇 걸음 들어왔는지"를 적어 둔다.
 * 뒤로 단추는 이 숫자가 0보다 클 때만 브라우저 뒤로가기를 쓰고, 아니면(주소로 바로 들어왔거나
 * 새로고침한 첫 화면) 사이트 밖으로 튕겨 나가지 않게 정해진 화면으로 보낸다.
 * Next 라우터의 내부 기록(__NA 등)은 그대로 두고 우리 열쇠만 덧붙인다.
 */

const DEPTH = 'ftDepth';

type HistoryState = Record<string, unknown> | null;

function current(): Record<string, unknown> {
  return ((typeof window !== 'undefined' && (window.history.state as HistoryState)) ||
    {}) as Record<string, unknown>;
}

/** 지금 기록 칸의 깊이 (적힌 게 없으면 0: 사이트에 막 들어온 칸) */
export function historyDepth(): number {
  const d = current()[DEPTH];
  return typeof d === 'number' ? d : 0;
}

let lastDepth = -1;

/** 주소(경로)가 바뀐 직후 부른다: 새 칸이면 앞 칸보다 한 걸음 깊다고 적는다 */
export function markRoute(): void {
  const st = current();
  if (typeof st[DEPTH] === 'number') {
    // 뒤로·앞으로 가기나 새로고침: 이미 적혀 있다
    lastDepth = st[DEPTH] as number;
    return;
  }
  lastDepth = lastDepth < 0 ? 0 : lastDepth + 1;
  window.history.replaceState({ ...st, [DEPTH]: lastDepth }, '');
}

/** 같은 주소 안에서 화면 단계가 바뀔 때 새 기록 칸을 쌓는다 (뒤로가기로 이전 단계에 돌아오게) */
export function pushStep(key: string, value: unknown): void {
  const st = current();
  const depth = historyDepth() + 1;
  lastDepth = depth;
  window.history.pushState({ ...st, [key]: value, [DEPTH]: depth }, '');
}

/** 지금 칸의 단계 값을 덮어쓴다 (새 칸을 쌓지 않음) */
export function replaceStep(key: string, value: unknown): void {
  window.history.replaceState({ ...current(), [key]: value }, '');
}

/** 지금 칸에 적힌 단계 값 */
export function readStep(key: string): unknown {
  return current()[key];
}
