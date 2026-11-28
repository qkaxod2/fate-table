import { describe, expect, it } from 'vitest';
import { CommandError, initialState, parseCommand, reduce, type RoomEvent } from '../src/index';
import { GM, P1, Table } from './helpers';

const members = (s: ReturnType<typeof initialState>) => ({
  ...s,
  members: {
    gm: { userId: 'gm', nickname: 'GM', role: 'gm' as const },
    u1: { userId: 'u1', nickname: '하나', role: 'player' as const },
    u2: { userId: 'u2', nickname: '둘', role: 'player' as const },
  },
});

const letter = { handoutId: 'h1', title: '찢어진 편지', body: '자정에 부두로.' };

describe('handouts', () => {
  it('only the GM can show a handout', () => {
    const t = new Table(members);
    expect(() => t.run(P1, { type: 'handout.show', payload: { ...letter, to: [] } })).toThrow(
      CommandError,
    );
  });

  it('showing to everyone is one public event', () => {
    const t = new Table(members);
    const evs = t.run(GM, { type: 'handout.show', payload: { ...letter, to: [] } });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ visibility: 'public', payload: { to: null } });
    expect(t.state.handouts?.h1).toMatchObject({ title: '찢어진 편지', shownTo: 'all' });
  });

  it('showing to chosen players makes one private event each', () => {
    const t = new Table(members);
    const evs = t.run(GM, { type: 'handout.show', payload: { ...letter, to: ['u1', 'u2'] } });
    expect(evs.map((e) => [e.visibility, e.ownerId])).toEqual([
      ['owner', 'u1'],
      ['owner', 'u2'],
    ]);
    // GM은 둘 다 보므로 받은 사람이 모인다
    expect(t.state.handouts?.h1?.shownTo).toEqual(['u1', 'u2']);
    // 플레이어 화면은 자기 이벤트만 접는다
    const mine = reduce(initialState(), evs[0] as RoomEvent);
    expect(mine.handouts?.h1?.shownTo).toEqual(['u1']);
  });

  it('rejects unknown recipients and the GM as a recipient', () => {
    const t = new Table(members);
    expect(() =>
      t.run(GM, { type: 'handout.show', payload: { ...letter, to: ['nobody'] } }),
    ).toThrow(CommandError);
    expect(() => t.run(GM, { type: 'handout.show', payload: { ...letter, to: ['gm'] } })).toThrow(
      CommandError,
    );
  });

  it('showing again updates the content, hiding removes it', () => {
    const t = new Table(members);
    t.run(GM, { type: 'handout.show', payload: { ...letter, to: ['u1'] } });
    t.run(GM, { type: 'handout.show', payload: { ...letter, title: '편지 (해독)', to: [] } });
    expect(t.state.handouts?.h1).toMatchObject({ title: '편지 (해독)', shownTo: 'all' });
    t.run(GM, { type: 'handout.hide', payload: { handoutId: 'h1' } });
    expect(t.state.handouts?.h1).toBeUndefined();
    expect(() => t.run(GM, { type: 'handout.hide', payload: { handoutId: 'h1' } })).toThrow(
      CommandError,
    );
  });

  it('rejects non-https images', () => {
    expect(() =>
      parseCommand({
        type: 'handout.show',
        payload: { ...letter, imageUrl: 'http://x.test/a.png' },
      }),
    ).toThrow();
    const ok = parseCommand({ type: 'handout.show', payload: letter });
    expect(ok.payload).toMatchObject({ to: [] });
  });
});
