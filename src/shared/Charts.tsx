import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CategoryPoint, DayPoint } from './data'

interface ChartsProps {
  byDay: DayPoint[]
  byCategory: CategoryPoint[]
  animate: boolean
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD' })
const money = (v: unknown) => compact.format(Number(v))

export default function Charts({ byDay, byCategory, animate }: ChartsProps) {
  return (
    <div className="charts">
      <figure className="chart">
        <figcaption>Revenue per day</figcaption>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={byDay} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} minTickGap={40} />
            <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip formatter={money} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }} />
            <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={animate} />
          </LineChart>
        </ResponsiveContainer>
      </figure>
      <figure className="chart">
        <figcaption>Revenue by category</figcaption>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={byCategory} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} interval={0} />
            <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip formatter={money} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }} cursor={{ fill: 'var(--panel-2)' }} />
            <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </div>
  )
}
