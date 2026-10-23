// 캐릭터 초상화 생성 (NovelAI V5 medium). 키는 함수 시크릿 NAI_API_KEY에만 있다.
// 요청: { presetId, appearance, guidance, seed? }  응답: { ok, data: { url, seed } } | { ok:false, error }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { unzipSync } from 'npm:fflate@0.8.2';
import { buildPortraitRequest, checkAppearance, findPreset } from '../_shared/portrait.js';

const NAI_URL = 'https://image.novelai.net/ai/generate-image';
const DAILY_LIMIT = Number(Deno.env.get('PORTRAIT_DAILY_LIMIT') ?? 30);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const naiKey = Deno.env.get('NAI_API_KEY');
  if (!naiKey) return fail(503, 'NOT_CONFIGURED', '이미지 생성 키가 아직 설정되지 않았어요.');

  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  const user = who.user;
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  let input: { presetId?: unknown; appearance?: unknown; guidance?: unknown; seed?: unknown };
  try {
    input = await req.json();
  } catch {
    return fail(400, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
  }
  const presetId = String(input.presetId ?? '');
  const appearance = String(input.appearance ?? '');
  const guidance = Number(input.guidance);
  const seed =
    typeof input.seed === 'number' && Number.isInteger(input.seed)
      ? input.seed >>> 0
      : crypto.getRandomValues(new Uint32Array(1))[0]!;

  if (!findPreset(presetId)) return fail(400, 'UNKNOWN_PRESET', '없는 화풍이에요.');
  const issue = checkAppearance(appearance);
  if (issue) return fail(400, issue, '외형 입력을 확인해 주세요.');

  const admin = createClient(url, service);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from('media_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'portrait')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return fail(429, 'QUOTA_EXCEEDED', `초상화는 하루 ${DAILY_LIMIT}장까지 만들 수 있어요.`);
  }

  const body = buildPortraitRequest({ presetId, appearance, guidance, seed });
  const res = await callNai(body, naiKey);
  if (res.status === 429)
    return fail(429, 'BUSY', '다른 그림을 그리는 중이에요. 잠시 뒤 다시 눌러 주세요.');
  if (!res.ok) {
    console.error('nai', res.status, (await res.text()).slice(0, 300));
    return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }

  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const png = Object.values(files)[0];
  if (!png) return fail(502, 'NAI_FAILED', '그림을 만들지 못했어요.');

  const path = `${user.id}/${crypto.randomUUID()}.png`;
  const up = await admin.storage.from('portraits').upload(path, png, { contentType: 'image/png' });
  if (up.error) {
    console.error('upload', up.error.message);
    return fail(500, 'STORAGE_FAILED', '그림을 저장하지 못했어요.');
  }
  await admin.from('media_usage').insert({ user_id: user.id, kind: 'portrait', path });

  const { data: pub } = admin.storage.from('portraits').getPublicUrl(path);
  return reply(200, { ok: true, data: { url: pub.publicUrl, seed } });
});
