import {
  initialState,
  reduce,
  replay,
  type Actor,
  type Command,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ApiError, callFunction } from '@/lib/api';

interface Row {
  seq: number;
  type: string;
  actor_id: string | null;
  payload: unknown;
  visibility: string;
  owner_id: string | null;
}

function fromRow(r: Row): RoomEvent {
  return {
    seq: Number(r.seq),
    type: r.type,
    actorId: r.actor_id,
    payload: r.payload,
    visibility: r.visibility,
    ...(r.owner_id ? { ownerId: r.owner_id } : {}),
  } as RoomEvent;
}

export interface RoomSnapshot {
  state: RoomState;
  events: RoomEvent[];
  /** 마지막으로 받은 이벤트가 화면을 연 뒤에 일어난 것인지 (연출·효과음 여부) */
  live: boolean;
}

/**
 * 서버 방. 이벤트를 읽어 같은 리듀서로 상태를 만들고, Realtime으로 새 이벤트를 받는다.
 * 비공개 이벤트는 RLS가 걸러 주므로 보이는 것만 접는다. 내 화면에서 seq가 비면 서버에서 다시 채운다.
 */
export class RemoteRoom {
  private state: RoomState = initialState();
  private events: RoomEvent[] = [];
  private lastSeq = 0;
  private buffer = new Map<number, RoomEvent>();
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private filling = false;
  /** 채우는 동안 새 이벤트가 와서 한 번 더 읽어야 하는지 */
  private refill = false;
  private snapshot: RoomSnapshot = { state: this.state, events: [], live: false };

  constructor(
    private readonly sb: SupabaseClient,
    readonly roomId: string,
    readonly userId: string,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  get actor(): Actor {
    return { userId: this.userId, role: this.state.members[this.userId]?.role ?? 'spectator' };
  }

  async start(): Promise<void> {
    await this.fill();
    this.snapshot = { ...this.snapshot, live: true };
    this.channel = this.sb
      .channel(`room:${this.roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `room_id=eq.${this.roomId}` },
        (msg) => this.receive([fromRow(msg.new as Row)]),
      )
      .subscribe((status) => {
        // 다시 연결되면 놓친 이벤트를 채운다
        if (status === 'SUBSCRIBED') void this.fill();
      });
  }

  stop(): void {
    if (this.channel) void this.sb.removeChannel(this.channel);
    this.channel = null;
  }

  async run(command: Command): Promise<RoomEvent[]> {
    const body = { roomId: this.roomId, clientCmdId: crypto.randomUUID(), command };
    let res: { events: RoomEvent[] };
    try {
      res = await callFunction<{ events: RoomEvent[] }>('commands', body);
    } catch (e) {
      // 응답만 잃었을 수 있으니 같은 명령 id로 한 번 더 보낸다. 서버는 처리한 명령이면 그 결과를 돌려준다
      if (!(e instanceof ApiError) || e.code !== 'NETWORK') throw e;
      res = await callFunction<{ events: RoomEvent[] }>('commands', body);
    }
    this.receive(res.events);
    return res.events;
  }

  /** 순서대로 적용. 내가 볼 수 없는 이벤트 자리(비공개)는 seq가 비므로 서버에서 확인해 건너뛴다 */
  private receive(list: RoomEvent[]) {
    for (const e of list) if (e.seq > this.lastSeq) this.buffer.set(e.seq, e);
    this.drain();
    if (this.buffer.size > 0) void this.fill();
  }

  private drain() {
    let changed = false;
    for (
      let next = this.buffer.get(this.lastSeq + 1);
      next;
      next = this.buffer.get(this.lastSeq + 1)
    ) {
      this.buffer.delete(next.seq);
      this.apply(next);
      changed = true;
    }
    if (changed) this.emit();
  }

  private apply(e: RoomEvent) {
    this.events = [...this.events, e];
    // 되돌리기는 지난 이벤트를 빼고 처음부터 다시 접는다
    this.state = e.type === 'event.undone' ? replay(this.events) : reduce(this.state, e);
    this.lastSeq = e.seq;
  }

  /**
   * lastSeq 이후를 서버에서 읽어 채운다. 읽은 범위 안에서 빠진 seq는 볼 수 없는 이벤트이므로 건너뛴다.
   * 조회를 기다리는 동안 실시간으로 먼저 받은 이벤트가 있을 수 있으므로, 이미 적용한 seq는 건너뛰고
   * lastSeq는 줄어들지 않는다.
   */
  private async fill() {
    if (this.filling) {
      this.refill = true;
      return;
    }
    this.filling = true;
    try {
      do {
        this.refill = false;
        await this.readFromServer();
        // 서버 head까지 읽었으니 그보다 작은 버퍼는 버린다
        for (const k of this.buffer.keys()) if (k <= this.lastSeq) this.buffer.delete(k);
        this.emit();
        this.drain();
        // 읽는 사이 도착한 이벤트 앞에 아직 빈 자리가 있으면 한 번 더 읽는다
      } while (this.refill && this.buffer.size > 0);
    } finally {
      this.filling = false;
    }
  }

  private async readFromServer() {
    for (;;) {
      const { data, error } = await this.sb
        .from('events')
        .select('seq, type, actor_id, payload, visibility, owner_id')
        .eq('room_id', this.roomId)
        .gt('seq', this.lastSeq)
        .order('seq')
        .limit(1000);
      if (error) throw error;
      const rows = (data as Row[]).map(fromRow);
      for (const e of rows) if (e.seq > this.lastSeq) this.apply(e);
      if (rows.length < 1000) return;
    }
  }

  private emit() {
    this.snapshot = { state: this.state, events: this.events, live: this.snapshot.live };
    for (const fn of this.listeners) fn();
  }
}
