// 장면·인물 묘사 → NovelAI 태그 (Vertex AI Gemini). 지침은 guide.ts.
// 요청: { kind: 'scene'|'npc'|'standing', description, context? }
// 응답: { ok, data: { prompt, negative, summary, model } } | { ok:false, error }
import { admin, CORS, currentUser, fail, ok, readJson } from '../_shared/http.ts';
import { withUsage } from '../_shared/quota.ts';
import { generateJson, VERTEX_MODEL, VertexError, vertexConfigured } from '../_shared/vertex.ts';
import {
  GUIDE,
  RESPONSE_SCHEMA,
  userMessage,
  type PromptContext,
  type PromptKind,
} from './guide.ts';

const KINDS: readonly PromptKind[] = ['scene', 'npc', 'standing'];
const DAILY_LIMIT = Number(Deno.env.get('PROMPT_DAILY_LIMIT') ?? 120);
const DESCRIPTION_MAX = 1500;

/** 쉼표 구분 태그 정리: 공백·밑줄·작가 태그. 길이를 넘으면 태그 단위로 자른다 */
function tidy(tags: unknown, max: number): string {
  const out: string[] = [];
  let len = 0;
  for (const raw of String(tags ?? '').split(/[,\n]/)) {
    const t = raw.trim().replace(/_/g, ' ');
    if (!t || /^artist\s*:/i.test(t)) continue;
    if (len + t.length + 2 > max) break;
    out.push(t);
    len += t.length + 2;
  }
  return out.join(', ');
}

function cleanContext(raw: unknown): PromptContext {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);
  const out: PromptContext = {};
  const name = str(r.name, 80);
  const scene = str(r.scene, 200);
  if (name) out.name = name;
  if (scene) out.scene = scene;
  if (Array.isArray(r.aspects))
    out.aspects = r.aspects
      .map((a) => str(a, 120))
      .filter((a): a is string => !!a)
      .slice(0, 10);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  if (!vertexConfigured())
    return fail(503, 'NOT_CONFIGURED', '프롬프트 도우미(Gemini) 키가 아직 설정되지 않았어요.');

  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const input = await readJson<{ kind?: unknown; description?: unknown; context?: unknown }>(req);
  if (!input) return fail(400, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
  const kind = String(input.kind ?? '') as PromptKind;
  if (!KINDS.includes(kind)) return fail(400, 'UNKNOWN_KIND', '없는 그림 종류예요.');
  const description = String(input.description ?? '').slice(0, DESCRIPTION_MAX);
  const context = cleanContext(input.context);
  if (!description.trim() && !context.name && !context.aspects?.length)
    return fail(400, 'EMPTY', '어떤 그림인지 한 줄이라도 적어 주세요.');

  const db = admin();
  // 사용량은 Gemini를 부르기 전에 예약한다. 모델 호출이 실패하면 예약을 돌려놓는다
  const quota = {
    userId: user.id,
    group: 'prompt',
    kinds: ['prompt'],
    kind: 'prompt',
    limit: DAILY_LIMIT,
  };
  const refuse = (reason: 'limit' | 'unavailable') =>
    reason === 'limit'
      ? fail(429, 'QUOTA_EXCEEDED', `프롬프트 도우미는 하루 ${DAILY_LIMIT}번까지 쓸 수 있어요.`)
      : fail(503, 'QUOTA_UNAVAILABLE', '사용량을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return withUsage(db, quota, refuse, async (keep) => {
    let out: { prompt?: unknown; negative?: unknown; summary?: unknown };
    try {
      out = await generateJson({
        system: GUIDE,
        user: userMessage(kind, description, context),
        schema: RESPONSE_SCHEMA,
      });
    } catch (e) {
      if (e instanceof VertexError && e.status === 429)
        return fail(429, 'BUSY', '도우미가 바빠요. 잠시 뒤 다시 눌러 주세요.');
      if (e instanceof VertexError && e.status === 503)
        return fail(503, 'NOT_CONFIGURED', '프롬프트 도우미(Gemini) 키가 아직 설정되지 않았어요.');
      console.error('prompt', e instanceof Error ? e.message : e);
      return fail(502, 'LLM_FAILED', '프롬프트를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }

    // 모델을 불렀으니 결과가 비어도 사용량을 남긴다
    keep();
    const prompt = tidy(out.prompt, 880);
    if (!prompt) return fail(502, 'LLM_FAILED', '프롬프트를 만들지 못했어요. 다시 눌러 주세요.');
    return ok({
      prompt,
      negative: tidy(out.negative, 300),
      summary: String(out.summary ?? '').slice(0, 200),
      model: VERTEX_MODEL,
    });
  });
});
