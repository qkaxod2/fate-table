/**
 * NAI 캐릭터 초상화. 웹(선택 화면)과 Edge Function(요청 생성)이 같은 데이터를 쓴다.
 * 작가 태그는 프리셋으로만 고르고, 사용자는 외형과 가이던스만 바꾼다.
 */

export const PORTRAIT_MODEL = 'nai-diffusion-5-full-medium';
/** medium 모델은 웹 클라이언트에서 14스텝·k_euler_ancestral로 고정된다 */
export const PORTRAIT_STEPS = 14;
export const PORTRAIT_SIZE = { width: 832, height: 1216 } as const;
export const GUIDANCE = { min: 3, max: 8, step: 0.1 } as const;
export const APPEARANCE_MAX = 600;

export type PortraitPresetId = 'watercolor' | 'cel' | 'pastel' | 'gamecg' | 'daily' | 'neon';

export interface PortraitPreset {
  id: PortraitPresetId;
  name: string;
  blurb: string;
  /** public/ 기준 견본 이미지 */
  thumb: string;
  /** 작가·화풍·품질 태그 (base caption) */
  prompt: string;
  negative: string;
  guidance: number;
  cfgRescale: number;
}

// 모든 프리셋 negative 앞에 붙는다 (전연령 기본)
const SAFE_NEGATIVE = 'nsfw, nude, cleavage, underwear, lowres, worst quality, bad quality';

