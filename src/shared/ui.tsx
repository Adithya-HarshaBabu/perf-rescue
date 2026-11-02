import { useSyncExternalStore, type ReactNode } from 'react'
import { CATEGORIES, STATUSES, type Filters, type Kpis } from './data'
import { metricsStore, runBenchmark, type Variant } from './metrics'

// Presentational pieces both dashboards render, so the only differences between them are the
// data flow and rendering strategy, not the markup.

export function Header({ variant }: { variant: Variant }) {
  const other = variant === 'slow' ? 'fast' : 'slow'
  return (
    <header className="dash-header">
      <div>
        <span className={`variant variant-${variant}`}>{variant === 'slow' ? 'Before' : 'After'}</span>
        <h1>Orders dashboard</h1>
      </div>
      <nav>
        <a href="../">Race both</a>
        <a href={`../${other}/${location.search}`}>Open {variant === 'slow' ? 'after' : 'before'} →</a>
      </nav>
    </header>
  )
}

interface FiltersBarProps {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  count: number
  busy?: boolean
}

export function FiltersBar({ filters, onChange, count, busy }: FiltersBarProps) {
  return (
    <div className="filters">
      <input
        data-bench="search"
        type="search"
        placeholder="Search customer, email, product or order ID"
        aria-label="Search orders"
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
      />
      <select aria-label="Category" value={filters.category} onChange={(e) => onChange({ category: e.target.value as Filters['category'] })}>
        <option value="all">All categories</option>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select aria-label="Status" value={filters.status} onChange={(e) => onChange({ status: e.target.value as Filters['status'] })}>
        <option value="all">All statuses</option>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select aria-label="Sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as Filters['sort'] })}>
        <option value="date">Newest first</option>
        <option value="amount">Largest first</option>
      </select>
      <span className={`count ${busy ? 'busy' : ''}`}>{count.toLocaleString('en-US')} orders</span>
    </div>
  )
}

export function KpiTiles({ kpis, format }: { kpis: Kpis; format: (n: number) => string }) {
  return (
    <div className="kpis">
      <Kpi label="Revenue" value={format(kpis.revenue)} />
      <Kpi label="Orders" value={kpis.orders.toLocaleString('en-US')} />
      <Kpi label="Avg. order" value={format(kpis.aov)} />
      <Kpi label="Refund rate" value={`${(kpis.refundRate * 100).toFixed(1)}%`} />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function SyncBanner({ children }: { children: ReactNode }) {
  return <div className="sync-banner">{children}</div>
}

const COLUMNS = ['Order', 'Date', 'Customer', 'Product', 'Region', 'Status', 'Amount']

export function TableHead() {
  return (
    <div className="row head" role="row">
      {COLUMNS.map((c) => <span key={c} role="columnheader">{c}</span>)}
    </div>
  )
}

const ms = (n: number | null) => (n === null ? '–' : `${Math.round(n)} ms`)

export function MetricsBar() {
  const m = useSyncExternalStore(metricsStore.subscribe, metricsStore.get)
  const embedded = window.parent !== window
  return (
    <aside className="metrics" aria-label="Live performance metrics">
      <Metric label="LCP" value={ms(m.load.lcp)} />
      <Metric label="CLS" value={m.load.cls === null ? '–' : m.load.cls.toFixed(3)} />
      <Metric label="INP" value={ms(m.load.inp)} />
      <Metric label="Last keystroke → paint" value={ms(m.lastPaint)} />
      <Metric label="Last keystroke → results" value={ms(m.lastResults)} />
      <Metric label="JS loaded" value={`${m.load.jsKb.toLocaleString('en-US')} KB`} />
      <Metric label="DOM nodes" value={m.load.domNodes.toLocaleString('en-US')} />
      {!embedded && (
        <button type="button" disabled={m.running} onClick={() => void runBenchmark()}>
          {m.running ? 'Typing…' : m.bench ? `Typed in ${Math.round(m.bench.total)} ms · run again` : 'Run typing test'}
        </button>
      )}
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
