import { startOfSessionFatePoints } from './character';
import { applyInvoke } from './invoke';
import type { EventPayloads, EventType, RoomEvent, SealedSide } from './events';
import type { Character, RollSide, RoomState } from './types';

export function initialState(): RoomState {
  return {
    seq: 0,
    members: {},
    characters: {},
    aspects: {},
    session: null,
    sessionsPlayed: 0,
    scene: null,
    gmPool: 0,
    rolls: {},
    activeRollId: null,
    compels: {},
    pendingDamage: {},
    conflict: null,
    contest: null,
    challenge: null,
    tokens: {},
  };
}

function toSide(s: SealedSide): RollSide {
  return { ...s, paidInvokes: [] };
}

function mapCharacters(state: RoomState, fn: (c: Character) => Character): RoomState['characters'] {
  return Object.fromEntries(Object.entries(state.characters).map(([id, c]) => [id, fn(c)]));
}

function patchCharacter(state: RoomState, id: string, fn: (c: Character) => Character): RoomState {
  const c = state.characters[id];
  if (!c) return state;
  return { ...state, characters: { ...state.characters, [id]: fn(c) } };
}

function withoutKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = rec;
  return rest;
}

/** 운명점 변경. NPC나 'gm_pool'이면 GM 풀에서 처리. 0 미만으로 내려가지 않는다. */
function adjustFate(state: RoomState, target: string, delta: number): RoomState {
  const c = state.characters[target];
  if (target === 'gm_pool' || c?.isNpc)
    return { ...state, gmPool: Math.max(0, state.gmPool + delta) };
  return patchCharacter(state, target, (ch) => ({
    ...ch,
    fatePoints: Math.max(0, ch.fatePoints + delta),
  }));
}

type Handler<K extends EventType> = (
  s: RoomState,
  p: EventPayloads[K],
  e: RoomEvent<K>,
) => RoomState;
type Handlers = { [K in EventType]: Handler<K> };