export const PORTRAIT_PRESETS: readonly PortraitPreset[] = [
  {
    id: 'watercolor',
    name: '햇살 수채',
    blurb: '부드러운 색감과 창가의 빛',
    thumb: '/portrait-presets/watercolor.webp',
    prompt:
      '0.9::artist:zuizi ::, 0.8::artist:csyday, artist:k-suwabe, artist:bloomminority ::, 0.7::artist:quasarcake ::, 0.6::artist:maccha (mochancc), artist:ezu (e104mjd) ::, 0.9::artist:hen-tie, artist:tobu (bilibil) ::, year 2026, year 2025, animated, promotional art, no text, location, masterpiece, best quality, amazing quality, very aesthetic, highres, incredibly absurdres, -1::character picture, artist collaboration ::, high complexity, best illustration, novel illustration',
    negative:
      'normal quality, low quality, cropped, aliasing, jpeg artifacts, dithering, signature, logo, watermark, username, blurry, sign, duplicate, mutation, deformed, disfigured, missing finger, extra arms, extra legs, long neck, bad feet, bad proportions, chromatic aberration, scan artifacts, big head, unfinished, unclear fingertips, incomplete, blank page, out of frame, head out of frame, outside border, framed, character doll, vignetting, backlighting, pixel art, 3d, realistic, photorealistic, artist collaboration, 4koma, 2koma, multiple views, distorted, bad anatomy, bad face, bad eyes, bad limbs, bad hands, extra digits, fewer digits, distorted composition, bad perspective, displeasing, very displeasing, fewer details, screentone, film grain, bad portrait, bad illustration',
    guidance: 5,
    cfgRescale: 0,
  },
  {
    id: 'cel',
    name: '산뜻한 선화',
    blurb: '깔끔한 선과 맑은 평면 채색',
    thumb: '/portrait-presets/cel.webp',
    prompt:
      '0.5::artist:qiandaiyiyu ::, 0.4::artist:torino aqua ::, 0.5::artist:yoya yogurt ::, 0.8::artist:tokkyu ::, 0.45::artist:fymrie ::, 0.5::artist:nanase miri ::, 0.5::artist:soybean (hisoybean) ::, 0.4::artist:poki (j0ch3fvj6nd) ::, 0.4::artist:mmlyno ::, 0.4::artist:drive shot ::, year 2025, year 2024, high detail, masterpiece, best quality, very aesthetic, highres, best illustration, -1::artist collaboration ::, -1::monochrome ::, 2::flat color ::, simple illustration, 1.0::soft shading ::, 0.7::crisp lineart, defined outlines, clear color separation, cel shading ::, 0.8::colored lineart ::, 0.4::glossy eyes ::',
    negative:
      'artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    guidance: 6,
    cfgRescale: 0,
  },
  {
    id: 'pastel',
    name: '파스텔 툰',
    blurb: '둥글고 귀여운 데포르메',
    thumb: '/portrait-presets/pastel.webp',
    prompt:
      '0.45::artist:dolman (dm) ::, 0.54::artist:onono imoko ::, 0.18::artist:some1else45 ::, 0.36::artist:channel (caststation) ::, 0.72::artist:oharu-chan ::, 0.27::artist:bkub ::, year 2026, year 2025, year 2024, 1::no lineart ::, 0.75::flat color ::, 1::pastel (medium) ::, 0.75::toon (style) ::, 1::deformed ::, 1::white outline ::, high complexity, 1.25::redrawn ::, -1::bad anatomy ::, -1::upscaled ::, -2::blurry ::, 1::highres ::, 1::absurdres ::, 1::best quality ::, 1::masterpiece ::, 0.75::very aesthetic ::, -1.5::multiple views ::, -2::artist collaboration ::',
    negative:
      'official art, official style, artist collaboration, signature, watermark, username, artist name, twitter username, 1990s (style), retro art style, realistic, 3d, meme, hatching (texture), notice lines, jaggy lines, bad anatomy, wrong hand, bad hands, missing limb, mascot, extra digits, fewer digits, bad face, mutation, disfigured, extra arms, extra legs, bad proportions, thick lips, stuffed toy, JPEG artifacts, unfinished, chromatic aberration, scan, scan artifacts, rotated, variant set, normal quality, low quality, displeasing, very displeasing, blurry, multiple views',
    guidance: 5.7,
    cfgRescale: 0.27,
  },
  {
    id: 'gamecg',
    name: '게임 일러스트',
    blurb: '선명한 광택, 게임 CG 같은 마감',
    thumb: '/portrait-presets/gamecg.webp',
    prompt:
      '2::de da xianyu::, 1.4::artist:koyo2023 ::, 1.45::artist: kim hyung tae::, 0.7::artist:zankuro::, 0.7::artist:gogalking::, 0.95::artist:channel (caststation)::, 0.95::artist:freng::, 1.2::murata yuusuke ::, 0.8::artist:suzumi (ccroquette)::, 1.1::artist:pigeon666 ::, 0.7::artist:soybean_(hisoybean)::, 0.85::artist:chueog ::, year 2025, -1::artist collaboration ::, masterpiece, best quality, amazing quality, very aesthetic, best illustration, newest, highres, incredibly absurdres, hyper detail, 4k, high complexity',
    negative:
      'photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::, 3::shiny skin::, opening door, peeping, full-face blush, bloom, white pupils, bright pupils, chibi, inset, company name, logo, 2::bags under eyes::, simple illustration, blurry, blurry foreground, backlighting, aura, outline, film grain, vignetting, overexposure, chiaroscuro, tenebrism, pale colors, pastel colors, ai-generated, sepia',
    guidance: 6,
    cfgRescale: 0.2,
  },
  {
    id: 'daily',
    name: '청춘 스냅',
    blurb: '밝고 자연스러운 일상의 한 장면',
    thumb: '/portrait-presets/daily.webp',
    prompt:
      'artist:as4_s2, artist:wanke, artist:re0n, artist:shigure_s, artist:uof, artist:mors_gn, artist:adelie_cat, artist:huwari_(dnwls3010), artist:freng, 0.5::muted colors::, year 2025, high detail, best quality, very aesthetic, highres',
    negative:
      'artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::, 3::shiny skin::, full-face blush, bloom, white pupils, bright pupils, chibi, inset, company name, 2::bags under eyes::, simple illustration, blurry, blurry foreground, backlighting, aura, outline, vignetting, overexposure, chiaroscuro, tenebrism, pale colors, pastel colors, ai-generated, sepia',
    guidance: 6,
    cfgRescale: 0,
  },
  {
    id: 'neon',
    name: '네온 드라마',
    blurb: '강한 대비와 극적인 조명',
    thumb: '/portrait-presets/neon.webp',
    prompt:
      '1.2::artist:arisaka ako::, 1.1::artist:yumi xsh::, 1.0::artist:yoneyama mai::, 0.9::artist:secretfj520 ::, 0.9::artist:pigeon666 ::, 0.9::artist:john kafka::, 1.1::artist:gogalking::, 1.1::artist:channel (caststation)::, 0.8::artist:k-suwabe::, year 2026, year 2025, ultra detailed, high detail, detailed eyes, masterpiece, best quality, very aesthetic, highres, best illustration, novel illustration, -3::simple illustration ::, no text',
    negative:
      'artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::',
    guidance: 4,
    cfgRescale: 0.2,
  },
];

export function findPreset(id: string): PortraitPreset | undefined {
  return PORTRAIT_PRESETS.find((p) => p.id === id);
}

