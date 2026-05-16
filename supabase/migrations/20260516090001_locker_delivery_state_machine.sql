-- Smart locker delivery state machine.
-- The browser app has no separate backend, so business-critical transitions live
-- in SECURITY DEFINER RPCs and run as database transactions.

ALTER TABLE public.orders
  ALTER COLUMN otp_code DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

UPDATE public.orders
SET
  status = 'stored',
  deposited_at = COALESCE(deposited_at, start_time),
  otp_expires_at = COALESCE(otp_expires_at, now() + interval '24 hours')
WHERE status = 'active';

UPDATE public.orders
SET completed_at = COALESCE(completed_at, picked_up_at, now())
WHERE status = 'completed';

DO $$
BEGIN
  ALTER TABLE public.lockers
    ADD CONSTRAINT lockers_status_check
    CHECK (status IN ('empty', 'reserved', 'awaiting_dropoff', 'occupied', 'pickup_in_progress', 'overdue'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('active', 'reserved', 'awaiting_dropoff', 'stored', 'pickup_in_progress', 'completed', 'cancelled', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_box
  ON public.orders (box_id)
  WHERE status IN ('active', 'reserved', 'awaiting_dropoff', 'stored', 'pickup_in_progress');

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_otp_expires_at ON public.orders(otp_expires_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_phone TEXT,
  recipient_email TEXT,
  channel TEXT NOT NULL DEFAULT 'sms',
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Admin manage notifications"
    ON public.notifications
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Customers view own notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (customer_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Customers view own orders"
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'customer') AND customer_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

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
  v_reservation_expires_at TIMESTAMPTZ := now() + interval '10 minutes';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'shipper') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_phone !~ '^[0-9+\s-]{8,15}$' THEN
    RAISE EXCEPTION 'invalid_customer_phone' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.request_dropoff_open(_order_id UUID)
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
  v_locker public.lockers%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'shipper') AND v_order.shipper_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'reserved' THEN
    RAISE EXCEPTION 'order_not_reserved' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_locker
  FROM public.lockers
  WHERE id = v_order.box_id
  FOR UPDATE;

  IF v_locker.status <> 'reserved' THEN
    RAISE EXCEPTION 'locker_not_reserved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = 'awaiting_dropoff'
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'awaiting_dropoff', updated_at = now()
  WHERE id = v_order.box_id;

  RETURN QUERY
  SELECT v_order.id, v_order.box_id, 'awaiting_dropoff'::TEXT, 'awaiting_dropoff'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_dropoff_open_failed(_order_id UUID, _reason TEXT DEFAULT NULL)
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
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'shipper') AND v_order.shipper_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_order.status NOT IN ('reserved', 'awaiting_dropoff') THEN
    RAISE EXCEPTION 'order_not_cancellable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = 'failed', failure_reason = COALESCE(_reason, 'hardware_open_failed')
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'empty', updated_at = now()
  WHERE id = v_order.box_id;

  RETURN QUERY
  SELECT v_order.id, v_order.box_id, 'empty'::TEXT, 'failed'::TEXT;
END;
$$;

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
  SELECT * INTO v_order
  FROM public.orders
  WHERE box_id = _box_id
    AND status = 'awaiting_dropoff'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dropoff_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_otp := lpad(floor(random() * 1000000)::INTEGER::TEXT, 6, '0');

  UPDATE public.orders
  SET
    status = 'stored',
    otp_code = v_otp,
    otp_expires_at = v_otp_expires_at,
    deposited_at = now(),
    start_time = now()
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'occupied', updated_at = now()
  WHERE id = _box_id;

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
  SELECT * INTO v_order
  FROM public.orders
  WHERE box_id = _box_id
    AND status = 'stored'
  ORDER BY deposited_at DESC NULLS LAST, created_at DESC
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

  UPDATE public.orders
  SET
    status = 'pickup_in_progress',
    otp_used_at = now(),
    pickup_started_at = now()
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'pickup_in_progress', updated_at = now()
  WHERE id = _box_id;

  RETURN QUERY SELECT true, v_order.id, 'allowed'::TEXT, v_order.is_paid, v_order.total_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_otp(_box_id INTEGER, _otp TEXT)
RETURNS TABLE (order_id UUID, is_paid BOOLEAN, total_amount INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.order_id, COALESCE(v.is_paid, false), COALESCE(v.total_amount, 0)
  FROM public.verify_pickup_otp(_box_id, _otp) AS v
  WHERE v.allowed = true;
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
  SELECT * INTO v_order
  FROM public.orders
  WHERE box_id = _box_id
    AND status = 'pickup_in_progress'
  ORDER BY pickup_started_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'pickup_order_not_found'::TEXT;
    RETURN;
  END IF;

  UPDATE public.orders
  SET
    status = 'completed',
    picked_up_at = now(),
    completed_at = now(),
    otp_code = NULL
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'empty', updated_at = now()
  WHERE id = _box_id;

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

  PERFORM 1 FROM public.lockers WHERE id = _box_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'locker_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE box_id = _box_id
    AND status IN ('active', 'reserved', 'awaiting_dropoff', 'stored', 'pickup_in_progress')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.orders
    SET
      status = 'completed',
      picked_up_at = COALESCE(picked_up_at, now()),
      completed_at = COALESCE(completed_at, now()),
      failure_reason = v_message,
      otp_code = NULL
    WHERE id = v_order.id;
  END IF;

  UPDATE public.lockers
  SET status = 'empty', updated_at = now()
  WHERE id = _box_id;

  INSERT INTO public.alerts (box_id, type, message)
  VALUES (_box_id, 'info', v_message);

  RETURN QUERY SELECT true, _box_id, 'reset'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_orders_by_phone(_phone TEXT)
RETURNS TABLE (
  id UUID,
  box_id INTEGER,
  start_time TIMESTAMPTZ,
  total_amount INTEGER,
  is_paid BOOLEAN,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.box_id, o.start_time, o.total_amount, o.is_paid, o.status
  FROM public.orders AS o
  WHERE o.user_phone = _phone
    AND o.status IN ('active', 'stored', 'pickup_in_progress')
  ORDER BY o.start_time DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_locker_for_dropoff(integer, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.request_dropoff_open(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mark_dropoff_open_failed(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_force_reset_locker(integer, text) FROM public;

GRANT EXECUTE ON FUNCTION public.reserve_locker_for_dropoff(integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_dropoff_open(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dropoff_open_failed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_reset_locker(integer, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_dropoff_closed(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pickup_otp(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pickup_closed(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_orders_by_phone(text) TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
