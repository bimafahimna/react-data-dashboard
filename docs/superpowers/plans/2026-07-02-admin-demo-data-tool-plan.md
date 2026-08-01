# Admin Demo-Data Tool — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-02-admin-demo-data-tool-design.md`
**Working directory:** `react-data-dashboard/dashboard`
**Commit policy for this run:** **DO NOT COMMIT.** Leave all changes in the working tree for user review.

Tasks are sequenced so each is independently verifiable. After each task, run its listed check before moving on.

---

## Task 1 — Add `Role` enum + `User.role` to Prisma schema

**File:** `prisma/schema.prisma`

Add to the top of the file (near existing enums):

```prisma
enum Role {
  USER
  ADMIN
}
```

Add to `model User`:

```prisma
  role Role @default(USER)
```

Generate migration and client:

```bash
npx prisma migrate dev --name add_user_role
```

**Verify:**
- New folder `prisma/migrations/<timestamp>_add_user_role/` exists with an up SQL file that `ALTER TYPE`s / `ADD COLUMN role`.
- `npx prisma generate` succeeds (implicit via `migrate dev`).
- `SELECT DISTINCT role FROM "User";` in psql returns `USER` for all rows.

---

## Task 2 — Add `requireAdmin` helper

**Create file:** `lib/auth/requireAdmin.ts`

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

