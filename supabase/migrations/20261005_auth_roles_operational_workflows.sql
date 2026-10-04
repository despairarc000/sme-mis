-- SME MIS authentication, tenant isolation, catalog/price/stock workflow functions.
-- Applied to the connected Supabase project before being recorded here.

alter table public.staff_account
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

create or replace function public.current_staff_account_id()
returns integer
language sql stable security definer set search_path = ''
as $$
  select sa.staff_account_id
  from public.staff_account sa
  where sa.auth_user_id = auth.uid()
    and sa.status = 'Active'
  limit 1
$$;

create or replace function public.current_sme_id()
returns integer
language sql stable security definer set search_path = ''
as $$
  select sa.sme_id
  from public.staff_account sa
  where sa.auth_user_id = auth.uid()
    and sa.status = 'Active'
  limit 1
$$;

create or replace function public.current_staff_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select sa.role
  from public.staff_account sa
  where sa.auth_user_id = auth.uid()
    and sa.status = 'Active'
  limit 1
$$;

create or replace function public.register_sme_owner(
  p_sme_name text,
  p_region text default null,
  p_province text default null,
  p_city_municipality text default null,
  p_barangay text default null,
  p_full_name text default null
)
returns table (sme_id integer, staff_account_id integer)
language plpgsql security definer set search_path = ''
as $$
declare
  new_sme_id integer;
  new_staff_id integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if exists (select 1 from public.staff_account where auth_user_id = auth.uid()) then
    raise exception 'This account is already linked to an SME';
  end if;
  if nullif(trim(p_sme_name), '') is null then raise exception 'Business name is required'; end if;

  insert into public.sme (
    sme_name, region, province, city_municipality, barangay,
    cost_module_enabled, stock_module_enabled, sales_log_enabled, scan_enabled, status
  )
  values (
    trim(p_sme_name), nullif(trim(p_region), ''), nullif(trim(p_province), ''),
    nullif(trim(p_city_municipality), ''), nullif(trim(p_barangay), ''),
    false, false, false, false, 'Active'
  )
  returning public.sme.sme_id into new_sme_id;

  insert into public.staff_account (sme_id, role, full_name, status, auth_user_id)
  values (new_sme_id, 'Owner', coalesce(nullif(trim(p_full_name), ''), 'Owner'), 'Active', auth.uid())
  returning public.staff_account.staff_account_id into new_staff_id;

  return query select new_sme_id, new_staff_id;
end;
$$;

create or replace function public.create_item(
  p_product_id integer,
  p_current_price numeric,
  p_current_cost numeric default null,
  p_current_stock_qty integer default null,
  p_reorder_level integer default null,
  p_shelf_location text default null,
  p_barcode_qr_value text default null
)
returns public.item
language plpgsql security definer set search_path = ''
as $$
declare
  new_item public.item;
  my_sme integer;
  my_role text;
begin
  my_sme := public.current_sme_id();
  my_role := public.current_staff_role();

  if my_sme is null or my_role not in ('Owner', 'Manager') then
    raise exception 'Owner or Manager access is required';
  end if;
  if p_current_price is null or p_current_price < 0 then raise exception 'A valid current price is required'; end if;
  if p_current_cost is not null and p_current_cost < 0 then raise exception 'Cost cannot be negative'; end if;
  if p_current_stock_qty is not null and p_current_stock_qty < 0 then raise exception 'Opening stock cannot be negative'; end if;
  if p_reorder_level is not null and p_reorder_level < 0 then raise exception 'Reorder level cannot be negative'; end if;
  if not exists (select 1 from public.product where product_id = p_product_id) then raise exception 'Product not found'; end if;
  if exists (select 1 from public.item where sme_id = my_sme and product_id = p_product_id and status = 'Active') then
    raise exception 'This product is already listed by this SME';
  end if;

  insert into public.item (
    sme_id, product_id, current_price, current_cost, current_stock_qty, reorder_level,
    shelf_location, barcode_qr_value, status
  )
  values (
    my_sme, p_product_id, p_current_price, p_current_cost, p_current_stock_qty, p_reorder_level,
    nullif(trim(p_shelf_location), ''), nullif(trim(p_barcode_qr_value), ''), 'Active'
  )
  returning * into new_item;

  if p_current_stock_qty is not null and p_current_stock_qty > 0 then
    insert into public.stock_movement (item_id, staff_account_id, movement_type, quantity)
    values (new_item.item_id, public.current_staff_account_id(), 'RESTOCK', p_current_stock_qty);
  end if;
  return new_item;
end;
$$;

