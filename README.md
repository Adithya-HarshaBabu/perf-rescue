# Perf Rescue

**One React dashboard, built twice: the way slow apps usually get built, and fixed.** Same features,
same markup, same 10,000 orders. The race page types into both and measures them live in your browser.

Measured in headless Chrome on an Apple M3 (production build, 10,000 rows):

| Metric | Before | After |
|---|---|---|
| JavaScript needed for first render (gzip) | 299 KB | 85 KB |
| Keystroke → next paint, average / worst | 167 ms / 1,317 ms | 3 ms / 11 ms |
| Keystroke → results on screen (avg) | 167 ms | 14 ms |
| Main thread blocked during the typing test | 1,889 ms | 0 ms |
| DOM nodes | 90,299 | 445 |
| Largest Contentful Paint | 1,680 ms | 756 ms |
| Cumulative Layout Shift | 0.073 | 0.015 |

## What was wrong, and the fix

| 🐌 Before (`src/slow`) | ✅ After (`src/fast`) |
|---|---|
| Chart library, moment with every locale and lodash in the first bundle | Charts lazy-loaded after first paint; `Intl` and plain code instead of moment and lodash |
| All 10,000 rows rendered into the DOM | Virtualized table with TanStack Virtual |
| Filter, sort and aggregate everything on the main thread per keystroke | A Web Worker does the work over pre-indexed typed arrays; one query in flight, newest wins |
| `moment()` parsing inside the sort comparator | Timestamps and sort orders computed once, so filtering keeps the order for free |
| New context value and inline props re-render everything | Stable callbacks, memoized table, rows and charts |
| Late "synced" banner pushes the page down | Space reserved up front |

Each problem is marked with 🐌 in the slow source and its fix with ✅ in the fast source.

## How it's measured
`src/shared/metrics.ts` sits outside React so measuring adds no work to what's measured:
- Core Web Vitals (LCP, CLS, INP) via `web-vitals`
- Keystroke → next paint (what INP captures) and keystroke → results rendered for that text
- Main-thread blocking from the Long Tasks API (Chromium)
- First-render JS from the build: `bundle-stats.json` is written by a small Vite plugin that gzips each
  page's entry chunk and its static imports

The race page loads the two dashboards one after the other in iframes, since same-origin iframes
share a main thread and would slow each other down. Add `?rows=30000` to any page to stress-test.

## Run locally
```bash
npm install
npm run build && npm run preview   # http://127.0.0.1:4191 (measure production builds, not dev)
```

Stack: React 19, TypeScript, Vite, TanStack Virtual, Recharts, Web Workers, web-vitals.
