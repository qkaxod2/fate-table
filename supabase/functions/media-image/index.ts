// NAI 그림 생성 (NovelAI V5 medium). 키는 함수 시크릿 NAI_API_KEY에만 있다.
// 요청: { kind?, presetId, appearance, negative?, guidance, seed?, expression?, baseUrl? }
//   kind: portrait(기본) · npc · standing(전신, 배경을 따서 투명 PNG) · expression(스탠딩 표정 차분) · scene(장면 배경)
// 응답: { ok, data: { url, seed, kind, expression? } } | { ok:false, error }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { unzipSync } from 'npm:fflate@0.8.2';
import { decode, encode } from 'npm:fast-png@6.3.0';
import {
  MEDIA_KINDS,
  TAGS_MAX,
  buildPortraitRequest,
  buildSceneRequest,
  buildStandingRequest,
  checkAppearance,
  findExpression,
  findPreset,
  matteBackground,
} from '../_shared/portrait.js';
import { withUsage } from '../_shared/quota.ts';

const NAI_URL = 'https://image.novelai.net/ai/generate-image';
const BUCKET = 'portraits';
// 예전 이름(PORTRAIT_DAILY_LIMIT)도 받는다. 초상화·스탠딩·배경을 합쳐 센다
const DAILY_LIMIT = Number(
  Deno.env.get('MEDIA_DAILY_LIMIT') ?? Deno.env.get('PORTRAIT_DAILY_LIMIT') ?? 60,
);
const IMAGE_KINDS = ['portrait', 'npc', 'standing', 'expression', 'scene'];

