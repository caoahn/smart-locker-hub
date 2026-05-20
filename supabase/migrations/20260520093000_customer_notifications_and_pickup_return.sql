-- Customer notification feed and pickup retry handling.

CREATE OR REPLACE FUNCTION public.list_customer_notifications()
RETURNS TABLE (
  id UUID,
  order_id UUID,
  channel TEXT,
  subject TEXT,
  content TEXT,
  status TEXT,
  recipient_phone TEXT,
  recipient_email TEXT,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
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

  UPDATE public.notifications AS n
  SET customer_id = v_uid
  WHERE n.customer_id IS NULL
    AND (
      (v_email IS NOT NULL AND n.recipient_email IS NOT NULL AND lower(n.recipient_email) = lower(v_email))
      OR (v_phone_key <> '' AND public.normalize_phone(n.recipient_phone) = v_phone_key)
      OR EXISTS (
        SELECT 1
        FROM public.orders AS o
        WHERE o.id = n.order_id
          AND (
            o.customer_id = v_uid
            OR (v_email IS NOT NULL AND o.customer_email IS NOT NULL AND lower(o.customer_email) = lower(v_email))
            OR (v_phone_key <> '' AND public.normalize_phone(o.user_phone) = v_phone_key)
          )
      )
    );

  RETURN QUERY
  SELECT
    n.id,
    n.order_id,
    n.channel,
    n.subject,
    n.content,
    n.status,
    n.recipient_phone,
    n.recipient_email,
    n.created_at,
    n.sent_at
  FROM public.notifications AS n
  WHERE n.customer_id = v_uid
    OR (v_email IS NOT NULL AND n.recipient_email IS NOT NULL AND lower(n.recipient_email) = lower(v_email))
    OR (v_phone_key <> '' AND public.normalize_phone(n.recipient_phone) = v_phone_key)
  ORDER BY n.created_at DESC;
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

REVOKE EXECUTE ON FUNCTION public.list_customer_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.list_customer_notifications() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.return_pickup_to_storage(integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.return_pickup_to_storage(integer, text) TO anon, authenticated;
