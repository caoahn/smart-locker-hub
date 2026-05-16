CREATE OR REPLACE FUNCTION public.mark_pickup_open_failed(_order_id UUID, _reason TEXT DEFAULT NULL)
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
    AND status = 'pickup_in_progress'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pickup_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.orders
  SET
    status = 'stored',
    otp_used_at = NULL,
    pickup_started_at = NULL,
    failure_reason = COALESCE(_reason, 'hardware_pickup_open_failed')
  WHERE id = v_order.id;

  UPDATE public.lockers
  SET status = 'occupied', updated_at = now()
  WHERE id = v_order.box_id;

  RETURN QUERY
  SELECT v_order.id, v_order.box_id, 'occupied'::TEXT, 'stored'::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_pickup_open_failed(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_pickup_open_failed(uuid, text) TO anon, authenticated;
