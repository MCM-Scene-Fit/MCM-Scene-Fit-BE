-- 세션·매장 신청서·임시 업로드 사진만 저장한다.
-- 가방 10개 · 소지품 16종 · 매장 4곳은 바뀌지 않는 값이라 src/data 파일에 그대로 둔다.

create table if not exists sessions (
  id          text primary key,
  data        jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists sessions_expires_at_idx on sessions (expires_at);

create table if not exists fit_passes (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists uploads (
  id          text primary key,
  data        jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists uploads_expires_at_idx on uploads (expires_at);
