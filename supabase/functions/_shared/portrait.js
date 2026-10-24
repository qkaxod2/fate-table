// 자동 생성 파일: scripts/bundle-shared.mjs. 직접 고치지 않는다.

// packages/portrait/src/matte.ts
var N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
function backgroundColor(src, w, h, ch) {
  const samples = [[], [], []];
  const k = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (const [x0, y0] of [
    [0, 0],
    [w - k, 0],
    [0, h - k],
    [w - k, h - k]
  ]) {
    for (let y = y0; y < y0 + k; y++)
      for (let x = x0; x < x0 + k; x++) {
        const i = (y * w + x) * ch;
        for (let c = 0; c < 3; c++) samples[c].push(src[i + c]);
      }
  }
  return samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);
}
function matteBackground(src, width, height, channels = 4, opts = {}) {
  const hard = opts.hard ?? 26;
  const soft = opts.soft ?? 70;
  const holeMin = opts.holeMin ?? Math.round(width * height * 15e-4);
  const pad = opts.pad ?? 6;
  const w = width;
  const h = height;
  const n = w * h;
  const ch = channels;
  const s = src instanceof Uint8Array ? src : new Uint8Array(src.buffer, src.byteOffset, src.length);
  const bg = backgroundColor(s, w, h, ch);
  const dist = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * ch;
    const a = ch === 4 ? s[i + 3] : 255;
    if (a < 8) continue;
    dist[p] = Math.max(
      Math.abs(s[i] - bg[0]),
      Math.abs(s[i + 1] - bg[1]),
      Math.abs(s[i + 2] - bg[2])
    );
  }
  const mark = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (p) => {
    if (mark[p] === 0 && dist[p] <= hard) {
      mark[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = p / w | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      seed(ny * w + nx);
    }
  }
  const strict = Math.max(4, hard >> 2);
  for (let start = 0; start < n; start++) {
    if (mark[start] !== 0 || dist[start] > strict) continue;
    head = tail = 0;
    mark[start] = 2;
    queue[tail++] = start;
    let sum = 0;
    while (head < tail) {
      const p = queue[head++];
      sum += dist[p];
      const x = p % w;
      const y = p / w | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mark[q] === 0 && dist[q] <= strict) {
          mark[q] = 2;
          queue[tail++] = q;
        }
      }
    }
    if (tail >= holeMin && sum / tail < 2) for (let i = 0; i < tail; i++) mark[queue[i]] = 1;
  }
  const out = new Uint8Array(n * 4);
  for (let p = 0; p < n; p++) {
    const i = p * ch;
    const o = p * 4;
    if (mark[p] === 1) continue;
    let alpha = ch === 4 ? s[i + 3] : 255;
    let r = s[i];
    let g = s[i + 1];
    let b = s[i + 2];
    const d = dist[p];
    if (d < soft) {
      const x = p % w;
      const y = p / w | 0;
      let edge = false;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mark[ny * w + nx] === 1) edge = true;
      }
      if (edge) {
        const a = Math.min(1, Math.max(0, (d - hard) / (soft - hard)));
        if (a <= 0.02) continue;
        const un = (c, k) => Math.min(255, Math.max(0, Math.round((c - k * (1 - a)) / a)));
        r = un(r, bg[0]);
        g = un(g, bg[1]);
        b = un(b, bg[2]);
        alpha = Math.round(alpha * a);
      }
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = alpha;
  }
  return cropToContent({ data: out, width: w, height: h }, pad);
}
function cropToContent(img, pad = 0) {
  const { data, width: w, height: h } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + 1);
  const cw = x1 - x0 + 1;
  const chh = y1 - y0 + 1;
  if (cw === w && chh === h) return img;
  const out = new Uint8Array(cw * chh * 4);
  for (let y = 0; y < chh; y++)
    out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
  return { data: out, width: cw, height: chh };
}

