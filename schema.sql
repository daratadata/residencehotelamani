-- Résidence Hotel Amani : à coller dans Supabase > SQL Editor > Run
create table profiles(
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text unique,
  role text not null default 'client' check(role in('client','receptionniste','gerant','proprietaire','admin')),
  created_at timestamptz default now());
create table room_types(
  id serial primary key, name text not null, description text,
  price int not null default 0, capacity int default 2, amenities text default '');
create table rooms(
  id serial primary key, number text unique not null,
  type_id int references room_types on delete restrict,
  status text not null default 'libre' check(status in('libre','occupee','nettoyage','maintenance')));
create table bookings(
  id bigserial primary key,
  client_id uuid references profiles on delete cascade,
  type_id int references room_types,
  room_id int references rooms,
  check_in date not null, check_out date not null check(check_out>check_in),
  guests int default 1, notes text,
  status text not null default 'en_attente' check(status in('en_attente','confirmee','arrivee','terminee','annulee')),
  created_at timestamptz default now());

-- Fonctions de rôle
create function my_role() returns text language sql stable security definer set search_path=public
as $$ select role from profiles where id=auth.uid() $$;
create function is_staff() returns boolean language sql stable as $$ select coalesce(my_role() in('receptionniste','gerant','proprietaire','admin'),false) $$;
create function can_manage() returns boolean language sql stable as $$ select coalesce(my_role() in('receptionniste','gerant','admin'),false) $$;
create function can_config() returns boolean language sql stable as $$ select coalesce(my_role() in('gerant','admin'),false) $$;

-- Profil créé à l'inscription. Le tout premier compte devient administrateur.
create function new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,full_name,phone,role) values(new.id,
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone',
    case when exists(select 1 from profiles) then 'client' else 'admin' end);
  return new;
end $$;
create trigger on_signup after insert on auth.users for each row execute function new_user();

-- Sécurité (RLS)
alter table profiles enable row level security;
alter table room_types enable row level security;
alter table rooms enable row level security;
alter table bookings enable row level security;

create policy p_sel on profiles for select using(id=auth.uid() or is_staff());
create policy p_upd on profiles for update using(my_role()='admin') with check(true);

create policy t_sel on room_types for select using(true);
create policy t_all on room_types for all using(can_config()) with check(can_config());

create policy r_sel on rooms for select using(is_staff());
create policy r_ins on rooms for insert with check(can_config());
create policy r_upd on rooms for update using(can_manage());

create policy b_sel on bookings for select using(client_id=auth.uid() or is_staff());
create policy b_ins on bookings for insert with check(client_id=auth.uid() and status='en_attente');
create policy b_cancel on bookings for update using(client_id=auth.uid() and status='en_attente') with check(status='annulee');
create policy b_upd on bookings for update using(can_manage());

-- Données de départ (modifiez les prix dans l'application)
insert into room_types(name,description,price,capacity,amenities) values
('Chambre Confort','Chambre climatisée, lit double, salle de bain privée',15000,2,'Climatisation, WiFi, TV'),
('Chambre Prestige','Chambre spacieuse avec coin salon',25000,2,'Climatisation, WiFi, Canal+, Minibar'),
('Suite Amani','Suite avec salon séparé, idéale pour les séjours longs',45000,4,'Climatisation, WiFi, Canal+, Cuisine');
insert into rooms(number,type_id) values('101',1),('102',1),('103',1),('201',2),('202',2),('301',3);
