import {
  initialState,
  reduce,
  resolve,
  type Actor,
  type Command,
  type NewEvent,
  type RoomEvent,
  type RoomState,
  type SealedSide,
} from '@fate/rules-engine';

function cryptoInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % maxExclusive;
}

/**
 * 체험 모드용 방. 서버 대신 브라우저 안에서 resolve → reduce를 돌린다.
 * 실제 방과 같은 명령·이벤트를 쓰므로, 화면 컴포넌트는 그대로 재사용된다.
 */
export class LocalRoom {
  private state: RoomState = initialState();
  private events: RoomEvent[] = [];
  private sealed = new Map<string, SealedSide>();
  private listeners = new Set<() => void>();
  private ids = 0;
  private snapshot: { state: RoomState; events: RoomEvent[] } = {
    state: this.state,
    events: this.events,
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  run(actor: Actor, command: Command): RoomEvent[] {
    const result = resolve(this.state, command, actor, {
      rng: cryptoInt,
      newId: () => `l${++this.ids}`,
      animSeed: () => cryptoInt(2 ** 32),
      sealed: (rollId) => this.sealed.get(rollId),
    });
    if (result.seal) this.sealed.set(result.seal.rollId, result.seal.side);
    const added = result.events.map((e) => this.append(e));
    this.emit();
    return added;
  }

  private append(e: NewEvent): RoomEvent {
    const full = { ...e, seq: this.state.seq + 1 } as RoomEvent;
    this.state = reduce(this.state, full);
    this.events = [...this.events, full];
    return full;
  }

  private emit() {
    this.snapshot = { state: this.state, events: this.events };
    for (const fn of this.listeners) fn();
  }
}