// packages/portrait/src/stage.ts
var MEDIA_KINDS = ["portrait", "npc", "standing", "expression", "scene"];
var TAGS_MAX = 900;
var STANDING_SIZE = { width: 832, height: 1216 };
var SCENE_SIZE = { width: 1216, height: 832 };
var EXPRESSION_STRENGTH = 0.5;
var EXPRESSIONS = [
  { id: "neutral", label: "\uAE30\uBCF8", tags: "light smile, closed mouth" },
  { id: "smile", label: "\uC6C3\uC74C", tags: "smile, open mouth, happy, :d, eyes visible" },
  { id: "serious", label: "\uC9C4\uC9C0", tags: "serious, closed mouth, furrowed brow, determined" },
  { id: "angry", label: "\uD654\uB0A8", tags: "angry, v-shaped eyebrows, clenched teeth, glaring" },
  { id: "sad", label: "\uC2AC\uD514", tags: "sad, frown, tears, downturned eyes" },
  { id: "surprised", label: "\uB180\uB78C", tags: "surprised, wide-eyed, open mouth, raised eyebrows" },
  { id: "embarrassed", label: "\uB2F9\uD669", tags: "embarrassed, blush, wavy mouth, sweatdrop" },
  { id: "smug", label: "\uC5EC\uC720", tags: "smug, smirk, half-closed eyes, confident" }
];
function findExpression(id) {
  return EXPRESSIONS.find((e) => e.id === id);
}
var FACE_TAGS = new Set(
  [
    "smile",
    "light smile",
    "grin",
    "smirk",
    "laughing",
    "happy",
    "frown",
    "angry",
    "sad",
    "crying",
    "tears",
    "surprised",
    "shocked",
    "blush",
    "serious",
    "expressionless",
    "pout",
    "open mouth",
    "closed mouth",
    ":d",
    ":o",
    "smug",
    "embarrassed",
    "determined",
    "glaring"
  ].map((t) => t.toLowerCase())
);
var STANDING_FRAME = "solo, full body, standing, straight-on, looking at viewer, white background, simple background";
var STANDING_NEGATIVE = "cropped, feet out of frame, head out of frame, multiple views, reference sheet, turnaround, shadow, drop shadow, gradient background, detailed background, scenery, border, frame, text, speech bubble";
var SCENE_FRAME = "no humans, scenery, wide shot, background";
var SCENE_NEGATIVE = "1girl, 1boy, people, person, character, crowd, silhouette, text, speech bubble, signature, watermark, border, frame";
function splitTags(text) {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}
function joinTags(...parts) {
  return parts.map((p) => p?.trim()).filter(Boolean).join(", ");
}
function uniq(tags) {
  const seen = /* @__PURE__ */ new Set();
  return tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function standingCaption(tags, expressionId = "neutral") {
  const face = findExpression(expressionId) ?? EXPRESSIONS[0];
  const look = splitTags(normalizeAppearance(tags)).filter((t) => !FACE_TAGS.has(t.toLowerCase()));
  return uniq([...splitTags(STANDING_FRAME), ...look, ...splitTags(face.tags)]).join(", ");
}
function buildStandingRequest(input) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error("UNKNOWN_PRESET");
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
    ...input.baseImage ? { img2img: { image: input.baseImage, strength: EXPRESSION_STRENGTH } } : {}
  });
}
function buildSceneRequest(input) {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error("UNKNOWN_PRESET");
  const issue = checkAppearance(input.tags, TAGS_MAX);
  if (issue) throw new Error(issue);
  const scene = uniq([...splitTags(input.tags), ...splitTags(SCENE_FRAME)]).join(", ");
  return buildNaiBody({
    base: `${scene}, ${preset.prompt}`,
    negative: joinTags(SAFE_NEGATIVE, input.negative, SCENE_NEGATIVE, preset.negative),
    size: SCENE_SIZE,
    guidance: input.guidance,
    cfgRescale: preset.cfgRescale,
    seed: input.seed
  });
}

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
function checkAppearance(text, max = APPEARANCE_MAX) {
  const t = text.trim();
  if (!t) return "EMPTY";
  if (t.length > max) return "TOO_LONG";
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
  return buildNaiBody({
    base: preset.prompt,
    character: normalizeAppearance(input.appearance),
    negative: [SAFE_NEGATIVE, input.negative?.trim(), preset.negative].filter(Boolean).join(", "),
    size: PORTRAIT_SIZE,
    guidance: input.guidance,
    cfgRescale: preset.cfgRescale,
    seed: input.seed
  });
}
function buildNaiBody(o) {
  const center = { x: 0.5, y: 0.5 };
  const chars = o.character ? [{ prompt: o.character, uc: "", center, enabled: true }] : [];
  return {
    input: o.base,
    model: PORTRAIT_MODEL,
    action: o.img2img ? "img2img" : "generate",
    parameters: {
      params_version: 4,
      width: o.size.width,
      height: o.size.height,
      scale: clampGuidance(o.guidance),
      cfg_rescale: o.cfgRescale,
      sampler: "k_euler_ancestral",
      steps: PORTRAIT_STEPS,
      n_samples: 1,
      seed: o.seed >>> 0,
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
      ...o.img2img ? {
        image: o.img2img.image,
        strength: o.img2img.strength,
        noise: 0,
        extra_noise_seed: o.seed >>> 0
      } : {},
      characterPrompts: chars,
      v4_prompt: {
        caption: {
          base_caption: o.base,
          char_captions: chars.map((c) => ({ char_caption: c.prompt, centers: [center] }))
        },
        use_coords: false,
        use_order: true
      },
      v4_negative_prompt: {
        caption: {
          base_caption: o.negative,
          char_captions: chars.map(() => ({ char_caption: "", centers: [center] }))
        },
        legacy_uc: false
      },
      negative_prompt: o.negative
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
  EXPRESSIONS,
  EXPRESSION_STRENGTH,
  GUIDANCE,
  MEDIA_KINDS,
  PORTRAIT_MODEL,
  PORTRAIT_PRESETS,
  PORTRAIT_SIZE,
  PORTRAIT_STEPS,
  SAFE_NEGATIVE,
  SCENE_SIZE,
  STANDING_SIZE,
  TAGS_MAX,
  buildNaiBody,
  buildPortraitRequest,
  buildSceneRequest,
  buildStandingRequest,
  checkAppearance,
  clampGuidance,
  cropToContent,
  findExpression,
  findPreset,
  joinTags,
  matteBackground,
  normalizeAppearance,
  standingCaption
};
