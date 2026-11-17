import { ensureSession, getSupabase } from './supabase';

/** 직접 올린 그림의 긴 변. 초상화·스탠딩 칸보다 넉넉하게 */
export const UPLOAD_EDGE = 1024;
/** 고르기 전에 막는 원본 크기 (줄여서 올리므로 실제로 올라가는 건 훨씬 작다) */
export const UPLOAD_SOURCE_MAX = 20 * 1024 * 1024;
/** 줄인 뒤에도 이보다 크면 올리지 않는다 */
export const UPLOAD_MAX = 1024 * 1024;
const BUCKET = 'portraits';

export class UploadError extends Error {}

/** 줄인 뒤의 크기: 긴 변이 edge를 넘지 않게, 작은 그림은 그대로 */
export function fitWithin(w: number, h: number, edge = UPLOAD_EDGE): { w: number; h: number } {
  const scale = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

interface Shrunk {
  blob: Blob;
  ext: 'webp' | 'jpg';
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((r) => c.toBlob(r, type, q));

async function shrink(file: File): Promise<Shrunk> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new UploadError('그림 파일을 읽지 못함. PNG · JPG · WEBP 파일을 골라 주기');
  }
  const { w, h } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UploadError('이 브라우저에서는 그림을 줄일 수 없음');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  // 투명 배경을 살리려고 WEBP로 줄인다. 너무 크면 화질을 낮춰 한 번 더
  for (const q of [0.88, 0.75, 0.6]) {
    const blob = await toBlob(canvas, 'image/webp', q);
    // WEBP로 못 줄이는 브라우저(Safari)는 PNG를 돌려준다. 그러면 JPG로 넘어간다
    if (!blob || blob.type !== 'image/webp') break;
    if (blob.size <= UPLOAD_MAX) {
      bmp.close();
      return { blob, ext: 'webp' };
    }
  }
  // JPG는 투명한 곳이 검게 나오니 종이색을 먼저 깐다
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  for (const q of [0.88, 0.75, 0.6]) {
    const blob = await toBlob(canvas, 'image/jpeg', q);
    if (!blob) break;
    if (blob.size <= UPLOAD_MAX) return { blob, ext: 'jpg' };
  }
  throw new UploadError('그림이 너무 큼. 더 작은 파일로 다시 시도');
}

/**
 * 내 기기에 있는 그림을 올리고 공개 주소를 돌려준다. 긴 변 1024px WEBP(안 되면 JPG)로 줄여서
 * portraits 버킷의 uploads/<내 id>/ 아래에 둔다.
 */
export async function uploadImage(file: File): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new UploadError('서버 미연결이라 그림을 올릴 수 없음');
  if (!file.type.startsWith('image/')) throw new UploadError('그림 파일만 올릴 수 있음');
  if (file.size > UPLOAD_SOURCE_MAX) throw new UploadError('20MB보다 작은 그림을 골라 주기');
  const { blob, ext } = await shrink(file);
  await ensureSession(sb);
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new UploadError('로그인 정보를 확인하지 못함. 새로고침 후 다시 시도');
  const path = `uploads/${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw new UploadError('그림을 올리지 못함. 잠시 뒤 다시 시도');
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
