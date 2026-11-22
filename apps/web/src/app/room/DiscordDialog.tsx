'use client';

// 디스코드 알림: GM이 채널 웹훅 주소를 붙이면 세션 시작·끝, 장면 전환, 대성공, 퇴장이 그 채널에 한 줄씩 올라간다.
// 주소는 GM만 읽을 수 있는 칸(room_webhooks)에 두고, 보내기는 서버가 한다.
import { useEffect, useState } from 'react';
import { Leaf } from '@/components/book/Leaf';
import { getSupabase } from '@/lib/supabase';
import styles from '../rooms/exit.module.css';
import own from './discord.module.css';

export const DISCORD_WEBHOOK =
  /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;

export function DiscordDialog({
  roomId,
  userId,
  roomName,
  onClose,
}: {
  roomId: string;
  userId: string;
  roomName: string;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb
      .from('room_webhooks')
      .select('url')
      .eq('room_id', roomId)
      .maybeSingle()
      .then(({ data }) => {
        const u = (data?.url as string | undefined) ?? null;
        setSaved(u);
        setUrl(u ?? '');
      });
  }, [roomId]);

  const valid = DISCORD_WEBHOOK.test(url.trim());
  const save = async () => {
    const sb = getSupabase();
    if (!sb || !valid) return;
    setBusy(true);
    const { error } = await sb
      .from('room_webhooks')
      .upsert({
        room_id: roomId,
        url: url.trim(),
        created_by: userId,
        updated_at: new Date().toISOString(),
      });
    setBusy(false);
    if (error) return setMsg({ text: '저장하지 못함. 잠시 뒤 다시', error: true });
    setSaved(url.trim());
    setMsg({ text: '저장됨. 다음 장면 전환부터 알림이 간다' });
  };
  const remove = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.from('room_webhooks').delete().eq('room_id', roomId);
    setBusy(false);
    if (error) return setMsg({ text: '끄지 못함. 잠시 뒤 다시', error: true });
    setSaved(null);
    setUrl('');
    setMsg({ text: '알림을 껐다' });
  };
  // 디스코드는 응답을 읽을 수 없게 받으므로(no-cors) 보낸 뒤 채널에서 직접 확인한다
  const test = async () => {
    if (!valid) return;
    const body = new FormData();
    body.set('content', `🔔 「${roomName}」 알림 시험`);
    await fetch(url.trim(), { method: 'POST', mode: 'no-cors', body }).catch(() => {});
    setMsg({ text: '보냈다. 디스코드 채널에 시험 메시지가 왔는지 확인' });
  };

  return (
    <Leaf size="sm" title="디스코드 알림" label="디스코드 알림" onClose={onClose} locked={busy}>
      <form
        className={styles.box}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className={styles.text}>
          디스코드 채널 설정 → 연동 → 웹후크에서 만든 주소를 붙이면 세션 시작·끝, 장면 전환, 대성공,
          퇴장 소식이 그 채널에 올라간다. 비공개 내용(GM 메모 · 귓속말)은 보내지 않는다.
        </p>
        <label className={styles.field}>
          웹후크 주소
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            spellCheck={false}
            disabled={busy || saved === undefined}
            aria-invalid={(url.trim() !== '' && !valid) || undefined}
          />
        </label>
        {url.trim() !== '' && !valid && (
          <p className={styles.error}>디스코드 웹후크 주소가 아니다</p>
        )}
        {msg && (
          <p className={msg.error ? styles.error : styles.note} role="status">
            {msg.text}
          </p>
        )}
        <p className={styles.note}>주소를 아는 사람은 그 채널에 글을 쓸 수 있으니 GM만 본다.</p>
        <div className={styles.actions}>
          {saved && (
            <button
              type="button"
              className={styles.cancel}
              disabled={busy}
              onClick={() => void remove()}
            >
              알림 끄기
            </button>
          )}
          <button
            type="button"
            className={styles.cancel}
            disabled={busy || !valid}
            onClick={() => void test()}
          >
            시험 보내기
          </button>
          <button
            type="submit"
            className={own.primary}
            disabled={busy || !valid || url.trim() === saved}
          >
            저장
          </button>
        </div>
      </form>
    </Leaf>
  );
}
