
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'shipper');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles view own or admin" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile + default shipper role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'shipper');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Lockers
CREATE TABLE public.lockers (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'empty', -- empty | occupied | overdue
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read lockers" ON public.lockers FOR SELECT USING (true);
CREATE POLICY "Staff update lockers" ON public.lockers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'shipper'));
CREATE POLICY "Admin insert lockers" ON public.lockers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.lockers (id, status) VALUES (1,'empty'),(2,'empty');

-- Settings (singleton row id=1)
CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  base_fee INTEGER NOT NULL DEFAULT 3000,
  base_hours INTEGER NOT NULL DEFAULT 24,
  overdue_fee INTEGER NOT NULL DEFAULT 2000,
  overdue_hours INTEGER NOT NULL DEFAULT 12,
  bank_account TEXT DEFAULT '0123456789',
  bank_code TEXT DEFAULT 'VCB',
  account_name TEXT DEFAULT 'SMART LOCKER',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Admin update settings" ON public.settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insert settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.settings (id) VALUES (1);

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id INTEGER NOT NULL REFERENCES public.lockers(id),
  otp_code TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  shipper_id UUID REFERENCES auth.users(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMPTZ,
  total_amount INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_phone ON public.orders(user_phone);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE POLICY "Admin all orders" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Shipper view orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'shipper'));
CREATE POLICY "Shipper create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'shipper') AND shipper_id = auth.uid());
CREATE POLICY "Shipper update own orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'shipper') AND shipper_id = auth.uid());

-- Public RPC: lookup active orders for a phone (no auth required)
CREATE OR REPLACE FUNCTION public.lookup_orders_by_phone(_phone TEXT)
RETURNS TABLE (
  id UUID, box_id INTEGER, start_time TIMESTAMPTZ, total_amount INTEGER,
  is_paid BOOLEAN, status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, box_id, start_time, total_amount, is_paid, status
  FROM public.orders
  WHERE user_phone = _phone AND status = 'active'
  ORDER BY start_time DESC;
$$;

-- Public RPC: verify OTP at locker keypad
CREATE OR REPLACE FUNCTION public.verify_otp(_box_id INTEGER, _otp TEXT)
RETURNS TABLE (order_id UUID, is_paid BOOLEAN, total_amount INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, is_paid, total_amount FROM public.orders
  WHERE box_id = _box_id AND otp_code = _otp AND status = 'active'
  LIMIT 1;
$$;

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id INTEGER,
  type TEXT NOT NULL, -- breakin | overdue | info
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage alerts" ON public.alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lockers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
