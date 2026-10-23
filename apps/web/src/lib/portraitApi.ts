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

export async function generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
  const sb = getSupabase();
  if (!sb) throw new PortraitError('OFFLINE', FALLBACK.OFFLINE!);
  await ensureSession(sb);
  const { data, error } = await sb.functions.invoke('media-image', { body: req });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      const e = body?.error;
      if (e?.code) throw new PortraitError(e.code, e.message);
    }
    throw new PortraitError('NETWORK', FALLBACK.NETWORK!);
  }
  return data.data as PortraitResult;
}