const handlers: Handlers = {
  'room.member_joined': (s, p) => ({ ...s, members: { ...s.members, [p.userId]: p } }),

  'session.started': (s, p) => ({
    ...s,
    session: { id: p.sessionId, number: p.number },
    sessionsPlayed: Math.max(s.sessionsPlayed, p.number),
    characters: mapCharacters(s, (c) =>
      c.isNpc
        ? c
        : {
            ...c,
            fatePoints: startOfSessionFatePoints(c),
            stunts: c.stunts.map((st) => ({ ...st, usedThisSession: false })),
          },
    ),
  }),

  'session.ended': (s, p) => {
    // 중상: 회복을 시작한 세션이 아닌 다음 세션이 끝날 때 해제
    let next = s;
    for (const c of Object.values(s.characters)) {
      const mod = c.consequences.moderate;
      if (mod?.recovering && mod.recoveringSince?.sessionId !== p.sessionId) {
        next = clearConsequence(next, c.id, 'moderate');
      }
    }
    return { ...next, session: null };
  },

  'scene.started': (s, p) => ({
    ...s,
    scene: {
      id: p.sceneId,
      name: p.name,
      pcIds: p.pcIds,
      zones: Object.fromEntries(p.zones.map((z) => [z.id, z])),
      ...(p.backgroundAssetId ? { backgroundAssetId: p.backgroundAssetId } : {}),
    },
    // GM 운명점 풀은 장면마다 그 장면의 PC 수로 재설정
    gmPool: p.pcIds.length,
  }),

  'scene.ended': (s, p) => {
    const zoneIds = new Set(Object.keys(s.scene?.zones ?? {}));
    const aspects = Object.fromEntries(
      Object.entries(s.aspects).filter(([, a]) => {
        if (a.kind === 'boost') return false;
        if (a.ownerType === 'scene' && a.ownerId === p.sceneId) return false;
        if (a.ownerType === 'zone' && zoneIds.has(a.ownerId)) return false;
        return true;
      }),
    );
    let next: RoomState = {
      ...s,
      aspects,
      scene: null,
      characters: mapCharacters(s, (c) => ({
        ...c,
        stress: [false, false, false],
        takenOut: false,
      })),
      conflict: null,
      contest: null,
      challenge: null,
      tokens: {},
      compels: {},
      pendingDamage: {},
    };
    // 경상: 회복을 시작한 장면이 아닌 다음 장면이 끝날 때 해제
    for (const c of Object.values(next.characters)) {
      const mild = c.consequences.mild;
      if (mild?.recovering && mild.recoveringSince?.sceneId !== p.sceneId) {
        next = clearConsequence(next, c.id, 'mild');
      }
    }
    return next;
  },

  'character.created': (s, p) => ({
    ...s,
    characters: { ...s.characters, [p.character.id]: p.character },
  }),
  'character.updated': (s, p) =>
    patchCharacter(s, p.id, (c) => {
      const next = { ...c, ...p.patch };
      if (!p.milestoneUsed) return next;
      const { milestone: _used, ...rest } = next;
      return rest;
    }),
  'milestone.granted': (s, p) =>
    p.characterIds.reduce(
      (acc, id) => patchCharacter(acc, id, (c) => ({ ...c, milestone: p.size })),
      s,
    ),

  'aspect.added': (s, p) => ({ ...s, aspects: { ...s.aspects, [p.aspect.id]: p.aspect } }),
  'aspect.revealed': (s, p) => ({
    ...s,
    aspects: { ...s.aspects, [p.aspect.id]: { ...p.aspect, hidden: false } },
  }),
  'aspect.updated': (s, p) => {
    const a = s.aspects[p.aspectId];
    return a ? { ...s, aspects: { ...s.aspects, [a.id]: { ...a, text: p.text } } } : s;
  },
  'aspect.removed': (s, p) => ({ ...s, aspects: withoutKey(s.aspects, p.aspectId) }),

  'roll.resolved': (s, p) => ({
    ...s,
    activeRollId: p.rollId,
    rolls: {
      ...s.rolls,
      [p.rollId]: {
        id: p.rollId,
        action: p.action,
        active: toSide(p.side),
        defense: null,
        difficulty: p.difficulty,
        targetId: p.targetId,
        status: 'open',
      },
    },
  }),

  'roll.opposition_requested': (s, p) => ({
    ...s,
    activeRollId: p.rollId,
    rolls: {
      ...s.rolls,
      [p.rollId]: {
        id: p.rollId,
        action: p.action,
        active: {
          characterId: p.attackerId,
          approach: p.approach,
          rating: 0,
          dice: null,
          animSeed: null,
          modifiers: [],
          paidInvokes: [],
        },
        defense: null,
        difficulty: null,
        targetId: p.defenderId,
        status: 'awaiting_defense',
      },
    },
  }),

  'roll.opposition_revealed': (s, p) => {
    const r = s.rolls[p.rollId];
    if (!r) return s;
    return {
      ...s,
      rolls: {
        ...s.rolls,
        [r.id]: { ...r, active: toSide(p.attacker), defense: toSide(p.defender), status: 'open' },
      },
    };
  },

  'invoke.applied': (s, p) => {
    const r = s.rolls[p.rollId];
    const a = s.aspects[p.aspectId];
    if (!r || !a) return s;
    let next: RoomState = {
      ...s,
      rolls: {
        ...s.rolls,
        [r.id]: (() => {
          const rolled = applyInvoke(r, {
            side: p.side,
            aspectId: p.aspectId,
            mode: p.mode,
            paidWith: p.paidWith,
            ...(p.newDice ? { newDice: p.newDice } : {}),
          });
          if (p.newAnimSeed === undefined) return rolled;
          const key = p.side === 'active' ? 'active' : 'defense';
          return { ...rolled, [key]: { ...rolled[key]!, animSeed: p.newAnimSeed } };
        })(),
      },
    };
    if (p.paidWith === 'fate_point') {
      next = adjustFate(next, p.payerId, -1);
    } else if (a.kind === 'boost') {
      next = { ...next, aspects: withoutKey(next.aspects, a.id) };
    } else {
      next = {
        ...next,
        aspects: { ...next.aspects, [a.id]: { ...a, freeInvokes: a.freeInvokes - 1 } },
      };
    }
    return next;
  },

  'stunt.applied': (s, p) => {
    const r = s.rolls[p.rollId];
    if (!r) return s;
    const key = p.side === 'active' ? 'active' : 'defense';
    const side = r[key];
    if (!side) return s;
    const updated = {
      ...side,
      modifiers: [...side.modifiers, { source: `stunt:${p.stuntId}`, value: p.value }],
    };
    const next = { ...s, rolls: { ...s.rolls, [r.id]: { ...r, [key]: updated } } };
    return patchCharacter(next, side.characterId, (c) => ({
      ...c,
      stunts: c.stunts.map((st) =>
        st.id === p.stuntId && st.kind === 'once_per_session'
          ? { ...st, usedThisSession: true }
          : st,
      ),
    }));
  },

  'roll.finalized': (s, p) => {
    const r = s.rolls[p.rollId];
    if (!r) return s;
    return {
      ...s,
      activeRollId: s.activeRollId === r.id ? null : s.activeRollId,
      rolls: {
        ...s.rolls,
        [r.id]: {
          ...r,
          status: 'final',
          result: { total: p.total, shifts: p.shifts, outcome: p.outcome },
        },
      },
    };
  },

  'fate.adjusted': (s, p) => adjustFate(s, p.target, p.delta),
  'compel.offered': (s, p) => ({
    ...s,
    compels: {
      ...s.compels,
      [p.compelId]: { id: p.compelId, aspectId: p.aspectId, targetId: p.targetId, text: p.text },
    },
  }),
  'compel.accepted': (s, p) => {
    const c = s.compels[p.compelId];
    if (!c) return s;
    return adjustFate({ ...s, compels: withoutKey(s.compels, c.id) }, c.targetId, +1);
  },
  'compel.refused': (s, p) => {
    const c = s.compels[p.compelId];
    if (!c) return s;
    return adjustFate({ ...s, compels: withoutKey(s.compels, c.id) }, c.targetId, -1);
  },
  'compel.withdrawn': (s, p) => ({ ...s, compels: withoutKey(s.compels, p.compelId) }),

  'conflict.started': (s, p) => ({
    ...s,
    conflict: {
      id: p.conflictId,
      kind: p.kind,
      order: p.order,
      index: 0,
      round: 1,
      consequencesTaken: {},
    },
  }),
  'conflict.turn_advanced': (s, p) =>
    s.conflict ? { ...s, conflict: { ...s.conflict, index: p.index, round: p.round } } : s,
  'conflict.ended': (s) => ({ ...s, conflict: null }),

  'damage.pending': (s, p) => ({ ...s, pendingDamage: { ...s.pendingDamage, [p.rollId]: p } }),
  'damage.absorbed': (s, p) => {
    let next: RoomState = { ...s, pendingDamage: withoutKey(s.pendingDamage, p.rollId) };
    next = patchCharacter(next, p.targetId, (c) => {
      const stress = [...c.stress] as Character['stress'];
      if (p.stressBox) stress[p.stressBox - 1] = true;
      const consequences = { ...c.consequences };
      for (const k of p.consequences)
        consequences[k.slot] = { aspectId: k.aspectId, recovering: false };
      return { ...c, stress, consequences };
    });
    // 후유증은 특성이 되고, 공격한 쪽이 쓸 무료 발동 1을 가진다
    const aspects = { ...next.aspects };
    for (const k of p.consequences) {
      aspects[k.aspectId] = {
        id: k.aspectId,
        ownerType: 'character',
        ownerId: p.targetId,
        kind: 'consequence',
        text: k.text,
        freeInvokes: 1,
        hidden: false,
      };
    }
    next = { ...next, aspects };
    if (next.conflict && p.consequences.length) {
      const taken = next.conflict.consequencesTaken;
      next = {
        ...next,
        conflict: {
          ...next.conflict,
          consequencesTaken: {
            ...taken,
            [p.targetId]: (taken[p.targetId] ?? 0) + p.consequences.length,
          },
        },
      };
    }
    return next;
  },
  'character.conceded': (s, p) => {
    const next = adjustFate(s, p.characterId, p.fpGained);
    return patchCharacter(dropDamageFor(next, p.characterId), p.characterId, (c) => ({
      ...c,
      takenOut: true,
    }));
  },
  'character.taken_out': (s, p) =>
    patchCharacter(dropDamageFor(s, p.characterId), p.characterId, (c) => ({
      ...c,
      takenOut: true,
    })),

  'consequence.recovery_started': (s, p) =>
    patchCharacter(s, p.characterId, (c) => {
      const cur = c.consequences[p.slot];
      if (!cur) return c;
      return {
        ...c,
        consequences: {
          ...c.consequences,
          [p.slot]: {
            ...cur,
            recovering: true,
            recoveringSince: { sceneId: s.scene?.id ?? null, sessionId: s.session?.id ?? null },
          },
        },
      };
    }),
  'consequence.cleared': (s, p) => clearConsequence(s, p.characterId, p.slot),

  'contest.started': (s, p) => ({
    ...s,
    contest: {
      id: p.contestId,
      sides: p.sides,
      victories: Object.fromEntries(p.sides.map((id) => [id, 0])),
    },
  }),
  'contest.exchange': (s, p) => {
    if (!s.contest || !p.winnerId) return s;
    const v = s.contest.victories;
    return {
      ...s,
      contest: {
        ...s.contest,
        victories: { ...v, [p.winnerId]: (v[p.winnerId] ?? 0) + p.victories },
      },
    };
  },
  'contest.ended': (s) => ({ ...s, contest: null }),
  'challenge.started': (s, p) => ({
    ...s,
    challenge: { id: p.challengeId, title: p.title, steps: p.steps.map((label) => ({ label })) },
  }),
  'challenge.step': (s, p) => {
    if (!s.challenge) return s;
    const steps = s.challenge.steps.map((st, i) =>
      i === p.index ? { ...st, outcome: p.outcome } : st,
    );
    return { ...s, challenge: { ...s.challenge, steps } };
  },
  'challenge.ended': (s) => ({ ...s, challenge: null }),

  'zone.added': (s, p) =>
    s.scene ? { ...s, scene: { ...s.scene, zones: { ...s.scene.zones, [p.zone.id]: p.zone } } } : s,
  'zone.linked': (s, p) => {
    const zones = s.scene?.zones;
    const from = zones?.[p.from];
    const to = zones?.[p.to];
    if (!s.scene || !from || !to) return s;
    const link = (z: typeof from, other: string) =>
      z.links.includes(other) ? z : { ...z, links: [...z.links, other] };
    return {
      ...s,
      scene: {
        ...s.scene,
        zones: { ...zones, [from.id]: link(from, to.id), [to.id]: link(to, from.id) },
      },
    };
  },
  'zone.updated': (s, p) => {
    const z = s.scene?.zones[p.zoneId];
    if (!s.scene || !z) return s;
    const { zoneId: _id, ...patch } = p;
    return { ...s, scene: { ...s.scene, zones: { ...s.scene.zones, [z.id]: { ...z, ...patch } } } };
  },
  'zone.unlinked': (s, p) => {
    const zones = s.scene?.zones;
    const from = zones?.[p.from];
    const to = zones?.[p.to];
    if (!s.scene || !from || !to) return s;
    return {
      ...s,
      scene: {
        ...s.scene,
        zones: {
          ...zones,
          [from.id]: { ...from, links: from.links.filter((l) => l !== to.id) },
          [to.id]: { ...to, links: to.links.filter((l) => l !== from.id) },
        },
      },
    };
  },
  'zone.removed': (s, p) => {
    if (!s.scene) return s;
    const zones = Object.fromEntries(
      Object.entries(withoutKey(s.scene.zones, p.zoneId)).map(([id, z]) => [
        id,
        { ...z, links: z.links.filter((l) => l !== p.zoneId) },
      ]),
    );
    const tokens = Object.fromEntries(Object.entries(s.tokens).filter(([, z]) => z !== p.zoneId));
    const aspects = Object.fromEntries(
      Object.entries(s.aspects).filter(
        ([, a]) => !(a.ownerType === 'zone' && a.ownerId === p.zoneId),
      ),
    );
    return { ...s, scene: { ...s.scene, zones }, tokens, aspects };
  },
  'token.moved': (s, p) => ({
    ...s,
    tokens: p.zoneId
      ? { ...s.tokens, [p.characterId]: p.zoneId }
      : withoutKey(s.tokens, p.characterId),
  }),

  // 로그·미디어 전용 이벤트는 방 상태를 바꾸지 않는다 (StoryLog가 이벤트 목록에서 직접 그림)
  'chat.posted': (s) => s,
  'gm.note': (s) => s,
  'narration.posted': (s) => s,
  'sfx.played': (s) => s,
  'media.attached': (s, p) => {
    if (p.kind === 'portrait')
      return patchCharacter(s, p.target, (c) => ({
        ...c,
        ...(p.assetId ? { portraitAssetId: p.assetId } : {}),
        ...(p.url ? { portraitUrl: p.url } : {}),
      }));
    if (p.kind === 'standing' && p.url) {
      const face = p.expression ?? 'neutral';
      return patchCharacter(s, p.target, (c) => ({
        ...c,
        // 기본 스탠딩을 새로 그리면 예전 표정 차분은 버린다 (다른 그림이라 어긋난다)
        standing: face === 'neutral' ? { neutral: p.url! } : { ...c.standing, [face]: p.url! },
        ...(face === 'neutral' && p.meta ? { standingMeta: p.meta } : {}),
      }));
    }
    if (p.kind === 'scene' && s.scene?.id === p.target)
      return {
        ...s,
        scene: {
          ...s.scene,
          ...(p.assetId ? { backgroundAssetId: p.assetId } : {}),
          ...(p.url ? { backgroundUrl: p.url } : {}),
        },
      };
    return s;
  },
  'character.expression_set': (s, p) =>
    patchCharacter(s, p.characterId, (c) => {
      if (p.expression) return { ...c, expression: p.expression };
      const { expression: _gone, ...rest } = c;
      return rest;
    }),
  // 되돌리기는 replay()가 처리한다. 단일 이벤트 적용으로는 바뀌는 것이 없다.
  'event.undone': (s) => s,
};

