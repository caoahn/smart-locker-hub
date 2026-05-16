CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
  v_role public.app_role;
BEGIN
  v_role := CASE
    WHEN v_requested_role IN ('admin', 'shipper', 'customer') THEN v_requested_role::public.app_role
    ELSE 'customer'::public.app_role
  END;

  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
