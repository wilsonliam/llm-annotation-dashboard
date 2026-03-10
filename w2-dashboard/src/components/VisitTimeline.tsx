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
import type { Prediction } from '../lib/loader'
import { PROVIDER_COLORS, PROVIDER_LABELS } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'

interface VisitTimelineProps {
  stayId: number
  predictions: Record<string, Prediction[]>
  providers: string[]
}

export function VisitTimeline({ stayId, predictions, providers }: VisitTimelineProps) {
  // Gather all bin indices for this stay
  const binMap = new Map<number, Record<string, { ready: number; confidence: number }>>()

  for (const provider of providers) {
    const preds = predictions[provider]
    const pred = preds.find(p => p.stayId === stayId)
    if (!pred) continue
    for (const bin of pred.annotation.bins) {
      if (!binMap.has(bin.binIndex)) binMap.set(bin.binIndex, {})
      binMap.get(bin.binIndex)![provider] = {
        ready: bin.dischargeReady ? 1 : 0,
        confidence: bin.confidence,
      }
    }
  }

  const binIndices = Array.from(binMap.keys()).sort((a, b) => a - b)
  const readinessData = binIndices.map(bi => {
    const entry: Record<string, any> = { binIndex: bi }
    const bins = binMap.get(bi)!
    for (const p of providers) {
      entry[p] = bins[p]?.ready ?? null
    }
    return entry
  })

  const confidenceData = binIndices.map(bi => {
    const entry: Record<string, any> = { binIndex: bi }
    const bins = binMap.get(bi)!
    for (const p of providers) {
      entry[p] = bins[p]?.confidence ?? null
    }
    return entry
  })

  if (binIndices.length === 0) {
    return (
      <div className="text-muted text-sm p-4">No data for this stay.</div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Discharge Readiness (Stay {stayId})</CardTitle>
        </CardHeader>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={readinessData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="binIndex"
              label={{ value: 'Bin Index', position: 'insideBottom', offset: -5, fill: '#94A3B8', fontSize: 11 }}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              stroke="#334155"
            />
            <YAxis
              domain={[-0.1, 1.1]}
              ticks={[0, 1]}
              tickFormatter={v => (v === 1 ? 'Ready' : v === 0 ? 'Not Ready' : '')}
              tick={{ fill: '#94A3B8', fontSize: 10 }}
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
              formatter={(value: any) => (value === 1 ? 'Ready' : 'Not Ready')}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => PROVIDER_LABELS[value] ?? value}
              wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
            />
            {providers.map(p => (
              <Line
                key={p}
                type="stepAfter"
                dataKey={p}
                stroke={PROVIDER_COLORS[p]}
                strokeWidth={2}
                dot={{ r: 3, fill: PROVIDER_COLORS[p] }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confidence Over Time (Stay {stayId})</CardTitle>
        </CardHeader>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={confidenceData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="binIndex"
              label={{ value: 'Bin Index', position: 'insideBottom', offset: -5, fill: '#94A3B8', fontSize: 11 }}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              stroke="#334155"
            />
            <YAxis
              domain={[0, 1]}
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
              formatter={(value: any) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : String(value)}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => PROVIDER_LABELS[value] ?? value}
              wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
            />
            {providers.map(p => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={PROVIDER_COLORS[p]}
                strokeWidth={2}
                dot={{ r: 3, fill: PROVIDER_COLORS[p] }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
