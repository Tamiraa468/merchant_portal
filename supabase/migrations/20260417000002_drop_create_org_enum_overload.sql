-- ================================================================
-- Migration: drop the legacy create_org_and_attach(TEXT, org_type)
-- overload.
--
-- 20260417000001 added a TEXT/TEXT version. A pre-existing
-- create_org_and_attach(TEXT, org_type) also lives on remote from an
-- earlier manual/ad-hoc deploy. With both present PostgREST cannot
-- disambiguate a JSON call with two string args and returns 404.
-- The TEXT/TEXT version is the one the client calls, so drop the
-- enum overload.
-- ================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_org_and_attach(TEXT, public.org_type);

COMMIT;
