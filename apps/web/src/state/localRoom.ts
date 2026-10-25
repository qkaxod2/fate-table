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
  /** 튜토리얼용으로 미리 정해 둔 주사위 눈 (rng(3) 값: 0=−, 1=빈 면, 2=+) */
  private forced: number[] = [];
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
      rng: (max) => (max === 3 && this.forced.length ? this.forced.shift()! : cryptoInt(max)),
      newId: () => `l${++this.ids}`,
      animSeed: () => cryptoInt(2 ** 32),
      sealed: (rollId) => this.sealed.get(rollId),
    });
    if (result.seal) this.sealed.set(result.seal.rollId, result.seal.side);
    const added = result.events.map((e) => this.append(e));
    this.emit();
    return added;
  }

  /**
   * 튜토리얼: 다음에 굴릴 페이트 주사위 4개의 합을 정해 둔다 (−4~+4로 자른다).
   * 합이 작으면 +와 −를 한 쌍 섞어 실제 굴림처럼 보이게 한다.
   */
  forceDice(sum: number): void {
    const n = Math.max(-4, Math.min(4, Math.round(sum)));
    const faces: number[] = [];
    for (let i = 0; i < Math.abs(n); i++) faces.push(Math.sign(n));
    if (faces.length <= 2) faces.push(1, -1);
    while (faces.length < 4) faces.push(0);
    // 같은 눈이 몰리지 않게 한 칸씩 엇갈려 놓는다
    const mixed = [faces[0]!, faces[2]!, faces[1]!, faces[3]!];
    this.forced.push(...mixed.map((f) => f + 1));
  }

  /** 체험 시나리오의 앞선 사정(이미 다친 두목 등)을 명령 없이 바로 깔아 둔다 */
  seed(events: NewEvent[]): void {
    events.forEach((e) => this.append(e));
    this.emit();
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
