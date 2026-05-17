-- Qualify order columns inside PL/pgSQL functions.
-- Output columns declared in RETURNS TABLE are variables in PL/pgSQL, so
-- unqualified names like box_id can conflict with table columns.

CREATE OR REPLACE FUNCTION public.confirm_dropoff_closed(_box_id INTEGER)
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
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.box_id = _box_id
    AND o.status = 'awaiting_dropoff'
    AND o.deleted_at IS NULL
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dropoff_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_otp := lpad(floor(random() * 1000000)::INTEGER::TEXT, 6, '0');

  UPDATE public.orders AS o
  SET
    status = 'stored',
    otp_code = v_otp,
    otp_expires_at = v_otp_expires_at,
    deposited_at = now(),
    start_time = now()
  WHERE o.id = v_order.id;

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
    v_order.id,
    v_order.customer_id,
    v_order.user_phone,
    v_order.customer_email,
    CASE WHEN v_order.customer_email IS NULL THEN 'sms' ELSE 'email' END,
    'Smart Locker OTP',
    'OTP ' || v_otp || ' cho tu #' || _box_id || '. Ma het han luc ' || to_char(v_otp_expires_at, 'YYYY-MM-DD HH24:MI:SS TZ'),
    'queued'
  )
  RETURNING id INTO v_notification_id;

  RETURN QUERY
  SELECT v_order.id, _box_id, v_otp, v_otp_expires_at, v_notification_id;
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

CREATE OR REPLACE FUNCTION public.confirm_pickup_closed(_box_id INTEGER)
RETURNS TABLE (
  completed BOOLEAN,
  order_id UUID,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
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
    RETURN QUERY SELECT false, NULL::UUID, 'pickup_order_not_found'::TEXT;
    RETURN;
  END IF;

  UPDATE public.orders AS o
  SET
    status = 'completed',
    picked_up_at = now(),
    completed_at = now(),
    otp_code = NULL
  WHERE o.id = v_order.id;

  UPDATE public.lockers AS l
  SET status = 'empty', updated_at = now()
  WHERE l.id = _box_id;

  RETURN QUERY SELECT true, v_order.id, 'completed'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_force_reset_locker(_box_id INTEGER, _message TEXT DEFAULT NULL)
RETURNS TABLE (
  completed BOOLEAN,
  box_id INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_message TEXT := COALESCE(_message, 'Admin force reset locker');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.lockers AS l WHERE l.id = _box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'locker_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.box_id = _box_id
    AND o.status IN ('active', 'reserved', 'awaiting_dropoff', 'stored', 'pickup_in_progress')
    AND o.deleted_at IS NULL
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.orders AS o
    SET
      status = 'completed',
      picked_up_at = COALESCE(o.picked_up_at, now()),
      completed_at = COALESCE(o.completed_at, now()),
      failure_reason = v_message,
      otp_code = NULL
    WHERE o.id = v_order.id;
  END IF;

  UPDATE public.lockers AS l
  SET status = 'empty', updated_at = now()
  WHERE l.id = _box_id;

  INSERT INTO public.alerts (box_id, type, message)
  VALUES (_box_id, 'info', v_message);

  RETURN QUERY SELECT true, _box_id, 'reset'::TEXT;
END;
$$;
