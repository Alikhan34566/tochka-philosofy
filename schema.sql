-- PostgreSQL / Supabase. Поля повторяют данные сайта (seed.json).
create table poets (
  id text primary key,            -- slug: abai, zhansug, makat...
  name_ru text not null, years text, region text, role text,
  core text, drama text, music text, modern text, challenge text, bio_deep jsonb,      -- deep: [[заголовок, текст]]
  evidence text check (evidence in ('ok','w')), evidence_label text, evidence_text text
);
create table poet_links (        -- цепочка: кто с кем связан
  from_id text references poets(id), to_id text references poets(id),
  note text, confidence text check (confidence in ('documented','tradition','hypothesis')),
  source_url text,               -- без источника связь не публикуем
  primary key (from_id, to_id)
);
create table works (id serial primary key, poet_id text references poets(id), title text, summary text, read_url text);
create table quotes (id serial primary key, poet_id text references poets(id), text_kk text, text_ru text, source text);
create table themes (id text primary key, title_ru text, title_kk text, body text);
create table poet_themes (poet_id text references poets(id), theme_id text references themes(id), primary key (poet_id, theme_id));
create table glossary (id text primary key, term text, definition text);
create table users (id uuid primary key default gen_random_uuid(), nickname text unique, role text default 'user', trust_level int default 0, created_at timestamptz default now());
create table thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  target text not null,          -- '' (общая лента) | id поэта | название темы
  body text not null check (char_length(body) between 5 and 1500),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  created_at timestamptz default now()
);
create table moderation_queue (
  id serial primary key, thought_id uuid references thoughts(id),
  reason text, reviewed_by uuid references users(id), decision text, reviewed_at timestamptz
);
create index on thoughts (target, status, created_at desc);
