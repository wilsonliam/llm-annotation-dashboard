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
import type { SemanticData } from '../lib/loader'

interface EntropyDistributionProps {
  perProvider: SemanticData['per_provider']
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#8B5CF6',
  openai: '#06B6D4',
  gemini: '#F59E0B',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT-4o',
  gemini: 'Gemini',
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface EntropyChartProps {
  data: { name: string; agree: number; disagree: number; color: string }[]
  title: string
}

function EntropyChart({ data, title }: EntropyChartProps) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 40 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: '#94A3B8', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            label={{
              value: 'Entropy',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              fill: '#94A3B8',
              fontSize: 10,
            }}
          />
          <Tooltip
            contentStyle={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(value: unknown) => {
              const n = Number(value)
              return isNaN(n) ? String(value ?? '') : n.toFixed(3)
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
          <Bar
            dataKey="agree"
            name="Agrees w/ Majority"
            radius={[3, 3, 0, 0]}
            fill="#94A3B8"
            shape={(props: any) => {
              const { x, y, width, height, index } = props
              const color = data[index]?.color ?? '#94A3B8'
              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={hexToRgba(color, 0.5)}
                  rx={3}
                />
              )
            }}
          />
          <Bar
            dataKey="disagree"
            name="Disagrees"
            radius={[3, 3, 0, 0]}
            fill="#EF4444"
            shape={(props: any) => {
              const { x, y, width, height, index } = props
              const color = data[index]?.color ?? '#EF4444'
              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={color}
                  rx={3}
                />
              )
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function EntropyDistribution({ perProvider }: EntropyDistributionProps) {
  if (!perProvider || Object.keys(perProvider).length === 0) return null

  const providers = Object.keys(perProvider)

  const cosineData = providers.map(provider => ({
    name: PROVIDER_LABELS[provider] || provider,
    agree: perProvider[provider].mean_cosine_entropy_agree,
    disagree: perProvider[provider].mean_cosine_entropy_disagree,
    color: PROVIDER_COLORS[provider] || '#94A3B8',
  }))

  const clusterData = providers.map(provider => ({
    name: PROVIDER_LABELS[provider] || provider,
    agree: perProvider[provider].mean_cluster_entropy_agree,
    disagree: perProvider[provider].mean_cluster_entropy_disagree,
    color: PROVIDER_COLORS[provider] || '#94A3B8',
  }))

  return (
    <div
      style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: 8,
        padding: '20px',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>
        Entropy by Provider: Agree vs Disagree
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
        Mean semantic entropy when a provider agrees with the majority label vs when it disagrees.
        Lighter bars = agrees, solid bars = disagrees.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <EntropyChart data={cosineData} title="Cosine Divergence" />
        <EntropyChart data={clusterData} title="Clustering Entropy" />
      </div>
    </div>
  )
}
