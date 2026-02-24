-- ================================================
-- Supabase SQL: Profiles Table + RLS Policies
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ================================================

-- 1. Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'org_user' CHECK (role IN ('org_user', 'admin', 'courier')),
    full_name TEXT,
    org_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- 3. Create an index on role for filtering
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

-- 4. Create an index on org_id for organization lookups
CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles(org_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Policy: Users can view their own profile only
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can insert their own profile only (during registration)
CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile only
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Users cannot delete profiles (optional - for data integrity)
-- If you want to allow users to delete their own profile, uncomment below:
-- CREATE POLICY "Users can delete own profile"
--     ON public.profiles
--     FOR DELETE
--     USING (auth.uid() = id);

-- 6. Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create a trigger to call the function on update
DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 8. (Optional) Create a function to automatically create a profile on user signup
-- This is an alternative to creating the profile from the client-side
-- Uncomment if you prefer server-side profile creation via trigger:

-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     INSERT INTO public.profiles (id, email, role)
--     VALUES (NEW.id, NEW.email, 'merchant');
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- Verification Queries (run these to verify setup)
-- ================================================

-- Check if table exists and view structure:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles';

-- Check RLS policies:
-- SELECT policyname, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'profiles';

-- Check if RLS is enabled:
-- SELECT relname, relrowsecurity 
-- FROM pg_class 
-- WHERE relname = 'profiles';
