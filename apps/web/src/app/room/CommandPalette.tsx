'use client';

import { term } from '@fate/glossary';
import {
  APPROACHES,
  type Approach,
  type Command,
  type RoomEvent,
  type RoomState,
} from '@fate/rules-engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCloseGuard } from '@/components/ui/closeGuard';
import { useClosing } from '@/lib/motion';
import type { GmOpen } from './GmConsole';
import styles from './CommandPalette.module.css';

type Run = (cmd: Command) => Promise<RoomEvent[]>;

export interface PaletteEntry {
  /** 맨 앞에 적는 말 (이 중 하나로 시작하면 이 명령) */
  words: string[];
  label: string;
  hint: string;
  /** 뒤에 적을 내용이 필요하면 그 안내 */
  arg?: string;
  gmOnly?: boolean;
  act: (arg: string) => unknown;
}

const approachOf = (s: string): Approach | undefined =>
  APPROACHES.find((a) => term(a) === s || a === s.toLowerCase());

/** 방에서 쓰는 명령 목록. 창을 열지 않고 한 줄로 처리한다 */
export function roomCommands({
  state,
  run,
  isGm,
  openGm,
  openSheet,
  openHelp,
  chat,
}: {
  state: RoomState;
  run: Run;
  isGm: boolean;
  openGm: (o: GmOpen) => void;
  openSheet: (id: string) => void;
  openHelp: () => void;
  chat: (text: string) => void;
}): PaletteEntry[] {
  const sceneId = state.scene?.id;
  const findChar = (q: string) =>
    Object.values(state.characters).find((c) => c.name === q) ??
    Object.values(state.characters).find((c) => c.name.includes(q));
  const list: PaletteEntry[] = [
    {
      words: ['장면', 'scene'],
      label: '새 장면 열기',
      hint: '이름을 적고 Enter. 세션이 없으면 같이 열어요',
      arg: '장면 이름',
      gmOnly: true,
      act: async (name) => {
        if (!name) return openGm({ tool: 'scene' });
        if (!state.session) {
          const ok = await run({ type: 'session.start', payload: {} });
          if (!ok.length) return;
        }
        return run({ type: 'scene.start', payload: { name } });
      },
    },
    {
      words: ['특성', 'aspect'],
      label: `장면 ${term('aspect')} 붙이기`,
      hint: '모두에게 보이는 상황 특성',
      arg: '특성 문구',
      gmOnly: true,
      act: (text) =>
        !text || !sceneId
          ? openGm({ tool: 'aspect' })
          : run({
              type: 'aspect.add',
              payload: {
                ownerType: 'scene',
                ownerId: sceneId,
                kind: 'situation',
                text,
                freeInvokes: 0,
                hidden: false,
              },
            }),
    },
    {
      words: ['숨김', '숨은특성', 'secret'],
      label: `숨겨 둔 ${term('aspect')} 붙이기`,
      hint: 'GM에게만 보이고, 나중에 공개해요',
      arg: '특성 문구',
      gmOnly: true,
      act: (text) =>
        !text || !sceneId
          ? openGm({ tool: 'aspect' })
          : run({
              type: 'aspect.add',
              payload: {
                ownerType: 'scene',
                ownerId: sceneId,
                kind: 'situation',
                text,
                freeInvokes: 0,
                hidden: true,
              },
            }),
    },
    {
      words: ['npc', '엔피씨'],
      label: 'NPC 만들기',
      hint: `예: "npc 밀수꾼 은밀" (뒤에 잘하는 ${term('approach')} +2)`,
      arg: '이름 [접근법]',
      gmOnly: true,
      act: (arg) => {
        const parts = arg.split(/\s+/).filter(Boolean);
        const best = parts.length > 1 ? approachOf(parts.at(-1)!) : undefined;
        const name = (best ? parts.slice(0, -1) : parts).join(' ');
        if (!name) return openGm({ tool: 'npc' });
        const approaches = Object.fromEntries(
          APPROACHES.map((a) => [a, a === (best ?? 'forceful') ? 2 : 0]),
        ) as Record<Approach, number>;
        return run({
          type: 'character.create',
          payload: { name, isNpc: true, approaches, stunts: [], highConcept: name, aspects: [] },
        });
      },
    },
    {
      words: ['대사', '묘사', 'say'],
      label: 'GM 대사 보내기',
      hint: '모두의 대사 창에 크게 떠요',
      arg: '대사',
      gmOnly: true,
      act: (text) => text && run({ type: 'narration.post', payload: { text } }),
    },
    {
      words: ['메모', 'note'],
      label: '나만 보는 메모',
      hint: '플레이어에게는 보이지 않아요',
      arg: '메모',
      gmOnly: true,
      act: (text) =>
        text ? run({ type: 'gm.note', payload: { text } }) : openGm({ tool: 'note' }),
    },
    {
      words: ['풀', 'pool'],
      label: 'GM 풀 조절',
      hint: '"풀 +1", "풀 -2"',
      arg: '+1 / -1',
      gmOnly: true,
      act: (arg) => {
        const n = Number(arg.replace('−', '-')) || 1;
        return run({ type: 'fate.adjust', payload: { target: 'gm_pool', delta: n } });
      },
    },
    {
      words: ['운명점', 'fp'],
      label: `${term('fatePoint')} 주기·빼기`,
      hint: '"운명점 세라 +1"',
      arg: '이름 +1',
      gmOnly: true,
      act: (arg) => {
        const m = arg.match(/^(.+?)\s*([+−-]?\d+)$/);
        const c = m ? findChar(m[1]!.trim()) : undefined;
        if (!m || !c) return;
        return run({
          type: 'fate.adjust',
          payload: { target: c.id, delta: Number(m[2]!.replace('−', '-')) },
        });
      },
    },
    {
      words: ['다음', 'next'],
      label: '다음 차례',
      hint: `${term('conflict')} 중일 때`,
      act: () => state.conflict && run({ type: 'conflict.next', payload: {} }),
    },
    {
      words: ['갈등', '경합', '도전', 'conflict'],
      label: `${term('conflict')} · ${term('contest')} · ${term('challenge')}`,
      hint: '창을 열어 참가자를 골라요',
      gmOnly: true,
      act: () => openGm({ tool: 'conflict' }),
    },
    {
      words: ['강요', 'compel'],
      label: `${term('compel')} 걸기`,
      hint: '창을 열어 대상과 특성을 골라요',
      gmOnly: true,
      act: () => openGm({ tool: 'compel' }),
    },
    {
      words: ['세션', 'session'],
      label: '세션 시작·끝',
      hint: `${term('refresh')}과 요약`,
      gmOnly: true,
      act: () => openGm({ tool: 'session' }),
    },
    {
      words: ['말', 'chat', '/'],
      label: '채팅',
      hint: '기록에 한 줄 남겨요',
      arg: '할 말',
      act: (text) => text && chat(text),
    },
    {
      words: ['시트', 'sheet'],
      label: '캐릭터 시트 열기',
      hint: '이름 일부만 적어도 돼요',
      arg: '이름',
      act: (q) => {
        const c = q ? findChar(q) : undefined;
        if (c) openSheet(c.id);
      },
    },
    {
      words: ['단축키', '도움말', '?', 'help'],
      label: '단축키 보기',
      hint: '지금 쓸 수 있는 키',
      act: () => openHelp(),
    },
  ];
  return list.filter((e) => isGm || !e.gmOnly);
}

