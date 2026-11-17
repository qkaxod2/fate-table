'use client';

import type { Ambience, SceneCondition, SceneWeather } from '@fate/rules-engine';
import { useEffect, useRef, useState } from 'react';
import styles from './SceneAmbience.module.css';

const CLEAR: Ambience = { time: 'day', weather: 'clear', conditions: [] };

/**
 * 장면 분위기 (design-system.md 33절).
 * 배경 그림은 그대로 두고, 그 위에 시간(색 곱하기 · 색 보정은 무대가 data-grade를 보고 건다) · 상태(화재 · 황사 · 안개 층) ·
 * 날씨(비 · 폭풍 · 눈 입자) · 테두리(비네트)를 겹쳐 그린다. 인물 위, 꼬리표 아래에 깔린다.
 */
export function SceneAmbience({ ambience }: { ambience?: Ambience | undefined }) {
  const a = ambience ?? CLEAR;
  const has = (c: SceneCondition) => a.conditions.includes(c);
  return (
    <div
      className={styles.root}
      data-time={a.time}
      // 무대(theater)가 이 값을 보고 배경 그림과 인물에 시간 보정 filter를 건다
      data-grade={a.time !== 'day' ? a.time : undefined}
      data-weather={a.weather}
      data-fire={has('fire') || undefined}
      data-dust={has('dust') || undefined}
      data-fog={has('fog') || undefined}
      aria-hidden
    >
      {a.time !== 'day' && <div key={a.time} className={styles.tint} />}
      {has('fire') && <div className={styles.fire} />}
      {has('dust') && (
        <div className={styles.dust}>
          <i />
        </div>
      )}
      {has('fog') && (
        <div className={styles.fog}>
          <i />
          <i />
        </div>
      )}
      <Particles weather={a.weather} fire={has('fire')} dust={has('dust')} />
      {a.weather === 'storm' && <Lightning />}
      <div className={styles.frame} />
    </div>
  );
}

/** 폭풍: 몇 초에 한 번 번개가 번쩍인다 */
function Lightning() {
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let t: number;
    const next = () => {
      t = window.setTimeout(
        () => {
          setFlash((n) => n + 1);
          next();
        },
        4000 + Math.random() * 6000,
      );
    };
    next();
    return () => window.clearTimeout(t);
  }, []);
  return flash ? <div key={flash} className={styles.flash} /> : null;
}

type Kind = 'rain' | 'snow' | 'ember' | 'mote';
interface P {
  k: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  t: number;
}

/** 불티 빛망울 한 장의 폭 (입자 반지름 1 기준, CSS px). 핵 반지름 1 + 번짐 6 정도 */
const EMBER_SPAN = 9;

/**
 * 불티 하나: 주황 핵과 붉은 번짐. 예전의 arc + shadowBlur(6)와 같은 모양을 한 번만 그려 둔다.
 * 반지름 1~2.6 입자를 한 장으로 늘려 쓰므로 번짐도 입자 크기를 따라 커진다
 */
function emberSprite(dpr: number): HTMLCanvasElement {
  const px = Math.ceil(EMBER_SPAN * 2.6 * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const r = px / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgb(255 190 100)');
  grad.addColorStop(0.18, 'rgb(255 170 70)');
  grad.addColorStop(0.24, 'rgb(255 120 30 / 0.55)');
  grad.addColorStop(0.55, 'rgb(255 120 30 / 0.12)');
  grad.addColorStop(1, 'rgb(255 120 30 / 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  return c;
}

/** 입자 한 판: 비 · 눈 · 불티 · 흙먼지. 움직임 줄이기를 켜면 그리지 않는다 */
function Particles({
  weather,
  fire,
  dust,
}: {
  weather: SceneWeather;
  fire: boolean;
  dust: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = weather !== 'clear' || fire || dust;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !active) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    const fit = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);

    const area = Math.max(0.4, (w * h) / (1440 * 900));
    const wind = weather === 'storm' ? 0.38 : 0.16;
    const spawn = (k: Kind, anywhere: boolean): P => {
      const R = Math.random;
      switch (k) {
        case 'rain': {
          const vy = (weather === 'storm' ? 1300 : 950) * (0.8 + R() * 0.4);
          return {
            k,
            x: R() * (w + 200) - 100,
            y: anywhere ? R() * h : -30,
            vx: vy * wind,
            vy,
            r: 12 + R() * 12,
            a: 0.25 + R() * 0.3,
            t: 0,
          };
        }
        case 'snow':
          return {
            k,
            x: R() * w,
            y: anywhere ? R() * h : -10,
            vx: 0,
            vy: 28 + R() * 50,
            r: 1 + R() * 2.4,
            a: 0.5 + R() * 0.5,
            t: R() * 10,
          };
        case 'ember':
          return {
            k,
            x: R() * w,
            y: anywhere ? h * (0.4 + R() * 0.6) : h + 10,
            vx: (R() - 0.5) * 30,
            vy: -(35 + R() * 70),
            r: 0.8 + R() * 1.8,
            a: 1,
            t: R() * 10,
          };
        case 'mote':
          return {
            k,
            x: anywhere ? R() * w : -10,
            y: R() * h,
            vx: 70 + R() * 110,
            vy: (R() - 0.5) * 20,
            r: 0.6 + R() * 1.4,
            a: 0.25 + R() * 0.4,
            t: R() * 10,
          };
      }
    };
    const plan: Array<[Kind, number]> = [];
    if (weather === 'rain') plan.push(['rain', 220]);
    if (weather === 'storm') plan.push(['rain', 420]);
    if (weather === 'snow') plan.push(['snow', 170]);
    if (fire) plan.push(['ember', 70]);
    if (dust) plan.push(['mote', 140]);
    // 불티의 번짐은 미리 그려 둔 빛망울을 찍는다. 매 장면 입자마다 shadowBlur를 거는 것은 무거웠다
    const glow = fire ? emberSprite(dpr) : null;
    const ps: P[] = plan.flatMap(([k, n]) =>
      Array.from({ length: Math.round(n * area) }, () => spawn(k, true)),
    );

    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        p.t += dt;
        if (p.k === 'snow') p.vx = Math.sin(p.t * 1.3) * 18;
        if (p.k === 'ember') p.vx += Math.sin(p.t * 3) * 40 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const gone =
          p.y > h + 40 || p.x > w + 120 || p.x < -140 || (p.k === 'ember' && p.y < h * 0.15);
        if (gone) {
          ps[i] = spawn(p.k, false);
          continue;
        }
        if (p.k === 'rain') {
          const len = p.r / Math.hypot(p.vx, p.vy);
          ctx.strokeStyle = `rgb(205 218 238 / ${p.a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len);
          ctx.stroke();
        } else if (p.k === 'ember' && glow) {
          const alpha =
            Math.max(0, Math.min(1, (p.y - h * 0.15) / (h * 0.5))) *
            (0.6 + 0.4 * Math.sin(p.t * 9));
          // 빛망울은 반지름 1일 때 기준으로 그렸으니 입자 크기만큼 늘린다
          const s = EMBER_SPAN * p.r;
          ctx.globalAlpha = alpha;
          ctx.drawImage(glow, p.x - s / 2, p.y - s / 2, s, s);
          ctx.globalAlpha = 1;
        } else {
          const color = p.k === 'mote' ? '214 178 120' : '255 255 255';
          ctx.fillStyle = `rgb(${color} / ${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, w, h);
    };
  }, [weather, fire, dust, active]);
  return <canvas ref={ref} className={styles.canvas} hidden={!active} />;
}
