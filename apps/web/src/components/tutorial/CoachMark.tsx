'use client';

import Link from 'next/link';
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import styles from './CoachMark.module.css';

export interface Coach {
  step: number;
  total: number;
  /** 단계 번호 앞에 붙는 장 이름 (예: "1장 · 극복") */
  chapter?: string;
  title: string;
  /** 한두 문장. 길어지면 points로 빼서 접어 둔다 */
  body: string;
  /** 지금 할 일이나 쉬운 예시. 본문 아래 손글씨 메모로 보여 준다 */
  example?: string;
  /** 하나씩 짚어 주는 목록 (결과 4단계, 굴림 계산 순서 등). "더 보기"를 눌러야 펼쳐진다 */
  points?: string[];
  /** "더 보기" 대신 쓸 문구 (예: "결과마다 어떻게 되나요?") */
  moreLabel?: string;
  /** 설명만 하는 단계: 읽고 이 버튼을 눌러 넘어간다 */
  next?: { label: string; onClick: () => void };
  keys?: string[];
  /** 다 끝냈을 때: 단계 번호 대신 '완료'를 보이고 점들이 차례로 반짝인다 */
  clear?: boolean;
  /** 다음으로 갈 곳 (예: 캐릭터 만들기) */
  links?: { href: string; label: string }[];
}

interface Props {
  coach: Coach;
  onHide: () => void;
  /** 숨기기 버튼 문구 (튜토리얼 진행 중에는 "건너뛰기") */
  hideLabel?: string;
  /**
   * 말풍선이 가리킬 곳 (CSS 선택자, 보통 Spotlight의 ring과 같다).
   * 없거나 화면에 보이지 않으면 이 컴포넌트가 놓인 자리(무대 위 안내 자리)에 선다.
   */
  anchor?: string;
  /** 말풍선이 되도록 가리지 말아야 할 곳 (밝게 남긴 곳들) */
  avoid?: string[];
  /** 되도록 비켜 설 곳 (예: 책 본문·기록지). 밝게 남긴 곳보다는 덜 피한다 */
  shy?: string[];
  /** 가리킬 곳이 없을 때 말풍선이 설 수 있는 영역 (예: 무대). 없으면 기본 자리에 선다 */
  region?: string;
  /** 단계별 진행 중 (좁은 화면 스크롤 보정에 쓴다) */
  pinned?: boolean;
}

type Side = 'left' | 'right' | 'top' | 'bottom';
type Place =
  { mode: 'sheet' } | { mode: 'float'; x: number; y: number; side: Side | null; tail: number };

/** 이 폭 이하에서는 말풍선 대신 아래에서 올라오는 시트로 보여 준다 */
const SHEET_QUERY = '(max-width: 760px)';
/** 화면 가장자리와 띄울 거리 */
const M = 12;
/** 대상과 말풍선 사이 (Spotlight 고리 6px + 꼬리) */
const GAP = 20;
/** 꼬리가 말풍선 모서리에 너무 붙지 않게 */
const TAIL_PAD = 22;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** 화면 안에 보이는 부분만 잘라 낸 영역 (말풍선 자신과 화면 밖으로 나간 것은 빼고) */
function visibleBoxes(selector: string): Box[] {
  const out: Box[] = [];
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('[data-coach]')) continue;
    const r = el.getBoundingClientRect();
    const box = {
      l: Math.max(r.left, 0),
      t: Math.max(r.top, 0),
      r: Math.min(r.right, window.innerWidth),
      b: Math.min(r.bottom, window.innerHeight),
    };
    if (box.r - box.l >= 8 && box.b - box.t >= 8) out.push(box);
  }
  return out;
}

const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
  Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** 말풍선이 덮으면 안 되는 정도: 가리키는 대상 ≫ 밝게 남긴 곳 ≫ 되도록 비킬 곳(책 본문 등) */
const W_TARGET = 60;
const W_AVOID = 12;
const W_SHY = 2;

/**
 * 대상 옆에 말풍선을 놓을 자리. 네 방향 모두 후보를 만들고 점수가 가장 낮은 자리를 고른다.
 * - 후보: 방향마다 대상 가운데·양 끝 맞춤, 피할 곳 바로 바깥으로 비킨 위치. 꼬리는 늘 대상에 닿는다.
 * - 점수: 대상을 덮은 넓이(가장 무겁게) + 밝게 남긴 곳(avoid)을 덮은 넓이 + 되도록 비킬 곳(shy)을 덮은 넓이.
 * - 점수가 같으면 여유가 큰 방향(넓적한 대상은 위아래, 나머지는 좌우), 그다음 대상 가운데에 가까운 자리.
 */
