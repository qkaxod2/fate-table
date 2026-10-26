'use client';

import { useEffect, useRef, useState } from 'react';
import { Leaf } from '@/components/book/Leaf';
import { ApiError } from '@/lib/api';
import { josa } from '@/lib/josa';
import { closeRoom, leaveRoom } from '@/lib/lobby';
import styles from './exit.module.css';

/** 낫표로 감싼 이름 뒤에 붙일 을/를 */
const objectJosa = (name: string) => josa(name, '을/를').slice(name.length);

/**
 * 방 나가기(참가자) · 방 지우기(GM). 지우기는 되돌릴 수 없으니 방 이름을 그대로 적어야 누를 수 있다.
 * GM은 혼자 나갈 수 없다 (GM이 없는 방이 된다).
 */
export function ExitRoomDialog({
  roomId,
  roomName,
  isGm,
  onDone,
  onCancel,
}: {
  roomId: string;
  roomName: string;
  isGm: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const leaveBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => (nameInput.current ?? leaveBtn.current)?.focus(), []);

  const confirmed = !isGm || typed.trim() === roomName.trim();
  const go = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      await (isGm ? closeRoom(roomId) : leaveRoom(roomId));
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '지금은 할 수 없어요. 잠시 뒤 다시 해 주세요.');
      setBusy(false);
    }
  };

  return (
    <Leaf
      role="alertdialog"
      size="sm"
      kicker={isGm ? '되돌릴 수 없어요' : '방 나가기'}
      title={isGm ? '방을 지울까요?' : '방에서 나갈까요?'}
      label={isGm ? '방을 지울까요?' : '방에서 나갈까요?'}
      onClose={onCancel}
      locked={busy}
    >
      <form
        className={styles.box}
        aria-describedby="exit-desc"
        data-danger={isGm || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        {isGm ? (
          <>
            <p id="exit-desc" className={styles.text}>
              「{roomName}」{objectJosa(roomName)} 지우면 장면·캐릭터·이야기 기록이 모두 사라지고{' '}
              <strong>되돌릴 수 없어요.</strong> 접속 중인 참가자에게는 방이 닫혔다고 알리고
              내보내요.
            </p>
            <p className={styles.note}>
              GM은 방을 나갈 수 없어요. 잠깐 쉬려는 거라면 그냥 창을 닫아도 방은 그대로 남아요.
            </p>
            <label className={styles.field}>
              확인하려면 방 이름을 그대로 적어 주세요
              <input
                ref={nameInput}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={roomName}
                autoComplete="off"
                disabled={busy}
              />
            </label>
          </>
        ) : (
          <p id="exit-desc" className={styles.text}>
            「{roomName}」에서 나가면 내 방 목록에서도 빠져요. 내 캐릭터는 방에 남고, 초대 코드로
            언제든 다시 들어올 수 있어요.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button
            ref={leaveBtn}
            type="submit"
            className={styles.danger}
            disabled={!confirmed || busy}
          >
            {busy ? (isGm ? '지우는 중…' : '나가는 중…') : isGm ? '방 지우기' : '나가기'}
          </button>
        </div>
      </form>
    </Leaf>
  );
}
