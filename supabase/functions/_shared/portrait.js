// 자동 생성 파일: scripts/bundle-shared.mjs. 직접 고치지 않는다.

// packages/portrait/src/index.ts
var PORTRAIT_MODEL = "nai-diffusion-5-full-medium";
var PORTRAIT_STEPS = 14;
var PORTRAIT_SIZE = { width: 832, height: 1216 };
var GUIDANCE = { min: 3, max: 8, step: 0.1 };
var APPEARANCE_MAX = 600;
var SAFE_NEGATIVE = "nsfw, nude, cleavage, underwear, lowres, worst quality, bad quality";
var PORTRAIT_PRESETS = [
  {
    id: "watercolor",
    name: "\uD587\uC0B4 \uC218\uCC44",
    blurb: "\uBD80\uB4DC\uB7EC\uC6B4 \uC0C9\uAC10\uACFC \uCC3D\uAC00\uC758 \uBE5B",
    thumb: "/portrait-presets/watercolor.webp",
    prompt: "0.9::artist:zuizi ::, 0.8::artist:csyday, artist:k-suwabe, artist:bloomminority ::, 0.7::artist:quasarcake ::, 0.6::artist:maccha (mochancc), artist:ezu (e104mjd) ::, 0.9::artist:hen-tie, artist:tobu (bilibil) ::, year 2026, year 2025, animated, promotional art, no text, location, masterpiece, best quality, amazing quality, very aesthetic, highres, incredibly absurdres, -1::character picture, artist collaboration ::, high complexity, best illustration, novel illustration",
    negative: "normal quality, low quality, cropped, aliasing, jpeg artifacts, dithering, signature, logo, watermark, username, blurry, sign, duplicate, mutation, deformed, disfigured, missing finger, extra arms, extra legs, long neck, bad feet, bad proportions, chromatic aberration, scan artifacts, big head, unfinished, unclear fingertips, incomplete, blank page, out of frame, head out of frame, outside border, framed, character doll, vignetting, backlighting, pixel art, 3d, realistic, photorealistic, artist collaboration, 4koma, 2koma, multiple views, distorted, bad anatomy, bad face, bad eyes, bad limbs, bad hands, extra digits, fewer digits, distorted composition, bad perspective, displeasing, very displeasing, fewer details, screentone, film grain, bad portrait, bad illustration",
    guidance: 5,
    cfgRescale: 0
  },
  {
    id: "cel",
    name: "\uC0B0\uB73B\uD55C \uC120\uD654",
    blurb: "\uAE54\uB054\uD55C \uC120\uACFC \uB9D1\uC740 \uD3C9\uBA74 \uCC44\uC0C9",
    thumb: "/portrait-presets/cel.webp",
    prompt: "0.5::artist:qiandaiyiyu ::, 0.4::artist:torino aqua ::, 0.5::artist:yoya yogurt ::, 0.8::artist:tokkyu ::, 0.45::artist:fymrie ::, 0.5::artist:nanase miri ::, 0.5::artist:soybean (hisoybean) ::, 0.4::artist:poki (j0ch3fvj6nd) ::, 0.4::artist:mmlyno ::, 0.4::artist:drive shot ::, year 2025, year 2024, high detail, masterpiece, best quality, very aesthetic, highres, best illustration, -1::artist collaboration ::, -1::monochrome ::, 2::flat color ::, simple illustration, 1.0::soft shading ::, 0.7::crisp lineart, defined outlines, clear color separation, cel shading ::, 0.8::colored lineart ::, 0.4::glossy eyes ::",
    negative: "artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page",
    guidance: 6,
    cfgRescale: 0
  },
  {
    id: "pastel",
    name: "\uD30C\uC2A4\uD154 \uD230",
    blurb: "\uB465\uAE00\uACE0 \uADC0\uC5EC\uC6B4 \uB370\uD3EC\uB974\uBA54",
    thumb: "/portrait-presets/pastel.webp",
    prompt: "0.45::artist:dolman (dm) ::, 0.54::artist:onono imoko ::, 0.18::artist:some1else45 ::, 0.36::artist:channel (caststation) ::, 0.72::artist:oharu-chan ::, 0.27::artist:bkub ::, year 2026, year 2025, year 2024, 1::no lineart ::, 0.75::flat color ::, 1::pastel (medium) ::, 0.75::toon (style) ::, 1::deformed ::, 1::white outline ::, high complexity, 1.25::redrawn ::, -1::bad anatomy ::, -1::upscaled ::, -2::blurry ::, 1::highres ::, 1::absurdres ::, 1::best quality ::, 1::masterpiece ::, 0.75::very aesthetic ::, -1.5::multiple views ::, -2::artist collaboration ::",
    negative: "official art, official style, artist collaboration, signature, watermark, username, artist name, twitter username, 1990s (style), retro art style, realistic, 3d, meme, hatching (texture), notice lines, jaggy lines, bad anatomy, wrong hand, bad hands, missing limb, mascot, extra digits, fewer digits, bad face, mutation, disfigured, extra arms, extra legs, bad proportions, thick lips, stuffed toy, JPEG artifacts, unfinished, chromatic aberration, scan, scan artifacts, rotated, variant set, normal quality, low quality, displeasing, very displeasing, blurry, multiple views",
    guidance: 5.7,
    cfgRescale: 0.27
  },
  {
    id: "gamecg",
    name: "\uAC8C\uC784 \uC77C\uB7EC\uC2A4\uD2B8",
    blurb: "\uC120\uBA85\uD55C \uAD11\uD0DD, \uAC8C\uC784 CG \uAC19\uC740 \uB9C8\uAC10",
    thumb: "/portrait-presets/gamecg.webp",
    prompt: "2::de da xianyu::, 1.4::artist:koyo2023 ::, 1.45::artist: kim hyung tae::, 0.7::artist:zankuro::, 0.7::artist:gogalking::, 0.95::artist:channel (caststation)::, 0.95::artist:freng::, 1.2::murata yuusuke ::, 0.8::artist:suzumi (ccroquette)::, 1.1::artist:pigeon666 ::, 0.7::artist:soybean_(hisoybean)::, 0.85::artist:chueog ::, year 2025, -1::artist collaboration ::, masterpiece, best quality, amazing quality, very aesthetic, best illustration, newest, highres, incredibly absurdres, hyper detail, 4k, high complexity",
    negative: "photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::, 3::shiny skin::, opening door, peeping, full-face blush, bloom, white pupils, bright pupils, chibi, inset, company name, logo, 2::bags under eyes::, simple illustration, blurry, blurry foreground, backlighting, aura, outline, film grain, vignetting, overexposure, chiaroscuro, tenebrism, pale colors, pastel colors, ai-generated, sepia",
    guidance: 6,
    cfgRescale: 0.2
  },
  {
    id: "daily",
    name: "\uCCAD\uCD98 \uC2A4\uB0C5",
    blurb: "\uBC1D\uACE0 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uC77C\uC0C1\uC758 \uD55C \uC7A5\uBA74",
    thumb: "/portrait-presets/daily.webp",
    prompt: "artist:as4_s2, artist:wanke, artist:re0n, artist:shigure_s, artist:uof, artist:mors_gn, artist:adelie_cat, artist:huwari_(dnwls3010), artist:freng, 0.5::muted colors::, year 2025, high detail, best quality, very aesthetic, highres",
    negative: "artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::, 3::shiny skin::, full-face blush, bloom, white pupils, bright pupils, chibi, inset, company name, 2::bags under eyes::, simple illustration, blurry, blurry foreground, backlighting, aura, outline, vignetting, overexposure, chiaroscuro, tenebrism, pale colors, pastel colors, ai-generated, sepia",
    guidance: 6,
    cfgRescale: 0
  },
  {
    id: "neon",
    name: "\uB124\uC628 \uB4DC\uB77C\uB9C8",
    blurb: "\uAC15\uD55C \uB300\uBE44\uC640 \uADF9\uC801\uC778 \uC870\uBA85",
    thumb: "/portrait-presets/neon.webp",
    prompt: "1.2::artist:arisaka ako::, 1.1::artist:yumi xsh::, 1.0::artist:yoneyama mai::, 0.9::artist:secretfj520 ::, 0.9::artist:pigeon666 ::, 0.9::artist:john kafka::, 1.1::artist:gogalking::, 1.1::artist:channel (caststation)::, 0.8::artist:k-suwabe::, year 2026, year 2025, ultra detailed, high detail, detailed eyes, masterpiece, best quality, very aesthetic, highres, best illustration, novel illustration, -3::simple illustration ::, no text",
    negative: "artistic error, film grain, scan artifacts, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, photo, painting (object), multiple girls, multiple boys, doll, 3::artist collaboration::",
    guidance: 4,
    cfgRescale: 0.2
  }
];
function findPreset(id) {
  return PORTRAIT_PRESETS.find((p) => p.id === id);
}
var BLOCKED = [
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
  /\bshota\b/i
];
function checkAppearance(text) {
  const t = text.trim();
  if (!t) return "EMPTY";
  if (t.length > APPEARANCE_MAX) return "TOO_LONG";
  if (BLOCKED.some((re) => re.test(t))) return "BLOCKED_TAG";
  return null;
}
function normalizeAppearance(text) {
  const tags = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === "solo")) tags.unshift("solo");
  return tags.join(", ");
}
function clampGuidance(g) {
  if (!Number.isFinite(g)) return 5;
  const v = Math.min(GUIDANCE.max, Math.max(GUIDANCE.min, g));
  return Math.round(v * 10) / 10;
}
function buildPortraitRequest(input) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error("UNKNOWN_PRESET");
  const issue = checkAppearance(input.appearance);
  if (issue) throw new Error(issue);
  const character = normalizeAppearance(input.appearance);
  const negative = `${SAFE_NEGATIVE}, ${preset.negative}`;
  const center = { x: 0.5, y: 0.5 };
  return {
    input: preset.prompt,
    model: PORTRAIT_MODEL,
    action: "generate",
    parameters: {
      params_version: 4,
      width: PORTRAIT_SIZE.width,
      height: PORTRAIT_SIZE.height,
      scale: clampGuidance(input.guidance),
      cfg_rescale: preset.cfgRescale,
      sampler: "k_euler_ancestral",
      steps: PORTRAIT_STEPS,
      n_samples: 1,
      seed: input.seed >>> 0,
      noise_schedule: "karras",
      ucPresetId: "heavy",
      qualityPresetId: "none",
      dynamic_thresholding: false,
      skip_cfg_above_sigma: null,
      prefer_brownian: true,
      deliberate_euler_ancestral_bug: false,
      legacy_v3_extend: false,
      use_coords: false,
      legacy_uc: false,
      characterPrompts: [{ prompt: character, uc: "", center, enabled: true }],
      v4_prompt: {
        caption: {
          base_caption: preset.prompt,
          char_captions: [{ char_caption: character, centers: [center] }]
        },
        use_coords: false,
        use_order: true
      },
      v4_negative_prompt: {
        caption: {
          base_caption: negative,
          char_captions: [{ char_caption: "", centers: [center] }]
        },
        legacy_uc: false
      },
      negative_prompt: negative
    }
  };
}
var APPEARANCE_CHIPS = [
  { group: "\uC778\uBB3C", label: "\uC5EC\uC131", tag: "1girl" },
  { group: "\uC778\uBB3C", label: "\uB0A8\uC131", tag: "1boy" },
  { group: "\uC778\uBB3C", label: "\uC5B4\uB978", tag: "adult" },
  { group: "\uAD6C\uB3C4", label: "\uC0C1\uBC18\uC2E0", tag: "upper body" },
  { group: "\uAD6C\uB3C4", label: "\uC804\uC2E0", tag: "full body" },
  { group: "\uAD6C\uB3C4", label: "\uC815\uBA74 \uC751\uC2DC", tag: "looking at viewer" },
  { group: "\uBA38\uB9AC", label: "\uAC80\uC740 \uBA38\uB9AC", tag: "black hair" },
  { group: "\uBA38\uB9AC", label: "\uAE08\uBC1C", tag: "blonde hair" },
  { group: "\uBA38\uB9AC", label: "\uC740\uBC1C", tag: "silver hair" },
  { group: "\uBA38\uB9AC", label: "\uAE34 \uBA38\uB9AC", tag: "long hair" },
  { group: "\uBA38\uB9AC", label: "\uC9E7\uC740 \uBA38\uB9AC", tag: "short hair" },
  { group: "\uC637", label: "\uAC11\uC637", tag: "armor" },
  { group: "\uC637", label: "\uB85C\uBE0C", tag: "robe" },
  { group: "\uC637", label: "\uB9DD\uD1A0", tag: "cape" },
  { group: "\uC637", label: "\uC81C\uBCF5", tag: "uniform" },
  { group: "\uD45C\uC815", label: "\uBBF8\uC18C", tag: "smile" },
  { group: "\uD45C\uC815", label: "\uC9C4\uC9C0\uD568", tag: "serious" },
  { group: "\uBC30\uACBD", label: "\uB2E8\uC0C9 \uBC30\uACBD", tag: "simple background" }
];
export {
  APPEARANCE_CHIPS,
  APPEARANCE_MAX,
  GUIDANCE,
  PORTRAIT_MODEL,
  PORTRAIT_PRESETS,
  PORTRAIT_SIZE,
  PORTRAIT_STEPS,
  buildPortraitRequest,
  checkAppearance,
  clampGuidance,
  findPreset,
  normalizeAppearance
};
