/**
 * 무대용 그림: 라이트노벨풍 스탠딩(전신, 투명 배경), 표정 차분, 장면 배경.
 * 화풍은 초상화 프리셋을 그대로 써서 한 방의 그림이 같은 결로 보이게 한다.
 */
import {
  SAFE_NEGATIVE,
  buildNaiBody,
  checkAppearance,
  findPreset,
  normalizeAppearance,
} from './index';

/** 생성 종류. npc는 초상화와 같은 구도지만 사용량을 따로 센다 */
export const MEDIA_KINDS = ['portrait', 'npc', 'standing', 'expression', 'scene'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** LLM이 만든 태그는 사람이 쓴 외형보다 길어도 된다 */
export const TAGS_MAX = 900;
export const STANDING_SIZE = { width: 832, height: 1216 } as const;
export const SCENE_SIZE = { width: 1216, height: 832 } as const;
/** 표정 차분: 원본 스탠딩을 이 세기로 다시 그린다. 낮을수록 몸·옷이 그대로 남는다 */
export const EXPRESSION_STRENGTH = 0.5;

export interface Expression {
  id: string;
  label: string;
  tags: string;
}

/** 대사창 옆 표정 칩 순서 그대로 */
export const EXPRESSIONS: readonly Expression[] = [
  { id: 'neutral', label: '기본', tags: 'light smile, closed mouth' },
  { id: 'smile', label: '웃음', tags: 'smile, open mouth, happy, :d, eyes visible' },
  { id: 'serious', label: '진지', tags: 'serious, closed mouth, furrowed brow, determined' },
  { id: 'angry', label: '화남', tags: 'angry, v-shaped eyebrows, clenched teeth, glaring' },
  { id: 'sad', label: '슬픔', tags: 'sad, frown, tears, downturned eyes' },
  { id: 'surprised', label: '놀람', tags: 'surprised, wide-eyed, open mouth, raised eyebrows' },
  { id: 'embarrassed', label: '당황', tags: 'embarrassed, blush, wavy mouth, sweatdrop' },
  { id: 'smug', label: '여유', tags: 'smug, smirk, half-closed eyes, confident' },
];

export function findExpression(id: string): Expression | undefined {
  return EXPRESSIONS.find((e) => e.id === id);
}

/** 표정은 칩으로 바꾸므로 스탠딩 본 태그에서는 걷어 낸다 */
const FACE_TAGS = new Set(
  [
    'smile',
    'light smile',
    'grin',
    'smirk',
    'laughing',
    'happy',
    'frown',
    'angry',
    'sad',
    'crying',
    'tears',
    'surprised',
    'shocked',
    'blush',
    'serious',
    'expressionless',
    'pout',
    'open mouth',
    'closed mouth',
    ':d',
    ':o',
    'smug',
    'embarrassed',
    'determined',
    'glaring',
  ].map((t) => t.toLowerCase()),
);

/** 전신 스탠딩 구도. 흰 단색 배경이어야 배경을 깔끔하게 딸 수 있다 */
const STANDING_FRAME =
  'solo, full body, standing, straight-on, looking at viewer, white background, simple background';
const STANDING_NEGATIVE =
  'cropped, feet out of frame, head out of frame, multiple views, reference sheet, turnaround, shadow, drop shadow, gradient background, detailed background, scenery, border, frame, text, speech bubble';
const SCENE_FRAME = 'no humans, scenery, wide shot, background';
const SCENE_NEGATIVE =
  '1girl, 1boy, people, person, character, crowd, silhouette, text, speech bubble, signature, watermark, border, frame';

function splitTags(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinTags(...parts: Array<string | undefined>): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}

function uniq(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 스탠딩 인물 캡션: 구도 + 외형(표정 태그 제외) + 고른 표정 */
export function standingCaption(tags: string, expressionId = 'neutral'): string {
  const face = findExpression(expressionId) ?? EXPRESSIONS[0]!;
  const look = splitTags(normalizeAppearance(tags)).filter((t) => !FACE_TAGS.has(t.toLowerCase()));
  return uniq([...splitTags(STANDING_FRAME), ...look, ...splitTags(face.tags)]).join(', ');
}

export interface StandingInput {
  presetId: string;
  tags: string;
  expression?: string;
  guidance: number;
  seed: number;
  /** 표정 차분: 원본(흰 배경) PNG base64 */
  baseImage?: string;
  /** 이 그림에만 붙일 네거티브 (LLM 제안) */
  negative?: string;
}

export function buildStandingRequest(input: StandingInput) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error('UNKNOWN_PRESET');
  const issue = checkAppearance(input.tags, TAGS_MAX);
  if (issue) throw new Error(issue);
  return buildNaiBody({
    base: preset.prompt,
    character: standingCaption(input.tags, input.expression),
    negative: joinTags(SAFE_NEGATIVE, input.negative, STANDING_NEGATIVE, preset.negative),
    size: STANDING_SIZE,
    guidance: input.guidance,
    cfgRescale: preset.cfgRescale,
    seed: input.seed,
    ...(input.baseImage
      ? { img2img: { image: input.baseImage, strength: EXPRESSION_STRENGTH } }
      : {}),
  });
}

export interface SceneInput {
  presetId: string;
  tags: string;
  guidance: number;
  seed: number;
  negative?: string;
}

/** 장면 배경: 사람 없이 풍경만, 가로 구도 */
export function buildSceneRequest(input: SceneInput) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error('UNKNOWN_PRESET');
  const issue = checkAppearance(input.tags, TAGS_MAX);
  if (issue) throw new Error(issue);
  const scene = uniq([...splitTags(input.tags), ...splitTags(SCENE_FRAME)]).join(', ');
  return buildNaiBody({
    base: `${scene}, ${preset.prompt}`,
    negative: joinTags(SAFE_NEGATIVE, input.negative, SCENE_NEGATIVE, preset.negative),
    size: SCENE_SIZE,
    guidance: input.guidance,
    cfgRescale: preset.cfgRescale,
    seed: input.seed,
  });
}
