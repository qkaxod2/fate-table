'use client';

import type { DieFace } from '@fate/rules-engine';
import { useEffect, useRef } from 'react';
import { playSfx, tap } from '@/fx/sfx';
import styles from './DiceGL.module.css';

/*
 * 시험판: Three.js로 그린 페이트 주사위 (docs/threejs-review.md 1번).
 * Dice3D와 약속이 같다. 같은 rollKey면 모두에게 같은 궤적, 결과는 처음부터 정해져 있다.
 * 물리 엔진 없이 정해진 궤적(떨어짐 → 두 번 튀김 → 미끄러짐)에 회전을 얹는다.
 * 회전은 "마지막 자세에서 거꾸로 감아 둔 만큼 풀리는" 방식이라 끝 자세가 정확히 결과 면이다.
 * three는 이 화면이 처음 열릴 때만 따로 받아 온다(번들을 나눈다).
 */

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** BoxGeometry 면 순서(+x, −x, +y, −y, +z, −z)에 놓을 눈 */
const GLYPHS = ['+', '−', '', '', '+', '−'] as const;

/** 결과 면이 위를 보게 할 주사위 안쪽 축 (두 후보 중 하나) */
const UP_AXES: Record<DieFace, ReadonlyArray<readonly [number, number, number]>> = {
  1: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  [-1]: [
    [-1, 0, 0],
    [0, 0, -1],
  ],
  0: [
    [0, 1, 0],
    [0, -1, 0],
  ],
};

interface Props {
  dice: readonly DieFace[];
  rollKey: string;
  tone?: 'me' | 'op';
  onSettled?: () => void;
}

const DIE = 1;
const GAP = 0.42;

