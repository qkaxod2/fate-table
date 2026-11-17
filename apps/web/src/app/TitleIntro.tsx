'use client';

import { useLayoutEffect } from 'react';
import { playSfx } from '@/fx/sfx';
import { reducedMotion } from '@/lib/motion';
import styles from './page.module.css';

/*
 * 타이틀 콜: 첫 화면에 들어올 때 한 번.
 * 어둠 속 가운데에 제목이 한 글자씩 떠오르고, 장면에 불이 들어오며 제목이 제자리(왼쪽 아래)로 내려앉는다.
 * 누르거나 키를 누르면 바로 끝난다. 한 탭(세션)에서 한 번만, 움직임 줄이기 설정이면 보여 주지 않는다.
 *
 * 상태는 <html data-intro>에 둔다: wait(가려 둠) → run(재생) → skip(건너뜀, 잠깐 밝아짐) → done.
 * 정적 HTML이 그려지기 전에 INTRO_BOOT가 wait를 붙여서, 완성된 화면이 먼저 번쩍이지 않는다.
 */

const SEEN = 'fate.intro.seen';
/** 마지막 움직임(장면이 밝아짐)이 끝나는 때. page.module.css의 지연·길이와 맞춘다 */
const RUN_MS = 3300;
const SKIP_MS = 320;
/** 장면에 불이 들어오는 때 */
const SCENE_AT = 1100;

/** 본문보다 먼저 실행되는 짧은 스크립트. 스크립트가 끝내 안 돌면 4초 뒤 스스로 풀린다 */
export const INTRO_BOOT = `(function(){try{var d=document.documentElement;if(d.dataset.intro)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(sessionStorage.getItem('${SEEN}'))return;d.dataset.intro='wait';setTimeout(function(){if(d.dataset.intro==='wait')d.dataset.intro='done'},4000)}catch(e){}})()`;

function seen(): boolean {
  try {
    return sessionStorage.getItem(SEEN) !== null;
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN, '1');
  } catch {
    // 저장 못 하면 다음에 한 번 더 볼 뿐이다
  }
}

const root = () => document.documentElement;

export function TitleIntro({ titleId }: { titleId: string }) {
  // 그려지기 전에: 제목이 화면 가운데 오도록 얼마나 옮기고 키울지 재고 재생을 시작한다
  useLayoutEffect(() => {
    const html = root();
    const state = html.dataset.intro;
    // 다른 화면에서 넘어온 경우(처음 HTML의 스크립트가 안 돈 경우)에도 한 번은 보여 준다.
    // run은 재생 중에 화면을 떠났다 돌아왔거나 개발 모드가 효과를 두 번 부른 경우: 처음부터 다시 잰다
    const fresh = state === 'wait' || state === 'run' || (!state && !seen() && !reducedMotion());
    if (!fresh) {
      if (state === 'skip') html.dataset.intro = 'done';
      return;
    }
    const call = document.getElementById(titleId);
    if (!call) {
      html.dataset.intro = 'done';
      return;
    }
    // 움직임을 떼고(가린 채로) 제자리를 잰다. 재는 순간 스타일이 다시 계산되어 애니메이션도 처음부터다
    html.dataset.intro = 'wait';
    const r = call.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(1.35, (vw * 0.84) / Math.max(1, r.width));
    call.style.setProperty('--ix', `${vw / 2 - (r.left + r.width / 2)}px`);
    call.style.setProperty('--iy', `${vh / 2 - (r.top + r.height / 2)}px`);
    call.style.setProperty('--is', String(scale));
    html.dataset.intro = 'run';
    markSeen();

    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    let over = false;
    const finish = (skipped: boolean) => {
      if (over) return;
      over = true;
      for (const t of timers.splice(0)) window.clearTimeout(t);
      unlisten();
      if (!skipped) {
        html.dataset.intro = 'done';
        return;
      }
      html.dataset.intro = 'skip';
      later(() => {
        if (html.dataset.intro === 'skip') html.dataset.intro = 'done';
      }, SKIP_MS);
    };

    const onPointer = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      // 탭과 보조 키만 누른 것은 건너뛰기가 아니다 (건너뛰기 버튼으로 옮겨 가는 중일 수 있다)
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      finish(true);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    function unlisten() {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    }

    // 소리는 이미 이 탭에서 화면을 만진 적이 있을 때만 (자동 재생 제한, 소리 설정은 playSfx가 따른다)
    later(() => {
      const touched = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
        .userActivation?.hasBeenActive;
      if (touched) playSfx('scene-transition', 0.35);
    }, SCENE_AT);
    later(() => finish(false), RUN_MS);

    return () => {
      for (const t of timers.splice(0)) window.clearTimeout(t);
      unlisten();
    };
  }, [titleId]);

  // 재생 중에만 보인다(page.module.css). 누르는 순간과 키 입력은 창 전체에서 받으니
  // 버튼은 눈에 보이는 안내이자 키보드 초점이 머물 자리다
  return (
    <button type="button" className={styles.skip}>
      건너뛰기
    </button>
  );
}
