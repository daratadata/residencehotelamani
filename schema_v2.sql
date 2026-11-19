-- À exécuter UNE FOIS dans Supabase > SQL Editor (après schema.sql)
alter table bookings add column nationality text, add column id_type text, add column id_number text, add column provenance text;
alter table room_types add column photo_url text;

create table payments(
  id bigserial primary key,
  booking_id bigint references bookings on delete cascade,
  kind text not null check(kind in('acompte','solde','caution','remboursement')),
  method text not null default 'especes' check(method in('especes','orange_money','mtn_momo','wave','moov','carte')),
  amount int not null check(amount>0), ref text,
  by uuid default auth.uid() references profiles, at timestamptz default now());
create table cash_closings(
  id bigserial primary key, by uuid default auth.uid() references profiles,
  expected int, counted int, at timestamptz default now());
create table watchlist(
  id bigserial primary key, name text, phone text, id_number text, reason text not null,
  created_at timestamptz default now());

alter table payments enable row level security;
alter table cash_closings enable row level security;
alter table watchlist enable row level security;
create policy pay_sel on payments for select using(is_staff());
create policy pay_ins on payments for insert with check(can_manage());
create policy clo_sel on cash_closings for select using(is_staff());
create policy clo_ins on cash_closings for insert with check(can_manage());
create policy w_sel on watchlist for select using(can_manage());
create policy w_ins on watchlist for insert with check(can_manage());
create policy w_del on watchlist for delete using(can_config());

-- Photos des chambres (stockage public en lecture, envoi réservé gérant/admin)
insert into storage.buckets(id,name,public) values('room-photos','room-photos',true) on conflict do nothing;
create policy ph_sel on storage.objects for select using(bucket_id='room-photos');
create policy ph_ins on storage.objects for insert with check(bucket_id='room-photos' and can_config());
create policy ph_upd on storage.objects for update using(bucket_id='room-photos' and can_config());
