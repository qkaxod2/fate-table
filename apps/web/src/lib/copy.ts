import { term } from '@fate/glossary';
import type { Action, Outcome, RoomEvent, RoomState } from '@fate/rules-engine';
import { josa } from '@/lib/josa';

/** 판정 연출 (design-system.md 17·21절). 크게 찍는 글자는 한국어 결과(word)다. */
export const JUDGE: Record<Outcome, { word: string; tone: 'perfect' | 'great' | 'good' | 'miss' }> =
  {
    style: { word: term('style'), tone: 'perfect' },
    success: { word: term('success'), tone: 'great' },
    tie: { word: term('tie'), tone: 'good' },
    fail: { word: term('fail'), tone: 'miss' },
  };

/** 행동 × 결과 안내 문구 (design-system.md 6절) */
export const OUTCOME_COPY: Record<Action, Record<Outcome, string>> = {
  overcome: {
    fail: '넘지 못함. 큰 대가를 치르면 넘을 수도 있다',
    tie: '작은 대가를 치르고 넘어감',
    success: '성공!',
    style: '대성공. 부스트도 얻음',
  },
  create_advantage: {
    fail: '특성을 만들지 못함. 상대가 무료 발동을 얻을 수도 있다',
    tie: '부스트 획득',
    success: '특성을 붙이고 무료 발동 1개',
    style: '특성을 붙이고 무료 발동 2개',
  },
  attack: {
    fail: '빗나감',
    tie: '부스트 획득',
    success: '차이만큼 피해',
    style: '차이만큼 피해. 피해를 1 줄이고 부스트를 얻을 수도 있다',
  },
  defend: {
    fail: '막지 못함. 상대 뜻대로 된다',
    tie: '비김. 막긴 했지만 상대가 작은 이득을 얻는다',
    success: '막아냄',
    style: '막아내고 부스트 획득',
  },
};

function name(state: RoomState, id: string | null | undefined): string {
  if (!id) return '누군가';
  return state.characters[id]?.name ?? '누군가';
}

export interface LogLine {
  seq: number;
  kind: 'system' | 'scene' | 'roll' | 'fate' | 'gm' | 'chat';
  text: string;
  /** 되돌리기 버튼을 달지 않는 줄 */
  undoable?: false;
  /** GM이 쓴 줄: 글리치·뒤집기 연출을 살린다 */
  fx?: true;
}

