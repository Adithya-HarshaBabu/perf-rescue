import { useVirtualizer } from '@tanstack/react-virtual'
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_FILTERS, generateOrders, rowCount, type Filters, type Order } from '../shared/data'
import { reportResults } from '../shared/metrics'
import { FiltersBar, Header, KpiTiles, MetricsBar, SyncBanner, TableHead } from '../shared/ui'
import type { WorkerRequest, WorkerResponse } from './query.worker'

// "After": same features and markup as the slow version. Each ✅ is the fix for the matching 🐌.

// ✅ 1. Charts (and their library) load in their own chunk after first paint. No moment, no
//       lodash: Intl and a few lines of plain code cover what they were used for.
const Charts = lazy(() => import('../shared/Charts').then((m) => ({ default: memo(m.default) })))

// ✅ 6 (part). Formatters are built once instead of per call.
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const formatMoney = (n: number) => currency.format(n)

const ROW_HEIGHT = 52
const rows = rowCount()

// ✅ 3. The worker filters and aggregates; the main thread only renders what comes back.
function useOrderQuery(filters: Filters) {
  const workerRef = useRef<Worker | null>(null)
  const [result, setResult] = useState<WorkerResponse | null>(null)
  const inFlight = useRef(false)
  const queued = useRef<Filters | null>(null)
  const nextId = useRef(0)

  const send = useCallback((f: Filters) => {
    // At most one query in flight; while busy, only the newest filters wait. Typing fast never
    // builds a backlog, and a stale response can never overwrite a newer one.
    if (inFlight.current) {
      queued.current = f
      return
    }
    inFlight.current = true
    workerRef.current!.postMessage({ type: 'query', id: nextId.current++, filters: f } satisfies WorkerRequest)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('./query.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.postMessage({ type: 'init', rows } satisfies WorkerRequest)
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      inFlight.current = false
      if (queued.current) {
        const next = queued.current
        queued.current = null
        send(next)
      }
      setResult(e.data)
    }
    return () => worker.terminate()
  }, [send])

  useEffect(() => send(filters), [filters, send])

  return result
}

export default function App() {
  // Row objects for display only; the worker builds its own copy from the same seed.
  const [orders] = useState(() => generateOrders(rows))
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const result = useOrderQuery(filters)

  useEffect(() => {
    const t = setTimeout(() => setSyncedAt(new Date().toLocaleTimeString('en-US')), 700)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (result) reportResults(result.query)
  }, [result])

  // ✅ 5. A stable callback, so memoized children skip renders they don't need.
  const onChange = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), [])

  return (
    <>
      <div className="page">
        <Header variant="fast" />
        {/* ✅ 6. The banner's space is reserved from the first paint, so nothing shifts. */}
        <div className="sync-slot">{syncedAt && <SyncBanner>Synced with the orders API at {syncedAt}</SyncBanner>}</div>
        <FiltersBar
          filters={filters}
          onChange={onChange}
          count={result?.kpis.orders ?? rows}
          busy={!result || result.query !== filters.query}
        />
        {result ? <KpiTiles kpis={result.kpis} format={formatMoney} /> : <div className="kpis skeleton" />}
        <Suspense fallback={<div className="charts skeleton" />}>
          {result ? <Charts byDay={result.byDay} byCategory={result.byCategory} animate={false} /> : <div className="charts skeleton" />}
        </Suspense>
        <OrdersTable orders={orders} indices={result?.indices ?? null} />
      </div>
      <MetricsBar />
    </>
  )
}

const OrdersTable = memo(function OrdersTable({ orders, indices }: { orders: Order[]; indices: Int32Array | null }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // ✅ 2. Only the ~15 visible rows (plus a few above and below) exist in the DOM.
  const virtualizer = useVirtualizer({
    count: indices?.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })
  return (
    <div className="table" role="table" aria-label="Orders" aria-rowcount={indices?.length}>
      <TableHead />
      <div className="table-body" ref={scrollRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {indices &&
            virtualizer.getVirtualItems().map((v) => (
              <Row key={v.key} order={orders[indices[v.index]]} top={v.start} />
            ))}
        </div>
      </div>
    </div>
  )
})

// ✅ 4. Dates are formatted only for rows on screen, with a shared formatter.
const Row = memo(function Row({ order: o, top }: { order: Order; top: number }) {
  return (
    <div className="row" role="row" style={{ position: 'absolute', top, left: 0, right: 0 }}>
      <span>{o.id}</span>
      <span>{dateTime.format(new Date(o.createdAt))}</span>
      <span>
        {o.customer}
        <small>{o.email}</small>
      </span>
      <span>{o.product}</span>
      <span>{o.region}</span>
      <span className={`status ${o.status.toLowerCase()}`}>{o.status}</span>
      <span className="num">{currency.format(o.amount)}</span>
    </div>
  )
})
