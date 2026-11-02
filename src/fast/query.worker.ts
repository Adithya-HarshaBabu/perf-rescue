import { CATEGORIES, DAYS, STATUSES, dayKeys, generateOrders, type Filters, type Kpis } from '../shared/data'

// Filtering and aggregation run here, off the main thread. Everything that doesn't depend on the
// filters (lower-cased search text, timestamps, day buckets, sort orders) is computed once up front.

export type WorkerRequest = { type: 'init'; rows: number } | { type: 'query'; id: number; filters: Filters }

export interface WorkerResponse {
  id: number
  query: string
  /** Matching row indices, in display order. */
  indices: Int32Array
  kpis: Kpis
  byDay: { day: string; revenue: number }[]
  byCategory: { category: string; revenue: number }[]
}

let haystack: string[] = []
let amount: Float64Array
let dayIndex: Int16Array
let category: Int8Array
let status: Int8Array
let byDate: Int32Array
let byAmount: Int32Array
const days = dayKeys()
const REFUNDED = STATUSES.indexOf('Refunded')

function init(rows: number) {
  const orders = generateOrders(rows)
  const firstDay = Date.parse(`${days[0]}T00:00:00Z`)
  const ts = new Float64Array(rows)
  amount = new Float64Array(rows)
  dayIndex = new Int16Array(rows)
  category = new Int8Array(rows)
  status = new Int8Array(rows)
  haystack = orders.map((o, i) => {
    ts[i] = Date.parse(o.createdAt)
    amount[i] = o.amount
    dayIndex[i] = Math.min(DAYS - 1, Math.floor((ts[i] - firstDay) / 86_400_000))
    category[i] = CATEGORIES.indexOf(o.category)
    status[i] = STATUSES.indexOf(o.status)
    return `${o.customer}\n${o.email}\n${o.product}\n${o.id}`.toLowerCase()
  })
  const all = Int32Array.from({ length: rows }, (_, i) => i)
  byDate = all.slice().sort((a, b) => ts[b] - ts[a])
  byAmount = all.slice().sort((a, b) => amount[b] - amount[a])
}

function query(id: number, f: Filters): WorkerResponse {
  const q = f.query.trim().toLowerCase()
  const cat = f.category === 'all' ? -1 : CATEGORIES.indexOf(f.category)
  const st = f.status === 'all' ? -1 : STATUSES.indexOf(f.status)
  const order = f.sort === 'date' ? byDate : byAmount
  const out = new Int32Array(order.length)
  const dayRevenue = new Float64Array(DAYS)
  const catRevenue = new Float64Array(CATEGORIES.length)
  let n = 0
  let paid = 0
  let revenue = 0
  // Pre-sorted orders mean filtering keeps the sort for free: no sorting per keystroke.
  for (let k = 0; k < order.length; k++) {
    const i = order[k]
    if (cat !== -1 && category[i] !== cat) continue
    if (st !== -1 && status[i] !== st) continue
    if (q && !haystack[i].includes(q)) continue
    out[n++] = i
    if (status[i] === REFUNDED) continue
    paid++
    revenue += amount[i]
    dayRevenue[dayIndex[i]] += amount[i]
    catRevenue[category[i]] += amount[i]
  }
  return {
    id,
    query: f.query,
    indices: out.slice(0, n),
    kpis: { revenue, orders: n, aov: paid ? revenue / paid : 0, refundRate: n ? (n - paid) / n : 0 },
    byDay: days.map((day, d) => ({ day, revenue: Math.round(dayRevenue[d]) })).filter((p) => p.revenue > 0),
    byCategory: CATEGORIES.map((c, j) => ({ category: c, revenue: Math.round(catRevenue[j]) })),
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') return init(msg.rows)
  const res = query(msg.id, msg.filters)
  ;(self as unknown as Worker).postMessage(res, [res.indices.buffer])
}
