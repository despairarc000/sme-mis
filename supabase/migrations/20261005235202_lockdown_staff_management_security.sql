-- Tighten Data API privileges and move staff administration behind the protected Edge Function.

revoke all on table public.sme, public.staff_account, public.category, public.product,
  public.product_alias, public.dti_srp, public.item, public.price_change_log,
  public.stock_movement, public.customer, public.feedback
from anon;

grant select on table public.sme, public.staff_account, public.category, public.product,
  public.product_alias, public.dti_srp, public.item, public.price_change_log,
  public.stock_movement, public.customer, public.feedback
to authenticated;

grant update on table public.sme to authenticated;
grant insert, update, delete on table public.category, public.product, public.product_alias to authenticated;

revoke insert, update, delete on table public.staff_account from authenticated;
drop policy if exists staff_update_owner on public.staff_account;

revoke all on function public.lookup_public_prices(text, text, text, text, text) from anon, authenticated;
grant execute on function public.lookup_public_prices(text, text, text, text, text) to anon, authenticated;

revoke execute on function public.archive_item(integer) from anon;
revoke execute on function public.change_item_price(integer, numeric, text, boolean) from anon;
revoke execute on function public.create_item(integer, numeric, numeric, integer, integer, text, text) from anon;
revoke execute on function public.record_stock_movement(integer, text, integer) from anon;
revoke execute on function public.register_sme_owner(text, text, text, text, text, text) from anon;
revoke execute on function public.current_sme_id() from anon;
revoke execute on function public.current_staff_account_id() from anon;
revoke execute on function public.current_staff_role() from anon;

grant execute on function public.archive_item(integer) to authenticated;
grant execute on function public.change_item_price(integer, numeric, text, boolean) to authenticated;
grant execute on function public.create_item(integer, numeric, numeric, integer, integer, text, text) to authenticated;
grant execute on function public.record_stock_movement(integer, text, integer) to authenticated;
grant execute on function public.register_sme_owner(text, text, text, text, text, text) to authenticated;
grant execute on function public.current_sme_id() to authenticated;
grant execute on function public.current_staff_account_id() to authenticated;
grant execute on function public.current_staff_role() to authenticated;