/** 이벤트 하나를 로그 문장으로 바꾼다. 로그에 남길 필요 없는 이벤트는 null. */
export function describe(e: RoomEvent, state: RoomState): LogLine | null {
  const line = (kind: LogLine['kind'], text: string): LogLine => ({ seq: e.seq, kind, text });
  switch (e.type) {
    case 'scene.started':
      return line('scene', `장면 시작: ${e.payload.name}`);
    case 'roll.opposition_requested':
      return line(
        'roll',
        `${josa(name(state, e.payload.attackerId), '이/가')} ${name(state, e.payload.defenderId)}에게 ${term(e.payload.action)}! 상대의 대응을 기다린다`,
      );
    case 'roll.resolved':
      return line(
        'roll',
        `${name(state, e.payload.side.characterId)}: ${term(e.payload.action)} · ${term(e.payload.side.approach)}`,
      );
    case 'roll.opposition_revealed':
      return line(
        'roll',
        `${josa(name(state, e.payload.defender.characterId), '이/가')} ${josa(term(e.payload.defender.approach), '으로/로')} ${term('defend')}. 두 결과 공개`,
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
    case 'roll.defense_ready': {
      const who = state.rolls[e.payload.rollId]?.defense?.characterId;
      return line('roll', `${josa(who ? name(state, who) : '방어자', '이/가')} 방어 조정을 마쳤다`);
    }
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
        `${josa(name(state, e.payload.targetId), '이/가')} 피해를 받아냈다: ${parts.join(', ')}`,
      );
    }
    case 'character.taken_out':
      return line('roll', `${name(state, e.payload.characterId)} ${term('takenOut')}!`);
    case 'narration.posted':
      return { ...line('gm', e.payload.text), fx: true };
    case 'chat.posted': {
      const member = e.actorId ? state.members[e.actorId] : undefined;
      const who = e.payload.as ?? member?.nickname;
      const l = line('chat', who ? `${who}: ${e.payload.text}` : e.payload.text);
      return member?.role === 'gm' ? { ...l, fx: true } : l;
    }
    case 'room.member_joined':
      return {
        ...line(
          'system',
          `${e.payload.nickname}님이 들어왔다${e.payload.role === 'gm' ? ' (GM)' : ''}`,
        ),
        undoable: false,
      };
    case 'room.member_left':
      return { ...line('system', `${e.payload.nickname}님이 방을 나갔다`), undoable: false };
    case 'room.closed':
      return { ...line('system', 'GM이 방을 닫았다'), undoable: false };
    case 'character.created':
      return line('system', `새 캐릭터: ${e.payload.character.name}`);
    case 'scene.ended':
      return line('scene', '장면이 끝났다. 스트레스가 모두 회복된다');
    case 'session.started':
      return line(
        'scene',
        `세션 ${e.payload.number} 시작! ${josa(term('fatePoint'), '이/가')} ${term('refresh')} 수치까지 채워진다`,
      );
    case 'session.ended':
      return line('scene', '세션이 끝났다');
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
      return line('roll', `${term('conflict')}이 끝났다`);
    case 'character.conceded':
      return line(
        'fate',
        `${name(state, e.payload.characterId)} ${term('concede')}. ${term('fatePoint')} +${e.payload.fpGained}`,
      );
    case 'consequence.recovery_started':
      return line(
        'system',
        `${name(state, e.payload.characterId)}의 ${josa(term(e.payload.slot), '이/가')} 낫기 시작한다`,
      );
    case 'consequence.cleared':
      return line(
        'system',
        `${name(state, e.payload.characterId)}의 ${josa(term(e.payload.slot), '이/가')} 나았다`,
      );
    case 'milestone.granted': {
      const size = { minor: '작은', significant: '중요한', major: '큰' }[e.payload.size];
      return line(
        'gm',
        `${e.payload.characterIds.map((id) => name(state, id)).join(', ')}: ${size} ${term('milestone')} 도달!`,
      );
    }
    case 'character.updated':
      return line('system', `${name(state, e.payload.id)}의 시트가 바뀌었다`);
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
          : `${term('contest')}: 무승부, 판이 뒤집힘`,
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
      return line('roll', `${term('challenge')}이 끝났다`);
    case 'zone.added':
      return line('system', `새 ${term('zone')}: ${e.payload.zone.name}`);
    case 'zone.removed':
      return line('system', `${term('zone')}이 사라졌다`);
    case 'token.moved': {
      const zone = e.payload.zoneId ? state.scene?.zones[e.payload.zoneId]?.name : null;
      return line(
        'system',
        zone
          ? `${name(state, e.payload.characterId)} → ${zone}`
          : `${josa(name(state, e.payload.characterId), '이/가')} 지도에서 빠졌다`,
      );
    }
    case 'aspect.revealed':
      return line('gm', `숨은 ${term('aspect')} 발견: 「${e.payload.aspect.text}」`);
    case 'aspect.removed':
      return line('system', `${term('aspect')}이 사라졌다`);
    case 'gm.note':
      return { ...line('system', `📝 메모: ${e.payload.text}`), undoable: false };
    case 'event.undone':
      return {
        ...line('system', `↶ GM이 방금 일을 되돌렸다`),
        undoable: false,
      };
    default:
      return null;
  }
}

/** 오류 코드 → 사용자 문구 (design-system.md 11절) */
export const ERROR_COPY: Record<string, string> = {
  NOT_ENOUGH_FATE_POINTS: '운명점 부족. 무료 발동이 있는 특성을 써 보기',
  ASPECT_ALREADY_INVOKED: '이 특성은 이번 굴림에 이미 씀',
  ROLL_NOT_OPEN: '이미 끝났거나 취소된 굴림',
  AWAITING_DEFENSE: '상대가 방어 조정을 마칠 때까지 대기',
  QUOTA_UNAVAILABLE: '사용량 확인 실패. 잠시 뒤 다시 시도',
  FORBIDDEN_ROLE: 'GM 전용',
  INVALID_CHARACTER: '캐릭터 시트에 고칠 곳 있음',
  DUPLICATE_CHARACTER: '이미 이 방에 데려온 캐릭터',
  QUOTA_EXCEEDED: '이번 달 생성 한도 소진',
  NOT_MEMBER: '이 방의 참가자가 아님',
};
