/**
 * 스탠딩 배경 따기. 단색(흰) 배경으로 그린 전신 그림에서 배경만 투명하게 만든다.
 * 가장자리에서 시작해 배경색과 비슷한 픽셀을 따라 번지고(선화가 벽이 된다),
 * 경계 한 겹은 반투명으로 풀어 흰 테두리가 남지 않게 한다. 마지막에 그림 크기로 잘라 낸다.
 */

export interface Rgba {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface MatteOptions {
  /** 이보다 배경과 가까우면 배경 (채널별 최대 차이, 0~255) */
  hard?: number;
  /** hard~soft 사이의 경계 픽셀은 반투명 */
  soft?: number;
  /** 바깥과 이어지지 않은 배경색 섬(팔과 몸 사이 등)도 지울 최소 크기 */
  holeMin?: number;
  /** 잘라 낼 때 남길 여백 (px) */
  pad?: number;
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 네 모서리 근처 픽셀의 중앙값으로 배경색을 잡는다 */
function backgroundColor(
  src: Uint8Array,
  w: number,
  h: number,
  ch: number,
): [number, number, number] {
  const samples: number[][] = [[], [], []];
  const k = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (const [x0, y0] of [
    [0, 0],
    [w - k, 0],
    [0, h - k],
    [w - k, h - k],
  ] as const) {
    for (let y = y0; y < y0 + k; y++)
      for (let x = x0; x < x0 + k; x++) {
        const i = (y * w + x) * ch;
        for (let c = 0; c < 3; c++) samples[c]!.push(src[i + c]!);
      }
  }
  return samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]!) as [number, number, number];
}

export function matteBackground(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 3 | 4 = 4,
  opts: MatteOptions = {},
): Rgba {
  const hard = opts.hard ?? 26;
  const soft = opts.soft ?? 70;
  const holeMin = opts.holeMin ?? Math.round(width * height * 0.0015);
  const pad = opts.pad ?? 6;
  const w = width;
  const h = height;
  const n = w * h;
  const ch = channels;
  const s =
    src instanceof Uint8Array ? src : new Uint8Array(src.buffer, src.byteOffset, src.length);
  const bg = backgroundColor(s, w, h, ch);

  const dist = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * ch;
    const a = ch === 4 ? s[i + 3]! : 255;
    if (a < 8) continue; // 이미 투명하면 배경으로 본다
    dist[p] = Math.max(
      Math.abs(s[i]! - bg[0]),
      Math.abs(s[i + 1]! - bg[1]),
      Math.abs(s[i + 2]! - bg[2]),
    );
  }

  // 0 = 아직, 1 = 배경, 2 = 그림
  const mark = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (p: number) => {
    if (mark[p] === 0 && dist[p]! <= hard) {
      mark[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % w;
    const y = (p / w) | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      seed(ny * w + nx);
    }
  }

  // 바깥과 이어지지 않은 아주 평평한 배경색 덩어리 (팔과 몸 사이 빈틈)
  const strict = Math.max(4, hard >> 2);
  for (let start = 0; start < n; start++) {
    if (mark[start] !== 0 || dist[start]! > strict) continue;
    head = tail = 0;
    mark[start] = 2;
    queue[tail++] = start;
    let sum = 0;
    while (head < tail) {
      const p = queue[head++]!;
      sum += dist[p]!;
      const x = p % w;
      const y = (p / w) | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mark[q] === 0 && dist[q]! <= strict) {
          mark[q] = 2;
          queue[tail++] = q;
        }
      }
    }
    if (tail >= holeMin && sum / tail < 2) for (let i = 0; i < tail; i++) mark[queue[i]!] = 1;
  }

  const out = new Uint8Array(n * 4);
  for (let p = 0; p < n; p++) {
    const i = p * ch;
    const o = p * 4;
    if (mark[p] === 1) continue; // 투명 (0,0,0,0)
    let alpha = ch === 4 ? s[i + 3]! : 255;
    let r = s[i]!;
    let g = s[i + 1]!;
    let b = s[i + 2]!;
    const d = dist[p]!;
    if (d < soft) {
      const x = p % w;
      const y = (p / w) | 0;
      let edge = false;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mark[ny * w + nx] === 1) edge = true;
      }
      if (edge) {
        // 배경색과 섞인 비율만큼 투명하게 하고, 섞인 배경색을 빼서 원래 색을 되살린다
        const a = Math.min(1, Math.max(0, (d - hard) / (soft - hard)));
        if (a <= 0.02) continue;
        const un = (c: number, k: number) =>
          Math.min(255, Math.max(0, Math.round((c - k * (1 - a)) / a)));
        r = un(r, bg[0]);
        g = un(g, bg[1]);
        b = un(b, bg[2]);
        alpha = Math.round(alpha * a);
      }
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = alpha;
  }

  return cropToContent({ data: out, width: w, height: h }, pad);
}

/** 투명하지 않은 부분만 남기고 잘라 낸다. 아래쪽은 발이 붙도록 여백을 두지 않는다. */
export function cropToContent(img: Rgba, pad = 0): Rgba {
  const { data, width: w, height: h } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + 1);
  const cw = x1 - x0 + 1;
  const chh = y1 - y0 + 1;
  if (cw === w && chh === h) return img;
  const out = new Uint8Array(cw * chh * 4);
  for (let y = 0; y < chh; y++)
    out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
  return { data: out, width: cw, height: chh };
}
