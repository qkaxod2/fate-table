-- GM 보관함에 '자료'(핸드아웃)를 더한다: 단서 · 편지 · 지도처럼 플레이어에게 띄워 줄 글과 그림.
-- 제목 · 본문 · 그림 주소 · GM 메모. GM 메모는 계정에만 남고 방에 보여 줄 때는 빠진다.
alter table public.gm_library drop constraint if exists gm_library_kind_check;
alter table public.gm_library
  add constraint gm_library_kind_check check (kind in ('npc', 'scene', 'backdrop', 'handout'));
