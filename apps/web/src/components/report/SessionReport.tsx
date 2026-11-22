'use client';

// 세션 결산 카드: 판정 수와 결과, 많이 발동된 특성, 강요, 운명점 흐름 그래프.
import { term } from '@fate/glossary';
import { useState } from 'react';
import { Leaf } from '@/components/book/Leaf';
import type { SessionReport as Report } from '@/lib/sessionReport';
import styles from './SessionReport.module.css';

/** 캐릭터마다 정해진 순서로 색을 준다 (순위가 바뀌어도 같은 캐릭터는 같은 색) */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

export function SessionReport({ report, onClose }: { report: Report; onClose: () => void }) {
  const { outcomes } = report;
  return (
    <Leaf
      title={`세션 ${report.number} 결산`}
      kicker={report.title ?? (report.scenes.length ? report.scenes.join(' → ') : undefined)}
      label="세션 결산"
      onClose={onClose}
      size="lg"
    >
      <div className={styles.tiles}>
        <Tile n={report.scenes.length} label="장면" />
        <Tile n={report.rolls} label="판정" />
        <Tile n={outcomes.style} label={term('style')} />
        <Tile n={report.invokes} label={term('invoke')} />
        <Tile n={report.compelsAccepted} label={`${term('compel')} 수락`} />
        <Tile n={report.takenOut} label={term('takenOut')} />
      </div>
      {report.rolls > 0 && (
        <p className={styles.line}>
          결과: {term('style')} {outcomes.style} · {term('success')} {outcomes.success} ·{' '}
          {term('tie')} {outcomes.tie} · {term('fail')} {outcomes.fail}
          {report.busiest &&
            ` · 가장 많이 굴린 캐릭터: ${report.busiest.name}(${report.busiest.rolls}번)`}
        </p>
      )}
      {report.topAspects.length > 0 && (
        <section>
          <h3 className={styles.h}>가장 많이 발동된 {term('aspect')}</h3>
          <ol className={styles.top}>
            {report.topAspects.map((a) => (
              <li key={a.text}>
                「{a.text}」 <small>{a.count}번</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      {report.pcs.length > 0 && report.fate.length > 1 && (
        <section>
          <h3 className={styles.h}>{term('fatePoint')} 흐름</h3>
          <FateChart report={report} />
        </section>
      )}
    </Leaf>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className={styles.tile}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

const W = 560;
const H = 180;
const PAD = { l: 28, r: 72, t: 10, b: 22 };

/** 캐릭터별 운명점 계단 선. 마우스를 올리면 그 순간 값이 보이고, 표로도 볼 수 있다 */
export function FateChart({ report }: { report: Report }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pts = report.fate;
  const max = Math.max(3, ...pts.flatMap((p) => Object.values(p.values)));
  const x = (i: number) => PAD.l + (i / Math.max(1, pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const pcs = report.pcs.slice(0, SERIES.length);
  const path = (id: string) =>
    pts
      .map((p, i) => {
        const v = p.values[id] ?? 0;
        if (i === 0) return `M${x(0)},${y(v)}`;
        return `H${x(i)}V${y(v)}`;
      })
      .join('');
  const at = hover ?? pts.length - 1;
  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        {pcs.map((c, i) => (
          <span key={c.id}>
            <i style={{ background: SERIES[i] }} aria-hidden />
            {c.name} <b>{pts[at]?.values[c.id] ?? 0}</b>
          </span>
        ))}
        <button type="button" className={styles.toggle} onClick={() => setTable((t) => !t)}>
          {table ? '그래프로' : '표로 보기'}
        </button>
      </div>
      {table ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>순간</th>
              {pcs.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pts.map((p, i) => (
              <tr key={p.seq}>
                <td>{i === 0 ? '시작' : i}</td>
                {pcs.map((c) => (
                  <td key={c.id}>{p.values[c.id] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${term('fatePoint')} 흐름 그래프`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1));
            setHover(Math.max(0, Math.min(pts.length - 1, i)));
          }}
        >
          {Array.from({ length: max + 1 }, (_, v) => (
            <g key={v} className={styles.grid}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {hover !== null && (
            <line className={styles.cross} x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />
          )}
          {pcs.map((c, i) => (
            <path key={c.id} d={path(c.id)} stroke={SERIES[i]} className={styles.series} />
          ))}
          {labelYs(pcs.map((c) => y(pts.at(-1)?.values[c.id] ?? 0))).map((ly, i) => (
            <text key={pcs[i]!.id} x={W - PAD.r + 6} y={ly + 4} className={styles.label}>
              <tspan fill={SERIES[i]}>●</tspan> {pcs[i]!.name}
            </text>
          ))}
          {hover !== null &&
            pcs.map((c, i) => (
              <circle
                key={c.id}
                cx={x(hover)}
                cy={y(pts[hover]?.values[c.id] ?? 0)}
                r={4}
                fill={SERIES[i]}
                className={styles.dot}
              />
            ))}
        </svg>
      )}
    </div>
  );
}

/** 끝 이름표가 겹치지 않게 최소 13px씩 띄운다 (원래 높이 순서는 지킨다) */
function labelYs(ys: number[]): number[] {
  const order = ys.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = [...ys];
  let last = -Infinity;
  for (const [v, i] of order) {
    const at = Math.max(v, last + 13);
    out[i] = at;
    last = at;
  }
  return out;
}
