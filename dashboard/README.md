This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Making a user admin

Admin-only features (currently: **Demo Data** in the sidebar, under OTHERS) are
gated on `User.role`. Bootstrap an admin directly against the database:

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE email = 'you@example.com';
```

Demote back to a normal user:

```sql
UPDATE "User" SET "role" = 'USER' WHERE email = 'you@example.com';
```

Changes take effect on the user's next request — no logout/login required
because role is looked up live from the database on every admin-gated action.

The Demo Data page (`/dashboard/demo-data`, admin-only) exposes three
operations backed by `prisma/seed-demo.cjs`:

- **Replace** — wipe demo rows and generate a fresh reproducible dataset.
- **Add batch** — additive `--keep` run; each click uses a fresh seed suffix
  so the extra activity varies per invocation.
- **Remove all** — clear demo rows only.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
