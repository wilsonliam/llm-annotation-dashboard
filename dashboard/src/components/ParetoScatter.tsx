import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import type { ProviderMetrics } from '../lib/loader'
import { PROVIDER_COLORS, PROVIDER_LABELS, formatNum, formatPct } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'

interface ParetoScatterProps {
  metrics: ProviderMetrics[]
}

type XMetric = 'total_tokens' | 'mean_latency_s' | 'brier_score'
type YMetric = 'agreement' | 'mean_confidence' | 'avg_kappa' | 'ready_rate'

const X_OPTIONS: { value: XMetric; label: string }[] = [
  { value: 'total_tokens', label: 'Total Tokens' },
  { value: 'mean_latency_s', label: 'Mean Latency (s)' },
  { value: 'brier_score', label: 'Brier Score' },
]

const Y_OPTIONS: { value: YMetric; label: string }[] = [
  { value: 'agreement', label: 'Agreement' },
  { value: 'mean_confidence', label: 'Mean Confidence' },
  { value: 'avg_kappa', label: 'Avg κ' },
  { value: 'ready_rate', label: 'Ready Rate' },
]

const selectStyle: React.CSSProperties = {
  background: '#1E293B',
  border: '1px solid #334155',
  color: '#F1F5F9',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '12px',
}

// Custom dot: star for Pareto-optimal, circle otherwise
function CustomDot(props: any) {
  const { cx, cy, payload } = props
  const color = PROVIDER_COLORS[payload.provider] ?? '#888'
  if (payload.pareto_optimal) {
    // Draw a star
    const size = 10
    const points = Array.from({ length: 5 }, (_, i) => {
      const outer = ((i * 72 - 90) * Math.PI) / 180
      const inner = (((i * 72 + 36) - 90) * Math.PI) / 180
      return [
        cx + size * Math.cos(outer),
        cy + size * Math.sin(outer),
        cx + (size * 0.4) * Math.cos(inner),
        cy + (size * 0.4) * Math.sin(inner),
      ]
    })
    const d = points
      .map(([ox, oy, ix, iy]) => `L${ox},${oy} L${ix},${iy}`)
      .join(' ')
      .replace('L', 'M')
    return (
      <g>
        <path d={d + ' Z'} fill={color} stroke={color} strokeWidth={1} opacity={0.9} />
      </g>
    )
  }
  return <circle cx={cx} cy={cy} r={7} fill={color} stroke={color} strokeWidth={1} opacity={0.85} />
}

function formatAxisValue(value: number, metric: XMetric | YMetric): string {
  if (metric === 'total_tokens') return (value / 1000).toFixed(0) + 'k'
  if (metric === 'agreement' || metric === 'mean_confidence' || metric === 'ready_rate' || metric === 'avg_kappa') {
    return (value * 100).toFixed(0) + '%'
  }
  return formatNum(value, 2)
}

export function ParetoScatter({ metrics }: ParetoScatterProps) {
  const [xMetric, setXMetric] = useState<XMetric>('total_tokens')
  const [yMetric, setYMetric] = useState<YMetric>('agreement')

  const scatterData = metrics.map(m => ({
    x: m[xMetric] as number,
    y: m[yMetric] as number,
    provider: m.provider,
    label: PROVIDER_LABELS[m.provider] ?? m.provider,
    pareto_optimal: m.pareto_optimal,
    agreement: m.agreement,
    mean_confidence: m.mean_confidence,
    avg_kappa: m.avg_kappa,
    ready_rate: m.ready_rate,
    total_tokens: m.total_tokens,
    mean_latency_s: m.mean_latency_s,
    brier_score: m.brier_score,
  }))

  // Pareto frontier: sort by x, connect pareto-optimal points as a step line
  const paretoPoints = useMemo(() => {
    const optimal = scatterData.filter(d => d.pareto_optimal).sort((a, b) => a.x - b.x)
    return optimal
  }, [scatterData])

  const paretoLineData = useMemo(() => {
    if (paretoPoints.length === 0) return []
    const sorted = [...paretoPoints].sort((a, b) => a.x - b.x)
    // Build step line data
    const result: Array<{ x: number; y: number }> = []
    for (let i = 0; i < sorted.length; i++) {
      result.push({ x: sorted[i].x, y: sorted[i].y })
      if (i < sorted.length - 1) {
        result.push({ x: sorted[i + 1].x, y: sorted[i].y })
      }
    }
    return result
  }, [paretoPoints])

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Pareto Scatter</CardTitle>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">X:</label>
            <select
              style={selectStyle}
              value={xMetric}
              onChange={e => setXMetric(e.target.value as XMetric)}
            >
              {X_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="text-xs text-muted">Y:</label>
            <select
              style={selectStyle}
              value={yMetric}
              onChange={e => setYMetric(e.target.value as YMetric)}
            >
              {Y_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="x"
            type="number"
            name={X_OPTIONS.find(o => o.value === xMetric)?.label}
            tickFormatter={v => formatAxisValue(v, xMetric)}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="#334155"
            domain={['auto', 'auto']}
          />
          <YAxis
            dataKey="y"
            type="number"
            name={Y_OPTIONS.find(o => o.value === yMetric)?.label}
            tickFormatter={v => formatAxisValue(v, yMetric)}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="#334155"
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#334155' }}
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null
              const d = payload[0]?.payload
              if (!d) return null
              return (
                <div
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#F1F5F9',
                  }}
                >
                  <p style={{ fontWeight: 600, color: PROVIDER_COLORS[d.provider], marginBottom: 6 }}>
                    {d.label}
                  </p>
                  <p>Agreement: {formatPct(d.agreement)}</p>
                  <p>Confidence: {formatPct(d.mean_confidence)}</p>
                  <p>Avg κ: {formatNum(d.avg_kappa)}</p>
                  <p>Ready Rate: {formatPct(d.ready_rate)}</p>
                  <p>Total Tokens: {d.total_tokens.toLocaleString()}</p>
                  <p>Latency: {d.mean_latency_s.toFixed(2)}s</p>
                  <p>Brier: {formatNum(d.brier_score)}</p>
                  {d.pareto_optimal && (
                    <p style={{ color: '#FBBF24', marginTop: 4 }}>★ Pareto-optimal</p>
                  )}
                </div>
              )
            }}
          />
          {/* Pareto frontier as a custom overlay */}
          {paretoLineData.length > 1 && (
            <Scatter
              data={paretoLineData.map(p => ({ x: p.x, y: p.y, provider: '__pareto_line__', pareto_optimal: false }))}
              fill="none"
              line={{ stroke: '#FBBF24', strokeWidth: 1.5, strokeDasharray: '5 3' }}
              shape={() => null as any}
            />
          )}
          <Scatter
            data={scatterData}
            shape={<CustomDot />}
          >
            <LabelList
              dataKey="label"
              position="top"
              style={{ fill: '#94A3B8', fontSize: 11 }}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted mt-2">★ = Pareto-optimal · dashed line = frontier</p>
    </Card>
  )
}
