# Hondenlogboek

Mobiele, realtime logboek-app voor Babs en Moos. Snel loggen met één tik, filters per hond en type, een daglijn en een weekoverzicht.

## Starten

1. `npm install`
2. Maak een `.env.local` aan op basis van `.env.example`.
3. `npm run dev`

## Supabase

Deze app gebruikt **geen auth**. De data is bewust publiek en gedeeld via de URL.

### Supabase setup (stappen)

1. Maak een nieuw Supabase project aan.
2. Open de SQL editor en voer het datamodel + policies hieronder uit.
3. Voeg de tabellen toe aan realtime (zie SQL-block hieronder).
4. Ga naar Project Settings → API en kopieer de Project URL + anon key.
5. Zet die waarden in `.env.local` (zie `.env.example`).

### Vereiste env vars

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Datamodel (SQL)

```
create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dog text not null check (dog in ('Babs', 'Moos')),
  type text not null check (type in (
    'poep',
    'plas',
    'wandeling',
    'maaltijd',
    'training',
    'verzorging',
    'welzijn'
  )),
  data jsonb not null default '{}'
);

create table public.training_types (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null unique
);

create table public.care_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null unique
);
```

### Policies (public read/write)

```
alter table public.events enable row level security;
alter table public.training_types enable row level security;
alter table public.care_actions enable row level security;

create policy "public read" on public.events for select using (true);
create policy "public write" on public.events for insert with check (true);
create policy "public update" on public.events for update using (true) with check (true);
create policy "public delete" on public.events for delete using (true);

create policy "public read" on public.training_types for select using (true);
create policy "public write" on public.training_types for insert with check (true);
create policy "public update" on public.training_types for update using (true) with check (true);
create policy "public delete" on public.training_types for delete using (true);

create policy "public read" on public.care_actions for select using (true);
create policy "public write" on public.care_actions for insert with check (true);
create policy "public update" on public.care_actions for update using (true) with check (true);
create policy "public delete" on public.care_actions for delete using (true);
```

### Realtime

```
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.training_types;
alter publication supabase_realtime add table public.care_actions;
```

### Defaults

De app seedt automatisch:

- Verzorging: `borstelen`, `blazen`, `nagels knippen`
- Training: `Algemeen`

## CSV-export

De knop **“Exporteer CSV (gefilterd)”** gebruikt de huidige filters en daglijn.

## PWA

De app bevat een manifest en icons zodat je hem als homescreen app kunt toevoegen.

## Structuur

- `src/App.jsx` bevat alle UI + logica
- `src/lib/supabase.js` bevat de Supabase client
- `src/index.css` bevat Tailwind + styling
