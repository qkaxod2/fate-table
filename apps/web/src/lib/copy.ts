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
  /** 되돌리기 버튼을 달지 않는 줄 */
  undoable?: false;
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
      return {
        ...line(
          'system',
          `${e.payload.nickname}님이 들어왔어요${e.payload.role === 'gm' ? ' (GM)' : ''}`,
        ),
        undoable: false,
      };
    case 'character.created':
      return line('system', `새 캐릭터: ${e.payload.character.name}`);
    case 'scene.ended':
      return line('system', '장면이 끝났어요. 스트레스가 모두 회복돼요');
    case 'session.started':
      return line(
        'system',
        `세션 ${e.payload.number} 시작! ${term('fatePoint')}가 ${term('refresh')}돼요`,
      );
    case 'session.ended':
      return line('system', '세션이 끝났어요');
    case 'conflict.started':
      return line(
        'roll',
        `${e.payload.kind === 'physical' ? '물리' : '정신'} ${term('conflict')} 시작! 차례: ${e.payload.order.map((id) => name(state, id)).join(' → ')}`,
      );
    case 'conflict.turn_advanced': {
      const id = state.conflict?.order[e.payload.index];
      return line('roll', `${e.payload.round}라운드 · ${name(state, id)}의 차례`);
    }
    case 'conflict.ended':
      return line('roll', `${term('conflict')}이 끝났어요`);
    case 'character.conceded':
      return line(
        'fate',
        `${name(state, e.payload.characterId)} ${term('concede')}. ${term('fatePoint')} +${e.payload.fpGained}`,
      );
    case 'consequence.recovery_started':
      return line(
        'system',
        `${name(state, e.payload.characterId)}의 ${term(e.payload.slot)} 회복 시작`,
      );
    case 'consequence.cleared':
      return line(
        'system',
        `${name(state, e.payload.characterId)}의 ${term(e.payload.slot)}이 나았어요`,
      );
    case 'milestone.granted': {
      const size = { minor: '작은', significant: '중요한', major: '큰' }[e.payload.size];
      return line(
        'gm',
        `${e.payload.characterIds.map((id) => name(state, id)).join(', ')}: ${size} ${term('milestone')} 도달!`,
      );
    }
    case 'character.updated':
      return line('system', `${name(state, e.payload.id)}의 시트가 바뀌었어요`);
    case 'contest.started':
      return line(
        'roll',
        `${term('contest')} 시작: ${e.payload.sides.map((id) => name(state, id)).join(' vs ')}`,
      );
    case 'contest.exchange':
      return line(
        'roll',
        e.payload.winnerId
          ? `${term('contest')}: ${name(state, e.payload.winnerId)} ${e.payload.victories}승`
          : `${term('contest')}: 무승부, 판이 뒤집혀요`,
      );
    case 'contest.ended':
      return line(
        'roll',
        e.payload.winnerId
          ? `${term('contest')} 끝! ${name(state, e.payload.winnerId)} 승리`
          : `${term('contest')} 끝`,
      );
    case 'challenge.started':
      return line('roll', `${term('challenge')} 시작: ${e.payload.title}`);
    case 'challenge.step':
      return line(
        'roll',
        `${term('challenge')} · ${state.challenge?.steps[e.payload.index]?.label ?? `${e.payload.index + 1}단계`}: ${term(e.payload.outcome)}`,
      );
    case 'challenge.ended':
      return line('roll', `${term('challenge')}이 끝났어요`);
    case 'zone.added':
      return line('system', `새 ${term('zone')}: ${e.payload.zone.name}`);
    case 'zone.removed':
      return line('system', `${term('zone')}이 사라졌어요`);
    case 'token.moved': {
      const zone = e.payload.zoneId ? state.scene?.zones[e.payload.zoneId]?.name : null;
      return line(
        'system',
        zone
          ? `${name(state, e.payload.characterId)} → ${zone}`
          : `${name(state, e.payload.characterId)}이(가) 지도에서 빠졌어요`,
      );
    }
    case 'aspect.revealed':
      return line('gm', `숨은 ${term('aspect')} 발견: 「${e.payload.aspect.text}」`);
    case 'aspect.removed':
      return line('system', `${term('aspect')}이 사라졌어요`);
    case 'gm.note':
      return { ...line('gm', `📝 ${e.payload.text}`), undoable: false };
    case 'event.undone':
      return {
        ...line('gm', `↶ GM이 ${e.payload.seqs.length}개 기록을 되돌렸어요`),
        undoable: false,
      };
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
