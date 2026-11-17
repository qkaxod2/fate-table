'use client';

import type { Aspect, RoomEvent } from '@fate/rules-engine';
import { useMemo, useState } from 'react';

/**
 * 장면 꼬리표가 어떻게 들어오는지. 화면을 처음 열 때 이미 있던 것은 가만히 있고,
 * 그 뒤에 붙은 것은 탁자에 카드를 내려놓듯 떨어지고(deal), GM이 숨겨 둔 것을 공개하면
 * 뒤집히며 드러난다(reveal). 공개되면 다시 그려지도록 꼬리표의 key로 tagKey를 쓴다.
 */
export function useDealt(aspects: readonly Aspect[], events: readonly RoomEvent[]) {
  const [known] = useState(() => new Set(aspects.map(tagKey)));
  const revealed = useMemo(
    () =>
      new Set(events.flatMap((e) => (e.type === 'aspect.revealed' ? [e.payload.aspect.id] : []))),
    [events],
  );
  return (a: Aspect): 'deal' | 'reveal' | undefined =>
    known.has(tagKey(a)) ? undefined : revealed.has(a.id) && !a.hidden ? 'reveal' : 'deal';
}

export const tagKey = (a: Aspect) => (a.hidden ? `${a.id}:h` : a.id);