**Verify:**
- `npx tsc --noEmit` passes for this file.
- Grep confirms no other file yet imports it (that's expected).

---

## Task 3 — Refactor `seed-demo.cjs` to expose `runSeedDemo`

**File:** `prisma/seed-demo.cjs`

Change 3a — extract `runSeedDemo` around the existing `main`:

- Rename the current `async function main(prisma, flags)` to `async function runSeedDemo({ prisma, mode, seedSuffix })`.
- At the top of the new function, build `flags` and `seedString`:
  ```javascript
  const flags = { clear: mode === "clear", keep: mode === "keep" };
  const seedString =
    (process.env.SEED_RANDOM_SEED || "react-dashboard-demo") +
    (seedSuffix ? `-${seedSuffix}` : "");
  ```
- Replace every existing use of `SEED_RANDOM_SEED` (env read) inside the function with `seedString`.
- Instead of `console.log`ing the summary at the end, `return summary`.
- Add `runSeedDemo` to `module.exports`.

Change 3b — replace the CLI wrapper `if (require.main === module)` block with:

```javascript
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

**Verify (all three CLI paths still work):**
```bash
npm run seed:demo          # full reseed
npm run seed:demo:clear    # clear only
node prisma/seed-demo.cjs --keep   # additive
```
Each should print the expected summary and not throw.

Also:
```bash
npm run test:run -- prisma/__tests__/seed-demo-helpers.test.cjs
```
Existing 26 tests must still pass.

---

## Task 4 — Add `runSeedDemo` shape test

**File:** `prisma/__tests__/seed-demo-helpers.test.cjs`

Append a new `describe("runSeedDemo", ...)` block that:

- Imports `{ runSeedDemo }` from `../seed-demo.cjs`.
- Asserts `typeof runSeedDemo === "function"`.
- For `mode: "clear"` with a stubbed Prisma (all `deleteMany` return `{ count: 0 }`, all `findMany` return `[]`, `$transaction` runs the callback), asserts the returned summary has: `mode === "clear"`, `cleared !== null`, `inserted === null`, `typeof seedString === "string"`.

**Verify:**
```bash
npm run test:run
```
All prior tests + one new suite pass.

---

## Task 5 — Wire admin flag into Sidebar

Find where `<Sidebar />` is rendered (grep for `Sidebar` and `SideNavbar` imports). Likely `app/dashboard/layout.tsx`. In that parent server component:

- Import `getAdminActor` from `@/lib/auth/requireAdmin`.
- Compute `const isAdmin = !!(await getAdminActor());` alongside the other server-side lookups.
- Pass `isAdmin={isAdmin}` to `<Sidebar />`.

**File:** `components/layout/Navbar/SideNavbar.tsx`

- Add `isAdmin: boolean` to the props type.
- In the OTHERS section, insert between "Help" and the existing "Settings" link a conditional `<Link>`:

```tsx
{isAdmin && (
  <Link
    href="/dashboard/demo-data"
    className={`flex items-center gap-3 px-3 py-2 rounded-md transition ${
      isActiveLink("/dashboard/demo-data")
        ? "bg-white shadow-sm text-gray-900 font-medium"
        : "text-gray-600 hover:bg-white hover:shadow-sm hover:text-blue-600"
    }`}
  >
    <Database size={18} />
    Demo Data
  </Link>
)}
```

- Add `Database` to the `lucide-react` import.

**Verify:**
- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- Sign in with a `USER` account → "Demo Data" is absent.
- Promote to `ADMIN` in DB → refresh → "Demo Data" appears.

---

## Task 6 — Create the page

**Create file:** `app/dashboard/demo-data/types.ts`

```typescript
export type SeedSummary = {
  mode: "reseed" | "keep" | "clear";
  ranAt: string;
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

export type ActionResult =
  | { ok: true; summary: SeedSummary }
  | { ok: false; message: string };
```

**Create file:** `app/dashboard/demo-data/page.tsx`

Server component that:

- `import { notFound } from "next/navigation"`.
- `import { getAdminActor } from "@/lib/auth/requireAdmin"`.
- `import { ActionCard } from "./ActionCard"`.
- `import { replaceSeedAction, keepSeedAction, clearSeedAction } from "./actions"`.
- Calls `getAdminActor()`; if null, `notFound()`.
- Renders three `<ActionCard>` instances (see Section 4 of spec for exact copy).

**Verify:**
- Visit `/dashboard/demo-data` as non-admin → 404.
- Visit as admin → page renders with three cards (buttons don't need to work yet if Task 7/8 aren't done).

---

## Task 7 — Create the `ActionCard` client component

**Create file:** `app/dashboard/demo-data/ActionCard.tsx`

- `"use client"` header.
- Props:
  ```typescript
  type Props = {
    kind: "replace" | "keep" | "clear";
    title: string;
    description: string;
    confirmLabel: string;
    buttonLabel: string;
    buttonTone: "primary" | "danger";
    action: (prev: ActionResult | null) => Promise<ActionResult>;
  };
  ```
- Uses `useActionState(action, null)` for `[state, formAction, isPending]`.
- Local `useState<boolean>` for confirm dialog open.
- Renders a card with title, description, and one action button. Clicking the button opens the confirm dialog. Confirm dialog is a `<form action={formAction}>` with a submit button whose click closes the dialog. Cancel just closes.
- Below the button, renders result:
  - `state.ok === true` → green box with summary lines built from `state.summary` (see spec Section 4 "Summary display").
  - `state.ok === false` → red box with `state.message`.
  - `isPending` → grey box "Running…".

Style with Tailwind classes matching the Settings page (`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`).

**Verify:**
- `npx tsc --noEmit` passes.
- Manually click each button (after Task 8 exists) → dialog opens; cancel closes without dispatching; confirm dispatches.

---

## Task 8 — Create the server actions

**Create file:** `app/dashboard/demo-data/actions.ts`

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import { runSeedDemo } from "../../../prisma/seed-demo.cjs";
import type { ActionResult } from "./types";

async function runOrFail(
  mode: "reseed" | "keep" | "clear",
  seedSuffix?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Forbidden — admin role required." };
  }

  try {
    const summary = await runSeedDemo({ prisma, mode, seedSuffix });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/data");
    revalidatePath("/dashboard/demo-data");
    return { ok: true, summary };
  } catch (err) {
    console.error(`[demo-data] ${mode} failed:`, err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function replaceSeedAction(_prev: ActionResult | null): Promise<ActionResult> {
  return runOrFail("reseed");
}

export async function keepSeedAction(_prev: ActionResult | null): Promise<ActionResult> {
  return runOrFail("keep", String(Date.now()));
}

export async function clearSeedAction(_prev: ActionResult | null): Promise<ActionResult> {
  return runOrFail("clear");
}
```

If static import of the `.cjs` file fails to compile, replace the import with a dynamic form inside `runOrFail`:

```typescript
const { runSeedDemo } = await import("../../../prisma/seed-demo.cjs");
```

**Verify:**
- `npx tsc --noEmit` passes.
- Sign in as admin → click Replace → confirm → summary appears with realistic counts.
- Sign in as non-admin → hit `/dashboard/demo-data` directly (won't work, 404) — but if you POST the action via curl, expect `{ ok: false, message: "Forbidden…" }`.

---

## Task 9 — README bootstrap section

**File:** `README.md` (dashboard root)

Add a new section:

```markdown
## Making a user admin

Admin-only features (currently: **Demo Data** in the sidebar) are gated on `User.role`. To promote a user:

    UPDATE "User" SET "role" = 'ADMIN' WHERE email = 'you@example.com';

To demote:

    UPDATE "User" SET "role" = 'USER' WHERE email = 'you@example.com';

Changes take effect on the user's next request (no logout/login required).
```

**Verify:**
- File saved. Nothing to run.

---

## Task 10 — Manual smoke walk-through

Run through the manual smoke steps from spec Section 6:

1. `npx prisma migrate dev` — migration applies cleanly (already done in Task 1).
2. `npm run seed:demo` — CLI still prints a summary and populates data.
3. Sign in with Google (or password) as user A.
4. `psql`: `UPDATE "User" SET role = 'ADMIN' WHERE email = '<A>';`
5. Refresh dashboard → "Demo Data" appears in OTHERS.
6. Sign in as user B (still `USER`) → "Demo Data" absent → visiting `/dashboard/demo-data` returns 404.
7. Back as user A: click **Replace** → confirm dialog → confirm → summary appears within ~5s → navigate to `/dashboard` and verify KPIs reflect new data.
8. Click **Add batch** twice → the `seedString` shown in the summary differs between clicks (has different `-<timestamp>` suffix) → order count grows.
9. Click **Remove all** → summary shows non-zero cleared counts → navigate to `/dashboard` → charts empty of demo data → user A row still exists in DB.

Log any deviations in a follow-up note.

---

## Task 11 — Final review

Do not commit. Instead:

- `git status` to enumerate every touched file.
- `git diff` to eyeball the aggregate diff.
- Confirm the file list matches this plan's expected surface:
  - `prisma/schema.prisma` (modified)
  - `prisma/migrations/<ts>_add_user_role/*` (new)
  - `prisma/seed-demo.cjs` (modified)
  - `prisma/__tests__/seed-demo-helpers.test.cjs` (modified)
  - `lib/auth/requireAdmin.ts` (new)
  - `components/layout/Navbar/SideNavbar.tsx` (modified)
  - `app/dashboard/layout.tsx` (or wherever Sidebar is rendered; modified)
  - `app/dashboard/demo-data/page.tsx` (new)
  - `app/dashboard/demo-data/ActionCard.tsx` (new)
  - `app/dashboard/demo-data/actions.ts` (new)
  - `app/dashboard/demo-data/types.ts` (new)
  - `README.md` (modified)
- Leave the working tree dirty. Await user review.
