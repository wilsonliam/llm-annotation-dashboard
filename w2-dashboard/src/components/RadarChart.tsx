import {
  Radar,
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ProviderMetrics } from '../lib/loader'
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'

interface RadarChartProps {
  metrics: ProviderMetrics[]
}

export function RadarChart({ metrics }: RadarChartProps) {
  if (metrics.length === 0) return null

  // Normalize tokens and latency (lower is better → invert)
  const maxTokens = Math.max(...metrics.map(m => m.total_tokens))
  const maxLatency = Math.max(...metrics.map(m => m.mean_latency_s))
  const maxBrier = Math.max(...metrics.map(m => m.brier_score))

  const axes = [
    'Agreement',
    'Mean Confidence',
    'Avg κ',
    'Cost Efficiency',
    'Speed',
    'Calibration',
  ]

  const radarData = axes.map((axis, i) => {
    const entry: Record<string, any> = { axis }
    for (const m of metrics) {
      let value: number
      switch (i) {
        case 0: value = m.agreement; break
        case 1: value = m.mean_confidence; break
        case 2: value = Math.max(0, m.avg_kappa); break
        case 3: value = maxTokens > 0 ? 1 - m.total_tokens / maxTokens : 1; break
        case 4: value = maxLatency > 0 ? 1 - m.mean_latency_s / maxLatency : 1; break
        case 5: value = maxBrier > 0 ? 1 - m.brier_score / maxBrier : 1; break
        default: value = 0
      }
      entry[m.provider] = parseFloat((value * 100).toFixed(1))
    }
    return entry
  })

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Radar Comparison</CardTitle>
      </CardHeader>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadar data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="#334155"
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: '#94A3B8', fontSize: 9 }}
            stroke="#334155"
          />
          {metrics.map(m => (
            <Radar
              key={m.provider}
              name={PROVIDER_LABELS[m.provider] ?? m.provider}
              dataKey={m.provider}
              stroke={PROVIDER_COLORS[m.provider]}
              fill={PROVIDER_COLORS[m.provider]}
              fillOpacity={0.2}
              strokeOpacity={0.8}
              strokeWidth={2}
            />
          ))}
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </Card>
  )
}
