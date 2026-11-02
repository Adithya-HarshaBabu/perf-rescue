import { useEffect, useRef, useState } from 'react'
import { BENCH_QUERY, type BenchResult, type LoadMetrics, type Variant } from '../shared/metrics'

// Runs the same typing test against both dashboards, one after the other. Same-origin iframes
// share the page's main thread, so running them at the same time would let one slow the other.

type Phase = 'idle' | Variant | 'done'
interface Run {
  load: LoadMetrics
  bench?: BenchResult
}

const FIXES = [
  ['Chart library, moment with every locale and lodash in the first bundle', 'Charts lazy-loaded after first paint; Intl and plain code instead of moment and lodash'],
  ['All 10,000 rows rendered into the DOM', 'Virtualized table (TanStack Virtual): only visible rows exist'],
  ['Filter, sort and aggregate everything on the main thread per keystroke', 'Web Worker does the work; one query in flight, newest wins'],
  ['moment() date parsing inside the sort comparator', 'Timestamps and sort orders computed once, filtering keeps the order'],
  ['New context value and inline props re-render everything', 'Stable callbacks and memoized table, rows and charts'],
  ['Late “synced” banner pushes the page down', 'Space reserved up front: no layout shift'],
]

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [runs, setRuns] = useState<Partial<Record<Variant, Run>>>({})
  const [srcs, setSrcs] = useState<Partial<Record<Variant, string>>>({})
  const stats = useBundleStats()
  const frames = useRef<Record<Variant, HTMLIFrameElement | null>>({ slow: null, fast: null })

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      const { type, variant, load, bench } = e.data ?? {}
      if (type === 'perf-rescue:ready') {
        setRuns((r) => ({ ...r, [variant]: { load } }))
        frames.current[variant as Variant]?.contentWindow?.postMessage({ type: 'perf-rescue:run' }, location.origin)
      } else if (type === 'perf-rescue:result') {
        setRuns((r) => ({ ...r, [variant]: { load, bench } }))
        if (variant === 'slow') {
          setPhase('fast')
          setSrcs((s) => ({ ...s, fast: `fast/${location.search}` }))
        } else {
          setPhase('done')
        }
      }
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [])

  const start = () => {
    setRuns({})
    setPhase('slow')
    // A fresh URL each time so both pages load from scratch.
    const bust = `${location.search ? `${location.search}&` : '?'}run=${Date.now()}`
    setSrcs({ slow: `slow/${bust}` })
  }

  const running = phase === 'slow' || phase === 'fast'
  return (
    <div className="race">
      <header className="race-head">
        <span className="eyebrow">Performance rescue · case study</span>
        <h1>Same dashboard, rebuilt to be fast.</h1>
        <p>
          Two versions of one React orders dashboard: 10,000 orders, search, filters, KPIs, charts and a table. The
          <strong> before</strong> version uses patterns found in real codebases; the <strong>after</strong> version fixes
          them without removing a single feature. Press run to type “{BENCH_QUERY}” into each one and measure it live in
          your browser.
        </p>
        <div className="race-actions">
          <button type="button" className="primary" onClick={start} disabled={running}>
            {running ? `Testing the ${phase === 'slow' ? 'before' : 'after'} version…` : phase === 'done' ? 'Run again' : 'Run the race'}
          </button>
          <a href={`slow/${location.search}`}>Open before ↗</a>
          <a href={`fast/${location.search}`}>Open after ↗</a>
        </div>
      </header>

      <Results runs={runs} stats={stats} />

      <div className="frames">
        {(['slow', 'fast'] as const).map((v) => (
          <section key={v} className={`frame ${phase === v ? 'active' : ''}`}>
            <h2>
              <span className={`variant variant-${v}`}>{v === 'slow' ? 'Before' : 'After'}</span>
              {phase === v ? 'running…' : runs[v]?.bench ? 'done' : 'waiting'}
            </h2>
            {srcs[v] ? (
              <iframe ref={(el) => { frames.current[v] = el }} src={srcs[v]} title={`${v === 'slow' ? 'Before' : 'After'} dashboard`} />
            ) : (
              <div className="frame-empty">Loads when its turn comes</div>
            )}
          </section>
        ))}
      </div>

      <section className="fixes">
        <h2>What changed</h2>
        <div className="fix-grid">
          <span className="fix-head">Before</span>
          <span className="fix-head">After</span>
          {FIXES.map(([before, after]) => (
            <div key={before} className="fix-row">
              <span>🐌 {before}</span>
              <span>✅ {after}</span>
            </div>
          ))}
        </div>
        <p className="note">
          Numbers are measured in your browser, so they vary by device; on a slower laptop or phone the gap widens.
          Blocking time uses the Long Tasks API (Chromium browsers). Append <code>?rows=30000</code> to stress-test.
        </p>
      </section>
    </div>
  )
}