export function DiceGL({ dice, rollKey, tone = 'me', onSettled }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const THREE = await import('three');
      const { RoundedBoxGeometry } =
        await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
      if (disposed) return;

      const css = getComputedStyle(el);
      const read = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;
      const op = tone === 'op';
      const body = read(op ? '--dice-body-op' : '--dice-body', op ? '#2a2d36' : '#f4f2ed');
      const pip = read(op ? '--dice-pip-op' : '--dice-pip', op ? '#eef0f3' : '#1c1e25');
      const table = read('--dice-table', '#dcd8cf');

      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const span = dice.length * DIE + (dice.length - 1) * GAP;
      // 거의 위에서 내려다본다(윗면이 결과). 주사위 줄이 판 너비의 2/3쯤 차게 거리를 잡는다
      const FOV = 26;
      const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
      const aim = () => {
        const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
        const d = Math.max((span * 1.5) / (2 * tan * camera.aspect), (DIE * 3.2) / (2 * tan));
        camera.position.set(0, d * 0.9, d * 0.44);
        camera.lookAt(0, DIE * 0.5, 0);
      };
      aim();

      // 탁자 위 등불 하나 + 방 안의 흐린 빛
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x3a3226, 0.9));
      const lamp = new THREE.DirectionalLight(0xffe2b4, 2.4);
      lamp.position.set(-2.5, 6, 3);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(1024, 1024);
      lamp.shadow.radius = 6;
      lamp.shadow.bias = -0.0008;
      const sc = lamp.shadow.camera;
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      scene.add(lamp);

      // 판정 기록지(종이) 바닥: 그림자만 받는다
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(span * 4, span * 4),
        new THREE.ShadowMaterial({ color: 0x1a140a, opacity: 0.24 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      el.style.setProperty('--felt', table);

      // 면마다 눈을 그린 캔버스 텍스처
      const faceTex = (glyph: string) => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d')!;
        g.fillStyle = body;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = pip;
        const t = 30;
        const l = 70;
        if (glyph === '+' || glyph === '−') g.fillRect(128 - l, 128 - t / 2 - 0, l * 2, t);
        if (glyph === '+') g.fillRect(128 - t / 2, 128 - l, t, l * 2);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
      };
      const textures = GLYPHS.map(faceTex);
      const materials = textures.map(
        (map) => new THREE.MeshStandardMaterial({ map, roughness: op ? 0.45 : 0.38, metalness: 0 }),
      );
      const geometry = new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.14);

      const rand = mulberry32(hashKey(rollKey));
      const up = new THREE.Vector3(0, 1, 0);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      type Track = {
        mesh: InstanceType<typeof THREE.Mesh>;
        qEnd: InstanceType<typeof THREE.Quaternion>;
        axis: InstanceType<typeof THREE.Vector3>;
        spin: number;
        from: InstanceType<typeof THREE.Vector3>;
        to: InstanceType<typeof THREE.Vector3>;
        delay: number;
        dur: number;
        knocked: boolean;
      };

      const tracks: Track[] = dice.map((face, i) => {
        const mesh = new THREE.Mesh(geometry, materials);
        mesh.castShadow = true;
        scene.add(mesh);
        const axes = UP_AXES[face];
        const a = axes[rand() < 0.5 ? 0 : 1]!;
        // 윗면의 −가 세로로 서서 'I'처럼 읽히지 않게, 막대가 화면 가로로 눕는 방향을 고른 뒤 살짝만 비튼다
        const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...a), up);
        const bar = new THREE.Vector3(-a[2], 0, a[0]).applyQuaternion(base);
        const snap = bar.lengthSq() > 0.5 ? -Math.atan2(-bar.z, bar.x) : 0;
        const qEnd = base.premultiply(
          new THREE.Quaternion().setFromAxisAngle(up, snap + (rand() - 0.5) * 0.24),
        );
        const axis = new THREE.Vector3(rand() - 0.5, rand() * 0.4, rand() - 0.5).normalize();
        const x = -span / 2 + DIE / 2 + i * (DIE + GAP);
        const z = (rand() - 0.5) * 0.25;
        return {
          mesh,
          qEnd,
          axis,
          spin: Math.PI * (3 + rand() * 2),
          from: new THREE.Vector3(x - 1.6 - rand(), 0, z + 1.2 + rand() * 0.6),
          to: new THREE.Vector3(x, 0, z),
          delay: i * 110,
          dur: 1150 + i * 120,
          knocked: false,
        };
      });

      // 높이: 떨어짐 → 두 번 튀김. t는 0..1
      const BOUNCES = [
        [0, 0.38, 2.6],
        [0.38, 0.66, 0.7],
        [0.66, 0.84, 0.18],
      ] as const;
      const height = (t: number) => {
        if (t < BOUNCES[0][1]) {
          const k = t / BOUNCES[0][1];
          return BOUNCES[0][2] * (1 - k * k);
        }
        for (const [s, e, peak] of BOUNCES.slice(1)) {
          if (t < e) {
            const k = (t - s) / (e - s);
            return peak * 4 * k * (1 - k);
          }
        }
        return 0;
      };
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      const half = DIE / 2;

      const place = (tr: Track, t: number) => {
        const p = easeOut(t);
        tr.mesh.position.lerpVectors(tr.from, tr.to, p);
        tr.mesh.position.y = half + height(t);
        const unwind = tr.spin * (1 - easeOut(Math.min(1, t * 1.08)));
        tr.mesh.quaternion.setFromAxisAngle(tr.axis, unwind).multiply(tr.qEnd);
      };

      let raf = 0;
      const t0 = performance.now();
      const frame = (now: number) => {
        let done = true;
        for (const tr of tracks) {
          const t = Math.min(1, Math.max(0, (now - t0 - tr.delay) / tr.dur));
          if (t < 1) done = false;
          place(tr, t);
          if (!tr.knocked && t >= BOUNCES[0][1]) {
            tr.knocked = true;
            playSfx('dice-settle', 0.16, 1.15 + tracks.indexOf(tr) * 0.08);
            tap(8);
          }
        }
        renderer.render(scene, camera);
        if (done) {
          onSettled?.();
          return;
        }
        raf = requestAnimationFrame(frame);
      };

      if (reduced) {
        tracks.forEach((tr) => place(tr, 1));
        renderer.render(scene, camera);
        onSettled?.();
      } else {
        raf = requestAnimationFrame(frame);
      }

      const ro = new ResizeObserver(() => {
        const nw = Math.max(1, el.clientWidth);
        const nh = Math.max(1, el.clientHeight);
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        aim();
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      });
      ro.observe(el);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geometry.dispose();
        materials.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // rollKey가 바뀔 때만 다시 굴린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, tone]);

  return (
    <div
      ref={host}
      className={styles.stage}
      role="img"
      aria-label={dice
        .map((f) => (f === 1 ? '플러스' : f === -1 ? '마이너스' : '빈 면'))
        .join(', ')}
    />
  );
}
