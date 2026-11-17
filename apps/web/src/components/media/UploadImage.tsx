'use client';

import { useRef, useState } from 'react';
import { portraitAvailable } from '@/lib/portraitApi';
import { UploadError, uploadImage } from '@/lib/uploadImage';
import styles from './UploadImage.module.css';

/**
 * 내 그림 올리기: 파일을 고르거나 끌어다 놓으면 줄여서 올리고 주소를 넘긴다.
 * 그리기 대신 직접 그린 그림·커미션 그림을 쓰고 싶을 때.
 */
export function UploadImage({
  onUploaded,
  label = '내 그림 올리기',
  hint = 'PNG · JPG · WEBP. 긴 변 1024px로 줄여서 올린다.',
}: {
  onUploaded: (url: string) => void | Promise<unknown>;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const online = portraitAvailable();

  async function take(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUploaded(await uploadImage(file));
    } catch (e) {
      setError(e instanceof UploadError ? e.message : '그림을 올리지 못함');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div
      className={styles.drop}
      data-over={over || undefined}
      onDragOver={(e) => {
        if (!online) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (online) void take(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <button
        type="button"
        className={styles.pick}
        disabled={!online || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? '올리는 중…' : label}
      </button>
      <span className={styles.hint}>
        {online ? `${hint} 여기로 끌어다 놓아도 된다.` : '서버 연결 후 사용 가능'}
      </span>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
