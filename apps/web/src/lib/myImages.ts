import type { MediaKind } from '@fate/portrait';
import { useEffect, useState } from 'react';

/**
 * 내가 그린 그림 보관함. 생성할 때마다 PNG를 이 브라우저(IndexedDB)에 같이 담아 두고,
 * 다른 방·캐릭터에서 다시 고르거나 파일로 받을 수 있게 한다.
 */
export interface SavedImage {
  id: string;
  kind: MediaKind;
  /** 서버에 올라간 원본 주소. 방에 붙일 때는 이걸 쓴다 */
  url: string;
  seed: number;
  presetId: string;
  prompt: string;
  expression?: string;
  createdAt: string;
  /** 받아 둔 PNG. 원본을 못 받았으면 비어 있다 */
  blob?: Blob;
}

export type ImageMeta = Omit<SavedImage, 'id' | 'createdAt' | 'blob'>;

export const KIND_LABEL: Record<MediaKind, string> = {
  portrait: '초상화',
  npc: 'NPC',
  standing: '스탠딩',
  expression: '표정',
  scene: '장면 배경',
};

const DB = 'fate-gallery';
const STORE = 'images';
/** 넘치면 오래된 것부터 지운다 */
const MAX = 300;
const CHANGED = 'fate:gallery';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
      store.createIndex('url', 'url');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode: IDBTransactionMode) {
  return (await openDb()).transaction(STORE, mode).objectStore(STORE);
}

let channel: BroadcastChannel | null = null;

/** 같은 탭의 다른 화면과 다른 탭에 알린다 (채널은 자기가 보낸 건 받지 않는다) */
function announce() {
  try {
    channel ??= new BroadcastChannel(CHANGED);
    channel.postMessage(1);
  } catch {}
}

async function fetchBlob(url: string): Promise<Blob | undefined> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.blob() : undefined;
  } catch {
    return undefined;
  }
}

/** 새로 그린 그림을 보관함에 담는다. 실패해도 그림 그리기는 그대로 이어진다 */
export async function keepImage(meta: ImageMeta): Promise<void> {
  try {
    const blob = await fetchBlob(meta.url);
    const store = await tx('readwrite');
    if ((await done(store.index('url').count(meta.url))) > 0) return;
    const img: SavedImage = {
      ...meta,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...(blob ? { blob } : {}),
    };
    await done(store.put(img));
    await trim();
    // 브라우저가 공간이 모자랄 때 보관함을 먼저 비우지 않도록 부탁해 둔다
    void navigator.storage?.persist?.().catch(() => {});
    announce();
  } catch {
    // 사생활 보호 모드 등 저장소를 못 쓰는 환경에서는 조용히 넘어간다
  }
}

async function trim() {
  const store = await tx('readwrite');
  const n = await done(store.count());
  if (n <= MAX) return;
  const keys = await done(store.index('createdAt').getAllKeys(null, n - MAX));
  for (const k of keys) store.delete(k);
}

export async function listImages(): Promise<SavedImage[]> {
  try {
    const all = await done((await tx('readonly')).getAll() as IDBRequest<SavedImage[]>);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await done((await tx('readwrite')).delete(id));
    announce();
  } catch {}
}

function fileName(kind: string, seed: number, at = new Date()): string {
  const d = at.toISOString().slice(0, 10).replaceAll('-', '');
  return `fate-${kind}-${d}-${seed}.png`;
}

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** PNG 파일로 내려받는다. 보관함에 없으면 원본 주소에서 받아 온다 */
export async function downloadImage(
  img: Pick<SavedImage, 'url' | 'kind' | 'seed'> & { blob?: Blob; createdAt?: string },
): Promise<boolean> {
  let blob = img.blob;
  if (!blob) {
    const kept = (await listImages()).find((x) => x.url === img.url);
    blob = kept?.blob ?? (await fetchBlob(img.url));
  }
  if (!blob) return false;
  save(blob, fileName(img.kind, img.seed, img.createdAt ? new Date(img.createdAt) : undefined));
  return true;
}

export interface ShownImage extends SavedImage {
  /** 화면에 그릴 주소: 받아 둔 PNG가 있으면 그쪽 */
  src: string;
}

/** 보관함을 읽고, 다른 곳(다른 탭 포함)에서 바뀌면 다시 읽는다 */
export function useMyImages(kinds?: readonly MediaKind[]) {
  const [images, setImages] = useState<ShownImage[]>([]);
  const [ready, setReady] = useState(false);
  const filter = kinds?.join(',');

  useEffect(() => {
    let alive = true;
    let urls: string[] = [];
    const only = filter ? filter.split(',') : null;

    const load = async () => {
      const all = await listImages();
      if (!alive) return;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = [];
      setImages(
        all
          .filter((x) => !only || only.includes(x.kind))
          .map((x) => {
            if (!x.blob) return { ...x, src: x.url };
            const src = URL.createObjectURL(x.blob);
            urls.push(src);
            return { ...x, src };
          }),
      );
      setReady(true);
    };

    void load();
    const onChange = () => void load();
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANGED);
      bc.onmessage = onChange;
    } catch {}
    return () => {
      alive = false;
      bc?.close();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [filter]);

  return { images, ready };
}
