-- =====================================================================
-- Garant: database schema for Supabase (PostgreSQL).
-- Run this whole file once in Supabase -> SQL Editor.
-- WARNING: running it again RESETS Garant's tables (saved plots, reports, chats).
-- Accounts themselves (Supabase Auth) are not touched.
-- =====================================================================

-- ---------- clean re-run ----------
drop function if exists public.my_plots();
drop table if exists public.ai_messages cascade;
drop table if exists public.notifications cascade;
drop table if exists public.saved_plots cascade;
drop table if exists public.reports cascade;
drop table if exists public.plots cascade;
drop table if exists public.seizure_notices cascade;
drop table if exists public.seizure_projects cascade;
drop table if exists public.cities cascade;
drop function if exists public.garant_handle_new_user() cascade;
drop table if exists public.profiles cascade;

-- ---------- reference data (public, read-only) ----------
create table public.cities (
  code         text primary key,
  name_ru      text not null,
  name_en      text not null,
  lat          double precision not null,
  lon          double precision not null,
  has_registry boolean not null default false
);

create table public.seizure_projects (
  id           text primary key,
  city_code    text not null references public.cities(code),
  title_ru     text not null,
  title_en     text not null,
  purpose_ru   text not null,
  purpose_en   text not null,
  doc_ru       text not null,
  doc_en       text not null,
  decree_date  date,
  period_from  date,
  period_to    date,
  source_name  text not null,
  source_url   text not null,
  published_at date
);

create table public.seizure_notices (
  id           bigint generated always as identity primary key,
  project_id   text not null references public.seizure_projects(id) on delete cascade,
  city_code    text not null references public.cities(code),
  district     text not null default '',
  locality     text not null default '',
  street       text not null default '',
  house        text not null default '',
  cadastral_no text,
  raw_address  text not null
);
create index seizure_notices_city_idx on public.seizure_notices (city_code);
create index seizure_notices_cad_idx  on public.seizure_notices (cadastral_no);

-- ---------- user data ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '' check (char_length(full_name) <= 120),
  lang          text not null default 'en' check (lang in ('en','ru')),
  notify_risk   boolean not null default true,
  notify_docs   boolean not null default true,
  notify_digest boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.plots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  address      text not null default '' check (char_length(address) <= 400),
  city         text not null default '' check (char_length(city) <= 120),
  region       text not null default '' check (char_length(region) <= 160),
  kind         text not null default '' check (char_length(kind) <= 60),
  -- Kazakhstan bounding box: anything outside is rejected by the database itself
  lat          double precision not null check (lat between 40.4 and 55.6),
  lon          double precision not null check (lon between 46.3 and 87.5),
  geom         jsonb,
  area_m2      numeric,
  cadastral_no text check (cadastral_no is null or cadastral_no ~ '^[0-9]{2}-[0-9]{3}-[0-9]{3}-[0-9]{2,5}$'),
  approx       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index plots_user_idx on public.plots (user_id, created_at desc);

create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  plot_id    uuid not null references public.plots(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  level      text not null check (level in ('high','mid','low')),
  data       jsonb not null,
  ai_summary jsonb,
  created_at timestamptz not null default now()
);
create index reports_plot_idx on public.reports (plot_id, created_at desc);
create index reports_user_idx on public.reports (user_id, created_at desc);

create table public.saved_plots (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plot_id     uuid not null references public.plots(id) on delete cascade,
  has_changes boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, plot_id)
);

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plot_id    uuid not null references public.plots(id) on delete cascade,
  report_id  uuid references public.reports(id) on delete cascade,
  kind       text not null check (kind in ('level_changed','new_risk','risk_gone')),
  params     jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.ai_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  report_id  uuid not null references public.reports(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null check (char_length(content) between 1 and 6000),
  sources    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_report_idx on public.ai_messages (report_id, created_at);
create index ai_messages_user_idx   on public.ai_messages (user_id, created_at desc);

-- ---------- profile is created automatically at sign-up ----------
create function public.garant_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.garant_handle_new_user() from public, anon, authenticated;

create trigger garant_on_auth_user_created
  after insert on auth.users
  for each row execute function public.garant_handle_new_user();

-- accounts that already exist get a profile too (matters when this file is re-run)
insert into public.profiles (id, full_name)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 120) from auth.users u
on conflict (id) do nothing;

-- ---------- row level security: every user sees only their own rows ----------
alter table public.cities            enable row level security;
alter table public.seizure_projects  enable row level security;
alter table public.seizure_notices   enable row level security;
alter table public.profiles          enable row level security;
alter table public.plots             enable row level security;
alter table public.reports           enable row level security;
alter table public.saved_plots       enable row level security;
alter table public.notifications     enable row level security;
alter table public.ai_messages       enable row level security;

create policy cities_read   on public.cities           for select to anon, authenticated using (true);
create policy projects_read on public.seizure_projects for select to anon, authenticated using (true);
create policy notices_read  on public.seizure_notices  for select to anon, authenticated using (true);

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy plots_select on public.plots for select to authenticated using (user_id = (select auth.uid()));
create policy plots_insert on public.plots for insert to authenticated with check (user_id = (select auth.uid()));
create policy plots_delete on public.plots for delete to authenticated using (user_id = (select auth.uid()));

create policy reports_select on public.reports for select to authenticated using (user_id = (select auth.uid()));
create policy reports_insert on public.reports for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.plots p where p.id = plot_id and p.user_id = (select auth.uid())));
create policy reports_update on public.reports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy saved_select on public.saved_plots for select to authenticated using (user_id = (select auth.uid()));
create policy saved_insert on public.saved_plots for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.plots p where p.id = plot_id and p.user_id = (select auth.uid())));
create policy saved_update on public.saved_plots for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_delete on public.saved_plots for delete to authenticated using (user_id = (select auth.uid()));

create policy notif_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_insert on public.notifications for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.plots p where p.id = plot_id and p.user_id = (select auth.uid())));
create policy notif_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ai_select on public.ai_messages for select to authenticated using (user_id = (select auth.uid()));
create policy ai_insert on public.ai_messages for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.reports r where r.id = report_id and r.user_id = (select auth.uid())));

-- ---------- privileges: grant only what the app needs ----------
revoke all on public.cities, public.seizure_projects, public.seizure_notices,
              public.profiles, public.plots, public.reports, public.saved_plots,
              public.notifications, public.ai_messages from anon, authenticated;

grant select on public.cities, public.seizure_projects, public.seizure_notices to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, lang, notify_risk, notify_docs, notify_digest) on public.profiles to authenticated;

