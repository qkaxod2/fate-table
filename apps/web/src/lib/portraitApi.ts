import type { MediaKind } from '@fate/portrait';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { keepImage } from './myImages';
import { ensureSession, getSupabase } from './supabase';

export interface PortraitRequest {
  presetId: string;
  appearance: string;
  guidance: number;
  seed?: number;
}

export interface PortraitResult {
  url: string;
  seed: number;
}

export interface ImageRequest extends PortraitRequest {
  kind: MediaKind;
  negative?: string;
  /** 표정 차분: 바꿀 표정과 원본 스탠딩 */
  expression?: string;
  baseUrl?: string;
}

export interface ImageResult extends PortraitResult {
  kind: MediaKind;
  expression?: string;
}

export type PromptKind = 'scene' | 'npc' | 'standing';

export interface PromptRequest {
  kind: PromptKind;
  description: string;
  context?: { name?: string; aspects?: string[]; scene?: string };
}

export interface PromptResult {
  prompt: string;
  negative: string;
  summary: string;
  model: string;
}

export class PortraitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const FALLBACK: Record<string, string> = {
  OFFLINE: '서버 미연결이라 그림을 만들 수 없음',
  NETWORK: '서버에 닿지 못함. 잠시 뒤 다시 시도',
};

export function portraitAvailable(): boolean {
  return getSupabase() !== null;
}

async function invoke<T>(fn: string, body: object): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new PortraitError('OFFLINE', FALLBACK.OFFLINE!);
  await ensureSession(sb);
  const { data, error } = await sb.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = await error.context.json().catch(() => null);
      const e = res?.error;
      if (e?.code) throw new PortraitError(e.code, e.message);
    }
    throw new PortraitError('NETWORK', FALLBACK.NETWORK!);
  }
  return data.data as T;
}

interface JobRow {
  status: 'pending' | 'running' | 'done' | 'failed';
  result: unknown;
  error: { code?: string; message?: string } | null;
}

/** 작업을 끝까지 기다리는 최대 시간 */
const JOB_TIMEOUT_MS = 4 * 60_000;

/**
 * 그림은 작업 큐로 맡긴다: 서버는 바로 작업 id를 돌려주고, 끝나면 media_jobs 행이 done/failed로 바뀐다.
 * Realtime으로 지켜보면서, 놓칠 때를 대비해 몇 초마다 직접도 읽는다. 오래 그대로면 서버를 재촉한다.
 * (서버가 큐를 못 쓰는 환경이면 예전처럼 결과를 바로 돌려준다)
 */
async function invokeQueued<T>(body: object): Promise<T> {
  const first = await invoke<T | { jobId?: string }>('media-image', { ...body, async: true });
  const jobId = (first as { jobId?: string }).jobId;
  if (!jobId) return first as T;
  const sb = getSupabase()!;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = (row: JobRow | null) => {
      if (done || !row || (row.status !== 'done' && row.status !== 'failed')) return;
      done = true;
      cleanup();
      if (row.status === 'done') resolve(row.result as T);
      else
        reject(
          new PortraitError(
            row.error?.code ?? 'NAI_FAILED',
            row.error?.message ?? '그림을 만들지 못함',
          ),
        );
    };
    const read = async () => {
      const { data } = await sb
        .from('media_jobs')
        .select('status, result, error')
        .eq('id', jobId)
        .maybeSingle();
      finish(data as JobRow | null);
    };
    const channel = sb
      .channel(`media-job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'media_jobs', filter: `id=eq.${jobId}` },
        (msg) => finish(msg.new as JobRow),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void read();
      });
    const started = Date.now();
    let lastKick = started;
    const poll = window.setInterval(() => {
      if (Date.now() - started > JOB_TIMEOUT_MS) {
        done = true;
        cleanup();
        reject(new PortraitError('TIMEOUT', '그림이 너무 오래 걸림. 잠시 뒤 다시 시도'));
        return;
      }
      void read();
      if (Date.now() - lastKick > 30_000) {
        lastKick = Date.now();
        void invoke('media-image', { drain: true }).catch(() => {});
      }
    }, 4000);
    function cleanup() {
      window.clearInterval(poll);
      void sb.removeChannel(channel);
    }
  });
}

export async function generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
  const r = await invokeQueued<PortraitResult>(req);
  void keepImage({
    kind: 'portrait',
    url: r.url,
    seed: r.seed,
    presetId: req.presetId,
    prompt: req.appearance,
  });
  return r;
}

/** 초상화·NPC·스탠딩·표정·장면 배경 (NAI). 그린 그림은 내 그림 보관함에도 담긴다 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const r = await invokeQueued<ImageResult>(req);
  void keepImage({
    kind: req.kind,
    url: r.url,
    seed: r.seed,
    presetId: req.presetId,
    prompt: req.appearance,
    ...(req.expression ? { expression: req.expression } : {}),
  });
  return r;
}

/** 묘사 → NAI 태그 (Gemini) */
export function suggestPrompt(req: PromptRequest): Promise<PromptResult> {
  return invoke('media-prompt', req);
}
