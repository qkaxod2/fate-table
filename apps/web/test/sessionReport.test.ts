import { describe, expect, it } from 'vitest';
import type { RoomEvent } from '@fate/rules-engine';
import { sessionReport } from '@/lib/sessionReport';

let seq = 0;
const E = (type: string, payload: unknown, actorId = 'gm') =>
  ({ seq: ++seq, type, actorId, payload, visibility: 'public' }) as RoomEvent;

describe('sessionReport', () => {
  it('counts the last session and follows fate points', () => {
    seq = 0;
    const pc = {
      id: 'a',
      name: '하윤',
      isNpc: false,
      ownerId: 'u1',
      approaches: { careful: 1, clever: 1, flashy: 1, forceful: 3, quick: 2, sneaky: 0 },
      stunts: [],
      refresh: 3,
      fatePoints: 3,
      stress: [false, false, false],
      consequences: {},
    };
    const events = [
      E('character.created', { character: pc }),
      E('aspect.added', {
        aspect: {
          id: 'oath',
          ownerType: 'character',
          ownerId: 'a',
          kind: 'high',
          text: '맹세',
          freeInvokes: 0,
          hidden: false,
        },
      }),
      E('session.started', { sessionId: 's1', number: 1 }),
      E('scene.started', { sceneId: 'sc', name: '부두', pcIds: [], zones: [] }),
      E('fate.adjusted', { target: 'a', delta: -1, reason: 'manual' }),
      E('fate.adjusted', { target: 'a', delta: 2, reason: 'manual' }),
      E('session.ended', { sessionId: 's1' }),
    ];
    const r = sessionReport(events)!;
    expect(r.number).toBe(1);
    expect(r.scenes).toEqual(['부두']);
    expect(r.pcs).toEqual([{ id: 'a', name: '하윤' }]);
    expect(r.fate.map((p) => p.values.a)).toEqual([3, 2, 4]);
  });

  it('returns null without a session', () => {
    expect(sessionReport([])).toBeNull();
  });
});
