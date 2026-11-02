import { onCLS, onINP, onLCP } from 'web-vitals'

// Measurement layer shared by both dashboards. It lives outside React so measuring never adds
// work to the components being measured; the metrics bar subscribes to it on its own.

export type Variant = 'slow' | 'fast'

export interface LoadMetrics {
  lcp: number | null
  cls: number | null
  inp: number | null
  jsKb: number
  domNodes: number
}

export interface BenchResult {
  /** Keystroke → next painted frame (what INP measures): how frozen the input feels. */
  avgPaint: number
  worstPaint: number
  /** Keystroke → results for that text on screen. */
  avgResults: number
  worstResults: number
  /** Total wall time to type the query and clear it again. */
  total: number
  /** Sum of (long task − 50 ms) during the run. */
  blocking: number
  domNodes: number
}

export interface MetricsState {
  load: LoadMetrics
  lastPaint: number | null
  lastResults: number | null
  bench: BenchResult | null
  running: boolean
}

let state: MetricsState = {
  load: { lcp: null, cls: null, inp: null, jsKb: 0, domNodes: 0 },
  lastPaint: null,
  lastResults: null,
  bench: null,
  running: false,
}
const listeners = new Set<() => void>()

function set(patch: Partial<MetricsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function setLoad(patch: Partial<LoadMetrics>) {
  set({ load: { ...state.load, ...patch } })
}

export const metricsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: () => state,
}

// --- Keystroke timing -------------------------------------------------------------------------

const SEARCH = '[data-bench="search"]'
const pending = new Map<string, number>()
let paints: number[] = []
let results: number[] = []
let lastRendered: string | null = null
let waiters: { query: string; resolve: () => void }[] = []

function afterNextPaint(fn: () => void) {
  // Browsers throttle animation frames in hidden tabs to about one a second, which would swamp
  // the measurement; there is no paint to wait for then anyway.
  if (document.visibilityState === 'hidden') setTimeout(fn, 0)
  else requestAnimationFrame(() => setTimeout(fn, 0))
}

/** Call once a dashboard has rendered results for `query` (from an effect). */
export function reportResults(query: string) {
  afterNextPaint(() => {
    lastRendered = query
    const t0 = pending.get(query)
    if (t0 !== undefined) {
      pending.delete(query)
      const ms = performance.now() - t0
      results.push(ms)
      set({ lastResults: ms })
    }
    waiters = waiters.filter((w) => (w.query === query ? (w.resolve(), false) : true))
  })
}

function waitForResults(query: string, timeout = 15_000): Promise<void> {
  if (lastRendered === query && !pending.has(query)) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout)
    waiters.push({ query, resolve: () => (clearTimeout(timer), resolve()) })
  })
}

// --- Long tasks ---------------------------------------------------------------------------------

let blocking = 0
function observeLongTasks() {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) blocking += Math.max(0, e.duration - 50)
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* Long Tasks API is Chromium-only; blocking time then reads 0. */
  }
}

// --- Page weight --------------------------------------------------------------------------------

function jsKb(): number {
  let bytes = 0
  for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (!/\.(m?js|tsx?)(\?|$)/.test(e.name)) continue
    bytes += e.encodedBodySize || e.transferSize || e.decodedBodySize
  }
  return Math.round(bytes / 1024)
}

function domNodes() {
  return document.getElementsByTagName('*').length
}

// --- Benchmark ----------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function typeInto(input: HTMLInputElement, value: string) {
  // React tracks the input's value itself, so set it through the native setter, then fire the
  // same input event a real keystroke does.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export const BENCH_QUERY = 'wireless'
const KEY_INTERVAL = 90

/** Types BENCH_QUERY into the search box like a person would, then deletes it again. */
export async function runBenchmark(): Promise<BenchResult> {
  const input = document.querySelector<HTMLInputElement>(SEARCH)
  if (!input) throw new Error('Search box not found')
  set({ running: true })
  if (input.value) {
    typeInto(input, '')
    await waitForResults('')
  }
  await sleep(300)
  pending.clear()
  paints = []
  results = []
  blocking = 0
  const start = performance.now()
  for (let i = 1; i <= BENCH_QUERY.length; i++) {
    typeInto(input, BENCH_QUERY.slice(0, i))
    await sleep(KEY_INTERVAL)
  }
  await waitForResults(BENCH_QUERY)
  for (let i = BENCH_QUERY.length - 1; i >= 0; i--) {
    typeInto(input, BENCH_QUERY.slice(0, i))
    await sleep(KEY_INTERVAL)
  }
  await waitForResults('')
  const bench: BenchResult = {
    avgPaint: avg(paints),
    worstPaint: Math.max(0, ...paints),
    avgResults: avg(results),
    worstResults: Math.max(0, ...results),
    total: performance.now() - start,
    blocking,
    domNodes: domNodes(),
  }
  set({ bench, running: false })
  return bench
}

// --- Setup --------------------------------------------------------------------------------------

export function startMetrics(variant: Variant) {
  observeLongTasks()

  document.addEventListener(
    'input',
    (e) => {
      const target = e.target as HTMLElement
      if (!target.matches?.(SEARCH)) return
      const t0 = e.timeStamp
      pending.set((target as HTMLInputElement).value, t0)
      afterNextPaint(() => {
        const ms = performance.now() - t0
        paints.push(ms)
        set({ lastPaint: ms })
      })
    },
    true,
  )

  onLCP((m) => setLoad({ lcp: m.value }), { reportAllChanges: true })
  onCLS((m) => setLoad({ cls: m.value }), { reportAllChanges: true })
  onINP((m) => setLoad({ inp: m.value }), { reportAllChanges: true })

  const sample = () => setLoad({ jsKb: jsKb(), domNodes: domNodes() })
  addEventListener('load', () => setTimeout(sample, 0))
  setInterval(sample, 2000)

  // The race page drives each dashboard through postMessage.
  if (window.parent !== window) {
    addEventListener('message', async (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'perf-rescue:run') return
      sample()
      const bench = await runBenchmark()
      sample()
      window.parent.postMessage({ type: 'perf-rescue:result', variant, bench, load: state.load }, location.origin)
    })
    addEventListener('load', () =>
      // Give lazy chunks and the first data pass time to land before reporting load metrics.
      setTimeout(() => {
        sample()
        window.parent.postMessage({ type: 'perf-rescue:ready', variant, load: state.load }, location.origin)
      }, 1500),
    )
  }
}