type BundleStats = Record<string, { initialKb: number; totalKb: number }>

/** Gzipped bundle sizes the build writes out; absent in dev. */
function useBundleStats() {
  const [stats, setStats] = useState<BundleStats | null>(null)
  useEffect(() => {
    fetch('bundle-stats.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {})
  }, [])
  return stats
}

type Row = [label: string, pick: (r: Run) => number | null | undefined, unit: 'ms' | 'kb' | 'n' | 'cls']

const ROWS: Row[] = [
  ['Keystroke → next paint (avg)', (r) => r.bench?.avgPaint, 'ms'],
  ['Keystroke → next paint (worst)', (r) => r.bench?.worstPaint, 'ms'],
  ['Keystroke → results on screen (avg)', (r) => r.bench?.avgResults, 'ms'],
  ['Typing test, start to finish', (r) => r.bench?.total, 'ms'],
  ['Main thread blocked', (r) => r.bench?.blocking, 'ms'],
  ['DOM nodes', (r) => r.bench?.domNodes ?? r.load.domNodes, 'n'],
  ['Largest Contentful Paint', (r) => r.load.lcp, 'ms'],
  ['Cumulative Layout Shift', (r) => r.load.cls, 'cls'],
]

function fmt(v: number | null | undefined, unit: Row[2]) {
  if (v === null || v === undefined) return '–'
  if (unit === 'ms') return `${Math.round(v).toLocaleString('en-US')} ms`
  if (unit === 'kb') return `${v.toLocaleString('en-US')} KB`
  if (unit === 'cls') return v.toFixed(3)
  return v.toLocaleString('en-US')
}

function change(before: number | null | undefined, after: number | null | undefined, unit: Row[2]) {
  if (before == null || after == null) return ''
  if (unit === 'cls') return after < before ? `−${Math.round((1 - after / Math.max(before, 1e-9)) * 100)}%` : ''
  if (after <= 0) return before > 0 ? 'eliminated' : ''
  const ratio = before / after
  return ratio >= 2 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1)}× better` : ratio > 1 ? `−${Math.round((1 - after / before) * 100)}%` : ''
}

function Results({ runs, stats }: { runs: Partial<Record<Variant, Run>>; stats: BundleStats | null }) {
  const { slow, fast } = runs
  const initial = stats && ([stats.slow?.initialKb, stats.fast?.initialKb] as const)
  return (
    <section className="results" aria-live="polite">
      <div className="results-row results-head">
        <span>Metric</span>
        <span>Before</span>
        <span>After</span>
        <span>Change</span>
      </div>
      {initial && (
        <div className="results-row">
          <span>JavaScript needed for first render (gzip)</span>
          <span className="num slow">{fmt(initial[0], 'kb')}</span>
          <span className="num fast">{fmt(initial[1], 'kb')}</span>
          <span className="num gain">{change(initial[0], initial[1], 'kb')}</span>
        </div>
      )}
      {ROWS.map(([label, pick, unit]) => {
        const b = slow && pick(slow)
        const a = fast && pick(fast)
        return (
          <div key={label} className="results-row">
            <span>{label}</span>
            <span className="num slow">{fmt(b, unit)}</span>
            <span className="num fast">{fmt(a, unit)}</span>
            <span className="num gain">{change(b, a, unit)}</span>
          </div>
        )
      })}
    </section>
  )
}
