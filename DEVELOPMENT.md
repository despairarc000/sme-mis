# SME MIS Development Safety Rules

## Required validation before deployment

Do not push a change to trigger Vercel merely to discover whether it builds.

Before deployment, run:

```bash
npm run type-check
npm run lint
npm run build
```

The GitHub Actions CI workflow runs the same checks and browser smoke tests.

## No blind redeployment

A failed Vercel deployment does not authorize an immediate second deployment.

After a failure:

1. Read the actual Vercel build or runtime error.
2. Identify the first meaningful/root error and its file, route, or request.
3. Make the smallest evidence-based fix.
4. Re-run local/CI validation.
5. Deploy again only when the failure has a concrete diagnosis.

If the next deployment fails with the same error, stop and investigate instead of retrying.

Never guess at a Vercel error and repeatedly push builds.

## Data integrity

SME MIS must not use mock business data, fake reports, or synthetic inventory values. Reports and dashboard metrics must come from real application data.

## Production safety

Do not disable TypeScript build failures with Next.js configuration. Do not bypass failed CI checks just to deploy.
