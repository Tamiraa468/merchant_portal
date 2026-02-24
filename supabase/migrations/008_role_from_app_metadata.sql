-- ================================================================
-- Migration 008: Server-side role assignment from app metadata
--
-- Frontend sends: options.data = { full_name, app: "merchant_portal" | "courier_app" | "customer_app" }
-- DB trigger reads raw_user_meta_data->>'app' and assigns role.
-- Frontend NEVER controls role directly.
-- ================================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Drop old CHECK constraint and DEFAULT on profiles.role
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT;

-- ---------------------------------------------------------------
-- 2. Add new CHECK constraint allowing 'org_user','courier','customer'
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('org_user', 'courier', 'customer'));

-- ---------------------------------------------------------------
-- 3. Drop old RLS policies that we will replace
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;

-- ---------------------------------------------------------------
-- 4. Create/replace the trigger function
--    Reads raw_user_meta_data->>'app' to determine role.
--    Inserts into profiles with ON CONFLICT upsert.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _app  TEXT;
  _role TEXT;
  _name TEXT;
BEGIN
  _app  := NEW.raw_user_meta_data->>'app';
  _name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Determine role from app identifier
  IF _app = 'merchant_portal' THEN
    _role := 'org_user';
  ELSIF _app = 'courier_app' THEN
    _role := 'courier';
  ELSIF _app = 'customer_portal' THEN
    _role := 'customer';
  ELSE
    RAISE EXCEPTION 'Unknown or missing app identifier: "%". Supply raw_user_meta_data.app as one of merchant_portal, courier_app, customer_portal.', _app;
  END IF;

  -- Upsert into profiles
  INSERT INTO public.profiles (id, email, full_name, role, org_id)
  VALUES (
    NEW.id,
    NEW.email,
    _name,
    _role,
    NULL                          -- org_id is always NULL at signup
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role      = EXCLUDED.role;    -- enforce server-determined role

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------
-- 5. Attach trigger (recreate to be safe)
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------
-- 6. RLS Policies
-- ---------------------------------------------------------------

-- SELECT: users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- INSERT: only the trigger (SECURITY DEFINER) inserts.
-- If you still want client-side insert as a fallback, keep this.
-- Otherwise you can omit it.
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: users can update their own row BUT cannot change role.
-- The WITH CHECK ensures the role column stays the same after update.
CREATE POLICY "Users can update own profile no role change"
  ON public.profiles
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

COMMIT;
