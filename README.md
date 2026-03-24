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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## MongoDB Setup

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` and `MONGODB_DB`.
3. Start MongoDB locally or use your hosted cluster.

The backend PDF index cache will use MongoDB when `MONGODB_URI` is set; otherwise it falls back to in-memory cache.

### MongoDB via Docker

Run MongoDB in Docker:

```bash
docker compose up -d mongodb
```

Check status:

```bash
docker compose ps
```

Connection used by this app (matches `.env.example`):

`mongodb://root:rootpassword@localhost:27018/oxford_nextjs?authSource=admin`

## GitHub CI/CD

This repo includes GitHub Actions workflow: `.github/workflows/ci-cd.yml`.

CI runs on PR/push and executes:
- `npm ci`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

CD runs on push to `master` and deploys to Vercel **only if** these secrets exist:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Enable Vercel Deploy from GitHub Actions

1. Import this repository into Vercel and complete one manual deploy.
2. In Vercel project settings, add runtime env vars:
   - `MONGODB_URI`
   - `MONGODB_DB`
3. Create a Vercel access token and save it as GitHub repo secret `VERCEL_TOKEN`.
4. Get `orgId` and `projectId` from `.vercel/project.json` after `vercel link`, then save them as:
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
5. Push to `oxford-nextjs-backend` to test CI only.
6. Merge/push to `master` to trigger production deploy job.
