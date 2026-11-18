-- Only the edge function (service role) may write scores.
revoke execute on function public.submit_daily(date, uuid, text, int, int, int, int, text, jsonb) from anon, authenticated, public;
grant execute on function public.submit_daily(date, uuid, text, int, int, int, int, text, jsonb) to service_role;
-- Read/track helpers are public on purpose; make sure nothing else is.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
