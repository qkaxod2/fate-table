-- 직접 올린 그림. 로그인한 사용자(익명 포함)는 portraits 버킷의 uploads/<자기 id>/ 아래에만
-- WEBP(Safari는 JPG)를 올릴 수 있다. 크기는 클라이언트가 긴 변 1024px · 1MB 아래로 줄여서 올린다.

drop policy if exists "portrait uploads: own folder" on storage.objects;
create policy "portrait uploads: own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portraits'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
    and storage.extension(name) in ('webp', 'jpg')
  );
