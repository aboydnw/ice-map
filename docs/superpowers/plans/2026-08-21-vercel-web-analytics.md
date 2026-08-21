# Vercel Web Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standard Vercel Web Analytics page-view tracking to the deployed Vite/React app.

**Architecture:** Install Vercel's supported analytics package as a production dependency and mount its React component once at the application root. Keep tracking independent of the map UI and rely on Vercel's deployment environment for the analytics endpoint.

**Tech Stack:** React 19, TypeScript, Vite 8, Yarn, `@vercel/analytics`

## Global Constraints

- Track standard page views only; do not add custom events.
- Do not add cookies, analytics UI, environment variables, or application-specific tracking.
- Analytics failure must not affect the map UI or application loading.
- Vercel Web Analytics must be enabled in the project dashboard before the deployment containing this change.

---

### Task 1: Mount Vercel Web Analytics

**Files:**
- Modify: `web/package.json`
- Modify: `web/yarn.lock`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `Analytics` from `@vercel/analytics/react`
- Produces: one root-level `<Analytics />` instance that reports standard page views in Vercel deployments

- [ ] **Step 1: Verify the integration is currently absent**

Run:

```bash
if rg -q '"@vercel/analytics"' web/package.json && rg -q '<Analytics' web/src/main.tsx; then exit 0; else exit 1; fi
```

Expected: exit code 1 because neither the dependency nor component is present.

- [ ] **Step 2: Add the production dependency**

Run from `web`:

```bash
yarn add @vercel/analytics
```

Expected: `package.json` and `yarn.lock` include the resolved current `@vercel/analytics` release.

- [ ] **Step 3: Mount the analytics component once**

Update `web/src/main.tsx` to import the React integration:

```tsx
import { Analytics } from "@vercel/analytics/react";
```

Then render it alongside the existing application inside `StrictMode`:

```tsx
<StrictMode>
  <ChakraProvider value={system}>
    <App />
  </ChakraProvider>
  <Analytics />
</StrictMode>
```

- [ ] **Step 4: Verify the integration is present**

Run:

```bash
if rg -q '"@vercel/analytics"' web/package.json && rg -q '<Analytics' web/src/main.tsx; then exit 0; else exit 1; fi
```

Expected: exit code 0.

- [ ] **Step 5: Run static validation**

Run from `web`:

```bash
yarn lint
npx prettier --check src/main.tsx package.json
```

Expected: both commands exit 0 with no lint or formatting errors.

- [ ] **Step 6: Build the production bundle**

Run from `web`:

```bash
yarn build
```

Expected: TypeScript and Vite complete successfully and write the production bundle to `web/dist`.

- [ ] **Step 7: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-08-21-vercel-web-analytics.md web/package.json web/yarn.lock web/src/main.tsx
git commit -m "feat(web): add Vercel Web Analytics"
```

After the commit is deployed, enable Web Analytics in the Vercel project dashboard if it is not already enabled, trigger a new production deployment, visit the site, and confirm a view request appears in the browser network panel and traffic begins appearing in the Analytics dashboard.
