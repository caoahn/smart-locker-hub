
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lookup_orders_by_phone(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.verify_otp(integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_orders_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