function split(input: string): [string, string] {
  const t = input.trim();
  const i = t.search(/\s/);
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1).trim()];
}

/** Ctrl+K 명령 창: 한 줄로 적고 Enter */
export function CommandPalette({
  build,
  onClose,
}: {
  /** 열 때마다 지금 방 상태로 명령 목록을 만든다 */
  build: () => PaletteEntry[];
  onClose: () => void;
}) {
  const entries = build();
  const [closing, close] = useClosing(onClose);
  const [input, setInput] = useState('');
  const [index, setIndex] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const [head, rest] = split(input);
  const matches = useMemo(() => {
    const h = head.toLowerCase();
    if (!h) return entries;
    const exact = entries.filter((e) => e.words.some((w) => w.toLowerCase() === h));
    if (exact.length) return exact;
    return entries.filter(
      (e) =>
        e.words.some((w) => w.toLowerCase().startsWith(h)) ||
        e.label.toLowerCase().includes(input.trim().toLowerCase()),
    );
  }, [entries, head, input]);
  const pick = matches[Math.min(index, matches.length - 1)];

  useEffect(() => field.current?.focus(), []);

  const guard = useCloseGuard(close);

  const exec = (e: PaletteEntry) => {
    const exactHead = e.words.some((w) => w.toLowerCase() === head.toLowerCase());
    void e.act(exactHead ? rest : '');
    close();
  };

  return (
    <div className={styles.backdrop} data-closing={closing || undefined} {...guard.backdrop}>
      <div className={styles.box} role="dialog" aria-label="명령" {...guard.panel}>
        <input
          ref={field}
          className={styles.input}
          value={input}
          placeholder="무엇을 할까요?  예: npc 밀수꾼 은밀 · 특성 짙은 안개 · 대사 문이 열린다"
          onChange={(e) => {
            setInput(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => (i + 1) % Math.max(matches.length, 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => (i - 1 + matches.length) % Math.max(matches.length, 1));
            } else if (e.key === 'Tab' && pick) {
              e.preventDefault();
              setInput(`${pick.words[0]} `);
            } else if (e.key === 'Enter' && pick) {
              e.preventDefault();
              exec(pick);
            }
          }}
        />
        <ul className={styles.list}>
          {matches.map((e) => (
            <li key={e.label}>
              <button
                type="button"
                className={styles.item}
                data-active={e === pick || undefined}
                onMouseEnter={() => setIndex(matches.indexOf(e))}
                onClick={() => exec(e)}
              >
                <span className={styles.word}>{e.words[0]}</span>
                <span className={styles.label}>
                  {e.label}
                  {e.arg && <em> · {e.arg}</em>}
                </span>
                <span className={styles.hint}>{e.hint}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className={styles.none}>맞는 명령이 없어요</li>}
        </ul>
        <div className={styles.foot}>
          <kbd>↑</kbd>
          <kbd>↓</kbd> 고르기 · <kbd>Tab</kbd> 채우기 · <kbd>Enter</kbd> 실행 · <kbd>Esc</kbd> 닫기
        </div>
      </div>
      {guard.nudge}
    </div>
  );
}

/** ? 단축키 목록 */
export function ShortcutHelp({ isGm, onClose }: { isGm: boolean; onClose: () => void }) {
  const [closing, close] = useClosing(onClose);
  const guard = useCloseGuard(close);
  const rows: Array<[string[], string]> = [
    [['Ctrl', 'K'], '명령 창 열기 (/ 도 돼요)'],
    [['1', '–', '4'], '행동 고르기 (극복 · 이점 창출 · 공격 · 방어)'],
    [['Q', 'W', 'E', 'A', 'S', 'D'], `${term('approach')} 고르기`],
    [['Space'], '굴리기'],
    [['1', '–', '9'], `굴린 뒤: 발동할 ${term('aspect')} 고르기`],
    [['F', 'R'], '고른 특성으로 +2 · 다시 굴리기'],
    [['Enter'], '이대로 확정'],
    ...(isGm ? ([[['Ctrl', 'Z'], '마지막 기록 되돌리기']] as Array<[string[], string]>) : []),
    [['?'], '이 목록'],
    [['Esc'], '창 닫기'],
  ];
  return (
    <div className={styles.backdrop} data-closing={closing || undefined} {...guard.backdrop}>
      <div className={styles.box} role="dialog" aria-label="단축키" {...guard.panel}>
        <h2 className={styles.title}>단축키</h2>
        <dl className={styles.keys}>
          {rows.map(([k, v], i) => (
            <div key={i}>
              <dt>{k.map((part, j) => (part === '–' ? ' – ' : <kbd key={j}>{part}</kbd>))}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
