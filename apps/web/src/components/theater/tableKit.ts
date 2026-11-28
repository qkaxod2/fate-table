// 방(RoomTable)과 튜토리얼(TryTable)이 함께 쓰는 탁자 계산. 화면 배치 상수, 발동 후보, 판정판에 꽂힌 카드.
// 두 화면은 같은 무대 컴포넌트(Duel·TraitCard·ActionMenu…)를 쓰고, 그 컴포넌트에 넘길 값을 여기서 만든다.
import { term } from '@fate/glossary';
import {
  canInvoke,
  previewInvokes,
  type Aspect,
  type Character,
  type InvokeSide,
  type RollState,
  type RoomState,
} from '@fate/rules-engine';
import type { InvokeChoice } from '@/components/roll/InvokeTray';
import type { Played } from './Duel';
import th from './theater.module.css';

/** 장면 특성 카드가 서는 자리 (무대 기준 %) */
export const TAG_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [32, 43],
  [54, 43],
  [43, 56],
  [21, 56],
  [65, 56],
  [43, 30],
];
/* 판정 중에는 판정판과 손패를 가리지 않게 양옆 두 줄로 선다 */
export const TAG_SPOTS_ROLL: ReadonlyArray<readonly [number, number]> = [
  [3, 40],
  [77, 40],
  [3, 52],
  [77, 52],
  [3, 64],
  [77, 64],
];

/** 발동할 수 없는 이유 */
export const BLOCK_REASON: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점 부족',
  ASPECT_ALREADY_INVOKED: '이번 굴림에 이미 씀',
};

/** 손패 부채꼴: 가운데는 곧게, 바깥으로 갈수록 기운다 */
export const fanOf = (i: number, n: number) => {
  const d = i - (n - 1) / 2;
  if (n <= 1 || Math.abs(d) < 0.6) return th.fan2;
  if (Math.abs(d) < 1.6) return d < 0 ? th.fan1 : th.fan3;
  return d < 0 ? th.fanL : th.fanR;
};

/** 판정에 낼 수 있는 특성: 숨기지 않은 장면·구역 특성과 판정 두 당사자의 특성 */
export function invokableAspects(state: RoomState, roll: RollState): Aspect[] {
  return Object.values(state.aspects).filter(
    (a) =>
      // 숨긴 캐릭터 특성은 GM 화면에만 있다 (NPC 자신이 발동하면 공개)
      (!a.hidden || a.ownerType === 'character') &&
      (a.ownerType !== 'character' ||
        a.ownerId === roll.active.characterId ||
        (!!roll.defense && a.ownerId === roll.defense.characterId)),
  );
}

/** 특성마다 발동 후보(+2 · 다시 굴림)나 못 쓰는 이유를 붙인다 */
export function invokeChoicesFor(
  state: RoomState,
  roll: RollState,
  aspects: readonly Aspect[],
  payer: { characterId: string; fatePoints: number },
  side: InvokeSide = 'active',
): InvokeChoice[] {
  return aspects.map((a): InvokeChoice => {
    const previews = previewInvokes(roll, [a], payer, side);
    const owner = a.ownerType === 'character' ? state.characters[a.ownerId]?.name : undefined;
    const against = a.ownerType === 'character' && a.ownerId !== payer.characterId;
    const base = { aspect: a, ...(owner ? { owner } : {}), against };
    if (previews.length === 0) {
      const check = canInvoke(
        roll,
        a,
        payer,
        side,
        a.freeInvokes > 0 ? 'free_invoke' : 'fate_point',
      );
      return {
        ...base,
        blocked: check.ok ? '쓸 수 없음' : (BLOCK_REASON[check.code] ?? '쓸 수 없음'),
      };
    }
    const bonus = previews.find((p) => p.mode === 'bonus');
    const reroll = previews.find((p) => p.mode === 'reroll');
    return { ...base, ...(bonus ? { bonus } : {}), ...(reroll ? { reroll } : {}) };
  });
}

/**
 * 판정판에 꽂힌 카드 (특기·발동). revoke를 주면 운명점이나 무료 발동으로 낸 카드에
 * 빼기 버튼이 붙는다 (특성 id를 받는다).
 */
export function playedCards(
  state: RoomState,
  modifiers: RollState['active']['modifiers'],
  character: Character | undefined,
  revoke?: (aspectId: string) => void,
): Played[] {
  return modifiers.map((m, i) => {
    if (m.source.startsWith('help:')) {
      const helper = state.characters[m.source.slice(5)];
      return { id: `${m.source}:${i}`, text: `${helper?.name ?? '동료'}의 도움`, how: '도움 +1' };
    }
    if (m.source.startsWith('stunt:')) {
      const st = character?.stunts.find((x) => `stunt:${x.id}` === m.source);
      return { id: `${m.source}:${i}`, text: st?.text ?? term('stunt'), how: term('stunt') };
    }
    const id = m.source.replace(/^aspect:/, '');
    const a = state.aspects[id] ?? m.restore;
    return {
      id,
      text: a?.text ?? term('aspect'),
      how:
        m.paidWith === 'free_invoke'
          ? a?.kind === 'boost'
            ? term('boost')
            : term('freeInvoke')
          : `${term('fatePoint')} 1`,
      onRevoke: revoke && m.paidWith ? () => revoke(id) : undefined,
    };
  });
}
