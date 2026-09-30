-- =========================================================
-- BloomCard — cài đặt Supabase (chạy lại nhiều lần vẫn an toàn)
-- Dán toàn bộ vào SQL Editor -> Run
-- =========================================================
create table if not exists products (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  price       integer not null default 0,
  stock       integer not null default 1,
  status      text not null default 'available',
  badge       text default '',
  image       text,
  image2      text,
  video       text,
  position    integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz default now()
);

-- Tự động thêm cột image2 và video nếu bảng products đã được tạo từ trước
alter table products add column if not exists image2 text;
alter table products add column if not exists video text;

create table if not exists feedbacks (
  id          text primary key default gen_random_uuid()::text,
  image       text not null,
  position    integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz default now()
);

alter table products  enable row level security;
alter table feedbacks enable row level security;

drop policy if exists "khach xem products"  on products;
drop policy if exists "khach xem feedbacks" on feedbacks;
drop policy if exists "admin products"      on products;
drop policy if exists "admin feedbacks"     on feedbacks;

create policy "khach xem products"  on products  for select to anon using (deleted_at is null);
create policy "khach xem feedbacks" on feedbacks for select to anon using (deleted_at is null);
create policy "admin products"  on products  for all to authenticated using (true) with check (true);
create policy "admin feedbacks" on feedbacks for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "ai cung xem anh"   on storage.objects;
drop policy if exists "admin tai anh len" on storage.objects;
drop policy if exists "admin sua anh"     on storage.objects;
drop policy if exists "admin xoa anh"     on storage.objects;

create policy "ai cung xem anh"   on storage.objects for select using (bucket_id = 'images');
create policy "admin tai anh len" on storage.objects for insert to authenticated with check (bucket_id = 'images');
create policy "admin sua anh"     on storage.objects for update to authenticated using (bucket_id = 'images');
create policy "admin xoa anh"     on storage.objects for delete to authenticated using (bucket_id = 'images');

-- =========================================================
-- Bảng cài đặt (bảo trì, v.v.)
-- =========================================================
create table if not exists site_settings (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz default now()
);

alter table site_settings enable row level security;

drop policy if exists "khach xem settings"  on site_settings;
drop policy if exists "admin settings"      on site_settings;

create policy "khach xem settings"  on site_settings for select using (true);
create policy "admin settings"      on site_settings for all to authenticated using (true) with check (true);

-- Mặc định: tắt bảo trì
insert into site_settings (key, value) values ('maintenance_mode', 'false')
on conflict (key) do nothing;
