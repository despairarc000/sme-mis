create or replace function public.lookup_public_prices(
  p_query text default null,
  p_region text default null,
  p_province text default null,
  p_city_municipality text default null,
  p_barangay text default null
)
returns table (
  product_id integer,
  product_name text,
  brand text,
  barcode text,
  sme_id integer,
  sme_name text,
  region text,
  province text,
  city_municipality text,
  barangay text,
  current_price numeric,
  price_updated_at timestamptz,
  availability_label text,
  store_count bigint,
  area_median numeric,
  area_min numeric,
  area_max numeric,
  srp_amount numeric,
  srp_effectivity_date date,
  srp_bulletin_reference text,
  price_position text,
  price_increase_visible boolean,
  verified_comments jsonb
)
language sql
security definer
set search_path = ''
as $$
with active_items as (
  select
    i.item_id, i.product_id, i.sme_id, i.current_price, i.price_updated_at, i.current_stock_qty,
    s.sme_name, s.region, s.province, s.city_municipality, s.barangay,
    p.product_name, p.normalized_name, p.brand, p.barcode
  from public.item i
  join public.sme s on s.sme_id = i.sme_id and s.status = 'Active'
  join public.product p on p.product_id = i.product_id
  where i.status = 'Active'
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or p.product_name ilike '%' || trim(p_query) || '%'
      or p.normalized_name ilike '%' || trim(p_query) || '%'
      or coalesce(p.brand, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.barcode, '') ilike '%' || trim(p_query) || '%'
      or exists (
        select 1 from public.product_alias pa
        where pa.product_id = p.product_id
          and pa.alias_name ilike '%' || trim(p_query) || '%'
      )
    )
    and (nullif(trim(coalesce(p_region, '')), '') is null or s.region ilike trim(p_region))
    and (nullif(trim(coalesce(p_province, '')), '') is null or s.province ilike trim(p_province))
    and (nullif(trim(coalesce(p_city_municipality, '')), '') is null or s.city_municipality ilike trim(p_city_municipality))
    and (nullif(trim(coalesce(p_barangay, '')), '') is null or s.barangay ilike trim(p_barangay))
),
price_stats as (
  select product_id, count(*) as store_count,
    percentile_cont(0.5) within group (order by current_price)::numeric as area_median,
    min(current_price)::numeric as area_min,
    max(current_price)::numeric as area_max
  from active_items group by product_id
),
latest_srp as (
  select distinct on (d.product_id) d.product_id, d.srp_amount, d.effectivity_date, d.bulletin_reference
  from public.dti_srp d
  where d.effectivity_date <= current_date
  order by d.product_id, d.effectivity_date desc, d.srp_id desc
),
latest_price_change as (
  select distinct on (l.item_id) l.item_id, l.old_price, l.new_price
  from public.price_change_log l
  order by l.item_id, l.changed_at desc, l.log_id desc
),
comments as (
  select f.item_id,
    jsonb_agg(jsonb_build_object(
      'comment', f.comment,
      'submitted_at', f.submitted_at,
      'store_response', f.store_response,
      'responded_at', f.responded_at
    ) order by f.submitted_at desc) as verified_comments
  from public.feedback f
  where lower(coalesce(f.verification_status, '')) = 'verified'
    and lower(coalesce(f.moderation_state, '')) = 'approved'
  group by f.item_id
)
select
  ai.product_id, ai.product_name, ai.brand, ai.barcode, ai.sme_id, ai.sme_name,
  ai.region, ai.province, ai.city_municipality, ai.barangay, ai.current_price, ai.price_updated_at,
  case
    when (select s.stock_module_enabled from public.sme s where s.sme_id = ai.sme_id) = false
      or ai.current_stock_qty is null then 'Availability not tracked'
    when ai.current_stock_qty = 0 then 'Out of stock'
    else 'Available'
  end,
  ps.store_count,
  case when ps.store_count >= 3 then ps.area_median else null end,
  case when ps.store_count >= 3 then ps.area_min else null end,
  case when ps.store_count >= 3 then ps.area_max else null end,
  srp.srp_amount, srp.effectivity_date, srp.bulletin_reference,
  case
    when ps.store_count < 3 then null
    when ai.current_price < ps.area_median then 'Below area median'
    when ai.current_price > ps.area_median then 'Above area median'
    else 'At area median'
  end,
  coalesce(lpc.new_price, ai.current_price) > coalesce(lpc.old_price, ai.current_price),
  coalesce(c.verified_comments, '[]'::jsonb)
from active_items ai
join price_stats ps on ps.product_id = ai.product_id
left join latest_srp srp on srp.product_id = ai.product_id
left join latest_price_change lpc on lpc.item_id = ai.item_id
left join comments c on c.item_id = ai.item_id
order by ai.product_name, ai.current_price, ai.region, ai.province, ai.city_municipality, ai.barangay, ai.sme_name;
$$;

revoke all on function public.lookup_public_prices(text, text, text, text, text) from public;
grant execute on function public.lookup_public_prices(text, text, text, text, text) to anon, authenticated;

