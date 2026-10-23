import { term } from '@fate/glossary';
import type { Action, Outcome, RoomEvent, RoomState } from '@fate/rules-engine';

/** 판정 연출 라벨 (design-system.md 17절). 한국어 결과 표기와 항상 같이 쓴다. */
export const JUDGE: Record<
  Outcome,
  { latin: string; tone: 'perfect' | 'great' | 'good' | 'miss' }
> = {
  style: { latin: 'PERFECT', tone: 'perfect' },
  success: { latin: 'GREAT', tone: 'great' },
  tie: { latin: 'GOOD', tone: 'good' },
  fail: { latin: 'MISS', tone: 'miss' },
};

/** 행동 × 결과 안내 문구 (design-system.md 6절) */
export const OUTCOME_COPY: Record<Action, Record<Outcome, string>> = {
  overcome: {
    fail: '실패했어요. 또는 큰 대가를 치르고 성공할 수 있어요',
    tie: '작은 대가를 치르고 성공해요',
    success: '성공!',
    style: '대성공! 부스트도 얻어요',
  },
  create_advantage: {
    fail: '특성을 만들지 못했어요 (상대가 무료 발동을 얻을 수 있어요)',
    tie: '부스트를 얻어요',
    success: '특성 + 무료 발동 1',
    style: '특성 + 무료 발동 2',
  },
  attack: {
    fail: '빗나갔어요',
    tie: '부스트를 얻어요',
    success: '차이만큼 피해를 줘요',
    style: '피해를 주거나, 피해 1을 줄이고 부스트를 얻어요',
  },
  defend: {
    fail: '상대의 행동이 통해요',
    tie: '상대가 동점 결과를 얻어요',
    success: '막아냈어요',
    style: '막아내고 부스트를 얻어요',
  },
};

function name(state: RoomState, id: string | null | undefined): string {
  if (!id) return '누군가';
  return state.characters[id]?.name ?? '누군가';
}

export interface LogLine {
  seq: number;
  kind: 'system' | 'roll' | 'fate' | 'gm' | 'chat';
  text: string;
}

/** 이벤트 하나를 로그 문장으로 바꾼다. 로그에 남길 필요 없는 이벤트는 null. */
export function describe(e: RoomEvent, state: RoomState): LogLine | null {
  const line = (kind: LogLine['kind'], text: string): LogLine => ({ seq: e.seq, kind, text });
  switch (e.type) {
    case 'scene.started':
      return line('system', `장면 시작: ${e.payload.name}`);
    case 'roll.opposition_requested':
      return line(
        'roll',
        `${name(state, e.payload.attackerId)}이(가) ${name(state, e.payload.defenderId)}에게 ${term(e.payload.action)}! 상대 응답 대기 중`,
      );
    case 'roll.resolved':
      return line(
        'roll',
        `${name(state, e.payload.side.characterId)}: ${term(e.payload.action)} · ${term(e.payload.side.approach)}`,
      );
    case 'roll.opposition_revealed':
      return line(
        'roll',
        `${name(state, e.payload.defender.characterId)}이(가) ${term(e.payload.defender.approach)}(으)로 ${term('defend')}. 두 결과 공개`,
      );
    case 'invoke.applied': {
      const a = state.aspects[e.payload.aspectId];
      const how = e.payload.mode === 'bonus' ? '+2' : '다시 굴림';
      const paid =
        e.payload.paidWith === 'free_invoke' ? term('freeInvoke') : `${term('fatePoint')} 1`;
      return line('fate', `「${a?.text ?? '특성'}」 ${term('invoke')} (${how}, ${paid})`);
    }
    case 'stunt.applied':
      return line('roll', `${term('stunt')} 적용 +${e.payload.value}`);
    case 'roll.finalized':
      return line(
        'roll',
        `결과: ${term(e.payload.outcome)} (${term('shifts')} ${e.payload.shifts >= 0 ? '+' : ''}${e.payload.shifts})`,
      );
    case 'aspect.added':
      if (e.payload.aspect.ownerType === 'character' && e.payload.aspect.kind !== 'boost')
        return null;
      return line(
        'system',
        `새 ${e.payload.aspect.kind === 'boost' ? term('boost') : term('aspect')}: 「${e.payload.aspect.text}」`,
      );
    case 'fate.adjusted':
      return line(
        'fate',
        `${e.payload.target === 'gm_pool' ? 'GM' : name(state, e.payload.target)} ${term('fatePoint')} ${e.payload.delta > 0 ? '+' : ''}${e.payload.delta}`,
      );
    case 'compel.offered':
      return line('gm', `GM의 ${term('compel')}: ${e.payload.text}`);
    case 'compel.accepted':
      return line('fate', `${term('compel')} 수락. ${term('fatePoint')} +1`);
    case 'compel.refused':
      return line('fate', `${term('compel')} 거절. ${term('fatePoint')} −1`);
    case 'damage.absorbed': {
      const parts = [
        ...(e.payload.stressBox ? [`${term('stress')} ${e.payload.stressBox}번 칸`] : []),
        ...e.payload.consequences.map((c) => `${term(c.slot)} 「${c.text}」`),
      ];
      return line(
        'roll',
        `${name(state, e.payload.targetId)}이(가) 피해를 받아냈어요: ${parts.join(', ')}`,
      );
    }
    case 'character.taken_out':
      return line('roll', `${name(state, e.payload.characterId)} ${term('takenOut')}!`);
    case 'narration.posted':
      return line('gm', e.payload.text);
    case 'chat.posted': {
      const who = e.payload.as ?? (e.actorId ? state.members[e.actorId]?.nickname : undefined);
      return line('chat', who ? `${who}: ${e.payload.text}` : e.payload.text);
    }
    case 'room.member_joined':
      return line(
        'system',
        `${e.payload.nickname}님이 들어왔어요${e.payload.role === 'gm' ? ' (GM)' : ''}`,
      );
    case 'character.created':
      return line('system', `새 캐릭터: ${e.payload.character.name}`);
    case 'scene.ended':
      return line('system', '장면이 끝났어요. 스트레스가 모두 회복돼요');
    default:
      return null;
  }
}

/** 오류 코드 → 사용자 문구 (design-system.md 11절) */
export const ERROR_COPY: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점이 부족해요. 무료 발동이 있는 특성을 써 보세요.',
  ASPECT_ALREADY_INVOKED: '이 특성은 이번 굴림에 이미 썼어요.',
  ROLL_NOT_OPEN: '이미 확정된 굴림이에요.',
  FORBIDDEN_ROLE: 'GM만 할 수 있는 일이에요.',
  INVALID_CHARACTER: '캐릭터 시트에 고칠 곳이 있어요.',
  QUOTA_EXCEEDED: '이번 달 생성 한도를 다 썼어요.',
  NOT_MEMBER: '이 방의 참가자가 아니에요.',
};
