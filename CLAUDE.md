# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build (use to check for type errors)
npm run lint     # ESLint 9 with Next.js core-web-vitals + TypeScript rules
npm start        # Serve production build
```

No test framework is configured.

## Environment

Copy `.env.example` to `.env` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + Supabase + Ant Design 6 + Tailwind CSS 4 + TypeScript (strict)

**Path alias:** `@/*` maps to the project root.

### App Router structure

```
app/
  (merchant)/       # Protected route group — merchant-facing pages
    layout.tsx      # Checks auth + role, renders sidebar/nav (MerchantLayout)
    dashboard/
    products/
    tasks/          # Delivery task CRUD with publishing workflow
    orders/
    analytics/
    financials/
    settings/
  auth/             # Public auth pages (login, register, forgot-password, reset)
  onboarding/       # Org creation after first signup
  layout.tsx        # Root layout: Geist fonts + AntdProvider + global CSS
```

### Key directories

- **`lib/supabase/`** — Supabase client factories: `client.ts` (browser), `server.ts` (server components/actions), `middleware.ts` (session refresh)
- **`lib/auth/requireOrg.ts`** — Server-side helpers: `requireOrg()` ensures auth + org_id (redirects to onboarding if missing), `requireOnboarding()` ensures auth without org
- **`types/database.ts`** — All domain types (Profile, Product, DeliveryTask, Order, OrgSettings), status enums, status config with labels/colors, transition helpers (`canTransitionStatus()`)
- **`components/providers/`** — AntdProvider with custom theme
- **`components/ui/`** — Shared UI: ErrorBoundary, LoadingSpinner, StatusBadge, CurrencyDisplay, LocationCard
- **`components/auth/`** — AuthForm (login/register), LogoutButton
- **`components/epod/`** — Electronic proof of delivery components
- **`middleware.ts`** — Route protection: redirects unauthenticated users to `/auth/login`, redirects authenticated users away from auth routes

### Data patterns

- All page components are client-side (`"use client"`) and query Supabase directly via the browser client
- Real-time updates use Supabase channel subscriptions (dashboard, tasks, orders pages)
- Forms use Ant Design `<Form>` with validation rules
- Tables use Ant Design `<Table>` with sorting/filtering/pagination
- Error/success feedback via Ant Design `message` from `App.useApp()`

### Multi-tenancy

All data is scoped by `org_id`. Row-level security (RLS) policies enforce isolation at the database level. The user's `org_id` comes from their profile record.

### Roles

Defined in `types/database.ts`. Merchant portal access requires one of: `org_user`, `admin`, `merchant` (see `MERCHANT_ALLOWED_ROLES`).

### Delivery task lifecycle

`draft` → `published` → `assigned` → `picked_up` → `delivered` → `completed` (also `cancelled`, `failed`). Status transitions are enforced by a PostgreSQL trigger. Tasks are created via the `create_delivery_task()` RPC. ePOD (electronic proof of delivery) uses OTP verification.

### Supabase migrations

Located in `supabase/migrations/` with timestamp-prefixed filenames (e.g., `20260401000001_phase1_fixes.sql`). Core tables: profiles, organizations, org_settings, products, delivery_tasks, locations, orders, order_items, payments, task_items, available_tasks.
