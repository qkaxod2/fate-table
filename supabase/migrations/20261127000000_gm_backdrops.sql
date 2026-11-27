-- GM 보관함에 '내 배경'을 더한다: 직접 올린 배경 그림(portraits 버킷 uploads/<내 id>/)의 주소와 이름.
-- 계정에 남으니 어느 방에서나 다시 꺼내 쓴다.
alter table public.gm_library drop constraint if exists gm_library_kind_check;
alter table public.gm_library
  add constraint gm_library_kind_check check (kind in ('npc', 'scene', 'backdrop'));
