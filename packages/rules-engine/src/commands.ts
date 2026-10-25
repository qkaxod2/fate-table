import { z } from 'zod';
import { ACTIONS, APPROACHES, CONSEQUENCE_SLOTS } from './types';

const id = z.string().min(1).max(64);
const text = z.string().trim().min(1).max(200);
const approach = z.enum(APPROACHES);
const action = z.enum(ACTIONS);
const slot = z.enum(CONSEQUENCE_SLOTS);
const side = z.enum(['active', 'defense']);
const approaches = z.object(
  Object.fromEntries(APPROACHES.map((a) => [a, z.number().int().min(-2).max(8)])) as Record<
    (typeof APPROACHES)[number],
    z.ZodNumber
  >,
);
const stunt = z.object({
  id,
  text,
  kind: z.enum(['bonus', 'once_per_session']),
  bonus: z.object({ approach, action, value: z.literal(2) }).optional(),
});
/** 지도 좌표는 0~100 (%) */
const coord = z.number().min(0).max(100);
const zone = z.object({ name: text, x: coord, y: coord });

function cmd<T extends string, P extends z.ZodRawShape>(type: T, payload: P) {
  return z.object({ type: z.literal(type), payload: z.object(payload) });
}

/** 클라이언트 → 서버 명령. 서버와 클라이언트가 같은 스키마를 쓴다. */
export const CommandSchema = z.discriminatedUnion('type', [
  cmd('session.start', { title: text.optional() }),
  cmd('session.end', { summary: z.string().max(4000).optional() }),
  cmd('scene.start', {
    name: text,
    pcIds: z.array(id).optional(),
    zones: z.array(zone).max(12).optional(),
    aspects: z
      .array(z.object({ text, hidden: z.boolean().default(false) }))
      .max(8)
      .optional(),
  }),
  cmd('scene.end', {}),

  cmd('character.create', {
    name: text,
    isNpc: z.boolean().default(false),
    ownerId: id.nullable().optional(),
    approaches,
    stunts: z.array(stunt).max(5).default([]),
    highConcept: text,
    trouble: text.optional(),
    aspects: z.array(text).max(3).default([]),
    /** 캐릭터 만들기에서 그린 초상화 (공개 Storage URL) */
    portraitUrl: z.string().url().max(500).optional(),
  }),
  cmd('character.update', {
    id,
    patch: z.object({
      name: text.optional(),
      approaches: approaches.optional(),
      stunts: z.array(stunt).max(5).optional(),
    }),
  }),
  cmd('milestone.grant', {
    characterIds: z.array(id).min(1),
    size: z.enum(['minor', 'significant', 'major']),
  }),

  cmd('aspect.add', {
    ownerType: z.enum(['character', 'scene', 'zone']),
    ownerId: id,
    kind: z.enum(['normal', 'situation', 'boost']),
    text,
    freeInvokes: z.number().int().min(0).max(2).default(0),
    hidden: z.boolean().default(false),
  }),
  cmd('aspect.reveal', { aspectId: id }),
  cmd('aspect.update', { aspectId: id, text }),
  cmd('aspect.remove', { aspectId: id }),

  cmd('roll.request', {
    characterId: id,
    action,
    approach,
    difficulty: z.number().int().min(-2).max(10).optional(),
    /** 대상이 있으면 반대 굴림(방어자가 굴려 동시에 공개) */
    targetId: id.optional(),
  }),
  cmd('roll.defend', { rollId: id, approach }),
  cmd('invoke.apply', {
    rollId: id,
    side: side.default('active'),
    aspectId: id,
    mode: z.enum(['bonus', 'reroll']),
    paidWith: z.enum(['fate_point', 'free_invoke']),
  }),
  cmd('stunt.apply', { rollId: id, side: side.default('active'), stuntId: id }),
  cmd('roll.defense_ready', { rollId: id }),
  cmd('roll.finalize', { rollId: id, reduceForBoost: z.boolean().default(false) }),

  cmd('fate.adjust', { target: id, delta: z.number().int().min(-10).max(10) }),
  cmd('compel.offer', { aspectId: id, targetId: id, text }),
  cmd('compel.respond', { compelId: id, accept: z.boolean() }),
  cmd('compel.withdraw', { compelId: id }),

  cmd('conflict.start', {
    kind: z.enum(['physical', 'mental']),
    participantIds: z.array(id).min(2),
  }),
  cmd('conflict.next', {}),
  cmd('conflict.end', {}),
  cmd('damage.absorb', {
    rollId: id,
    takeOut: z.boolean().default(false),
    stressBox: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .nullable()
      .default(null),
    consequences: z.array(z.object({ slot, text })).max(3).default([]),
  }),
  cmd('character.concede', { characterId: id }),
  cmd('consequence.startRecovery', { characterId: id, slot }),
  cmd('consequence.clear', { characterId: id, slot }),

  cmd('contest.start', { sides: z.array(id).length(2) }),
  cmd('contest.exchange', {
    winnerId: id.nullable(),
    victories: z.union([z.literal(1), z.literal(2)]).default(1),
  }),
  cmd('contest.end', {}),
  cmd('challenge.start', { title: text, steps: z.array(text).min(1).max(8) }),
  cmd('challenge.step', {
    index: z.number().int().min(0),
    outcome: z.enum(['fail', 'tie', 'success', 'style']),
  }),
  cmd('challenge.end', {}),

  cmd('zone.add', zone.shape),
  cmd('zone.link', { from: id, to: id }),
  cmd('zone.unlink', { from: id, to: id }),
  cmd('zone.update', {
    zoneId: id,
    name: text.optional(),
    x: coord.optional(),
    y: coord.optional(),
  }),
  cmd('zone.remove', { zoneId: id }),
  cmd('token.move', { characterId: id, zoneId: id.nullable() }),

  cmd('media.attach', {
    kind: z.enum(['portrait', 'standing', 'scene']),
    /** 캐릭터 id 또는 장면 id */
    target: id,
    url: z.string().url().max(500),
    /** 스탠딩일 때 어떤 표정인지 (없으면 기본) */
    expression: z.string().min(1).max(24).optional(),
    meta: z
      .object({
        presetId: z.string().min(1).max(24),
        prompt: z.string().max(1000),
        seed: z.number().int().min(0).max(4294967295),
      })
      .optional(),
  }),
  cmd('character.expression', {
    characterId: id,
    expression: z.string().min(1).max(24).nullable(),
  }),

  cmd('chat.post', { text: z.string().trim().min(1).max(2000), as: text.optional() }),
  cmd('gm.note', { text: z.string().trim().min(1).max(4000) }),
  cmd('narration.post', { text: z.string().trim().min(1).max(4000) }),
  cmd('sfx.play', { assetId: id }),
  cmd('event.undo', { targetSeq: z.number().int().min(1), reason: text.optional() }),
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

export function parseCommand(input: unknown): Command {
  return CommandSchema.parse(input);
}
