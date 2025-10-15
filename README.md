# LegalTrust.dev – MVP (Next.js + Supabase + OpenAI)

Input URL → fetch HTML → heuristics (Impressum/Datenschutz/Cookies/SSL) → GPT rating → (optional) store in Supabase.

## Quick start
1) Import repo to Vercel
2) Set `OPENAI_API_KEY` (and optionally Supabase vars)
3) Deploy

## Local
npm install
cp .env.example .env.local
npm run dev

## Supabase SQL
create table if not exists websites (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  created_at timestamp with time zone default now()
);
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  website_id uuid references websites(id) on delete cascade,
  status text not null default 'done',
  result_json jsonb,
  created_at timestamp with time zone default now()
);
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id) on delete cascade,
  summary text,
  score integer check (score between 0 and 100),
  created_at timestamp with time zone default now()
);
