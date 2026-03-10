import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { PROVIDER_COLORS, PROVIDER_LABELS, formatNum, formatPct } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

interface ConformalPanelProps {
  conformal: any
}

export function ConformalPanel({ conformal }: ConformalPanelProps) {
  const perModel: Record<string, any> = conformal?.per_model ?? {}
  const alphaSweep: Record<string, any[]> = conformal?.alpha_sweep ?? {}
  const providers = Object.keys(perModel)

  // Build alpha sweep chart data
  const allAlphas = new Set<number>()
  for (const p of providers) {
    for (const row of alphaSweep[p] ?? []) {
      allAlphas.add(row.alpha)
    }
  }
  const sortedAlphas = Array.from(allAlphas).sort((a, b) => a - b)

  const sweepData = sortedAlphas.map(alpha => {
    const entry: Record<string, any> = { alpha }
    for (const p of providers) {
      const row = (alphaSweep[p] ?? []).find((r: any) => r.alpha === alpha)
      entry[p] = row?.empirical_coverage ?? null
      entry[`${p}_target`] = 1 - alpha
    }
    return entry
  })

  return (
    <div className="space-y-6">
      {/* Per-model metric cards */}
      <div className="grid grid-cols-3 gap-4">
        {providers.map(p => {
          const m = perModel[p]
          return (
            <Card key={p}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{PROVIDER_LABELS[p] ?? p}</CardTitle>
                  <Badge provider={p}>{p}</Badge>
                </div>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">q̂ (threshold)</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{formatNum(m.q_hat)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">Coverage</p>
                  <p
                    className="text-lg font-bold mt-0.5"
                    style={{
                      color:
                        m.empirical_coverage >= m.target_coverage ? '#10B981' : '#EF4444',
                    }}
                  >
                    {formatPct(m.empirical_coverage)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">Avg Set Size</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {formatNum(m.avg_set_size, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">Singleton Frac</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {formatPct(m.singleton_frac)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">Cal Score Mean</p>
                  <p className="text-sm font-mono text-foreground mt-0.5">
                    {formatNum(m.cal_score_mean)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider">Cal Score Std</p>
                  <p className="text-sm font-mono text-foreground mt-0.5">
                    {formatNum(m.cal_score_std)}
                  </p>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted">
                n_cal = {m.n_cal} · n_test = {m.n_test} · target {formatPct(m.target_coverage)}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Alpha sweep chart */}
      <Card>
        <CardHeader>
          <CardTitle>Coverage vs Alpha Sweep</CardTitle>
        </CardHeader>
        <p className="text-xs text-muted mb-3">
          Empirical coverage as α varies. Dashed diagonal = target coverage (1 − α).
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sweepData} margin={{ top: 10, right: 30, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="alpha"
              tickFormatter={v => formatNum(v, 2)}
              label={{ value: 'α', position: 'insideBottom', offset: -5, fill: '#94A3B8', fontSize: 12 }}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              stroke="#334155"
            />
            <YAxis
              domain={[0.7, 1.05]}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              stroke="#334155"
            />
            <Tooltip
              contentStyle={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#F1F5F9',
                fontSize: 12,
              }}
              formatter={(value: any, name: any) => [
                typeof value === 'number' ? formatPct(value) : String(value),
                String(name).endsWith('_target') ? 'Target (1-α)' : PROVIDER_LABELS[String(name)] ?? String(name),
              ]}
              labelFormatter={v => `α = ${formatNum(v, 2)}`}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => {
                if (value.endsWith('_target')) return 'Target coverage'
                return PROVIDER_LABELS[value] ?? value
              }}
              wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
            />
            {/* Target coverage reference as a line for first provider (diagonal) */}
            {providers.length > 0 && (
              <Line
                dataKey={`${providers[0]}_target`}
                stroke="#6B7280"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                dot={false}
                name={`${providers[0]}_target`}
              />
            )}
            {providers.map(p => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={PROVIDER_COLORS[p]}
                strokeWidth={2}
                dot={{ r: 4, fill: PROVIDER_COLORS[p] }}
                name={p}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
