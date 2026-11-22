// 세션 결산: 이벤트 기록을 한 번 훑어 운명점 흐름, 많이 발동된 특성, 대성공 같은 숫자를 모은다.
import {
  initialState,
  reduce,
  undoneSeqs,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';

export interface FatePoint {
  seq: number;
  /** 캐릭터 id → 그 순간 운명점 */
  values: Record<string, number>;
}

export interface SessionReport {
  number: number;
  title?: string;
  scenes: string[];
  rolls: number;
  /** 결과별 판정 수 */
  outcomes: { style: number; success: number; tie: number; fail: number };
  invokes: number;
  topAspects: Array<{ text: string; count: number }>;
  compelsAccepted: number;
  compelsRefused: number;
  takenOut: number;
  /** PC 운명점 흐름 (그래프용) */
  pcs: Array<{ id: string; name: string }>;
  fate: FatePoint[];
  /** 굴림을 가장 많이 한 캐릭터 */
  busiest?: { name: string; rolls: number };
}

/**
 * 마지막(또는 sessionNumber번째) 세션을 결산한다. 세션이 하나도 없으면 null.
 * 되돌린 이벤트는 빼고 센다.
 */
export function sessionReport(
  events: readonly RoomEvent[],
  sessionNumber?: number,
): SessionReport | null {
  const undone = undoneSeqs(events);
  const live = events.filter((e) => !undone.has(e.seq));
  const starts = live.filter(
    (e): e is RoomEvent<'session.started'> => e.type === 'session.started',
  );
  const start =
    sessionNumber === undefined
      ? starts.at(-1)
      : starts.find((e) => e.payload.number === sessionNumber);
  if (!start) return null;

  let s: RoomState = initialState();
  let inSession = false;
  const report: SessionReport = {
    number: start.payload.number,
    ...(start.payload.title ? { title: start.payload.title } : {}),
    scenes: [],
    rolls: 0,
    outcomes: { style: 0, success: 0, tie: 0, fail: 0 },
    invokes: 0,
    topAspects: [],
    compelsAccepted: 0,
    compelsRefused: 0,
    takenOut: 0,
    pcs: [],
    fate: [],
  };
  const aspectCount = new Map<string, number>();
  const rollsBy = new Map<string, number>();
  const sample = (seq: number) => {
    const values: Record<string, number> = {};
    for (const c of Object.values(s.characters)) if (!c.isNpc) values[c.id] = c.fatePoints;
    report.fate.push({ seq, values });
  };

  for (const e of live) {
    if (e === start) inSession = true;
    if (!inSession) {
      s = reduce(s, e);
      continue;
    }
    // 이벤트를 적용하기 전에 봐야 하는 것 (지워지는 특성 이름 등)
    if (e.type === 'invoke.applied') {
      const text = s.aspects[e.payload.aspectId]?.text;
      if (text) aspectCount.set(text, (aspectCount.get(text) ?? 0) + 1);
      report.invokes++;
    }
    s = reduce(s, e);
    switch (e.type) {
      case 'session.started':
        sample(e.seq);
        break;
      case 'scene.started':
        report.scenes.push(e.payload.name);
        break;
      case 'roll.resolved':
      case 'roll.opposition_requested': {
        report.rolls++;
        const id = e.type === 'roll.resolved' ? e.payload.side.characterId : e.payload.attackerId;
        rollsBy.set(id, (rollsBy.get(id) ?? 0) + 1);
        break;
      }
      case 'roll.finalized':
        report.outcomes[e.payload.outcome]++;
        break;
      case 'compel.accepted':
        report.compelsAccepted++;
        break;
      case 'compel.refused':
        report.compelsRefused++;
        break;
      case 'character.taken_out':
        report.takenOut++;
        break;
    }
    if (
      e.type === 'fate.adjusted' ||
      e.type === 'invoke.applied' ||
      e.type === 'invoke.revoked' ||
      e.type === 'compel.accepted' ||
      e.type === 'compel.refused' ||
      e.type === 'character.conceded'
    )
      sample(e.seq);
    if (e.type === 'session.ended') break;
  }
  report.pcs = Object.values(s.characters)
    .filter((c) => !c.isNpc)
    .map((c) => ({ id: c.id, name: c.name }));
  report.topAspects = [...aspectCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([text, count]) => ({ text, count }));
  const [busyId, busyN] = [...rollsBy.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const busyName = busyId ? s.characters[busyId]?.name : undefined;
  if (busyName && busyN) report.busiest = { name: busyName, rolls: busyN };
  return report;
}
