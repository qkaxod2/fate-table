// GM 보관함 (gm_library): 자주 쓰는 NPC와 미리 준비한 장면. 계정에 두고 어느 방에서나 꺼내 쓴다.
// 꺼내 쓰기는 평소 명령(character.create · scene.start · scene.mood · gm.note)을 차례로 보내는 것이다.
import type {
  Aspect,
  Backdrop,
  Character,
  Command,
  Music,
  RoomEvent,
  RoomState,
  SceneCondition,
  SceneSound,
  SceneTime,
  SceneWeather,
} from '@fate/rules-engine';
import { ensureSession, getSupabase } from './supabase';

export type NpcPayload = Extract<Command, { type: 'character.create' }>['payload'];

export interface SavedNpc {
  key: string;
  savedAt: string;
  npc: NpcPayload;
}

export interface ScenePreset {
  key: string;
  savedAt: string;
  name: string;
  aspects: Array<{ text: string; hidden: boolean }>;
  mood?: {
    backdrop?: Backdrop | null;
    time?: SceneTime;
    weather?: SceneWeather;
    conditions?: SceneCondition[];
    sound?: SceneSound | null;
  };
  npcs: NpcPayload[];
  /** 열 때 틀 음악 (없으면 흐르던 음악을 그대로 둔다) */
  music?: Music;
  /** 강요 아이디어 · 진행 메모 (꺼낼 때 GM 메모로 남는다) */
  memo?: string;
}

type Kind = 'npc' | 'scene';

async function client() {
  const sb = getSupabase();
  if (!sb) throw new Error('OFFLINE');
  await ensureSession(sb);
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('NOT_SIGNED_IN');
  return { sb, uid };
}

async function list<T>(kind: Kind): Promise<T[]> {
  const { sb } = await client();
  const { data, error } = await sb
    .from('gm_library')
    .select('data')
    .eq('kind', kind)
    .order('saved_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((r) => r.data as T);
}

async function save(kind: Kind, key: string, item: { savedAt: string }): Promise<void> {
  const { sb, uid } = await client();
  const { error } = await sb
    .from('gm_library')
    .upsert({ user_id: uid, kind, key, data: item, saved_at: item.savedAt });
  if (error) throw error;
}

async function remove(kind: Kind, key: string): Promise<void> {
  const { sb } = await client();
  const { error } = await sb.from('gm_library').delete().eq('kind', kind).eq('key', key);
  if (error) throw error;
}

export const listNpcs = () => list<SavedNpc>('npc');
export const listScenes = () => list<ScenePreset>('scene');
export const deleteNpc = (key: string) => remove('npc', key);
export const deleteScene = (key: string) => remove('scene', key);

export function saveNpc(npc: NpcPayload, key: string = crypto.randomUUID()): Promise<void> {
  const item: SavedNpc = { key, savedAt: new Date().toISOString(), npc };
  return save('npc', key, item);
}

export function saveScene(p: Omit<ScenePreset, 'key' | 'savedAt'> & { key?: string }) {
  const item: ScenePreset = {
    ...p,
    key: p.key ?? crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  return save('scene', item.key, item).then(() => item);
}

/** 방에 있는 캐릭터를 다시 만들 수 있는 명령 내용으로 (상처·운명점 같은 이번 판 상태는 뺀다) */
export function npcFromCharacter(c: Character, aspects: readonly Aspect[]): NpcPayload {
  const own = aspects.filter((a) => a.ownerType === 'character' && a.ownerId === c.id);
  const high = own.find((a) => a.kind === 'high')?.text ?? c.name;
  const trouble = own.find((a) => a.kind === 'trouble')?.text;
  const rest = own
    .filter((a) => a.kind === 'normal')
    .map((a) => a.text)
    .slice(0, 3);
  return {
    name: c.name,
    isNpc: true,
    approaches: c.approaches,
    stunts: c.stunts.map(({ usedThisSession: _u, ...s }) => s),
    highConcept: high,
    ...(trouble ? { trouble } : {}),
    aspects: rest,
    ...(c.backstory ? { backstory: c.backstory } : {}),
    ...(c.portraitUrl ? { portraitUrl: c.portraitUrl } : {}),
  };
}

/** 지금 장면을 준비함 한 칸으로 (장면 특성·분위기·무대에 선 NPC) */
export function presetFromScene(state: RoomState): Omit<ScenePreset, 'key' | 'savedAt'> | null {
  const scene = state.scene;
  if (!scene) return null;
  const aspects = Object.values(state.aspects)
    .filter((a) => a.ownerType === 'scene' && a.kind !== 'boost')
    .slice(0, 8)
    .map((a) => ({ text: a.text, hidden: a.hidden }));
  const npcs = Object.values(state.characters)
    .filter((c) => c.isNpc && !c.takenOut)
    .map((c) => npcFromCharacter(c, Object.values(state.aspects)));
  return {
    name: scene.name,
    aspects,
    mood: {
      ...(scene.backdrop ? { backdrop: scene.backdrop } : {}),
      ...(scene.ambience
        ? {
            time: scene.ambience.time,
            weather: scene.ambience.weather,
            conditions: scene.ambience.conditions,
          }
        : {}),
      ...(scene.sound ? { sound: scene.sound } : {}),
    },
    npcs,
    ...(state.music ? { music: state.music } : {}),
  };
}

/** 준비한 장면을 연다: (세션이 없으면 세션 시작) → 장면 → 분위기 → NPC → 메모. 하나라도 실패하면 거기서 멈춘다 */
export async function openPreset(
  p: ScenePreset,
  state: RoomState,
  run: (cmd: Command) => Promise<RoomEvent[]>,
): Promise<boolean> {
  if (!state.session && !(await run({ type: 'session.start', payload: {} })).length) return false;
  const started = await run({
    type: 'scene.start',
    payload: { name: p.name, aspects: p.aspects.slice(0, 8) },
  });
  if (!started.length) return false;
  if (p.mood && Object.keys(p.mood).length > 0) await run({ type: 'scene.mood', payload: p.mood });
  if (p.music) await run({ type: 'music.set', payload: p.music });
  // 이미 같은 이름의 NPC가 무대에 있으면 또 만들지 않는다
  const here = new Set(
    Object.values(state.characters)
      .filter((c) => c.isNpc && !c.takenOut)
      .map((c) => c.name),
  );
  for (const npc of p.npcs) {
    if (here.has(npc.name)) continue;
    await run({ type: 'character.create', payload: { ...npc, isNpc: true } });
  }
  if (p.memo?.trim())
    await run({ type: 'gm.note', payload: { text: `[${p.name}] ${p.memo.trim()}` } });
  return true;
}
