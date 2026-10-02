-- Public-read bucket for parent-word recordings.
-- The tts Edge Function uploads with the service role, which bypasses RLS.
-- There is intentionally no insert/update/delete policy, so signed-in users cannot write objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts', 'tts', true, 1048576, array['audio/mpeg']::text[])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tts public read" on storage.objects;
create policy "tts public read"
on storage.objects
for select
to public
using (bucket_id = 'tts');
