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

Copy `.env.example` to `.env` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (public)
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — Gmail SMTP for ePOD OTP emails (optional in dev; OTP logs to console when missing)

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + Supabase + Ant Design 6 + Tailwind CSS 4 + TypeScript (strict)

**Path alias:** `@/*` maps to the project root.

Tailwind v4 has no config file — it runs via `@tailwindcss/postcss` plugin. `next.config.ts` has no custom configuration.

### App Router structure

```
app/
  (merchant)/       # Protected route group — merchant-facing pages
    layout.tsx      # Client component: checks auth + role, renders sidebar/nav (MerchantLayout)
    dashboard/
    products/
    tasks/          # Delivery task CRUD with publishing workflow
    orders/
    analytics/
    financials/
    settings/
  auth/             # Public auth pages (login, register, forgot-password, reset)
  onboarding/       # Org creation after first signup
  api/              # Next.js API routes (server-side, excluded from middleware matcher)
  layout.tsx        # Root layout: Geist fonts + AntdProvider + global CSS
  error.tsx         # App-level error boundary
```

### Key directories

- **`lib/supabase/`** — Supabase client factories: `client.ts` (browser), `server.ts` (server components/actions), `middleware.ts` (session refresh)
- **`lib/auth/requireOrg.ts`** — Server-side helpers: `requireOrg()` ensures auth + org_id (redirects to onboarding if missing), `requireOnboarding()` ensures auth without org (redirects to `/products` if org exists)
- **`types/database.ts`** — All domain types, status enums, status config with labels/colors, transition helpers (`canTransitionStatus()`, `getAvailableStatusTransitions()`)
- **`components/providers/`** — AntdProvider with custom Ant Design theme (`colorPrimary: "#2563eb"`)
- **`components/ui/`** — Shared UI: ErrorBoundary, LoadingSpinner, StatusBadge, CurrencyDisplay (Tögrög ₮), LocationCard
- **`components/auth/`** — AuthForm (login/register with `metadata.app = "merchant_portal"` for role assignment), LogoutButton
- **`components/epod/`** — Electronic proof of delivery: OTP input with auto-focus, countdown timer, resend cooldown, lock after 5 failed attempts
- **`middleware.ts`** — Route protection: redirects unauthenticated users to `/auth/login`, redirects authenticated users away from auth routes. API routes are excluded from the matcher.

### Data patterns

- All page components are client-side (`"use client"`) and query Supabase directly via the browser client — there is no server-side data fetching layer
- Real-time updates use Supabase channel subscriptions (dashboard, tasks, orders pages)
- Forms use Ant Design `<Form>` with validation rules
- Tables use Ant Design `<Table>` with sorting/filtering/pagination
- Error/success feedback via Ant Design `message` from `App.useApp()`

### Auth flow

Two layers of protection work together:
1. **`middleware.ts`** — Server-side: refreshes session tokens, redirects unauthenticated users
2. **`app/(merchant)/layout.tsx`** — Client-side: verifies auth state + role against `MERCHANT_ALLOWED_ROLES`, subscribes to `onAuthStateChange` events

During registration, `AuthForm` sets `metadata.app = "merchant_portal"` which a database trigger reads to assign the correct role.

### Multi-tenancy

All data is scoped by `org_id`. Row-level security (RLS) policies enforce isolation at the database level. The user's `org_id` comes from their profile record.

### Roles

Defined in `types/database.ts`. Merchant portal access requires one of: `org_user`, `admin`, `merchant` (see `MERCHANT_ALLOWED_ROLES`).

### Delivery task lifecycle

`draft` → `published` → `assigned` → `picked_up` → `delivered` → `completed` (also `cancelled`, `failed`). Status transitions are enforced by a PostgreSQL trigger. Tasks are created via the `create_delivery_task()` RPC.

### ePOD (Electronic Proof of Delivery)

When a task reaches `delivered` status, an OTP is sent to the customer's email for verification:
- **API route** `app/api/send-epod-otp/route.ts` — Manual resend via POST with Bearer token auth; calls `request_epod_otp()` RPC, sends email via Nodemailer/Gmail SMTP
- **Edge function** `supabase/functions/send-epod-otp/` — Auto-triggered by DB trigger on delivery status change
- **Verification** — `EpodVerification` component calls `verify_epod_otp()` RPC; success transitions task to `completed`

### Supabase

**Edge functions** live in `supabase/functions/` and are Deno-based (excluded from `tsconfig.json` compilation).

**Migrations** are in `supabase/migrations/` with timestamp-prefixed filenames. Core tables: profiles, organizations, org_settings, products, delivery_tasks, locations, orders, order_items, payments, task_items, available_tasks, delivery_epod_otps.

Key RPCs: `create_delivery_task()`, `request_epod_otp()`, `verify_epod_otp()`.