type Kind = (typeof MEDIA_KINDS)[number];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
const fail = (status: number, code: string, message: string) =>
  reply(status, { ok: false, error: { code, message } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 키당 동시 1건 제한이라 429면 2·4·8초 쉬고 다시 */
async function callNai(body: unknown, key: string): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(NAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status !== 429 || i >= 3) return res;
    await sleep(2000 * 2 ** i);
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 흰 배경 PNG → 배경을 딴 투명 PNG (그림 크기로 잘림) */
function cutOut(png: Uint8Array): Uint8Array {
  const img = decode(png);
  const channels = img.channels === 4 ? 4 : 3;
  const data =
    img.depth === 8 ? (img.data as Uint8Array) : Uint8Array.from(img.data, (v) => v >> 8);
  const out = matteBackground(data, img.width, img.height, channels);
  return encode({ width: out.width, height: out.height, data: out.data, channels: 4, depth: 8 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // 붙여 넣을 때 섞인 공백·따옴표·'Bearer ' 접두어는 걷어 낸다
  const naiKey = Deno.env
    .get('NAI_API_KEY')
    ?.replace(/\s|"/g, '')
    .replace(/^Bearer/i, '');
  if (!naiKey) return fail(503, 'NOT_CONFIGURED', '이미지 생성 키가 아직 설정되지 않았어요.');

  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  const user = who.user;
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return fail(400, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
  }
  const kind = String(input.kind ?? 'portrait') as Kind;
  if (!IMAGE_KINDS.includes(kind)) return fail(400, 'UNKNOWN_KIND', '없는 그림 종류예요.');
  const presetId = String(input.presetId ?? '');
  const appearance = String(input.appearance ?? '');
  const negative = typeof input.negative === 'string' ? input.negative.slice(0, 300) : undefined;
  const guidance = Number(input.guidance);
  const expression = typeof input.expression === 'string' ? input.expression : 'neutral';
  const seed =
    typeof input.seed === 'number' && Number.isInteger(input.seed)
      ? input.seed >>> 0
      : crypto.getRandomValues(new Uint32Array(1))[0]!;

  if (!findPreset(presetId)) return fail(400, 'UNKNOWN_PRESET', '없는 화풍이에요.');
  const issue = checkAppearance(appearance, kind === 'portrait' ? undefined : TAGS_MAX);
  if (issue) return fail(400, issue, '외형 입력을 확인해 주세요.');
  if (kind === 'expression' && !findExpression(expression))
    return fail(400, 'UNKNOWN_EXPRESSION', '없는 표정이에요.');

  const admin = createClient(url, service);
  // 사용량은 NovelAI를 부르기 전에 예약한다. 그림을 받기 전에 실패하면 예약을 돌려놓는다
  const quota = { userId: user.id, group: 'image', kinds: IMAGE_KINDS, kind, limit: DAILY_LIMIT };
  const refuse = (reason: 'limit' | 'unavailable') =>
    reason === 'limit'
      ? fail(429, 'QUOTA_EXCEEDED', `그림은 하루 ${DAILY_LIMIT}장까지 만들 수 있어요.`)
      : fail(503, 'QUOTA_UNAVAILABLE', '사용량을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return withUsage(admin, quota, refuse, async (keep) => {
    // 표정 차분은 원본 스탠딩(흰 배경, 잘리기 전)을 바탕으로 다시 그린다
    let baseImage: string | undefined;
    if (kind === 'expression') {
      const prefix = admin.storage.from(BUCKET).getPublicUrl('').data.publicUrl;
      const baseUrl = String(input.baseUrl ?? '');
      if (!baseUrl.startsWith(prefix) || !baseUrl.endsWith('.png'))
        return fail(400, 'BAD_BASE', '표정을 바꿀 스탠딩을 찾지 못했어요.');
      const rawPath = baseUrl
        .slice(prefix.length)
        .replace(/^\/+/, '')
        .replace(/\.png$/, '.raw.png');
      const { data: raw, error } = await admin.storage.from(BUCKET).download(rawPath);
      if (error || !raw) return fail(404, 'BAD_BASE', '이 스탠딩은 표정을 바꿀 원본이 없어요.');
      baseImage = toBase64(new Uint8Array(await raw.arrayBuffer()));
    }

    let body: unknown;
    try {
      body =
        kind === 'scene'
          ? buildSceneRequest({ presetId, tags: appearance, guidance, seed, negative })
          : kind === 'standing' || kind === 'expression'
            ? buildStandingRequest({
                presetId,
                tags: appearance,
                guidance,
                seed,
                negative,
                expression: kind === 'standing' ? 'neutral' : expression,
                ...(baseImage ? { baseImage } : {}),
              })
            : buildPortraitRequest({
                presetId,
                appearance,
                guidance,
                seed,
                negative,
                ...(kind === 'npc' ? { maxLength: TAGS_MAX } : {}),
              });
    } catch (e) {
      return fail(400, 'BAD_REQUEST', e instanceof Error ? e.message : '요청을 만들지 못했어요.');
    }

    const res = await callNai(body, naiKey);
    if (res.status === 429)
      return fail(429, 'BUSY', '다른 그림을 그리는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    if (!res.ok) {
      console.error('nai', kind, res.status, (await res.text()).slice(0, 300));
      return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
    // 여기부터는 생성 비용이 들었으므로 저장에 실패해도 사용량을 남긴다
    keep();

    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const png = Object.values(files)[0];
    if (!png) return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요.');

    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.png`;
    const store = (p: string, bytes: Uint8Array) =>
      admin.storage.from(BUCKET).upload(p, bytes, { contentType: 'image/png' });

    let final = png;
    if (kind === 'standing' || kind === 'expression') {
      // 원본은 다음 표정 차분의 바탕으로 남겨 둔다
      const rawUp = await store(`${user.id}/${id}.raw.png`, png);
      if (rawUp.error) console.error('upload raw', rawUp.error.message);
      try {
        final = cutOut(png);
      } catch (e) {
        console.error('matte', e instanceof Error ? e.message : e);
      }
    }
    const up = await store(path, final);
    if (up.error) {
      console.error('upload', up.error.message);
      return fail(500, 'STORAGE_FAILED', '그림을 저장하지 못했어요.');
    }
    keep(path);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return reply(200, {
      ok: true,
      data: {
        url: pub.publicUrl,
        seed,
        kind,
        ...(kind === 'standing' || kind === 'expression'
          ? { expression: kind === 'standing' ? 'neutral' : expression }
          : {}),
      },
    });
  });
});
