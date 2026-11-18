// 운영자 전용: 모든 사용자의 저장 캐릭터를 읽기 전용으로 돌려준다.
// 요청: { check?: true }  check면 운영자인지만 알려 준다 → { admin }
// 응답: { admin: true, characters: [{ owner, data, savedAt }] }  운영자가 아니면 403
import { admin, CORS, currentUser, fail, ok, readJson } from '../_shared/http.ts';

const LIMIT = 500;

interface Owner {
  id: string;
  label: string;
  anonymous: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'METHOD', 'POST만 받아요.');
  const user = await currentUser(req);
  if (!user) return fail(401, 'NOT_SIGNED_IN', '로그인이 필요해요.');

  const db = admin();
  const { data: row, error: adminErr } = await db
    .from('site_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminErr) return fail(500, 'DB', adminErr.message);
  const isAdmin = !!row && !user.is_anonymous;

  const body = await readJson<{ check?: unknown }>(req);
  if (body?.check) return ok({ admin: isAdmin });
  if (!isAdmin) return fail(403, 'FORBIDDEN', '운영자만 볼 수 있어요.');

  const { data: rows, error } = await db
    .from('saved_characters')
    .select('user_id, data, saved_at')
    .order('saved_at', { ascending: false })
    .limit(LIMIT);
  if (error) return fail(500, 'DB', error.message);

  // 주인 이름표: 이메일이 있으면 이메일, 없으면 익명 + id 앞자리
  const owners = new Map<string, Owner>();
  await Promise.all(
    [...new Set(rows.map((r) => r.user_id as string))].map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      const u = data.user;
      const anonymous = !u || !!u.is_anonymous;
      const name = (u?.user_metadata?.full_name ?? u?.user_metadata?.name) as string | undefined;
      const label = u?.email ? (name ? `${name} (${u.email})` : u.email) : `익명 ${id.slice(0, 8)}`;
      owners.set(id, { id, label, anonymous });
    }),
  );

  return ok({
    admin: true,
    truncated: rows.length === LIMIT,
    characters: rows.map((r) => ({
      owner: owners.get(r.user_id as string),
      data: r.data,
      savedAt: r.saved_at,
    })),
  });
});
