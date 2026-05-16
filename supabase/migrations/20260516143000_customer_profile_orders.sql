-- Customer profile and authenticated order tracking helpers.

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(COALESCE(_phone, ''), '[^0-9]', '', 'g');
$$;

DO $$
BEGIN
  CREATE POLICY "Profiles insert own"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_locker_for_dropoff(
  _box_id INTEGER,
  _customer_phone TEXT,
  _customer_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  locker_status TEXT,
  order_status TEXT,
  reservation_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locker public.lockers%ROWTYPE;
  v_order_id UUID;
  v_phone TEXT := trim(COALESCE(_customer_phone, ''));
  v_email TEXT := NULLIF(trim(COALESCE(_customer_email, '')), '');
  v_customer_id UUID;
  v_reservation_expires_at TIMESTAMPTZ := now() + interval '10 minutes';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'shipper') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_phone !~ '^[0-9+\s-]{8,15}$' THEN
    RAISE EXCEPTION 'invalid_customer_phone' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT u.id INTO v_customer_id
    FROM auth.users AS u
    WHERE lower(u.email) = lower(v_email)
    ORDER BY u.created_at DESC
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND public.normalize_phone(v_phone) <> '' THEN
    SELECT p.id INTO v_customer_id
    FROM public.profiles AS p
    WHERE public.normalize_phone(p.phone) = public.normalize_phone(v_phone)
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  SELECT * INTO v_locker
  FROM public.lockers
  WHERE id = _box_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'locker_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_locker.status <> 'empty' THEN
    RAISE EXCEPTION 'locker_not_empty' USING ERRCODE = '23505';
  END IF;

  UPDATE public.lockers
  SET status = 'reserved', updated_at = now()
  WHERE id = _box_id;

  INSERT INTO public.orders (
    box_id,
    otp_code,
    user_phone,
    customer_email,
    customer_id,
    shipper_id,
    start_time,
    status,
    reservation_expires_at
  )
  VALUES (
    _box_id,
    NULL,
    v_phone,
    v_email,
    v_customer_id,
    auth.uid(),
    now(),
    'reserved',
    v_reservation_expires_at
  )
  RETURNING id INTO v_order_id;

  RETURN QUERY
  SELECT v_order_id, _box_id, 'reserved'::TEXT, 'reserved'::TEXT, v_reservation_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_customer_orders()
RETURNS TABLE (
  id UUID,
  box_id INTEGER,
  user_phone TEXT,
  customer_email TEXT,
  status TEXT,
  start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  deposited_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  pickup_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  otp_expires_at TIMESTAMPTZ,
  otp_used_at TIMESTAMPTZ,
  total_amount INTEGER,
  is_paid BOOLEAN,
  failure_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_phone TEXT;
  v_phone_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users AS u
  WHERE u.id = v_uid;

  SELECT p.phone INTO v_phone
  FROM public.profiles AS p
  WHERE p.id = v_uid;

  v_phone_key := public.normalize_phone(v_phone);

  UPDATE public.orders AS o
  SET customer_id = v_uid
  WHERE o.deleted_at IS NULL
    AND o.customer_id IS NULL
    AND (
      (v_email IS NOT NULL AND o.customer_email IS NOT NULL AND lower(o.customer_email) = lower(v_email))
      OR (v_phone_key <> '' AND public.normalize_phone(o.user_phone) = v_phone_key)
    );

  RETURN QUERY
  SELECT
    o.id,
    o.box_id,
    o.user_phone,
    o.customer_email,
    o.status,
    o.start_time,
    o.created_at,
    o.deposited_at,
    o.picked_up_at,
    o.pickup_started_at,
    o.completed_at,
    o.otp_expires_at,
    o.otp_used_at,
    o.total_amount,
    o.is_paid,
    o.failure_reason
  FROM public.orders AS o
  WHERE o.deleted_at IS NULL
    AND (
      o.customer_id = v_uid
      OR (v_email IS NOT NULL AND o.customer_email IS NOT NULL AND lower(o.customer_email) = lower(v_email))
      OR (v_phone_key <> '' AND public.normalize_phone(o.user_phone) = v_phone_key)
    )
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_customer_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_customer_orders() TO authenticated;
