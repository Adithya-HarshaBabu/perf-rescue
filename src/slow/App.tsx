import _ from 'lodash'
import moment from 'moment'
import 'moment/min/locales'
import { createContext, useContext, useEffect, useState } from 'react'
import Charts from '../shared/Charts'
import { CATEGORIES, DEFAULT_FILTERS, generateOrders, rowCount, type Filters, type Order } from '../shared/data'
import { reportResults } from '../shared/metrics'
import { FiltersBar, Header, KpiTiles, MetricsBar, SyncBanner, TableHead } from '../shared/ui'

// "Before": a dashboard written the way many real ones are. Each 🐌 marks a problem the fast
// version fixes. None of it is contrived; every pattern here shows up in production code.

const DashboardContext = createContext<{ orders: Order[]; filters: Filters } | null>(null)

export default function App() {
  const [orders] = useState(() => generateOrders(rowCount()))
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)

  // 🐌 6. Late content with no reserved space: the banner pushes the whole page down (CLS).
  useEffect(() => {
    const t = setTimeout(() => setSyncedAt(moment().format('LTS')), 700)
    return () => clearTimeout(t)
  }, [])

  // 🐌 3. Filtering, sorting and aggregating all 10,000 rows synchronously on every keystroke.
  const query = filters.query.toLowerCase()
  const filtered = _.filter(orders, (o) => {
    if (filters.category !== 'all' && o.category !== filters.category) return false
    if (filters.status !== 'all' && o.status !== filters.status) return false
    return [o.customer, o.email, o.product, o.id].some((field) => field.toLowerCase().includes(query))
  })

  // 🐌 4. Parsing date strings with moment inside the sort comparator: ~2 parses per comparison.
  const sorted =
    filters.sort === 'date'
      ? filtered.slice().sort((a, b) => moment(b.createdAt).diff(moment(a.createdAt)))
      : _.orderBy(filtered, ['amount'], ['desc'])

  const paid = filtered.filter((o) => o.status !== 'Refunded')
  const revenue = _.sumBy(paid, 'amount')
  const kpis = {
    revenue,
    orders: filtered.length,
    aov: paid.length ? revenue / paid.length : 0,
    refundRate: filtered.length ? (filtered.length - paid.length) / filtered.length : 0,
  }
  const byDay = _.map(
    _.groupBy(_.sortBy(paid, (o) => moment(o.createdAt).valueOf()), (o) => moment(o.createdAt).format('YYYY-MM-DD')),
    (list, day) => ({ day, revenue: _.round(_.sumBy(list, 'amount')) }),
  )
  const byCategory = CATEGORIES.map((category) => ({
    category,
    revenue: _.round(_.sumBy(paid.filter((o) => o.category === category), 'amount')),
  }))

  useEffect(() => reportResults(filters.query), [filters.query])

  return (
    // 🐌 5. A new context value every render re-renders every consumer, even unrelated ones.
    <DashboardContext.Provider value={{ orders: sorted, filters }}>
      <div className="page">
        <Header variant="slow" />
        {syncedAt && <SyncBanner>Synced with the orders API at {syncedAt}</SyncBanner>}
        <FiltersBar filters={filters} onChange={(patch) => setFilters({ ...filters, ...patch })} count={sorted.length} />
        <KpiTiles kpis={kpis} format={(n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
        {/* 🐌 1. Chart library, moment (with every locale) and lodash all ship in the first bundle. */}
        <Charts byDay={byDay} byCategory={byCategory} animate />
        <OrdersTable />
      </div>
      <MetricsBar />
    </DashboardContext.Provider>
  )
}

function OrdersTable() {
  const { orders } = useContext(DashboardContext)!
  // 🐌 2. Every row goes into the DOM: 10,000 rows × 7 cells.
  return (
    <div className="table" role="table" aria-label="Orders">
      <TableHead />
      <div className="table-body">
        {orders.map((o) => (
          <div key={o.id} className="row" role="row">
            <span>{o.id}</span>
            <span>{moment(o.createdAt).format('MMM D, YYYY h:mm A')}</span>
            <span>
              {o.customer}
              <small>{o.email}</small>
            </span>
            <span>{o.product}</span>
            <span>{o.region}</span>
            <span className={`status ${o.status.toLowerCase()}`}>{o.status}</span>
            <span className="num">{o.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