create or replace function public.change_item_price(
  p_item_id integer,
  p_new_price numeric,
  p_reason text default null,
  p_is_correction boolean default false
)
returns public.item
language plpgsql security definer set search_path = ''
as $$
declare
  my_sme integer;
  my_role text;
  old_price numeric;
  changed_item public.item;
begin
  my_sme := public.current_sme_id();
  my_role := public.current_staff_role();

  if my_sme is null or my_role not in ('Owner', 'Manager') then raise exception 'Owner or Manager access is required'; end if;
  if p_new_price is null or p_new_price < 0 then raise exception 'A valid new price is required'; end if;

  select current_price into old_price
  from public.item
  where item_id = p_item_id and sme_id = my_sme and status = 'Active'
  for update;

  if old_price is null then raise exception 'Active item not found'; end if;
  if old_price = p_new_price then raise exception 'New price must differ from the current price'; end if;

  update public.item
  set current_price = p_new_price, price_updated_at = now()
  where item_id = p_item_id and sme_id = my_sme
  returning * into changed_item;

  insert into public.price_change_log (
    sme_id, item_id, staff_account_id, old_price, new_price, reason, is_correction
  )
  values (
    my_sme, p_item_id, public.current_staff_account_id(), old_price, p_new_price,
    nullif(trim(p_reason), ''), coalesce(p_is_correction, false)
  );
  return changed_item;
end;
$$;

create or replace function public.record_stock_movement(
  p_item_id integer,
  p_movement_type text,
  p_quantity integer
)
returns public.item
language plpgsql security definer set search_path = ''
as $$
declare
  my_sme integer;
  my_staff integer;
  my_role text;
  new_stock integer;
  current_stock integer;
  current_item public.item;
begin
  my_sme := public.current_sme_id();
  my_staff := public.current_staff_account_id();
  my_role := public.current_staff_role();

  if my_sme is null or my_staff is null then raise exception 'Authentication is required'; end if;
  if my_role = 'Staff' and p_movement_type <> 'SALE' then
    raise exception 'Staff accounts can record SALE movements only';
  end if;
  if not exists (
    select 1 from public.sme
    where sme_id = my_sme and stock_module_enabled = true and status = 'Active'
  ) then raise exception 'Stock tracking is not enabled for this SME'; end if;

  if p_movement_type not in ('RESTOCK','SALE','LOSS','SPOILAGE','ADJUSTMENT') then
    raise exception 'Invalid stock movement type';
  end if;
  if p_movement_type = 'ADJUSTMENT' then
    if p_quantity = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  elsif p_quantity <= 0 then
    raise exception 'Movement quantity must be positive';
  end if;

  select * into current_item
  from public.item
  where item_id = p_item_id and sme_id = my_sme and status = 'Active'
  for update;

  if current_item.item_id is null then raise exception 'Active item not found'; end if;
  current_stock := coalesce(current_item.current_stock_qty, 0);

  if p_movement_type = 'RESTOCK' or p_movement_type = 'ADJUSTMENT' then
    new_stock := current_stock + p_quantity;
  else
    new_stock := current_stock - p_quantity;
  end if;

  if new_stock < 0 then raise exception 'Stock cannot become negative'; end if;

  update public.item set current_stock_qty = new_stock where item_id = p_item_id;

  insert into public.stock_movement (item_id, staff_account_id, movement_type, quantity)
  values (p_item_id, my_staff, p_movement_type, p_quantity);

  select * into current_item from public.item where item_id = p_item_id;
  return current_item;
end;
$$;

create or replace function public.archive_item(p_item_id integer)
returns public.item
language plpgsql security definer set search_path = ''
as $$
declare
  my_sme integer;
  my_role text;
  archived_item public.item;
begin
  my_sme := public.current_sme_id();
  my_role := public.current_staff_role();
  if my_sme is null or my_role not in ('Owner','Manager') then raise exception 'Owner or Manager access is required'; end if;

  update public.item
  set status = 'Archived'
  where item_id = p_item_id and sme_id = my_sme and status = 'Active'
  returning * into archived_item;

  if archived_item.item_id is null then raise exception 'Active item not found'; end if;
  return archived_item;
end;
$$;

alter table public.stock_movement drop constraint if exists stock_movement_quantity_check;
alter table public.stock_movement
  add constraint stock_movement_quantity_check
  check (
    (movement_type = 'ADJUSTMENT' and quantity <> 0)
    or (movement_type <> 'ADJUSTMENT' and quantity > 0)
  );