grant select, insert, delete on public.plots to authenticated;
grant select, insert on public.reports to authenticated;
grant update (ai_summary) on public.reports to authenticated;
grant select, insert, delete on public.saved_plots to authenticated;
grant update (has_changes) on public.saved_plots to authenticated;
grant select, insert on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- chat history can be read and appended, never edited or deleted: the daily AI limit relies on it
grant select, insert on public.ai_messages to authenticated;

-- ---------- "My plots": saved plots with their latest report ----------
create function public.my_plots()
returns table (
  plot_id uuid, title text, address text, city text, kind text, area_m2 numeric,
  cadastral_no text, has_changes boolean, saved_at timestamptz,
  report_id uuid, level text, checked_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.title, p.address, p.city, p.kind, p.area_m2,
         p.cadastral_no, s.has_changes, s.created_at,
         r.id, r.level, r.created_at
  from public.saved_plots s
  join public.plots p on p.id = s.plot_id
  left join lateral (
    select rr.id, rr.level, rr.created_at
    from public.reports rr
    where rr.plot_id = p.id
    order by rr.created_at desc
    limit 1
  ) r on true
  where s.user_id = (select auth.uid())
  order by s.created_at desc
$$;
revoke all on function public.my_plots() from public, anon;
grant execute on function public.my_plots() to authenticated;

-- ---------- reference data: cities and the seizure registry ----------
-- Collected 2026-11-11 from public publications of akimat decrees; every project keeps its source link.
insert into public.cities (code, name_ru, name_en, lat, lon, has_registry) values
  ('astana', 'Астана', 'Astana', 51.1694, 71.4491, true),
  ('almaty', 'Алматы', 'Almaty', 43.2389, 76.8897, true),
  ('shymkent', 'Шымкент', 'Shymkent', 42.3417, 69.5901, false),
  ('karaganda', 'Караганда', 'Karaganda', 49.8047, 73.1094, false),
  ('aktobe', 'Актобе', 'Aktobe', 50.2839, 57.167, false),
  ('atyrau', 'Атырау', 'Atyrau', 47.0945, 51.9238, false),
  ('oskemen', 'Усть-Каменогорск', 'Oskemen', 49.9483, 82.6275, false),
  ('pavlodar', 'Павлодар', 'Pavlodar', 52.2873, 76.9674, false),
  ('taraz', 'Тараз', 'Taraz', 42.9, 71.3667, false),
  ('kostanay', 'Костанай', 'Kostanay', 53.2144, 63.6246, false),
  ('aktau', 'Актау', 'Aktau', 43.65, 51.1667, false),
  ('semey', 'Семей', 'Semey', 50.4111, 80.2275, false),
  ('kyzylorda', 'Кызылорда', 'Kyzylorda', 44.8528, 65.5092, false),
  ('oral', 'Уральск', 'Oral', 51.2333, 51.3667, false),
  ('petropavl', 'Петропавловск', 'Petropavl', 54.8667, 69.15, false),
  ('turkistan', 'Туркестан', 'Turkistan', 43.3, 68.25, false),
  ('taldykorgan', 'Талдыкорган', 'Taldykorgan', 45.0167, 78.3667, false),
  ('kokshetau', 'Кокшетау', 'Kokshetau', 53.2833, 69.3833, false);

insert into public.seizure_projects (id, city_code, title_ru, title_en, purpose_ru, purpose_en, doc_ru, doc_en, decree_date, period_from, period_to, source_name, source_url, published_at) values
  ('ast-2026-10-02-skver', 'astana', 'Сквер на пересечении улиц Нажимеденова, Тынышбайулы и Байтурсынулы', 'Public square at Nazhimedenov, Tynyshbaiuly and Baitursynuly streets', 'Изыскательские и проектные работы по объекту «Сквер», район Алматы', 'Survey and design work for the “Square” project, Almaty district', 'Постановление акимата г. Астаны от 02.10.2026', 'Astana akimat decree of 2 Oct 2026', '2026-10-02', '2026-12-28', '2027-12-28', 'Tengrinews, 08.10.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/zemelnyie-uchastki-tom-chisle-mnogoetajki-izyimayut-astane-610357/', '2026-10-08'),
  ('ast-2023-10-05-school-esil', 'astana', 'Школа в районе Есиль (жилой массив Заречное)', 'School in Esil district (Zarechnoye residential area)', 'Строительство школы, район Есиль; приложение к постановлению заменено в октябре 2026 года', 'School construction, Esil district; the decree appendix was replaced in October 2026', 'Постановление акимата г. Астаны от 05.10.2023 (в редакции от 02.10.2026)', 'Astana akimat decree of 5 Oct 2023 (as amended 2 Oct 2026)', '2023-10-05', null, null, 'Tengrinews, 08.10.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/zemelnyie-uchastki-tom-chisle-mnogoetajki-izyimayut-astane-610357/', '2026-10-08'),
  ('ast-2026-07-31-school-yuzhny', 'astana', 'Школа в районе Алматы у улицы Токпанова (ПКСИГ «Южный»)', 'School in Almaty district near Tokpanov St. (Yuzhny garage cooperative)', 'Строительство школы; в октябре 2026 года в список добавлены три участка', 'School construction; three plots were added to the list in October 2026', 'Постановление акимата г. Астаны от 31.07.2026 (дополнено 02.10.2026)', 'Astana akimat decree of 31 Jul 2026 (extended 2 Oct 2026)', '2026-07-31', null, null, 'Tengrinews, 08.10.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/zemelnyie-uchastki-tom-chisle-mnogoetajki-izyimayut-astane-610357/', '2026-10-08'),
  ('ast-2026-08-27-renovation', 'astana', 'Реновация жилья в районах Сарыарка и Байконыр', 'Housing renovation in Saryarka and Baikonyr districts', 'Программа реновации жилья и реализация генерального плана Астаны; 24 объекта, 1,7854 га', 'Housing renovation programme and the Astana master plan; 24 properties, 1.7854 ha', 'Постановление акимата г. Астаны (опубликовано 27.08.2026)', 'Astana akimat decree (published 27 Aug 2026)', null, null, null, 'bes.media, 27.08.2026 (по газете «Вечерняя Астана»)', 'https://bes.media/news/v-astane-izymut-uchastki-i-nedvizhimost-po-24-adresam-opublikovan-spisok/', '2026-08-27'),
  ('ast-2026-10-19-a56', 'astana', 'Улица А56 (проектное название), район Сарайшык', 'Street A56 (working name), Saraishyk district', 'Изыскательские и проектные работы по объекту «Улица А56» от улицы Нажимеденова; 51 участок, 4,9072 га', 'Survey and design work for “Street A56” from Nazhimedenov St.; 51 plots, 4.9072 ha', 'Постановление акимата г. Астаны от 19.10.2026', 'Astana akimat decree of 19 Oct 2026', '2026-10-19', '2026-12-28', '2027-12-28', 'Tengrinews, 03.11.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/dachi-snos-novoe-izyatie-zemelnyih-uchastkov-planiruyut-612229/', '2026-11-03'),
  ('ast-2026-08-31-water', 'astana', 'Водовод и насосно-фильтровальная станция № 4', 'Water main and pumping-filtration station No. 4', 'Изыскательские и проектные работы; 68 участков в районах Есиль, Сарайшык и Алматы (шоссе Каркаралы, пр. Кабанбай батыра, пр. Аль-Фараби, район аэропорта, трасса Астана — Караганда). Полный список адресов — в источнике', 'Survey and design work; 68 plots in Esil, Saraishyk and Almaty districts (Karkaraly highway, Kabanbay Batyr Ave., Al-Farabi Ave., the airport area, the Astana–Karaganda road). The full address list is in the source', 'Постановление акимата г. Астаны от 31.08.2026', 'Astana akimat decree of 31 Aug 2026', '2026-08-31', '2026-11-01', '2027-11-03', 'Tengrinews, 10.09.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/147-zemelnyih-uchastkov-izyimayut-v-astane-adresa-i-sroki-608191/', '2026-09-10'),
  ('ast-2026-09-01-collector', 'astana', 'Обводной коллектор очищенных стоков, район Нура', 'Bypass collector for treated wastewater, Nura district', 'Изыскательские и проектные работы; 61 участок вдоль озера Малый Талдыколь до шоссе Коргалжын (пр. Туран, ул. Чингиза Айтматова, ул. Розы Баглановой, ул. Казыбек би). Полный список адресов — в источнике', 'Survey and design work; 61 plots along Lake Maly Taldykol up to the Korgalzhyn highway (Turan Ave., Chingiz Aitmatov St., Roza Baglanova St., Kazybek Bi St.). The full address list is in the source', 'Постановление акимата г. Астаны от 01.09.2026', 'Astana akimat decree of 1 Sep 2026', '2026-09-01', '2026-11-01', '2027-11-03', 'Tengrinews, 10.09.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/147-zemelnyih-uchastkov-izyimayut-v-astane-adresa-i-sroki-608191/', '2026-09-10'),
  ('ast-2026-09-02-karlygash', 'astana', 'Подстанция 110/20 кВ «Карлыгаш», с/т «Зелёный остров»', '110/20 kV Karlygash substation, Zelyony Ostrov garden society', 'Изыскательские и проектные работы; 17 дачных участков, район Сарайшык', 'Survey and design work; 17 dacha plots, Saraishyk district', 'Постановление акимата г. Астаны от 02.09.2026', 'Astana akimat decree of 2 Sep 2026', '2026-09-02', '2026-11-01', '2027-11-03', 'Tengrinews, 10.09.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/147-zemelnyih-uchastkov-izyimayut-v-astane-adresa-i-sroki-608191/', '2026-09-10'),
  ('ast-2026-09-02-kns52', 'astana', 'Канализационная насосная станция № 52, район Есиль', 'Sewage pumping station No. 52, Esil district', 'Изыскательские и проектные работы; один дачный участок', 'Survey and design work; one dacha plot', 'Постановление акимата г. Астаны от 02.09.2026', 'Astana akimat decree of 2 Sep 2026', '2026-09-02', '2026-12-28', '2027-12-28', 'Tengrinews, 10.09.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/147-zemelnyih-uchastkov-izyimayut-v-astane-adresa-i-sroki-608191/', '2026-09-10'),
  ('ast-2026-08-20-admin-esil', 'astana', 'Административное здание, район Есиль', 'Administrative building, Esil district', 'Изыскательские и проектные работы для возможного административного здания; три участка, 16,4799 га', 'Survey and design work for a possible administrative building; three plots, 16.4799 ha', 'Постановление акимата г. Астаны от 20.08.2026', 'Astana akimat decree of 20 Aug 2026', '2026-08-20', '2026-11-01', '2027-11-03', 'Tengrinews, 31.08.2026 (по газете «Вечерняя Астана»)', 'https://tengrinews.kz/home-news/uchastki-stroitelstvo-jk-singapurskoy-shkolyi-izyimayut-607455/', '2026-08-31'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', 'Дачные участки в районе Сарайшык (июнь 2026)', 'Dacha plots in Saraishyk district (June 2026)', 'Принудительное отчуждение (выкуп) дачных участков; цель в публикации указана как «садоводство»', 'Compulsory buyout of dacha plots; the publication gives the purpose as “horticulture”', 'Постановление акимата г. Астаны от 15.06.2026', 'Astana akimat decree of 15 Jun 2026', '2026-06-15', null, null, 'bes.media, 31.07.2026 (по газете «Вечерняя Астана»)', 'https://bes.media/news/kakie-zemli-izymut-v-astane-dlya-gosnuzhd-polnyy-spisok/', '2026-07-31'),
  ('ast-2026-11-10-admin-nura', 'astana', 'Административное здание в районе Нура (ПКС «Дружба-2», с/т «Учитель»)', 'Administrative building in Nura district (Druzhba-2 and Uchitel garden societies)', 'Изыскательские и проектные работы у пересечения улицы Айтматова и проектной улицы Е167; 22 участка, 1,68 га', 'Survey and design work at Aitmatov St. and planned street E167; 22 plots, 1.68 ha', 'Постановление акимата г. Астаны (опубликовано в ноябре 2026)', 'Astana akimat decree (published November 2026)', null, '2027-02-01', '2028-02-01', 'Kursiv, 10.11.2026 (по газете «Вечерняя Астана»)', 'https://kz.kursiv.media/2026-11-10/shlc-akimat-astany-nachnet-prinuditelno-izymat-dachi-s-2027-goda/', '2026-11-10'),
  ('alm-2026-10-21-kairat-water', 'almaty', 'Сети водоснабжения и канализации, мкр Кайрат', 'Water supply and sewerage networks, Kairat microdistrict', 'Строительство сетей водоснабжения и водоотведения, Турксибский район; 13 участков', 'Water supply and sewerage networks, Turksib district; 13 plots', 'Постановление акимата г. Алматы от 21.10.2026', 'Almaty akimat decree of 21 Oct 2026', '2026-10-21', null, '2028-12-31', 'Tengrinews, 22.10.2026', 'https://tengrinews.kz/home-news/v-almatyi-gotovyat-novoe-izyyatie-zemel-opublikovanyi-adresa-611421/', '2026-10-22'),
  ('alm-2026-10-21-zhubanov', 'almaty', 'Пробивка улицы Жубанова, мкр Достык', 'Extension of Zhubanov St., Dostyk microdistrict', 'Пробивка улицы Жубанова, Наурызбайский район; 4 участка', 'Extension of Zhubanov St., Nauryzbai district; 4 plots', 'Постановление акимата г. Алматы от 21.10.2026', 'Almaty akimat decree of 21 Oct 2026', '2026-10-21', null, '2027-12-31', 'Tengrinews, 22.10.2026', 'https://tengrinews.kz/home-news/v-almatyi-gotovyat-novoe-izyyatie-zemel-opublikovanyi-adresa-611421/', '2026-10-22'),
  ('alm-2026-10-21-kairat-road', 'almaty', 'Подъездная дорога к полицентру «Восточные ворота», мкр Кайрат', 'Access road to the Vostochnye Vorota polycentre, Kairat microdistrict', 'Подъездная дорога до улицы Бухтарминской; 8 участков, приложение с адресами не опубликовано', 'Access road up to Bukhtarminskaya St.; 8 plots, the address appendix was not published', 'Постановление акимата г. Алматы от 21.10.2026', 'Almaty akimat decree of 21 Oct 2026', '2026-10-21', null, '2028-12-31', 'Tengrinews, 22.10.2026', 'https://tengrinews.kz/home-news/v-almatyi-gotovyat-novoe-izyyatie-zemel-opublikovanyi-adresa-611421/', '2026-10-22'),
  ('alm-2026-districts', 'almaty', 'Автобусные парки, школа, подстанция и благоустройство в разных районах', 'Bus depots, a school, a substation and landscaping in several districts', 'Автобусный парк в мкр Акжар, пристройка к школе и креативный центр в Жетысуском районе, подстанция 110 кВ «Восточные ворота», благоустройство в Алмалинском районе', 'Bus depot in Akzhar, school annex and creative centre in Zhetysu district, the 110 kV Vostochnye Vorota substation, landscaping in Almaly district', 'Постановления акимата г. Алматы (2026)', 'Almaty akimat decrees (2026)', null, null, '2027-12-31', 'Krisha.kz, 2026', 'https://krisha.kz/content/news/2026/2026-obyavlen-snos-v-raznyh-rayonah-almaty-dlya-chego-izymayut-uchastki', null),
  ('alm-2026-bus-depot-airport', 'almaty', 'Автобусный парк в Турксибском районе (мкр 9, Аэропорт)', 'Bus depot in Turksib district (microdistrict 9, Airport)', 'Строительство автобусного парка; три участка общей площадью 8,94 га', 'Bus depot construction; three plots, 8.94 ha in total', 'Постановление акимата г. Алматы (2026)', 'Almaty akimat decree (2026)', null, null, '2027-12-31', 'Krisha.kz, 2026', 'https://krisha.kz/content/news/2026/2026-snos-v-almaty-pochti-9-gektarov-zemli-izymaet-akimat', null),
  ('alm-2026-02-12-kalkaman', 'almaty', 'Лечебно-оздоровительный центр, мкр Калкаман', 'Health and wellness centre, Kalkaman microdistrict', 'Строительство лечебно-оздоровительного центра, Наурызбайский район; более 1,4 га', 'Health and wellness centre, Nauryzbai district; over 1.4 ha', 'Постановление акима г. Алматы от 12.02.2026', 'Almaty akim decree of 12 Feb 2026', '2026-02-12', null, '2027-12-31', 'Krisha.kz, 2026', 'https://krisha.kz/content/news/2026/2026-snos-v-almaty-gde-izymayut-uchastki-i-dlya-chego', null),
  ('alm-2026-07-tlendiev', 'almaty', 'Пробивка улицы Тлендиева от проспекта Рыскулова до границы города', 'Extension of Tlendiev St. from Ryskulov Ave. to the city boundary', 'Пробивка улицы Тлендиева, Алатауский район; 10 участков, около 0,5 га (опубликовано 7 адресов)', 'Extension of Tlendiev St., Alatau district; 10 plots, about 0.5 ha (7 addresses published)', 'Постановление акима г. Алматы (июль 2026)', 'Almaty akim decree (July 2026)', null, null, '2028-12-31', 'Ratel.kz, 24.07.2026 (со ссылкой на Krisha.kz)', 'https://ratel.kz/outlook/novyj_snos_v_almaty_gde_izymut_uchastki_dlja_probivki_ulitsy', '2026-07-24');

insert into public.seizure_notices (project_id, city_code, district, locality, street, house, cadastral_no, raw_address) values
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Нәжімеденов', '31/2', '21-318-067-2166', 'улица Нәжімеденов, участок № 31/2'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Байтұрсынұлы', '34/2', '21-318-067-2165', 'улица Байтұрсынұлы, участок № 34/2'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Тынышбайұлы', '11', '21-342-067-1966', 'улица Тынышбайұлы, участок № 11'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Тынышбайұлы', '7А', '21-318-067-1988', 'улица Тынышбайұлы, участок № 7А'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Байтұрсынұлы', '28/3', '21-342-067-2005', 'улица Байтұрсынұлы, участок № 28/3'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Байтұрсынұлы', '32/2', '21-318-067-2131', 'улица Байтұрсынұлы, участок №32/2'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Тынышбайұлы', '9А', '21-342-067-1987', 'улица Тынышбайұлы, участок № 9А'),
  ('ast-2026-10-02-skver', 'astana', '', '', 'улица Тынышбайұлы', '9', '21-342-067-1964', 'улица Тынышбайұлы, участок № 9'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'проезд 26', '5', '21-320-128-265', 'жилой массив Заречное, проезд 26, дом 5'),
  ('ast-2023-10-05-school-esil', 'astana', '', '', 'улица Ақмешіт', '1П', '21-320-128-1462', 'улица Ақмешіт, участок 1П'),
  ('ast-2023-10-05-school-esil', 'astana', '', '', 'улица Сауран', '10/1', '21-320-128-779', 'улица Сауран, участок № 10/1'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'улица 70 лет Октября', '71', '21-320-128-256', 'жилой массив Заречное, улица 70 лет Октября, дом 71'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'проезд 26', '1', '21-320-128-261', 'жилой массив Заречное, проезд 26, дом 1'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'улица 70 лет Октября', '74/1', '21-320-128-259', 'жилой массив Заречное, улица 70 лет Октября, дом 74/1'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'улица 70 лет Октября', '70', '21-320-128-260', 'жилой массив Заречное, улица 70 лет Октября, дом 70'),
  ('ast-2023-10-05-school-esil', 'astana', '', 'жилой массив Заречное', 'улица 70 лет Октября', '3', '21-320-128-335', 'жилой массив Заречное, улица 70 лет Октября, дом 3'),
  ('ast-2023-10-05-school-esil', 'astana', '', '', 'улица Сауран', '10', '21-320-128-712', 'улица Сауран, здание № 10'),
  ('ast-2026-07-31-school-yuzhny', 'astana', '', 'ПКСИГ "Южный"', '', '3320', '21-318-048-890', 'ПКСИГ "Южный", участок № 3320'),
  ('ast-2026-07-31-school-yuzhny', 'astana', '', 'ПКСИГ "Южный"', '', '2687', '21-318-048-300', 'ПКСИГ "Южный", участок № 2687'),
  ('ast-2026-07-31-school-yuzhny', 'astana', '', 'ПКСИГ "Южный"', '', '3348', '21-318-048-736', 'ПКСИГ "Южный", участок № 3348'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Абая', '1', null, 'район Сарыарка, ул. Абая, дом № 1'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. А. Молдагуловой', '18/2', null, 'район Сарыарка, ул. А. Молдагуловой, дом № 18/2'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. А. Молдагуловой', '24', null, 'район Сарыарка, ул. А. Молдагуловой, дом № 24'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'ул. Д. Бегельдинова', '5', null, 'район Байконыр, ул. Д. Бегельдинова, дом № 5'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'тупик Сейфуллина', '8', null, 'район Сарыарка, тупик Сейфуллина, дом № 8'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Кенесары', '21', null, 'район Сарыарка, ул. Кенесары, дом № 21'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'ул. С. Жунусова', '7', null, 'район Байконыр, ул. С. Жунусова, дом № 7'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Ж. Досмухамедулы', '8', null, 'район Сарыарка, ул. Ж. Досмухамедулы, дом № 8'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'ул. Ж. Досмухамедулы', '12', null, 'район Байконыр, ул. Ж. Досмухамедулы, дом № 12'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'ул. Ж. Досмухамедулы', '4', null, 'район Байконыр, ул. Ж. Досмухамедулы, дом № 4'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Герцена', '2А', null, 'район Сарыарка, ул. Герцена, дом № 2А'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. А. Молдагуловой', '18/3', null, 'район Сарыарка, ул. А. Молдагуловой, дом № 18/3'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'тупик Сейфуллина', '6', null, 'район Сарыарка, тупик Сейфуллина, дом № 6'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Кенесары', '19', null, 'район Сарыарка, ул. Кенесары, дом № 19'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Дукенулы', '3', null, 'район Сарыарка, ул. Дукенулы, дом № 3'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Дукенулы', '5', null, 'район Сарыарка, ул. Дукенулы, дом № 5'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'ул. Укили Ыбырая', '8', null, 'район Байконыр, ул. Укили Ыбырая, дом № 8'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Сейфуллина', '18/4', null, 'район Сарыарка, ул. Сейфуллина, дом № 18/4'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Сейфуллина', '18/3', null, 'район Сарыарка, ул. Сейфуллина, дом № 18/3'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Сейфуллина', '18/5', null, 'район Сарыарка, ул. Сейфуллина, дом № 18/5'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'пр. Абая', '87/2', null, 'район Байконыр, пр. Абая, дом № 87/2'),
  ('ast-2026-08-27-renovation', 'astana', 'Байконыр', '', 'пр. Абая', '87', null, 'район Байконыр, пр. Абая, дом № 87'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. Уалиханова', '3', null, 'район Сарыарка, ул. Уалиханова, дом № 3'),
  ('ast-2026-08-27-renovation', 'astana', 'Сарыарка', '', 'ул. В. Алтынсарина', '14', null, 'район Сарыарка, ул. В. Алтынсарина, дом № 14'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '22', '21-318-096-643', 'с/т "Зелёный остров", улица Узкая, участок №22'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '24', '21-318-096-645', 'с/т "Зелёный остров", улица Узкая, участок №24'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '76', '21-318-096-442', 'с/т "Журавушка", улица Центральная, участок №76'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Яблочная', '36', '21-318-096-961', 'с/т "Почтовик", улица Яблочная, участок №36'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Садовая', '98', '21-318-096-024', 'с/т "Журавушка", улица Садовая, участок №98'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '74', '21-318-096-440', 'с/т "Журавушка", улица Центральная, участок №74'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', '', '32', '21-318-096-409', 'с/т "Журавушка", участок №32'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Весенняя', '34', '21-318-096-411', 'с/т "Журавушка", улица Весенняя, участок №34'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Сливовая', '42', '21-318-096-252', 'ПКСДУ "Почтовик", улица Сливовая, участок №42'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '28', '21-318-096-647', 'с/т "Зелёный остров", улица Узкая, участок №28'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', '', '27', '21-318-096-066', 'с/т "Зелёный остров", дом №27'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '70', '21-318-096-438', 'с/т "Журавушка", улица Центральная, участок №70'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '72', '21-318-096-439', 'с/т "Журавушка", улица Центральная, участок №72'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Сливовая', '39', '21-318-096-243', 'с/т "Почтовик", улица Сливовая, участок №39'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Рябиновая', '76', '21-318-096-033', 'ПКСДУ "Почтовик", улица Рябиновая, участок №76'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '30', '21-318-096-648', 'с/т "Зелёный остров", улица Узкая, дом №30'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '27', '21-318-096-632', 'с/т "Зелёный остров", улица Набережная, участок №27'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', '', '73', '21-318-096-443', 'с/т "Журавушка", участок №73'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', '', '54', '21-318-096-046', 'с/т "Журавушка", участок №54'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Тенистая', '13', '21-318-096-128', 'ПКСДУ "Почтовик", улица Тенистая, участок №13'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '75', '21-318-096-441', 'с/т "Журавушка", улица Центральная, участок №75'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Весенняя', '30', '21-318-096-170', 'с/т "Журавушка", улица Весенняя, участок №30'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Весенняя', '36', '21-318-096-004', 'с/т "Журавушка", улица Весенняя, участок №36'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Яблочная', '36', '21-318-096-960', 'с/т "Почтовик", улица Яблочная, участок №36'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '23', '21-318-096-629', 'с/т "Зелёный остров", улица Набережная, участок №23'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '8', '21-318-096-183', 'с/т "Зелёный остров", улица Набережная, участок №8'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '69', '21-318-096-054', 'с/т "Журавушка", улица Центральная, участок №69'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', '', '41', '21-318-096-247', 'с/т "Почтовик", участок №41'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Газовая', '63', '21-318-096-345', 'с/т "Почтовик", улица Газовая, участок №63'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Сливовая', '40', '21-318-096-161', 'ПКСДУ "Почтовик", улица Сливовая, дом №40'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Сливовая', '38', '21-318-096-233', 'ПКСДУ "Почтовик", улица Сливовая, участок №38'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Яблочная', '36', '21-318-096-959', 'с/т "Почтовик", улица Яблочная, участок №36'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Сливовая', '35', '21-318-096-910', 'ПКСДУ "Почтовик", улица Сливовая, участок №35'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Сливовая', '34', '21-318-096-205', 'ПКСДУ "Почтовик", улица Сливовая, участок №34'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '26', '21-318-096-646', 'с/т "Зелёный остров", улица Узкая, участок №26'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '6', '21-318-096-899', 'с/т "Зелёный остров", улица Набережная, участок №6'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Сливовая', '37', '21-318-096-905', 'с/т "Почтовик", улица Сливовая, участок №37'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '25', '21-318-096-630', 'с/т "Зелёный остров", улица Набережная, участок №25'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '59', '21-318-096-434', 'с/т "Журавушка", улица Центральная, участок №59'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '71', '21-318-096-146', 'с/т "Журавушка", улица Центральная, участок №71'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '56', '21-318-096-245', 'с/т "Журавушка", улица Центральная, участок №56'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '58', '21-318-096-428', 'с/т "Журавушка", улица Центральная, участок №58'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Тенистая', '12', '21-318-096-231', 'ПКСДУ "Почтовик", улица Тенистая, участок №12'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Газовая', '64', '21-318-096-306', 'ПКСДУ "Почтовик", улица Газовая, участок №64'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Тенистая', '14', '21-318-096-365', 'ПКСДУ "Почтовик", улица Тенистая, участок №14'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Почтовик"', 'улица Яблочная', '36', '21-318-096-958', 'с/т "Почтовик", улица Яблочная, участок №36'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', '', '15', '21-318-096-895', 'ПКСДУ "Почтовик", участок №15'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Садовая', '100', '21-342-096-1166', 'с/т "Журавушка", улица Садовая, участок №100'),
  ('ast-2026-10-19-a56', 'astana', '', 'ПКСДУ "Почтовик"', 'улица Яблочная', '84', '21-342-096-1168', 'ПКСДУ "Почтовик", улица Яблочная, участок №84'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '21', '21-318-096-997', 'с/т "Зелёный остров", улица Набережная, участок №21'),
  ('ast-2026-10-19-a56', 'astana', '', 'с/т "Журавушка"', 'улица Центральная', '31', '21-318-096-408', 'с/т "Журавушка", улица Центральная, участок №31'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '2', null, 'с/т "Зелёный остров", улица Тупиковая, участок №2'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '3', null, 'с/т "Зелёный остров", улица Тупиковая, участок №3'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '4', null, 'с/т "Зелёный остров", улица Тупиковая, участок №4'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '5', null, 'с/т "Зелёный остров", улица Тупиковая, участок №5'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '6', null, 'с/т "Зелёный остров", улица Тупиковая, участок №6'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '7', null, 'с/т "Зелёный остров", улица Тупиковая, участок №7'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '8', null, 'с/т "Зелёный остров", улица Тупиковая, участок №8'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '9', null, 'с/т "Зелёный остров", улица Тупиковая, участок №9'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '10', null, 'с/т "Зелёный остров", улица Тупиковая, участок №10'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '11', null, 'с/т "Зелёный остров", улица Тупиковая, участок №11'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Тупиковая', '14', null, 'с/т "Зелёный остров", улица Тупиковая, участок №14'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Приишимская', '16', null, 'с/т "Зелёный остров", улица Приишимская, участок №16'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Приишимская', '18', null, 'с/т "Зелёный остров", улица Приишимская, участок №18'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Приишимская', '20', null, 'с/т "Зелёный остров", улица Приишимская, участок №20'),
  ('ast-2026-09-02-karlygash', 'astana', '', 'с/т "Зелёный остров"', 'улица Цветочная', '20', null, 'с/т "Зелёный остров", улица Цветочная, участок №20'),
  ('ast-2026-09-02-kns52', 'astana', '', 'с/т "Черёмушки АТП-1"', 'улица 8', '329', '21-320-112-426', 'с/т "Черёмушки АТП-1", улица 8, участок №329'),
  ('ast-2026-08-20-admin-esil', 'astana', 'Есиль', '', 'проспект Аль-Фараби', '46/8', '21-320-135-4787', 'район Есиль, проспект Аль-Фараби, участок №46/8'),
  ('ast-2026-08-20-admin-esil', 'astana', 'Есиль', '', 'улица Хусейн бен Талал', '42', '21-320-135-4474', 'район Есиль, улица Хусейн бен Талал, участок № 42'),
  ('ast-2026-08-20-admin-esil', 'astana', 'Есиль', '', 'улица № 38', '50/1', '21-320-135-4478', 'район Есиль, улица № 38, участок № 50/1'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '24', null, 'ПКСДУ "Силикатчик", участок 24'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '16', null, 'ПКСДУ "Силикатчик", участок 16'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '38', null, 'ПКСДУ "Силикатчик", участок 38'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '12', null, 'ПКСДУ "Силикатчик", участок 12'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица 2-я Набережная', '7', null, 'с/т "Зелёный остров", улица 2-я Набережная, участок 7'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '22', null, 'с/т "Зелёный остров", улица Набережная, участок 22'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Зелёная роща"', 'улица Малиновая', '1', null, 'ПКСДУ "Зелёная роща", улица Малиновая, участок 1'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица 2-я Набережная', '9', null, 'с/т "Зелёный остров", улица 2-я Набережная, участок 9'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '26', null, 'с/т "Зелёный остров", улица Набережная, участок 26'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '28', null, 'с/т "Зелёный остров", улица Набережная, участок 28'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '14', null, 'ПКСДУ "Силикатчик", участок 14'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Узкая', '35', null, 'с/т "Зелёный остров", улица Узкая, участок № 35'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Центральная', '37', null, 'с/т "Зелёный остров", улица Центральная, участок 37'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Центральная', '38', null, 'с/т "Зелёный остров", улица Центральная, участок 38'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица 2-я Набережная', '5', null, 'с/т "Зелёный остров", улица 2-я Набережная, участок 5'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Набережная', '20', null, 'с/т "Зелёный остров", улица Набережная, участок 20'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'с/т "Зелёный остров"', 'улица Центральная', '35', null, 'с/т "Зелёный остров", улица Центральная, участок 35'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Зелёная роща"', 'улица Малиновая', '2', null, 'ПКСДУ "Зелёная роща", улица Малиновая, участок 2'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '26', null, 'ПКСДУ "Силикатчик", участок 26'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '13', null, 'ПКСДУ "Силикатчик", участок 13'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Зелёная роща"', 'улица Малиновая', '3', null, 'ПКСДУ "Зелёная роща", улица Малиновая, участок 3'),
  ('ast-2026-06-15-sarayshyk-dachas', 'astana', '', 'ПКСДУ "Силикатчик"', '', '25', null, 'ПКСДУ "Силикатчик", участок 25'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '20', null, 'ПКС "Дружба-2", участок №20'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '40', null, 'ПКС "Дружба-2", участок №40'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '41А', null, 'ПКС "Дружба-2", участок №41А'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '42', null, 'ПКС "Дружба-2", участок №42'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '43', null, 'ПКС "Дружба-2", участок №43'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '44', null, 'ПКС "Дружба-2", участок №44'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '45', null, 'ПКС "Дружба-2", участок №45'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '45А', null, 'ПКС "Дружба-2", участок №45А'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '46', null, 'ПКС "Дружба-2", участок №46'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '47', null, 'ПКС "Дружба-2", участок №47'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '67', null, 'ПКС "Дружба-2", участок №67'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '68', null, 'ПКС "Дружба-2", участок №68'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '70', null, 'ПКС "Дружба-2", участок №70'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '70А', null, 'ПКС "Дружба-2", участок №70А'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '71', null, 'ПКС "Дружба-2", участок №71'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '170', null, 'ПКС "Дружба-2", участок №170'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '171', null, 'ПКС "Дружба-2", участок №171'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'ПКС "Дружба-2"', '', '41', null, 'ПКС "Дружба-2", строение 41'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'с/т "Учитель"', '', '3', null, 'с/т "Учитель", участок №3'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'с/т "Учитель"', '', '4', null, 'с/т "Учитель", участок №4'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'с/т "Учитель"', '', '5', null, 'с/т "Учитель", участок №5'),
  ('ast-2026-11-10-admin-nura', 'astana', '', 'с/т "Учитель"', '', '6', null, 'с/т "Учитель", участок №6'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '9', '20-317-104-1088', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 9'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '2', '20-317-104-111', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 2'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '26', '20-317-104-127', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 26'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '25', '20-317-104-135', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 25'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '358/12', '20-317-104-663', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 358/12'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '338/1', '20-317-104-781', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 338/1'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '643/39', '20-317-104-748', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 643/39'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '643/38', '20-317-104-761', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 643/38'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '500', '20-317-104-1141', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 500'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '37', '20-317-104-032', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 37'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '38', '20-317-104-036', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 38'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '41', '20-317-104-049', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 41'),
  ('alm-2026-10-21-kairat-water', 'almaty', '', 'мкр Кайрат; Потребительский кооператив имени Конаева', '', '643/1', '20-317-104-769', 'мкр Кайрат, Потребительский кооператив имени Конаева, участок 643/1'),
  ('alm-2026-10-21-zhubanov', 'almaty', '', 'микрорайон Достык', 'улица Сейтметова', '35', '20-322-005-254', 'микрорайон Достык, улица Сейтметова, дом 35'),
  ('alm-2026-10-21-zhubanov', 'almaty', '', 'микрорайон Достык', 'улица Нурпеисова', '45', '20-322-005-752', 'микрорайон Достык, улица Нурпеисова, дом 45'),
  ('alm-2026-10-21-zhubanov', 'almaty', '', 'микрорайон Достык', 'улица Смайылова', '50А', '20-322-005-916', 'микрорайон Достык, улица Смайылова, дом 50А'),
  ('alm-2026-10-21-zhubanov', 'almaty', '', 'микрорайон Достык', 'улица Смайылова', '56', '20-322-005-976', 'микрорайон Достык, улица Смайылова, дом 56'),
  ('alm-2026-districts', 'almaty', '', 'мкр Акжар', 'ул. Егинсу', '35/17', null, 'мкр Акжар, ул. Егинсу, дом 35/17'),
  ('alm-2026-districts', 'almaty', '', 'мкр Акжар', 'ул. Егинсу', '35/19', null, 'мкр Акжар, ул. Егинсу, дом 35/19'),
  ('alm-2026-districts', 'almaty', '', 'мкр Акжар', 'ул. Егинсу', '35/20', null, 'мкр Акжар, ул. Егинсу, дом 35/20'),
  ('alm-2026-districts', 'almaty', '', '', 'Кульджинский тракт', '22/2', null, 'Кульджинский тракт, дом 22/2'),
  ('alm-2026-districts', 'almaty', '', '', 'ул. Алимжанова', '73', null, 'ул. Алимжанова, дом 73'),
  ('alm-2026-districts', 'almaty', '', 'мкр Айнабулак', '', '65/2', null, 'мкр Айнабулак, дом 65/2'),
  ('alm-2026-districts', 'almaty', '', 'мкр Кайрат', '', '716', null, 'мкр Кайрат, дом 716'),
  ('alm-2026-districts', 'almaty', '', '', 'ул. Сокпакбаева', '72', null, 'ул. Сокпакбаева, дом 72'),
  ('alm-2026-02-12-kalkaman', 'almaty', '', 'мкр Калкаман', '', '4в', null, 'мкр Калкаман, участок 4в'),
  ('alm-2026-02-12-kalkaman', 'almaty', '', 'мкр Калкаман', '', '4/9', null, 'мкр Калкаман, участок 4/9'),
  ('alm-2026-02-12-kalkaman', 'almaty', '', 'мкр Калкаман', '', '4/10', null, 'мкр Калкаман, участок 4/10'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'мкр Ожет', 'ул. Шалкоде', '44', null, 'мкр Ожет, ул. Шалкоде, дом 44'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'мкр Ожет', 'ул. Красноармейская', '24', null, 'мкр Ожет, ул. Красноармейская, дом 24'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'мкр Ожет', 'ул. Жанайдара Садуакасова', '111', null, 'мкр Ожет, ул. Жанайдара Садуакасова, дом 111'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'мкр Ожет', 'ул. Хасен Оралтай', '214', null, 'мкр Ожет, ул. Хасен Оралтай, дом 214'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'мкр Болашак', '', '114/2', null, 'мкр Болашак, дом 114/2'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'ПК "Птицевод"', 'ул. Центральная', '25', null, 'ПК "Птицевод", ул. Центральная, дом 25'),
  ('alm-2026-07-tlendiev', 'almaty', '', 'ПК "Птицевод"', 'ул. Центральная', '29', null, 'ПК "Птицевод", ул. Центральная, дом 29');

-- registry: other cities (collected 19.11.2026)

insert into public.seizure_projects (id, city_code, title_ru, title_en, purpose_ru, purpose_en, doc_ru, doc_en, decree_date, period_from, period_to, source_name, source_url, published_at) values
('shym-2026-budget-121', 'shymkent', 'Принудительное отчуждение 121 участка до конца 2026 года', 'Compulsory acquisition of 121 plots by the end of 2026', 'Объекты транспортной, социальной и энергетической инфраструктуры; адреса в публикации не указаны', 'Transport, social and energy infrastructure; addresses not given in the publication', 'Паспорт бюджетной программы управления земельных отношений г. Шымкента (опубл. 09.10.2026)', 'Budget program passport of the Shymkent land relations department (published 9 Oct 2026)', null, null, '2026-12-31', 'Tengrinews, 20.10.2026', 'https://tengrinews.kz/home-news/121-zemelnyiy-uchastok-planiruyut-izyyat-kontsa-2026-goda-611227/', '2026-10-20'),
('osk-2026-pdp-22', 'oskemen', '9 участков в 22-м жилом районе (левый берег)', '9 plots in residential district 22 (left bank)', 'Школа, детские сады, проезды и инженерные сети по ПДП 22-го жилого района', 'School, kindergartens, driveways and utilities under the detailed plan of residential district 22', 'Постановление «О начале принудительного отчуждения земельных участков для государственных нужд», г. Усть-Каменогорск', 'Ust-Kamenogorsk decree on starting compulsory acquisition of land plots for state needs', null, null, null, 'Kazinform, август 2026', 'https://www.inform.kz/ru/zemli-pod-trts-i-mnogoetazhki-v-ust-kamenogorske-pereraspredelyat-pod-shkoli-i-d-d2713010', null),
('kst-2026-school-narimanov', 'kostanay', 'Школа на 1200 мест у Наримановской улицы', 'School for 1,200 pupils near Narimanovskaya street', 'Освобождение 36 участков под строительство школы; часть собственников согласилась на выкуп, часть дел в суде', '36 plots to be cleared for a school; some owners agreed to buyouts, some cases are in court', 'Изъятие для государственных нужд, акимат г. Костаная', 'Acquisition for state needs, Kostanay akimat', null, null, null, 'Костанайские новости, 08.06.2026', 'https://kstnews.kz/prodolzhaetsya-izyatie-zemelnyh-uchastkov-dlya-gosudarstvennyh-nuzhd-v-kostanae/', '2026-06-08'),
('kst-2026-park-kuznets', 'kostanay', 'Парковая зона у улицы Красный Кузнец (подтопляемая территория)', 'Park area near Krasny Kuznets street (flood-prone area)', 'Выкуп участков под парк: 25 участков выкуплены, 22 дома снесены, работа продолжается', 'Buyout for a park: 25 plots bought, 22 houses demolished, work continues', 'Изъятие для государственных нужд, акимат г. Костаная', 'Acquisition for state needs, Kostanay akimat', null, null, null, 'Костанайские новости, 08.06.2026', 'https://kstnews.kz/prodolzhaetsya-izyatie-zemelnyh-uchastkov-dlya-gosudarstvennyh-nuzhd-v-kostanae/', '2026-06-08'),
('atr-2026-baimukhanov', 'atyrau', 'Снос домов на изъятых участках: улицы Баймуханова и Амандосова', 'Demolition on acquired plots: Baimukhanov and Amandosov streets', 'Участки изъяты для государственных нужд, идёт снос 46 частных домов', 'Plots acquired for state needs; 46 private houses are being demolished', 'Изъятие для государственных нужд, г. Атырау (данные городского отдела ЖКХ)', 'Acquisition for state needs, Atyrau (city housing department)', null, null, null, 'Kazinform, октябрь 2026', 'https://www.inform.kz/ru/vatirau-snosyat-doma-napereshedshih-vgossobstvennost-territoriyah-edbe992c', null),
('pvl-2025-dostyk-stroitel', 'pavlodar', 'Микрорайон Достык: 14 участков в садоводстве «Строитель»', 'Dostyk microdistrict: 14 plots in the "Stroitel" garden society', 'Выкуп дачных участков под продолжение жилищного строительства по генплану', 'Buyout of garden plots to continue housing construction under the master plan', 'Согласование проектов договоров выкупа, Павлодарский городской маслихат', 'Approval of buyout contract drafts, Pavlodar city maslikhat', null, null, null, 'inbusiness.kz, 02.06.2025', 'https://inbusiness.kz/ru/last/sadovodcheskie-uchastki-izymut-pod-zastrojku-mikrorajona-v-pavlodare', '2025-06-02'),
('ptr-2026-06-kyzylzhar', 'petropavl', '33,8 га в Кызылжарском районе по обращению СЕВКАЗЭНЕРГО', '33.8 ha in Kyzylzhar district at the request of SEVKAZENERGO', 'Принудительное отчуждение частей земельных участков; проект в постановлении не назван', 'Compulsory acquisition of parts of plots; the project is not named in the decree', 'Постановление акимата Северо-Казахстанской области (опубл. 04.06.2026)', 'North Kazakhstan region akimat decree (published 4 Jun 2026)', null, null, null, 'Петропавловск news, 08.06.2026', 'https://pkzsk.info/na-severe-kazahstana-prinuditelno-izymut-34-gektara-zemli-dlya-gosudarstvennyh-nuzhd/', '2026-06-04'),
('ast-2026-11-06-runway', 'astana', 'Вторая взлётно-посадочная полоса аэропорта: 57 участков, 1019,7 га', 'Second airport runway: 57 plots, 1,019.7 ha', 'Строительство второй ВПП и реконструкция объектов аэропорта, район Есиль вдоль проспекта Кабанбай батыра', 'Second runway and airport reconstruction, Yesil district along Kabanbay Batyr avenue', 'Постановление акимата г. Астаны от 06.11.2026', 'Astana akimat decree of 6 Nov 2026', '2026-11-06', '2027-02-01', '2028-02-01', 'Zakon.kz, 13.11.2026', 'https://www.zakon.kz/pravo/6538506-v-astane-izymut-57-zemelnykh-uchastkov-dlya-stroitelstva-vzletnoposadochnoy-polosy.html', '2026-11-13')
on conflict (id) do nothing;

insert into public.seizure_notices (project_id, city_code, district, locality, street, house, raw_address)
select * from (values
('kst-2026-school-narimanov', 'kostanay', '', '', 'Наримановская улица', '', 'район Наримановской улицы (36 участков под школу)'),
('kst-2026-park-kuznets', 'kostanay', '', '', 'улица Красный Кузнец', '', 'район улицы Красный Кузнец (парковая зона)'),
('atr-2026-baimukhanov', 'atyrau', '', '', 'улица Баймуханова', '', 'улица Баймуханова (изъятые участки, снос домов)'),
('atr-2026-baimukhanov', 'atyrau', '', '', 'улица Амандосова', '', 'улица Амандосова (изъятые участки, снос домов)'),
('pvl-2025-dostyk-stroitel', 'pavlodar', '', 'Строитель;Достык', '', '', 'садоводство «Строитель», мкр Достык (14 участков)')
) v(project_id, city_code, district, locality, street, house, raw_address)
where not exists (select 1 from public.seizure_notices s where s.project_id = v.project_id and s.raw_address = v.raw_address);

update public.cities set has_registry = true where code in ('shymkent','oskemen','kostanay','atyrau','pavlodar','petropavl');
