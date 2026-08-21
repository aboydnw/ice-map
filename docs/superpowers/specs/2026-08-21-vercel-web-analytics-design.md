# Vercel Web Analytics Design

## Goal

Enable Vercel Web Analytics for the deployed ICE Detention Map so the project
owner can view standard traffic metrics such as visitors, page views,
referrers, and visitor demographics in the Vercel dashboard.

## Scope

This change adds standard page-view analytics only. It does not add custom
interaction events, cookies, analytics UI, or application-specific tracking.

## Implementation

The frontend is a Vite-powered React single-page app deployed from the `web`
directory. Add `@vercel/analytics` as a production dependency and render the
package's React `Analytics` component once in `web/src/main.tsx`, beside the
existing application root. This keeps analytics initialization separate from
the map's application behavior and follows Vercel's React quickstart.

No analytics configuration or environment variables are required. The package
will load Vercel's tracking script in the deployed environment and send page
views to the Vercel-managed analytics endpoint.

## Vercel Configuration

Web Analytics must be enabled for the project from the Analytics section of the
Vercel dashboard. A deployment containing the code change must occur after it
is enabled so Vercel provisions the analytics routes.

## Failure Behavior

Analytics is non-critical. A blocked or unavailable tracking request must not
change the map UI or prevent the application from loading.

## Verification

- Confirm the dependency is present in the package manifest and lockfile.
- Run the frontend linter.
- Run the production build, including TypeScript checking.
- After deployment, visit the production site and confirm an analytics view
  request appears in the browser network panel and traffic begins appearing in
  the Vercel Analytics dashboard.
