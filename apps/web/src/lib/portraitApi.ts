import type { MediaKind } from '@fate/portrait';
import { FunctionsHttpError } from '@supabase/supabase-js';
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
  OFFLINE: '아직 서버가 연결되지 않아 그림을 만들 수 없어요.',
  NETWORK: '서버에 닿지 못했어요. 잠시 뒤 다시 눌러 주세요.',
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

export function generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
  return invoke('media-image', req);
}

/** 초상화·NPC·스탠딩·표정·장면 배경 (NAI) */
export function generateImage(req: ImageRequest): Promise<ImageResult> {
  return invoke('media-image', req);
}

/** 묘사 → NAI 태그 (Gemini) */
export function suggestPrompt(req: PromptRequest): Promise<PromptResult> {
  return invoke('media-prompt', req);
}
