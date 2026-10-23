import {
  blankCharacter,
  initialState,
  reduce,
  replay,
  resolve,
  type Actor,
  type Aspect,
  type Character,
  type Command,
  type Dice,
  type NewEvent,
  type RoomEvent,
  type RoomState,
  type SealedSide,
} from '../src/index';

export const GM: Actor = { userId: 'gm', role: 'gm' };
export const P1: Actor = { userId: 'u1', role: 'player' };
export const P2: Actor = { userId: 'u2', role: 'player' };

export function pc(id: string, ownerId: string, over: Partial<Character> = {}): Character {
  return {
    ...blankCharacter(id, id, ownerId),
    approaches: { careful: 3, clever: 2, flashy: 2, forceful: 1, quick: 1, sneaky: 0 },
    ...over,
  };
}

export function aspect(id: string, over: Partial<Aspect> = {}): Aspect {
  return {
    id,
    ownerType: 'scene',
    ownerId: 'scene',
    kind: 'situation',
    text: id,
    freeInvokes: 0,
    hidden: false,
    ...over,
  };
}

/** 주사위 결과를 순서대로 돌려주는 rng (면 -1,0,1 → 인덱스 0,1,2) */
export function scriptedRng(faces: number[]) {
  let i = 0;
  return () => {
    const f = faces[i++ % faces.length]!;
    return f + 1;
  };
}

export class Table {
  state: RoomState = initialState();
  log: RoomEvent[] = [];
  sealed = new Map<string, SealedSide>();
  /** command_log 흉내: 명령마다 [first, last] */
  groups: Array<[number, number]> = [];
  private ids = 0;
  private dice: number[] = [0];

  private base: RoomState;

  constructor(setup?: (s: RoomState) => RoomState) {
    if (setup) this.state = setup(this.state);
    this.base = this.state;
  }

  nextDice(...faces: number[]) {
    this.dice = faces;
    return this;
  }

  push(e: NewEvent) {
    const full = { ...e, seq: this.state.seq + 1 } as RoomEvent;
    this.log.push(full);
    this.state = reduce(this.state, full);
    return full;
  }

  run(actor: Actor, command: Command) {
    const result = resolve(this.state, command, actor, {
      rng: scriptedRng(this.dice),
      newId: () => `id${++this.ids}`,
      animSeed: () => 42,
      sealed: (rollId) => this.sealed.get(rollId),
      history: this.log,
      groupOf: (seq) => this.groups.find(([f, l]) => f <= seq && seq <= l),
    });
    if (result.seal) this.sealed.set(result.seal.rollId, result.seal.side);
    const first = this.state.seq + 1;
    const out = result.events.map((e) => this.push(e));
    if (out.length) this.groups.push([first, this.state.seq]);
    if (out.some((e) => e.type === 'event.undone')) this.state = replay(this.log, this.base);
    return out;
  }
}

export function withCharacters(...cs: Character[]) {
  return (s: RoomState): RoomState => ({
    ...s,
    characters: Object.fromEntries(cs.map((c) => [c.id, c])),
  });
}

export const dice = (...d: number[]) => d as unknown as Dice;
