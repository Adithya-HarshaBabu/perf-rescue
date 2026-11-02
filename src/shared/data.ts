// Deterministic fake order data. Both dashboards (and the fast version's worker) generate the
// exact same rows from the same seed, so every comparison runs on identical input.

export const CATEGORIES = ['Electronics', 'Home', 'Outdoors', 'Books', 'Beauty', 'Toys', 'Grocery', 'Fashion'] as const
export const STATUSES = ['Paid', 'Shipped', 'Delivered', 'Refunded', 'Pending'] as const
export const REGIONS = ['North America', 'Europe', 'APAC', 'LATAM', 'Middle East'] as const

export type Category = (typeof CATEGORIES)[number]
export type Status = (typeof STATUSES)[number]

export interface Order {
  id: string
  customer: string
  email: string
  product: string
  category: Category
  region: string
  status: Status
  amount: number
  /** ISO timestamp, as an API would send it. */
  createdAt: string
}

export interface Filters {
  query: string
  category: Category | 'all'
  status: Status | 'all'
  sort: 'date' | 'amount'
}

export interface Kpis {
  revenue: number
  orders: number
  aov: number
  refundRate: number
}

export interface DayPoint {
  day: string
  revenue: number
}

export interface CategoryPoint {
  category: string
  revenue: number
}

export const DEFAULT_FILTERS: Filters = { query: '', category: 'all', status: 'all', sort: 'date' }
export const DEFAULT_ROWS = 10_000
export const DAYS = 180

/** Row count, overridable with ?rows= for heavier or lighter runs. */
export function rowCount(search = typeof location === 'undefined' ? '' : location.search): number {
  const n = Number(new URLSearchParams(search).get('rows'))
  return Number.isFinite(n) && n >= 100 && n <= 100_000 ? Math.floor(n) : DEFAULT_ROWS
}

const PRODUCTS: Record<Category, [string, number][]> = {
  Electronics: [['Wireless Earbuds', 79], ['USB-C Hub', 45], ['Mechanical Keyboard', 129], ['4K Monitor', 349], ['Smart Speaker', 99], ['Laptop Stand', 39]],
  Home: [['Ceramic Vase', 32], ['Linen Throw', 58], ['Desk Lamp', 44], ['Air Purifier', 189], ['Cast Iron Pan', 49], ['Wall Clock', 27]],
  Outdoors: [['Trail Backpack', 119], ['Camping Stove', 64], ['Insect Repellent', 12], ['Rain Shell', 149], ['Hammock', 55], ['Water Filter', 38]],
  Books: [['Design Systems Handbook', 34], ['Fantasy Box Set', 59], ['Cookbook', 29], ['Travel Guide', 22], ['Sci-Fi Novel', 18], ['Kids Atlas', 25]],
  Beauty: [['Vitamin C Serum', 36], ['Sunscreen SPF 50', 19], ['Hair Dryer', 129], ['Face Wash', 14], ['Perfume', 88], ['Nail Kit', 24]],
  Toys: [['Building Blocks', 49], ['Puzzle 1000pc', 21], ['RC Car', 69], ['Plush Bear', 18], ['Board Game', 39], ['Wireless Drone', 159]],
  Grocery: [['Coffee Beans', 17], ['Green Tea', 11], ['Olive Oil', 23], ['Granola', 9], ['Dark Chocolate', 7], ['Spice Set', 31]],
  Fashion: [['Wool Sweater', 89], ['Running Shoes', 119], ['Denim Jacket', 98], ['Leather Belt', 42], ['Sunglasses', 129], ['Wireless Watch', 199]],
}

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Priya', 'Ethan', 'Zara', 'Lucas', 'Ana', 'Omar', 'Mei', 'Leo', 'Ines', 'Kai', 'Nora', 'Ravi', 'Emma', 'Yuki', 'Diego']
const LAST = ['Shah', 'Garcia', 'Kim', 'Rossi', 'Nguyen', 'Patel', 'Müller', 'Silva', 'Okafor', 'Cohen', 'Tanaka', 'Dubois', 'Iyer', 'Larsen', 'Haddad', 'Novak', 'Reyes', 'Brown', 'Singh', 'Costa']
const DOMAINS = ['gmail.com', 'outlook.com', 'proton.me', 'yahoo.com', 'fastmail.com']

/** Day the data set ends on; fixed so every visitor sees the same numbers. */
const END = Date.UTC(2026, 9, 31, 23, 59, 59)
const DAY_MS = 86_400_000

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateOrders(n: number): Order[] {
  const rand = mulberry32(42)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const orders: Order[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const category = pick(CATEGORIES)
    const [product, price] = pick(PRODUCTS[category])
    const first = pick(FIRST)
    const last = pick(LAST)
    const qty = rand() < 0.75 ? 1 : 1 + Math.floor(rand() * 4)
    const r = rand()
    const status: Status = r < 0.06 ? 'Refunded' : r < 0.14 ? 'Pending' : r < 0.42 ? 'Paid' : r < 0.7 ? 'Shipped' : 'Delivered'
    orders[i] = {
      id: `ORD-${(100_000 + i).toString(36).toUpperCase()}`,
      customer: `${first} ${last}`,
      email: `${first}.${last}${Math.floor(rand() * 90 + 10)}@${pick(DOMAINS)}`.toLowerCase(),
      product,
      category,
      region: pick(REGIONS),
      status,
      amount: Math.round(price * qty * (0.85 + rand() * 0.3) * 100) / 100,
      createdAt: new Date(END - Math.floor(rand() * DAYS * DAY_MS)).toISOString(),
    }
  }
  return orders
}

/** Dates from the first to the last day of the data set, as YYYY-MM-DD. */
export function dayKeys(): string[] {
  const keys: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) keys.push(new Date(END - i * DAY_MS).toISOString().slice(0, 10))
  return keys
}
