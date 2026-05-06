'use client'
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface ChartEntry { name: string; value: number; fill: string }
interface DateEntry { date: string; count: number }

interface Props {
  statusCounts: ChartEntry[]
  sourceCounts: ChartEntry[]
  byDate: DateEntry[]
}

export default function ReportsCharts({ statusCounts, sourceCounts, byDate }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-4">
        <p className="text-sm font-semibold text-[#191B23] mb-3">By Status</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={statusCounts} layout="vertical" margin={{ left: 16 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {statusCounts.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-[#C3C5D7] p-4">
        <p className="text-sm font-semibold text-[#191B23] mb-3">By Source</p>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={sourceCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
              {sourceCounts.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-[#C3C5D7] p-4">
        <p className="text-sm font-semibold text-[#191B23] mb-3">Daily Volume</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={byDate} margin={{ bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#1A56DB" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