function placeBeside(
  t: Box,
  w: number,
  h: number,
  vw: number,
  vh: number,
  avoid: Box[],
  shy: Box[],
): Place {
  const room: Record<Side, number> = {
    left: t.l - GAP - M,
    right: vw - t.r - GAP - M,
    top: t.t - GAP - M,
    bottom: vh - t.b - GAP - M,
  };
  const across = (s: Side) => s === 'left' || s === 'right';
  const horiz: Side[] = room.left >= room.right ? ['left', 'right'] : ['right', 'left'];
  const vert: Side[] = room.top >= room.bottom ? ['top', 'bottom'] : ['bottom', 'top'];
  const order = t.r - t.l > vw * 0.5 ? [...vert, ...horiz] : [...horiz, ...vert];
  const cx = (t.l + t.r) / 2;
  const cy = (t.t + t.b) / 2;
  const cost = (box: Box) =>
    area(box, t) * W_TARGET +
    avoid.reduce((n, a) => n + area(box, a), 0) * W_AVOID +
    shy.reduce((n, a) => n + area(box, a), 0) * W_SHY;

  type Cand = { place: Place; cost: number; rank: number; off: number };
  const cands: Cand[] = [];
  order.forEach((side, rank) => {
    if (across(side)) {
      const x = clamp(side === 'left' ? t.l - GAP - w : t.r + GAP, M, vw - w - M);
      const reach = (y: number) => [Math.max(y + TAIL_PAD, t.t), Math.min(y + h - TAIL_PAD, t.b)];
      const ys = [
        cy - h / 2,
        t.t,
        t.b - h,
        ...[...avoid, ...shy].flatMap((a) => [a.t - h - 8, a.b + 8]),
      ]
        .map((y) => clamp(y, M, vh - h - M))
        .filter((y) => reach(y)[1]! - reach(y)[0]! >= 0);
      if (ys.length === 0) ys.push(clamp(cy - h / 2, M, vh - h - M));
      for (const y of ys) {
        const [lo, hi] = reach(y);
        const tail = hi! >= lo! ? (lo! + hi!) / 2 - y : cy - y;
        cands.push({
          place: { mode: 'float', x, y, side, tail: clamp(tail, TAIL_PAD, h - TAIL_PAD) },
          cost: cost({ l: x, t: y, r: x + w, b: y + h }),
          rank,
          off: Math.abs(y + h / 2 - cy),
        });
      }
      return;
    }
    const y = clamp(side === 'top' ? t.t - GAP - h : t.b + GAP, M, vh - h - M);
    const reach = (x: number) => [Math.max(x + TAIL_PAD, t.l), Math.min(x + w - TAIL_PAD, t.r)];
    const xs = [
      cx - w / 2,
      t.l,
      t.r - w,
      ...[...avoid, ...shy].flatMap((a) => [a.l - w - 8, a.r + 8]),
    ]
      .map((x) => clamp(x, M, vw - w - M))
      .filter((x) => reach(x)[1]! - reach(x)[0]! >= 0);
    if (xs.length === 0) xs.push(clamp(cx - w / 2, M, vw - w - M));
    for (const x of xs) {
      const [lo, hi] = reach(x);
      const tail = hi! >= lo! ? (lo! + hi!) / 2 - x : cx - x;
      cands.push({
        place: { mode: 'float', x, y, side, tail: clamp(tail, TAIL_PAD, w - TAIL_PAD) },
        cost: cost({ l: x, t: y, r: x + w, b: y + h }),
        rank,
        off: Math.abs(x + w / 2 - cx),
      });
    }
  });
  // 넓이 차이가 아주 작으면(가장자리 몇 줄) 같은 점수로 본다
  const q = (c: Cand) => Math.round(c.cost / 4000);
  return cands.reduce((a, b) =>
    q(b) < q(a) || (q(b) === q(a) && (b.rank < a.rank || (b.rank === a.rank && b.off < a.off)))
      ? b
      : a,
  ).place;
}