/** 외형 입력에 넣으면 안 되는 말. 작가 태그는 프리셋으로만, 노출 태그는 막는다. */
const BLOCKED = [
  /artist\s*:/i,
  /\bnsfw\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bsex/i,
  /\bnipples?\b/i,
  /\bpussy\b/i,
  /\bpenis\b/i,
  /\bcum\b/i,
  /\bexplicit\b/i,
  /\bloli\b/i,
  /\bshota\b/i,
];

export type AppearanceIssue = 'EMPTY' | 'TOO_LONG' | 'BLOCKED_TAG';

export function checkAppearance(text: string): AppearanceIssue | null {
  const t = text.trim();
  if (!t) return 'EMPTY';
  if (t.length > APPEARANCE_MAX) return 'TOO_LONG';
  if (BLOCKED.some((re) => re.test(t))) return 'BLOCKED_TAG';
  return null;
}

/** 줄바꿈·중복 쉼표 정리, 'solo'가 없으면 앞에 붙인다 */
export function normalizeAppearance(text: string): string {
  const tags = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === 'solo')) tags.unshift('solo');
  return tags.join(', ');
}

export function clampGuidance(g: number): number {
  if (!Number.isFinite(g)) return 5;
  const v = Math.min(GUIDANCE.max, Math.max(GUIDANCE.min, g));
  return Math.round(v * 10) / 10;
}

export interface PortraitInput {
  presetId: string;
  appearance: string;
  guidance: number;
  seed: number;
}

/** NovelAI generate-image 요청 본문 (V5 medium, params_version 4) */
export function buildPortraitRequest(input: PortraitInput) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error('UNKNOWN_PRESET');
  const issue = checkAppearance(input.appearance);
  if (issue) throw new Error(issue);
  const character = normalizeAppearance(input.appearance);
  const negative = `${SAFE_NEGATIVE}, ${preset.negative}`;
  const center = { x: 0.5, y: 0.5 };
  return {
    input: preset.prompt,
    model: PORTRAIT_MODEL,
    action: 'generate',
    parameters: {
      params_version: 4,
      width: PORTRAIT_SIZE.width,
      height: PORTRAIT_SIZE.height,
      scale: clampGuidance(input.guidance),
      cfg_rescale: preset.cfgRescale,
      sampler: 'k_euler_ancestral',
      steps: PORTRAIT_STEPS,
      n_samples: 1,
      seed: input.seed >>> 0,
      noise_schedule: 'karras',
      ucPresetId: 'heavy',
      qualityPresetId: 'none',
      dynamic_thresholding: false,
      skip_cfg_above_sigma: null,
      prefer_brownian: true,
      deliberate_euler_ancestral_bug: false,
      legacy_v3_extend: false,
      use_coords: false,
      legacy_uc: false,
      characterPrompts: [{ prompt: character, uc: '', center, enabled: true }],
      v4_prompt: {
        caption: {
          base_caption: preset.prompt,
          char_captions: [{ char_caption: character, centers: [center] }],
        },
        use_coords: false,
        use_order: true,
      },
      v4_negative_prompt: {
        caption: {
          base_caption: negative,
          char_captions: [{ char_caption: '', centers: [center] }],
        },
        legacy_uc: false,
      },
      negative_prompt: negative,
    },
  };
}

/** 외형 입력을 돕는 칩 (한국어 → 태그) */
export const APPEARANCE_CHIPS: readonly { label: string; tag: string; group: string }[] = [
  { group: '인물', label: '여성', tag: '1girl' },
  { group: '인물', label: '남성', tag: '1boy' },
  { group: '인물', label: '어른', tag: 'adult' },
  { group: '구도', label: '상반신', tag: 'upper body' },
  { group: '구도', label: '전신', tag: 'full body' },
  { group: '구도', label: '정면 응시', tag: 'looking at viewer' },
  { group: '머리', label: '검은 머리', tag: 'black hair' },
  { group: '머리', label: '금발', tag: 'blonde hair' },
  { group: '머리', label: '은발', tag: 'silver hair' },
  { group: '머리', label: '긴 머리', tag: 'long hair' },
  { group: '머리', label: '짧은 머리', tag: 'short hair' },
  { group: '옷', label: '갑옷', tag: 'armor' },
  { group: '옷', label: '로브', tag: 'robe' },
  { group: '옷', label: '망토', tag: 'cape' },
  { group: '옷', label: '제복', tag: 'uniform' },
  { group: '표정', label: '미소', tag: 'smile' },
  { group: '표정', label: '진지함', tag: 'serious' },
  { group: '배경', label: '단색 배경', tag: 'simple background' },
];
