-- ================================================
-- Migration: Add org_id to profiles and update schema
-- Run this in Supabase SQL Editor if you have existing data
-- ================================================

-- 1. Add org_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'org_id'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN org_id UUID;
    END IF;
END $$;

-- 2. Create index on org_id if it doesn't exist
CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles(org_id);

-- 3. Update role constraint to use correct values
-- First, update any old role values to new ones
UPDATE public.profiles SET role = 'org_user' WHERE role = 'merchant';
UPDATE public.profiles SET role = 'courier' WHERE role = 'customer';

-- 4. Drop old constraint and add new one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('org_user', 'admin', 'courier'));

-- 5. Create organizations table for proper org management
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 7. Policy: Users can view their own organization
DROP POLICY IF EXISTS "Users can view own organization" ON public.organizations;
CREATE POLICY "Users can view own organization" ON public.organizations
    FOR SELECT
    USING (
        id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    );

-- 8. Add foreign key constraint (optional - only if you want strict referential integrity)
-- ALTER TABLE public.profiles 
--     ADD CONSTRAINT profiles_org_id_fkey 
--     FOREIGN KEY (org_id) REFERENCES public.organizations(id);

-- 9. Create a default organization for existing users without one
-- Uncomment and modify as needed:
-- INSERT INTO public.organizations (id, name) VALUES (gen_random_uuid(), 'Default Organization');
-- UPDATE public.profiles SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
