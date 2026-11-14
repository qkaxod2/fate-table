'use client';

import { useCallback, useEffect, useRef } from 'react';
import { pushStep, readStep, replaceStep } from './history';

/**
 * 주소는 그대로인 채 단계만 바뀌는 화면(캐릭터 만들기 단계, 튜토리얼 캐릭터 고르기)을
 * 브라우저 뒤로·앞으로 가기와 잇는다.
 * - 돌려준 함수로 단계를 바꾸면 기록 칸이 하나 쌓인다
 * - 뒤로가기를 누르면 그 칸에 적힌 단계로 onPop이 불린다 (적힌 게 없으면 initial)
 */
export function useHistoryStep<T>(key: string, initial: T, onPop: (value: T) => void) {
  const popRef = useRef(onPop);
  useEffect(() => {
    popRef.current = onPop;
  });

  useEffect(() => {
    // 처음 들어온 칸은 첫 단계: 새로고침으로 다른 단계 값이 남아 있어도 화면과 맞춘다
    replaceStep(key, initial);
    const onPopState = () => {
      const v = readStep(key);
      popRef.current(v === undefined ? initial : (v as T));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // initial은 처음 한 번만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useCallback((value: T) => pushStep(key, value), [key]);
}
