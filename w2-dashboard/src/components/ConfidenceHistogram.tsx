import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { Prediction } from '../lib/loader'
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'

interface ConfidenceHistogramProps {
  predictions: Record<string, Prediction[]>
}

const NUM_BINS = 20

export function ConfidenceHistogram({ predictions }: ConfidenceHistogramProps) {
  const providers = Object.keys(predictions)

  // Build histogram buckets
  const buckets = Array.from({ length: NUM_BINS }, (_, i) => {
    const low = i / NUM_BINS
    const high = (i + 1) / NUM_BINS
    const entry: Record<string, any> = {
      bucket: `${(low * 100).toFixed(0)}-${(high * 100).toFixed(0)}%`,
      low,
      high,
    }
    for (const p of providers) {
      entry[p] = 0
    }
    return entry
  })

  for (const provider of providers) {
    for (const pred of predictions[provider]) {
      for (const bin of pred.annotation.bins) {
        const idx = Math.min(Math.floor(bin.confidence * NUM_BINS), NUM_BINS - 1)
        buckets[idx][provider]++
      }
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Confidence Distribution</CardTitle>
      </CardHeader>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={buckets}
          margin={{ top: 10, right: 20, bottom: 30, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="bucket"
            tick={{ fill: '#94A3B8', fontSize: 9 }}
            stroke="#334155"
            interval={3}
            angle={-35}
            textAnchor="end"
          />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} stroke="#334155" />
          <Tooltip
            contentStyle={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#F1F5F9',
              fontSize: 12,
            }}
          />
          <Legend
            iconType="square"
            iconSize={8}
            formatter={(value: string) => PROVIDER_LABELS[value] ?? value}
            wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
          />
          {providers.map(p => (
            <Bar
              key={p}
              dataKey={p}
              name={p}
              fill={PROVIDER_COLORS[p]}
              fillOpacity={0.8}
              maxBarSize={20}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
