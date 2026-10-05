-- Structural security regression tests for the SME MIS Data API and staff administration boundary.
begin;

select plan(8);

select ok(
  not has_table_privilege('anon', 'public.staff_account', 'SELECT'),
  'anon cannot directly read staff_account'
);

select ok(
  has_table_privilege('authenticated', 'public.staff_account', 'SELECT'),
  'authenticated can read staff_account through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.staff_account', 'INSERT')
  and not has_table_privilege('authenticated', 'public.staff_account', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.staff_account', 'DELETE'),
  'authenticated clients cannot directly mutate staff_account'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.register_sme_owner(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute the authenticated SME registration RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.register_sme_owner(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated clients can execute SME registration RPC'
);

select ok(
  has_function_privilege(
    'anon',
    'public.lookup_public_prices(text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon can execute the public price lookup function'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_account'
      and policyname = 'staff_select_same_sme'
      and cmd = 'SELECT'
  ),
  'staff_account retains same-SME SELECT RLS'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_account'
      and policyname = 'staff_update_owner'
  ),
  'direct staff update policy is removed'
);

select * from finish();
rollback;