alter table public.sme enable row level security;
alter table public.staff_account enable row level security;
alter table public.category enable row level security;
alter table public.product enable row level security;
alter table public.product_alias enable row level security;
alter table public.dti_srp enable row level security;
alter table public.item enable row level security;
alter table public.price_change_log enable row level security;
alter table public.stock_movement enable row level security;
alter table public.customer enable row level security;
alter table public.feedback enable row level security;

drop policy if exists sme_select_own on public.sme;
create policy sme_select_own on public.sme for select to authenticated
using (sme_id = public.current_sme_id());

drop policy if exists sme_update_owner on public.sme;
create policy sme_update_owner on public.sme for update to authenticated
using (sme_id = public.current_sme_id() and public.current_staff_role() = 'Owner')
with check (sme_id = public.current_sme_id());

drop policy if exists staff_select_same_sme on public.staff_account;
create policy staff_select_same_sme on public.staff_account for select to authenticated
using (sme_id = public.current_sme_id());

drop policy if exists staff_update_owner on public.staff_account;
create policy staff_update_owner on public.staff_account for update to authenticated
using (sme_id = public.current_sme_id() and public.current_staff_role() = 'Owner')
with check (sme_id = public.current_sme_id());

drop policy if exists category_select_authenticated on public.category;
create policy category_select_authenticated on public.category for select to authenticated
using (public.current_sme_id() is not null);

drop policy if exists category_manage on public.category;
create policy category_manage on public.category for all to authenticated
using (public.current_staff_role() in ('Owner','Manager'))
with check (public.current_staff_role() in ('Owner','Manager'));

drop policy if exists product_select_authenticated on public.product;
create policy product_select_authenticated on public.product for select to authenticated
using (public.current_sme_id() is not null);

drop policy if exists product_manage on public.product;
create policy product_manage on public.product for all to authenticated
using (public.current_staff_role() in ('Owner','Manager'))
with check (public.current_staff_role() in ('Owner','Manager'));

drop policy if exists alias_select_authenticated on public.product_alias;
create policy alias_select_authenticated on public.product_alias for select to authenticated
using (public.current_sme_id() is not null);

drop policy if exists alias_manage on public.product_alias;
create policy alias_manage on public.product_alias for all to authenticated
using (public.current_staff_role() in ('Owner','Manager'))
with check (public.current_staff_role() in ('Owner','Manager'));

drop policy if exists srp_select_authenticated on public.dti_srp;
create policy srp_select_authenticated on public.dti_srp for select to authenticated
using (public.current_sme_id() is not null);

drop policy if exists item_select_own on public.item;
create policy item_select_own on public.item for select to authenticated
using (sme_id = public.current_sme_id());

drop policy if exists price_log_select_own on public.price_change_log;
create policy price_log_select_own on public.price_change_log for select to authenticated
using (sme_id = public.current_sme_id());

drop policy if exists movement_select_own on public.stock_movement;
create policy movement_select_own on public.stock_movement for select to authenticated
using (
  exists (
    select 1 from public.item i
    where i.item_id = stock_movement.item_id
      and i.sme_id = public.current_sme_id()
  )
);

drop policy if exists customer_select_own_feedback on public.customer;
create policy customer_select_own_feedback on public.customer for select to authenticated
using (
  exists (
    select 1
    from public.feedback f
    join public.item i on i.item_id = f.item_id
    where f.customer_id = customer.customer_id
      and i.sme_id = public.current_sme_id()
  )
);

drop policy if exists feedback_select_own_sme on public.feedback;
create policy feedback_select_own_sme on public.feedback for select to authenticated
using (
  exists (
    select 1 from public.item i
    where i.item_id = feedback.item_id
      and i.sme_id = public.current_sme_id()
  )
);

revoke all on function public.current_staff_account_id() from public;
revoke all on function public.current_sme_id() from public;
revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_account_id() to authenticated;
grant execute on function public.current_sme_id() to authenticated;
grant execute on function public.current_staff_role() to authenticated;

revoke all on function public.register_sme_owner(text,text,text,text,text,text) from public;
grant execute on function public.register_sme_owner(text,text,text,text,text,text) to authenticated;

revoke all on function public.create_item(integer,numeric,numeric,integer,integer,text,text) from public;
grant execute on function public.create_item(integer,numeric,numeric,integer,integer,text,text) to authenticated;

revoke all on function public.change_item_price(integer,numeric,text,boolean) from public;
grant execute on function public.change_item_price(integer,numeric,text,boolean) to authenticated;

revoke all on function public.record_stock_movement(integer,text,integer) from public;
grant execute on function public.record_stock_movement(integer,text,integer) to authenticated;

revoke all on function public.archive_item(integer) from public;
grant execute on function public.archive_item(integer) to authenticated;
