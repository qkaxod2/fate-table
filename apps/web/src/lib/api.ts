import { FunctionsHttpError } from '@supabase/supabase-js';
import { ensureSession, getSupabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Edge Function 호출. 응답 형식은 { ok, data } | { ok:false, error:{code,message} } */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new ApiError('OFFLINE', '아직 서버가 연결되지 않았어요.');
  await ensureSession(sb);
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = await error.context.json().catch(() => null);
      const e = res?.error;
      if (e?.code) throw new ApiError(e.code, e.message);
    }
    throw new ApiError('NETWORK', '서버에 닿지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  return data.data as T;
}