/**
 * 가리킬 곳이 없을 때: 무대(region) 안에서 밝게 남긴 곳·비킬 곳을 가장 덜 가리는 자리.
 * 점수가 같으면 기본 자리(home)에 가장 가까운 곳.
 */
function placeFree(
  home: { x: number; y: number },
  region: Box,
  w: number,
  h: number,
  vw: number,
  vh: number,
  avoid: Box[],
  shy: Box[],
): Place {
  const xs = [
    home.x,
    region.l + M,
    region.r - w - M,
    ...[...avoid, ...shy].flatMap((a) => [a.l - w - 8, a.r + 8]),
  ];
  const ys = [
    home.y,
    region.t + M,
    region.b - h - M,
    ...[...avoid, ...shy].flatMap((a) => [a.t - h - 8, a.b + 8]),
  ];
  let best = { x: home.x, y: home.y, cost: Infinity, off: Infinity };
  for (const rx of xs)
    for (const ry of ys) {
      const x = clamp(rx, Math.max(M, region.l), Math.min(vw, region.r) - w - M);
      const y = clamp(ry, Math.max(M, region.t), Math.min(vh, region.b) - h - M);
      const box = { l: x, t: y, r: x + w, b: y + h };
      const c = Math.round(
        (avoid.reduce((n, a) => n + area(box, a), 0) * W_AVOID +
          shy.reduce((n, a) => n + area(box, a), 0) * W_SHY) /
          4000,
      );
      const off = Math.hypot(x - home.x, y - home.y);
      if (c < best.cost || (c === best.cost && off < best.off)) best = { x, y, cost: c, off };
    }
  return { mode: 'float', x: best.x, y: best.y, side: null, tail: 0 };
}

const samePlace = (a: Place | null, b: Place) =>
  !!a &&
  a.mode === b.mode &&
  (a.mode === 'sheet' ||
    (b.mode === 'float' &&
      a.side === b.side &&
      Math.abs(a.x - b.x) < 0.5 &&
      Math.abs(a.y - b.y) < 0.5 &&
      Math.abs(a.tail - b.tail) < 0.5));

const noop = () => () => {};

/**
 * 튜토리얼 단계 안내. 가리키는 곳 바로 옆에 붙는 작은 말풍선이고, 꼬리가 대상을 가리킨다.
 * 좁은 화면(760px 이하)에서는 화면 아래에서 올라오는 시트(높이 최대 35%)가 된다.
 * 긴 설명(points)은 "더 보기"로 접어 둔다.
 *
 * 무대는 넘치는 부분을 잘라 내고 고정 위치의 기준도 바꾸기 때문에, 말풍선은 body로 꺼내서 그린다.
 * 놓인 자리에는 빈 표식만 남겨서, 가리킬 곳이 없을 때 그 자리를 기준으로 선다.
 */
