-- Align the locker state machine with the physical flow:
-- dropoff order is created only after item + lock sensors are OK, and OTP is issued only after payment.

CREATE OR REPLACE FUNCTION public.issue_pickup_otp_for_order(
  _order_id UUID,
  _total_amount INTEGER DEFAULT NULL,
  _payment_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  notification_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_otp TEXT;
  v_otp_expires_at TIMESTAMPTZ := now() + interval '24 hours';
  v_notification_id UUID;
  v_amount INTEGER := GREATEST(COALESCE(_total_amount, 0), 0);
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = _order_id
    AND o.status = 'stored'
    AND o.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stored_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_otp := lpad(floor(random() * 1000000)::INTEGER::TEXT, 6, '0');

  UPDATE public.orders AS o
  SET
    is_paid = true,
    total_amount = v_amount,
    otp_code = v_otp,
    otp_expires_at = v_otp_expires_at,
    otp_used_at = NULL,
    failure_reason = _payment_note
  WHERE o.id = v_order.id;

  INSERT INTO public.notifications (
    order_id,
    customer_id,
    recipient_phone,
    recipient_email,
    channel,
    subject,
    content,
    status
  )
  VALUES (
    v_order.id,
    v_order.customer_id,
    v_order.user_phone,
    v_order.customer_email,
    CASE WHEN v_order.customer_email IS NULL THEN 'sms' ELSE 'email' END,
    'Smart Locker OTP',
    'OTP ' || v_otp || ' cho tu #' || v_order.box_id || '. Ma het han luc ' || to_char(v_otp_expires_at, 'YYYY-MM-DD HH24:MI:SS TZ'),
    'queued'
  )
  RETURNING id INTO v_notification_id;

  RETURN QUERY
  SELECT v_order.id, v_order.box_id, v_otp, v_otp_expires_at, v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_after_dropoff(
  _box_id INTEGER,
  _customer_phone TEXT,
  _customer_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  locker_status TEXT,
  order_status TEXT,
  notification_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locker public.lockers%ROWTYPE;
  v_order_id UUID;
  v_notification_id UUID;
  v_phone TEXT := trim(COALESCE(_customer_phone, ''));
  v_email TEXT := NULLIF(trim(COALESCE(_customer_email, '')), '');
  v_customer_id UUID;
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

  SELECT l.* INTO v_locker
  FROM public.lockers AS l
  WHERE l.id = _box_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'locker_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_locker.status <> 'empty' THEN
    RAISE EXCEPTION 'locker_not_empty' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.orders (
    box_id,
    otp_code,
    user_phone,
    customer_email,
    customer_id,
    shipper_id,
    start_time,
    deposited_at,
    status,
    is_paid,
    total_amount
  )
  VALUES (
    _box_id,
    NULL,
    v_phone,
    v_email,
    v_customer_id,
    auth.uid(),
    now(),
    now(),
    'stored',
    false,
    0
  )
  RETURNING id INTO v_order_id;

  UPDATE public.lockers AS l
  SET status = 'occupied', updated_at = now()
  WHERE l.id = _box_id;

  INSERT INTO public.notifications (
    order_id,
    customer_id,
    recipient_phone,
    recipient_email,
    channel,
    subject,
    content,
    status
  )
  VALUES (
    v_order_id,
    v_customer_id,
    v_phone,
    v_email,
    CASE WHEN v_email IS NULL THEN 'sms' ELSE 'email' END,
    'Smart Locker - Co don hang moi',
    'Don hang cua ban da duoc gui vao tu #' || _box_id || '. Vui long tra cuu bang so dien thoai de thanh toan va nhan OTP.',
    'queued'
  )
  RETURNING id INTO v_notification_id;

  RETURN QUERY
  SELECT v_order_id, _box_id, 'occupied'::TEXT, 'stored'::TEXT, v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_customer_payment_and_issue_otp(
  _order_id UUID,
  _phone TEXT,
  _total_amount INTEGER
)
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  notification_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_phone_key TEXT := public.normalize_phone(_phone);
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = _order_id
    AND o.status = 'stored'
    AND o.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stored_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_phone_key = '' OR public.normalize_phone(v_order.user_phone) <> v_phone_key THEN
    RAISE EXCEPTION 'phone_mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.issue_pickup_otp_for_order(v_order.id, _total_amount, 'customer_payment_confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_payment_and_issue_otp(
  _order_id UUID,
  _total_amount INTEGER DEFAULT 0
)
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  notification_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.issue_pickup_otp_for_order(_order_id, _total_amount, 'admin_payment_bypass');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_pickup_otp(_box_id INTEGER, _otp TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  order_id UUID,
  reason TEXT,
  is_paid BOOLEAN,
  total_amount INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_otp TEXT := trim(COALESCE(_otp, ''));
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.box_id = _box_id
    AND o.status = 'stored'
    AND o.deleted_at IS NULL
  ORDER BY o.deposited_at DESC NULLS LAST, o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'order_not_found'::TEXT, NULL::BOOLEAN, NULL::INTEGER;
    RETURN;
  END IF;

  IF NOT v_order.is_paid THEN
    RETURN QUERY SELECT false, v_order.id, 'payment_required'::TEXT, v_order.is_paid, v_order.total_amount;
    RETURN;
  END IF;

  IF v_order.otp_used_at IS NOT NULL THEN
    RETURN QUERY SELECT false, v_order.id, 'otp_used'::TEXT, v_order.is_paid, v_order.total_amount;
    RETURN;
  END IF;

  IF v_order.otp_expires_at IS NOT NULL AND v_order.otp_expires_at <= now() THEN
    RETURN QUERY SELECT false, v_order.id, 'otp_expired'::TEXT, v_order.is_paid, v_order.total_amount;
    RETURN;
  END IF;

  IF v_order.otp_code IS NULL OR v_order.otp_code <> v_otp THEN
    RETURN QUERY SELECT false, v_order.id, 'invalid_otp'::TEXT, v_order.is_paid, v_order.total_amount;
    RETURN;
  END IF;

  UPDATE public.orders AS o
  SET
    status = 'pickup_in_progress',
    otp_used_at = now(),
    pickup_started_at = now()
  WHERE o.id = v_order.id;

  UPDATE public.lockers AS l
  SET status = 'pickup_in_progress', updated_at = now()
  WHERE l.id = _box_id;

  RETURN QUERY SELECT true, v_order.id, 'allowed'::TEXT, v_order.is_paid, v_order.total_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_pickup_to_storage(_box_id INTEGER, _reason TEXT DEFAULT 'pickup_returned_with_item')
RETURNS TABLE (
  order_id UUID,
  box_id INTEGER,
  locker_status TEXT,
  order_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(trim(_reason), ''), 'pickup_returned_with_item');
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.box_id = _box_id
    AND o.status = 'pickup_in_progress'
    AND o.deleted_at IS NULL
  ORDER BY o.pickup_started_at DESC NULLS LAST, o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pickup_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.orders AS o
  SET
    status = 'stored',
    is_paid = false,
    otp_code = NULL,
    otp_expires_at = NULL,
    otp_used_at = NULL,
    pickup_started_at = NULL,
    start_time = now(),
    total_amount = 0,
    failure_reason = v_reason
  WHERE o.id = v_order.id;

  UPDATE public.lockers AS l
  SET status = 'occupied', updated_at = now()
  WHERE l.id = _box_id;

  RETURN QUERY
  SELECT v_order.id, _box_id, 'occupied'::TEXT, 'stored'::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_pickup_otp_for_order(uuid, integer, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.create_order_after_dropoff(integer, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.confirm_customer_payment_and_issue_otp(uuid, text, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_payment_and_issue_otp(uuid, integer) FROM public;

GRANT EXECUTE ON FUNCTION public.create_order_after_dropoff(integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_payment_and_issue_otp(uuid, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment_and_issue_otp(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pickup_otp(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_pickup_to_storage(integer, text) TO anon, authenticated;
