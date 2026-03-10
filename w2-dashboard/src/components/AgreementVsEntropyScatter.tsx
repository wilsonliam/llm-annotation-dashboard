import { useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { SemanticBin } from '../lib/loader'

interface AgreementVsEntropyScatterProps {
  bins: SemanticBin[]
}

const QUADRANT_COLORS: Record<string, string> = {
  robust_consensus: '#10B981',
  fragile_consensus: '#F59E0B',
  surprising_split: '#3B82F6',
  full_disagreement: '#EF4444',
}

interface TooltipData {
  x: number
  y: number
  bin: SemanticBin
  entropyValue: number
}

function ScatterTooltip({
  tooltip,
  method,
}: {
  tooltip: TooltipData
  method: 'cosine' | 'cluster'
}) {
  const { bin, entropyValue } = tooltip
  const providers = ['anthropic', 'openai', 'gemini']
  const truncate = (s: string, n: number) => (s && s.length > n ? s.slice(0, n) + '…' : s || '')

  return (
    <div
      style={{
        position: 'fixed',
        left: tooltip.x + 14,
        top: tooltip.y - 10,
        background: '#1E293B',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11,
        color: '#F1F5F9',
        pointerEvents: 'none',
        zIndex: 100,
        maxWidth: 320,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#94A3B8' }}>
        Stay {bin.stayId} · Bin {bin.binIndex}
      </div>
      <div>Label Agr.: {(bin.label_agreement * 100).toFixed(0)}%</div>
      <div>
        {method === 'cosine' ? 'Cosine Ent.' : 'Cluster Ent.'}: {entropyValue.toFixed(3)}
      </div>
      <div
        style={{
          display: 'inline-block',
          marginTop: 4,
          padding: '2px 6px',
          borderRadius: 4,
          background: QUADRANT_COLORS[bin.quadrant] + '33',
          color: QUADRANT_COLORS[bin.quadrant],
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {bin.quadrant.replace(/_/g, ' ')}
      </div>
      <div style={{ marginTop: 8, borderTop: '1px solid #334155', paddingTop: 8 }}>
        {providers.map(p => (
          <div key={p} style={{ marginBottom: 4 }}>
            <span style={{ color: '#64748B', textTransform: 'capitalize' }}>{p}: </span>
            <span style={{ color: '#CBD5E1' }}>{truncate(bin.reasoning[p] || '', 80)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SingleScatter({
  bins,
  entropyKey,
  title,
  method,
}: {
  bins: SemanticBin[]
  entropyKey: 'cosine_entropy' | 'cluster_entropy'
  title: string
  method: 'cosine' | 'cluster'
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const data = bins.map(b => ({
    x: b.label_agreement,
    y: b[entropyKey],
    bin: b,
  }))

  // Group by quadrant for color rendering
  const byQuadrant: Record<string, { x: number; y: number; bin: SemanticBin }[]> = {}
  for (const pt of data) {
    const q = pt.bin.quadrant
    if (!byQuadrant[q]) byQuadrant[q] = []
    byQuadrant[q].push(pt)
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#F1F5F9',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0.25, 1.05]}
              tickCount={5}
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              label={{ value: 'Label Agreement', position: 'insideBottom', offset: -8, fill: '#94A3B8', fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 1.05]}
              tickCount={6}
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              label={{ value: 'Semantic Entropy', angle: -90, position: 'insideLeft', offset: 10, fill: '#94A3B8', fontSize: 11 }}
            />
            <ReferenceLine x={0.67} stroke="#64748B" strokeDasharray="4 4" />
            <ReferenceLine y={0.3} stroke="#64748B" strokeDasharray="4 4" />
            {Object.entries(byQuadrant).map(([quadrant, pts]) => (
              <Scatter
                key={quadrant}
                name={quadrant}
                data={pts}
                fill={QUADRANT_COLORS[quadrant] || '#94A3B8'}
                fillOpacity={0.75}
                shape={(props: any) => {
                  const { cx, cy, payload } = props
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={QUADRANT_COLORS[payload.bin?.quadrant] || '#94A3B8'}
                      fillOpacity={0.75}
                      stroke="none"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e =>
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          bin: payload.bin,
                          entropyValue: payload.y,
                        })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        {tooltip && <ScatterTooltip tooltip={tooltip} method={method} />}
      </div>
    </div>
  )
}

export function AgreementVsEntropyScatter({ bins }: AgreementVsEntropyScatterProps) {
  if (!bins || bins.length === 0) return null

  return (
    <div
      style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: 8,
        padding: '20px',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', marginBottom: 16 }}>
        Label Agreement vs Semantic Entropy
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <SingleScatter
          bins={bins}
          entropyKey="cosine_entropy"
          title="Cosine Divergence"
          method="cosine"
        />
        <SingleScatter
          bins={bins}
          entropyKey="cluster_entropy"
          title="Clustering Entropy"
          method="cluster"
        />
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.entries(QUADRANT_COLORS).map(([q, color]) => (
          <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.85 }}
            />
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{q.replace(/_/g, ' ')}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: '#475569', marginLeft: 8 }}>
          — dashed lines: quadrant boundaries (x=0.67, y=0.3)
        </span>
      </div>
    </div>
  )
}
