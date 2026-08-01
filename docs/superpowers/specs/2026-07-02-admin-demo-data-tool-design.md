# Admin Demo-Data Tool — Design

**Status:** Approved (Sections 1–6)
**Date:** 2026-07-02
**Owner:** dashboard
**Related:** `2026-07-01-demo-seed-script-design.md` (the underlying seed script)

## 1. Scope, goal, and non-goals

### Goal

Ship an admin-only page reachable from the navbar's OTHERS section that lets an admin trigger three operations against the current DB from the browser:

1. **Replace** — wipe demo rows and generate a fresh dataset (same as `node prisma/seed-demo.cjs`).
2. **Add without clearing** — additive batch (same as `--keep`), useful for growing the dataset for demos.
3. **Remove all demo data** — wipe only demo-tagged rows (same as `--clear`).

### Access control

New RBAC layer with a `Role` enum (`USER`, `ADMIN`) on `User`. Only `ADMIN` sees the menu item, only `ADMIN` can invoke the actions. Non-admins get 404-style behavior from the page and an explicit error from the server action. Bootstrapping is a documented SQL `UPDATE`.

### Non-goals

- Usage caps / rate limits (dropped: admin gate is the trust boundary).
- Admin-management UI (promote/demote via SQL only, for now).
- Background job queue / progress streaming (job is ~4s, sync is fine).
- Multi-tenant scoping of demo data (still global demo tag; **Remove all** wipes across all users' demo rows).
- Audit log (called out as follow-up).

### Impact surface

- Prisma schema + one migration (`Role` enum, `User.role`).
- One new helper file (`lib/auth/requireAdmin.ts`).
- `prisma/seed-demo.cjs` gains an exported `runSeedDemo({ prisma, mode, seedSuffix })`.
- New route `/dashboard/demo-data` (page + `ActionCard` + `actions.ts` + `types.ts`).
- `components/layout/Navbar/SideNavbar.tsx` gains conditional admin item (via `isAdmin` prop resolved by the parent server component).
- README section on admin bootstrap.

## 2. RBAC design

### Schema change

```prisma
enum Role {
  USER
  ADMIN
}

model User {
  // ... existing fields ...
  role Role @default(USER)
}
```

Migration name: `add_user_role`. All existing users default to `USER`. No data backfill needed.

### Where role is checked

Auth today: `access_token` cookie holds `{ email, accountId }`. Role is **not** baked into the token. Instead, `requireAdmin()` looks it up live from DB on every gated call.

Rationale:

- **Freshness:** if an admin is demoted via SQL, the change takes effect on the very next action. No stale token window.
- **Cheap:** one indexed lookup by `accountId` (`@unique`) per gated request. Admin pages are low-traffic.
- **No cookie/session invalidation dance.**

### Helper — `lib/auth/requireAdmin.ts`

```typescript
import { getAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type AdminActor = { accountId: number; email: string };

export async function getAdminActor(): Promise<AdminActor | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { accountId: token.accountId },
    select: { accountId: true, email: true, role: true },
  });
  if (!user || user.role !== "ADMIN") return null;
  return { accountId: user.accountId, email: user.email };
}

export async function requireAdmin(): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) throw new Error("FORBIDDEN");
  return actor;
}
```

Consumption pattern:

- **Server components** (page): `const actor = await getAdminActor(); if (!actor) notFound();`
- **Server actions**: `try { await requireAdmin(); } catch { return { ok: false, message: "Forbidden — admin role required." }; }`
- **Navbar parent** (server component): pass `isAdmin={!!(await getAdminActor())}` prop to `<Sidebar />`.

### Bootstrap

Documented in README:

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE email = 'you@example.com';
```

No admin-promote UI in this iteration.

## 3. `seed-demo.cjs` refactor

### Why

To call the seed from a Next.js server action, the CLI wrapper must be separable from the work. Also fixes a latent bug where repeated `--keep` runs produce identical orders/inventory movements because the PRNG seed doesn't vary.

### Shape

`seed-demo.cjs` becomes "library + thin CLI wrapper":

```javascript
async function runSeedDemo({ prisma, mode, seedSuffix }) {
  const flags = {
    clear: mode === "clear",
    keep: mode === "keep",
  };
  const seedString =
    (process.env.SEED_RANDOM_SEED || "react-dashboard-demo") +
    (seedSuffix ? `-${seedSuffix}` : "");
  // ... existing main() body, using seedString ...
  return summary;
}

module.exports = { /* existing exports */, runSeedDemo };

if (require.main === module) {
  (async () => {
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { PrismaClient } = require("../generated/prisma");
    const flags = parseArgs(process.argv.slice(2));
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    try {
      const mode = flags.clear ? "clear" : flags.keep ? "keep" : "reseed";
      const summary = await runSeedDemo({ prisma, mode });
      printSummary(summary);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
```

Rules for the refactor:

- **Move**, don't rewrite. The body of the existing `main(prisma, flags)` moves verbatim into `runSeedDemo`, minus the two changes below.
- **Return, don't print.** `runSeedDemo` returns the summary. `printSummary` is only called by the CLI wrapper.
- **Seed derivation.** Move the `SEED_RANDOM_SEED` env read from `main` into `runSeedDemo` and combine with `seedSuffix`.
- The pure builders (`buildProducts`, `buildOrdersForStore`, `buildFxRates`, etc.) are unchanged.

### `--keep` variety fix (mode → seedSuffix mapping)

| Caller | mode | seedSuffix |
|---|---|---|
| CLI `node ... seed-demo.cjs` | `reseed` | `undefined` |
| CLI `node ... seed-demo.cjs --clear` | `clear` | `undefined` |
| CLI `node ... seed-demo.cjs --keep` | `keep` | `undefined` |
| UI Replace | `reseed` | `undefined` |
| UI Add batch | `keep` | `String(Date.now())` |
| UI Remove all | `clear` | `undefined` |

CLI behavior is preserved; only the UI's `keep` path introduces variety per invocation.

### Return shape — `SeedSummary`

```typescript
type SeedSummary = {
  mode: "reseed" | "keep" | "clear";
  ranAt: string;               // ISO
  durationMs: number;
  cleared: {
    inventoryMovements: number;
    orderItems: number;
    orders: number;
    products: number;
    customers: number;
    stores: number;
    fxRates: number;
  } | null;
  inserted: {
    stores: number;
    products: number;
    customers: number;
    orders: number;
    orderItems: number;
    inventoryMovements: number;
    fxRates: number;
  } | null;
  seedString: string;
};
```

`cleared` is null for `keep`. `inserted` is null for `clear`. Both are populated for `reseed`.

### Interop

Next.js server actions statically import the CJS file:

```typescript
import { runSeedDemo } from "../../../prisma/seed-demo.cjs";
```

Fallback if bundler complains: `const { runSeedDemo } = await import("../../../prisma/seed-demo.cjs")`.

## 4. Navbar + `/dashboard/demo-data` page

### Navbar

`components/layout/Navbar/SideNavbar.tsx` gains an `isAdmin: boolean` prop. Parent server component resolves it via `getAdminActor()`. In the OTHERS section, insert (between Help and Settings) a `Link` rendered only when `isAdmin`:

```tsx
{isAdmin && (
  <Link href="/dashboard/demo-data" className={/* active/inactive classes */}>
    <Database size={18} />
    Demo Data
  </Link>
)}
```

Icon: `Database` from `lucide-react`.

### Page (server component)

`app/dashboard/demo-data/page.tsx`:

1. `const actor = await getAdminActor(); if (!actor) notFound();`
2. Render title, description, three `<ActionCard>`s.

### `ActionCard` (client component)

`app/dashboard/demo-data/ActionCard.tsx`:

- `useActionState(action, null)` → `[state, formAction, isPending]`.
- Inline confirm dialog (Tailwind, no external lib). Click "Replace" → open dialog → confirm → dispatch action.
- After completion, render success (green) or error (red) inline block, styled to match the existing Settings status paragraph.
- `buttonTone: "primary" | "danger"` controls the confirm button colour.

### Action result

```typescript
type ActionResult =
  | { ok: true; summary: SeedSummary }
  | { ok: false; message: string };
```

### Summary display

- `reseed`: `"Done in Xs. Cleared: … Inserted: … Seed: <seedString>"`
- `keep`: `"Done in Xs. Inserted: … (stores/products/customers/FX skipped as duplicates). Seed: <seedString>"`
- `clear`: `"Done in Xs. Cleared: …"`
- error: `"Failed after Xs: <message>"`

### Revalidation

On success, actions revalidate `/dashboard`, `/dashboard/data`, and `/dashboard/demo-data`.

## 5. Server actions

`app/dashboard/demo-data/actions.ts` (see design section 5 for full code). Highlights:

- `replaceSeedAction`, `keepSeedAction`, `clearSeedAction` all wrap a private `runOrFail(mode, seedSuffix?)`.
- Admin check runs first. If `requireAdmin()` throws, return `{ ok: false, message: "Forbidden — admin role required." }`.
- Errors are caught and returned as `{ ok: false, message }`. Server logs the stack.
- **No `redirect()`.** The client renders the summary inline.

## 6. Testing and rollout

### Tests

1. **`requireAdmin` helper** — three cases (no token / non-admin / admin).
2. **`runSeedDemo` shape** — one new test in `prisma/__tests__/seed-demo-helpers.test.cjs` verifying the export and the summary shape for each mode (with a stub Prisma client that no-ops).
3. **Server actions** — one test per action, mocking `requireAdmin` to reject; assert `{ ok: false, message: /forbidden/i }`.

### Manual smoke (post-implementation)

1. `npx prisma migrate dev` — verify migration applies.
2. `npm run seed:demo` — sanity-check CLI still works after refactor.
3. Sign in with Google.
4. `UPDATE "User" SET role = 'ADMIN' WHERE email = '<me>';`.
5. Refresh dashboard → confirm "Demo Data" appears.
6. Sign in as a non-admin → confirm menu item is absent and `/dashboard/demo-data` returns 404.
7. As admin: Replace → confirm → summary → dashboard KPIs updated.
8. Click "Add batch" twice → order count grows between clicks; `seedSuffix` values differ.
9. Click "Remove all" → demo rows gone; non-demo user rows intact.

### Rollout

- **No commits.** All changes remain in the working tree for user review per session instructions.
- Migration file generated but not auto-applied against any DB; user runs `prisma migrate dev` when ready.

### Follow-ups (deferred)

- Audit log (`DemoDataAuditLog` table).
- Promote/demote UI (`/dashboard/admin/users`).
- Progress streaming (only if seed grows past ~15s).
- Optional `NODE_ENV`-based defense-in-depth gate.
