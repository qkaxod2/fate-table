// NAI 그림 생성 (NovelAI V5 medium). 키는 함수 시크릿 NAI_API_KEY에만 있다.
// 요청: { kind?, presetId, appearance, negative?, guidance, seed?, expression?, baseUrl? }
//   kind: portrait(기본) · npc · standing(전신, 배경을 따서 투명 PNG) · expression(스탠딩 표정 차분) · scene(장면 배경)
// 응답: { ok, data: { url, seed, kind, expression? } } | { ok:false, error }
// async: true면 작업(media_jobs)만 쌓고 { ok, data: { jobId } } (202). 결과는 그 행의 result/error로 온다
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
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
import { fail, reply, serve } from '../_shared/http.ts';
import { withUsage } from '../_shared/quota.ts';

const NAI_URL = 'https://image.novelai.net/ai/generate-image';
const BUCKET = 'portraits';
// 예전 이름(PORTRAIT_DAILY_LIMIT)도 받는다. 초상화·스탠딩·배경을 합쳐 센다
const DAILY_LIMIT = Number(
  Deno.env.get('MEDIA_DAILY_LIMIT') ?? Deno.env.get('PORTRAIT_DAILY_LIMIT') ?? 60,
);
const IMAGE_KINDS = ['portrait', 'npc', 'standing', 'expression', 'scene'];

type Kind = (typeof MEDIA_KINDS)[number];

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

interface Job {
  kind: Kind;
  presetId: string;
  appearance: string;
  negative: string | undefined;
  guidance: number;
  expression: string;
  seed: number;
  baseUrl: string;
}

/** 요청을 검사해 작업으로 만든다. 잘못됐으면 그 오류 응답 */
function parseJob(input: Record<string, unknown>): Job | Response {
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
  return {
    kind,
    presetId,
    appearance,
    negative,
    guidance,
    expression,
    seed,
    baseUrl: String(input.baseUrl ?? ''),
  };
}

/** 그림 하나를 만들어 저장한다. 응답은 바로 돌려줄 때와 작업 결과로 남길 때 같은 모양이다 */
async function produce(
  admin: SupabaseClient,
  userId: string,
  job: Job,
  naiKey: string,
): Promise<Response> {
  const { kind, presetId, appearance, negative, guidance, expression, seed } = job;
  // 사용량은 NovelAI를 부르기 전에 예약한다. 그림을 받기 전에 실패하면 예약을 돌려놓는다
  const quota = { userId, group: 'image', kinds: IMAGE_KINDS, kind, limit: DAILY_LIMIT };
  const refuse = (reason: 'limit' | 'unavailable') =>
    reason === 'limit'
      ? fail(429, 'QUOTA_EXCEEDED', `그림은 하루 ${DAILY_LIMIT}장까지 만들 수 있어요.`)
      : fail(503, 'QUOTA_UNAVAILABLE', '사용량을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return withUsage(admin, quota, refuse, async (keep) => {
    // 표정 차분은 원본 스탠딩(흰 배경, 잘리기 전)을 바탕으로 다시 그린다
    let baseImage: string | undefined;
    if (kind === 'expression') {
      const prefix = admin.storage.from(BUCKET).getPublicUrl('').data.publicUrl;
      const baseUrl = job.baseUrl;
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
      // 키가 틀리거나 만료됐을 때. GitHub 시크릿만 바꾸면 Supabase 워크플로가 다시 돌아야 함수에 반영된다
      if (res.status === 401 || res.status === 403)
        return fail(
          503,
          'NAI_KEY_REJECTED',
          '이미지 생성 키가 거절됐어요. 관리자가 키를 확인해야 해요.',
        );
      if (res.status === 402)
        return fail(503, 'NAI_NO_CREDIT', '이미지 생성 계정의 구독이나 Anlas가 부족해요.');
      return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
    // 여기부터는 생성 비용이 들었으므로 저장에 실패해도 사용량을 남긴다
    keep();

    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const png = Object.values(files)[0];
    if (!png) return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요.');

    const id = crypto.randomUUID();
    const path = `${userId}/${id}.png`;
    const store = (p: string, bytes: Uint8Array) =>
      admin.storage.from(BUCKET).upload(p, bytes, { contentType: 'image/png' });

    let final = png;
    if (kind === 'standing' || kind === 'expression') {
      // 원본은 다음 표정 차분의 바탕으로 남겨 둔다
      const rawUp = await store(`${userId}/${id}.raw.png`, png);
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
}

/** Supabase Edge Runtime: 응답을 보낸 뒤에도 이 작업을 끝까지 돌린다 */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/**
 * 쌓인 그림 작업을 하나씩 처리한다. NovelAI는 키당 동시 1건이라 DB(claim_media_job)가
 * 한 번에 하나만 내준다. 다른 곳에서 이미 그리고 있으면 그쪽이 끝난 뒤 이어서 가져간다.
 */
async function drain(admin: SupabaseClient, naiKey: string): Promise<void> {
  // 함수 실행 시간 한도 안에서만 새 작업을 맡는다. 남은 작업은 다음 요청(또는 화면의 재촉)이 이어 간다
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const { data, error } = await admin.rpc('claim_media_job');
    if (error) {
      console.error('claim', error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      { id: string; user_id: string; input: Job } | null | undefined;
    if (!row?.id) return;
    let status = 'failed';
    let result: unknown = null;
    let err: unknown = null;
    try {
      const res = await produce(admin, row.user_id, row.input, naiKey);
      const json = await res.json();
      if (res.ok && json?.ok) {
        status = 'done';
        result = json.data;
      } else err = json?.error ?? { code: 'NAI_FAILED', message: '그림을 만들지 못했어요.' };
    } catch (e) {
      console.error('job', row.id, e);
      err = { code: 'SERVER', message: '그림을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
    const { error: upErr } = await admin
      .from('media_jobs')
      .update({ status, result, error: err, finished_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) console.error('job update', upErr.message);
  }
}

serve(async (req) => {
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
  // 기다리던 작업이 오래 그대로면 화면이 재촉한다: 쌓인 작업을 이어서 처리한다
  if (input.drain === true && typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(drain(createClient(url, service), naiKey));
    return reply(202, { ok: true, data: {} });
  }
  const job = parseJob(input);
  if (job instanceof Response) return job;
  const admin = createClient(url, service);

  // 비동기: 작업만 쌓고 바로 답한다. 화면은 media_jobs를 Realtime으로 지켜보다 끝나면 받는다
  if (input.async === true && typeof EdgeRuntime !== 'undefined') {
    const { data, error } = await admin
      .from('media_jobs')
      .insert({ user_id: user.id, kind: job.kind, input: job })
      .select('id')
      .single();
    if (error || !data) {
      console.error('job insert', error?.message);
      return fail(500, 'QUEUE_FAILED', '그림 작업을 맡기지 못했어요.');
    }
    EdgeRuntime.waitUntil(drain(admin, naiKey));
    return reply(202, { ok: true, data: { jobId: data.id } });
  }
  return produce(admin, user.id, job, naiKey);
});