export function CoachMark({
  coach,
  onHide,
  hideLabel = '안내 숨기기',
  anchor,
  avoid = [],
  shy = [],
  region,
  pinned = false,
}: Props) {
  const home = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [more, setMore] = useState(false);
  const moreId = useId();
  // 선택자 목록은 매번 새 배열이라 내용으로 비교한다
  const avoidKey = avoid.join('\n');
  const shyKey = shy.join('\n');
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  // 매 프레임 대상 자리를 다시 잰다 (스크롤·창 크기·굴림 패널이 움직여도 따라간다)
  useLayoutEffect(() => {
    if (!client) return;
    let raf = 0;
    let last: Place | null = null;
    let wasLeaving = false;
    const tick = () => {
      const el = box.current;
      const spot = home.current;
      if (el && spot) {
        // <Presence>가 사라지는 중이라고 표시하면 말풍선도 같이 흐려진다 (body로 꺼내 그려서 따로 알려 줘야 한다)
        const nowLeaving = !!spot.closest('[data-leaving]');
        if (nowLeaving !== wasLeaving) setLeaving((wasLeaving = nowLeaving));
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let next: Place;
        if (window.matchMedia(SHEET_QUERY).matches) next = { mode: 'sheet' };
        else {
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          const t = anchor ? visibleBoxes(anchor)[0] : undefined;
          const keepClear = avoidKey ? avoidKey.split('\n').flatMap(visibleBoxes) : [];
          const soft = shyKey ? shyKey.split('\n').flatMap(visibleBoxes) : [];
          // 가리킬 곳이 없으면 무대 위 안내 자리(.coachSlot)의 오른쪽 위 모서리가 기본 자리다
          const s = spot.getBoundingClientRect();
          const home = { x: clamp(s.right - w, M, vw - w - M), y: clamp(s.top, M, vh - h - M) };
          const zone = region ? visibleBoxes(region)[0] : undefined;
          if (t) next = placeBeside(t, w, h, vw, vh, keepClear, soft);
          else if (zone) next = placeFree(home, zone, w, h, vw, vh, keepClear, soft);
          else next = { mode: 'float', ...home, side: null, tail: 0 };
        }
        if (!samePlace(last, next)) setPlace((last = next));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [anchor, avoidKey, shyKey, region, client]);

  // 시트가 떠 있는 동안에는 페이지 끝에 시트 높이만큼 여백을 둬서 맨 아래 행동 목록도 가려지지 않게 한다.
  // 화면 아래에 붙는 행동 띠(Dock)·판정 시트(RollSheet)·예고 카드는 --coach-sheet만큼 시트 위로 올라앉는다
  // (튜토리얼을 다 마친 자유 진행처럼 Spotlight가 없을 때도 같다)
  const sheet = place?.mode === 'sheet';
  useLayoutEffect(() => {
    if (!sheet) return;
    const el = box.current;
    if (!el) return;
    const body = document.body;
    const root = document.documentElement;
    const sync = () => {
      body.style.paddingBottom = `${el.offsetHeight + M}px`;
      root.style.setProperty('--coach-sheet', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      body.style.paddingBottom = '';
      root.style.removeProperty('--coach-sheet');
    };
  }, [sheet]);

  const points = coach.points ?? [];
  const style =
    place?.mode === 'float'
      ? ({ left: place.x, top: place.y, '--tail': `${place.tail}px` } as React.CSSProperties)
      : undefined;

  const bubble = (
    <div
      ref={box}
      className={styles.coach}
      role="status"
      aria-live="polite"
      data-coach
      data-clear={coach.clear || undefined}
      data-pinned={pinned || undefined}
      data-sheet={sheet || undefined}
      data-side={place?.mode === 'float' ? (place.side ?? 'none') : undefined}
      data-ready={place ? '' : undefined}
      data-leaving-coach={leaving || undefined}
      inert={leaving || undefined}
      style={style}
    >
      <span className={styles.tail} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.head}>
          {coach.chapter && <span className={styles.chapter}>{coach.chapter}</span>}
          <span className={styles.step}>
            {coach.clear ? '완료' : `${coach.step} / ${coach.total}`}
          </span>
          <ol className={styles.dots} aria-hidden>
            {Array.from({ length: coach.total }, (_, i) => (
              <li key={i} data-on={i < coach.step || undefined} />
            ))}
          </ol>
          <button type="button" className={styles.hide} onClick={onHide}>
            {hideLabel}
          </button>
        </div>
        <p className={styles.title}>{coach.title}</p>
        <p className={styles.body}>{coach.body}</p>
        {coach.example && <p className={styles.example}>{coach.example}</p>}
        {points.length > 0 && (
          <>
            <button
              type="button"
              className={styles.more}
              aria-expanded={more}
              aria-controls={moreId}
              data-more
              onClick={() => setMore((m) => !m)}
            >
              {more ? '접기' : (coach.moreLabel ?? '더 보기')}
              <span aria-hidden>{more ? '▴' : '▾'}</span>
            </button>
            <ul className={styles.points} id={moreId} hidden={!more}>
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}
        {((coach.keys && coach.keys.length > 0) || coach.next) && (
          <div className={styles.foot}>
            {coach.keys && coach.keys.length > 0 && (
              <p className={styles.keys}>
                <span>단축키</span>
                {coach.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </p>
            )}
            {coach.next && (
              <button type="button" className={styles.next} onClick={coach.next.onClick} autoFocus>
                {coach.next.label}
                <span aria-hidden> →</span>
              </button>
            )}
          </div>
        )}
        {coach.links && coach.links.length > 0 && (
          <p className={styles.links}>
            {coach.links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <span ref={home} className={styles.home} aria-hidden />
      {client && createPortal(bubble, document.body)}
    </>
  );
}