function clearConsequence(
  s: RoomState,
  characterId: string,
  slot: 'mild' | 'moderate' | 'severe',
): RoomState {
  const c = s.characters[characterId];
  const cur = c?.consequences[slot];
  if (!c || !cur) return s;
  const { [slot]: _gone, ...consequences } = c.consequences;
  return {
    ...s,
    aspects: withoutKey(s.aspects, cur.aspectId),
    characters: { ...s.characters, [characterId]: { ...c, consequences } },
  };
}

function dropDamageFor(s: RoomState, characterId: string): RoomState {
  return {
    ...s,
    pendingDamage: Object.fromEntries(
      Object.entries(s.pendingDamage).filter(([, d]) => d.targetId !== characterId),
    ),
  };
}

export function reduce(state: RoomState, event: RoomEvent): RoomState {
  const handler = handlers[event.type] as Handler<EventType>;
  return { ...handler(state, event.payload, event as RoomEvent<EventType>), seq: event.seq };
}

/**
 * 되돌린 이벤트의 seq. 뒤에서부터 보며, 되돌려진 되돌리기는 무시한다 (= 다시 하기).
 */
export function undoneSeqs(events: readonly RoomEvent[]): Set<number> {
  const undone = new Set<number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type !== 'event.undone' || undone.has(e.seq)) continue;
    for (const q of e.payload.seqs) undone.add(q);
  }
  return undone;
}

/** 이벤트 목록을 처음부터(또는 base부터) 접는다. 되돌린 이벤트는 건너뛴다. */
export function replay(events: readonly RoomEvent[], base: RoomState = initialState()): RoomState {
  const undone = undoneSeqs(events);
  return events.reduce((s, e) => (undone.has(e.seq) ? { ...s, seq: e.seq } : reduce(s, e)), base);
}
