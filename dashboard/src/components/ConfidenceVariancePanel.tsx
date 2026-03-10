import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import type { ConfidenceVarianceBin } from '../lib/loader'
import { Card, CardHeader, CardTitle } from './ui/card'
import { PROVIDER_COLORS } from '../lib/utils'

interface Props {
  bins: ConfidenceVarianceBin[]
}

// Interpolate color: blue (#1e3a8a) at 0 → yellow (#F59E0B) at 0.25 → red (#EF4444) at 0.5+
function stdColor(std: number): string {
  const t = Math.min(std / 0.35, 1) // 0.35 std is roughly the max with 3 providers
  if (t < 0.5) {
    const u = t * 2
    return interpolateHex('#1e3a8a', '#F59E0B', u)
  } else {
    const u = (t - 0.5) * 2
    return interpolateHex('#F59E0B', '#EF4444', u)
  }
}

function interpolateHex(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16)
  const bh = parseInt(b.slice(1), 16)
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bv = Math.round(ab + (bb - ab) * t)
  return `#${((r << 16) | (g << 8) | bv).toString(16).padStart(6, '0')}`
}

const QUADRANT_COLORS = {
  high_agreement_low_var: '#10B981',
  high_agreement_high_var: '#F59E0B',
  low_agreement_low_var: '#3B82F6',
  low_agreement_high_var: '#EF4444',
}

const QUADRANT_LABELS: Record<string, string> = {
  high_agreement_low_var: 'Confident consensus',
  high_agreement_high_var: 'Fragile consensus',
  low_agreement_low_var: 'Confident split',
  low_agreement_high_var: 'Uncertain split',
}

function getQuadrant(bin: ConfidenceVarianceBin): keyof typeof QUADRANT_COLORS {
  const highAgr = bin.label_agreement >= 0.67
  const highVar = bin.std_confidence >= 0.1
  if (highAgr && !highVar) return 'high_agreement_low_var'
  if (highAgr && highVar) return 'high_agreement_high_var'
  if (!highAgr && !highVar) return 'low_agreement_low_var'
  return 'low_agreement_high_var'
}

// Custom scatter tooltip
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ConfidenceVarianceBin & { quadrant: string }
  return (
    <div className="bg-surface border border-border rounded-lg p-3 text-xs space-y-1 max-w-xs">
      <div className="font-semibold text-foreground">Stay {d.stayId} · Bin {d.binIndex}</div>
      <div className="text-muted">Label agreement: <span className="text-foreground">{(d.label_agreement * 100).toFixed(0)}%</span></div>
      <div className="text-muted">Confidence std: <span className="text-foreground">{d.std_confidence.toFixed(3)}</span></div>
      <div className="text-muted">Mean confidence: <span className="text-foreground">{d.mean_confidence.toFixed(3)}</span></div>
      <div className="mt-1 border-t border-border pt-1 space-y-0.5">
        {Object.entries(d.confidences).map(([p, c]) => (
          <div key={p} className="flex justify-between gap-4">
            <span style={{ color: PROVIDER_COLORS[p] }}>{p}</span>
            <span className="text-foreground font-mono">{(c as number).toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs mt-1" style={{ color: QUADRANT_COLORS[d.quadrant as keyof typeof QUADRANT_COLORS] }}>
        {QUADRANT_LABELS[d.quadrant]}
      </div>
    </div>
  )
}

function ScatterPlot({ bins }: { bins: ConfidenceVarianceBin[] }) {
  const data = useMemo(() =>
    bins.map(b => ({ ...b, quadrant: getQuadrant(b) })),
    [bins]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label Agreement vs. Confidence Spread</CardTitle>
      </CardHeader>
      <div className="text-xs text-muted mb-3">
        Each dot is one bin. X = fraction of models agreeing with majority label. Y = std dev of confidence scores across models.
        <span className="ml-1 text-yellow-500 font-medium">Note: measures inter-model spread, not true calibration uncertainty.</span>
      </div>
      <div className="flex gap-4 mb-2 flex-wrap">
        {Object.entries(QUADRANT_LABELS).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: QUADRANT_COLORS[k as keyof typeof QUADRANT_COLORS] }} />
            <span className="text-muted">{label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            type="number" dataKey="label_agreement"
            domain={[0.3, 1.0]} name="Label Agreement"
            label={{ value: 'Label Agreement', position: 'insideBottom', offset: -12, fill: '#94A3B8', fontSize: 11 }}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis
            type="number" dataKey="std_confidence"
            domain={[0, 0.4]} name="Confidence Std"
            label={{ value: 'Confidence Std', angle: -90, position: 'insideLeft', offset: 12, fill: '#94A3B8', fontSize: 11 }}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
          />
          <Tooltip content={<ScatterTooltip />} />
          <ReferenceLine x={0.67} stroke="#475569" strokeDasharray="4 4" />
          <ReferenceLine y={0.1} stroke="#475569" strokeDasharray="4 4" />
          <Scatter data={data} fillOpacity={0.75}>
            {data.map((entry, i) => (
              <Cell key={i} fill={QUADRANT_COLORS[entry.quadrant as keyof typeof QUADRANT_COLORS]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  )
}

function VarianceHeatmap({ bins }: { bins: ConfidenceVarianceBin[] }) {
  const [hoveredBin, setHoveredBin] = useState<ConfidenceVarianceBin | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const stayIds = useMemo(() => [...new Set(bins.map(b => b.stayId))].sort((a, b) => a - b), [bins])
  const maxBinIndex = useMemo(() => Math.max(...bins.map(b => b.binIndex)), [bins])

  const lookup = useMemo(() => {
    const m = new Map<string, ConfidenceVarianceBin>()
    for (const b of bins) m.set(`${b.stayId}_${b.binIndex}`, b)
    return m
  }, [bins])

  const cellW = 10
  const cellH = 14
  const labelW = 70
  const svgWidth = labelW + (maxBinIndex + 1) * cellW + 16
  const svgHeight = stayIds.length * cellH + 24

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confidence Spread Heatmap</CardTitle>
      </CardHeader>
      <div className="text-xs text-muted mb-2">
        Blue → yellow → red = low → high inter-model confidence std dev. Hover for details.
      </div>
      <div className="overflow-x-auto relative">
        <svg width={svgWidth} height={svgHeight}>
          {/* X-axis labels (every 5 bins) */}
          {Array.from({ length: Math.floor(maxBinIndex / 5) + 1 }, (_, i) => i * 5).map(bi => (
            <text key={bi} x={labelW + bi * cellW + cellW / 2} y={12}
              textAnchor="middle" fontSize={9} fill="#64748B">{bi}</text>
          ))}
          {stayIds.map((stayId, row) => (
            <g key={stayId}>
              <text x={labelW - 4} y={24 + row * cellH + cellH / 2 + 3}
                textAnchor="end" fontSize={9} fill="#64748B">{stayId}</text>
              {Array.from({ length: maxBinIndex + 1 }, (_, bi) => {
                const bin = lookup.get(`${stayId}_${bi}`)
                if (!bin) return null
                return (
                  <rect
                    key={bi}
                    x={labelW + bi * cellW} y={24 + row * cellH}
                    width={cellW - 1} height={cellH - 1}
                    fill={stdColor(bin.std_confidence)}
                    rx={1}
                    onMouseEnter={(e) => {
                      setHoveredBin(bin)
                      setTooltipPos({ x: e.clientX, y: e.clientY })
                    }}
                    onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHoveredBin(null)}
                    style={{ cursor: 'default' }}
                  />
                )
              })}
            </g>
          ))}
        </svg>
        {hoveredBin && (
          <div
            className="fixed z-50 bg-surface border border-border rounded-lg p-2 text-xs pointer-events-none space-y-1"
            style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 40 }}
          >
            <div className="font-semibold text-foreground">Stay {hoveredBin.stayId} · Bin {hoveredBin.binIndex}</div>
            <div className="text-muted">Std: <span className="text-foreground font-mono">{hoveredBin.std_confidence.toFixed(3)}</span></div>
            <div className="text-muted">Mean: <span className="text-foreground font-mono">{hoveredBin.mean_confidence.toFixed(3)}</span></div>
            {Object.entries(hoveredBin.confidences).map(([p, c]) => (
              <div key={p} className="flex justify-between gap-3">
                <span style={{ color: PROVIDER_COLORS[p] }}>{p}</span>
                <span className="font-mono text-foreground">{(c as number).toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export function ConfidenceVariancePanel({ bins }: Props) {
  const stats = useMemo(() => {
    const stds = bins.map(b => b.std_confidence)
    const mean = stds.reduce((s, v) => s + v, 0) / stds.length
    const max = Math.max(...stds)
    const highVar = bins.filter(b => b.std_confidence >= 0.1).length
    return { mean, max, highVar, total: bins.length }
  }, [bins])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Confidence Variance</h2>
        <p className="text-xs text-muted mt-0.5">
          Standard deviation of self-reported confidence scores across the three models per bin.{' '}
          <span className="text-yellow-500">
            Proxy for inter-model disagreement, not true calibration — models may report different confidence scales.
            True uncertainty requires token-level logprobs on the <code className="font-mono">dischargeReady</code> token.
          </span>
        </p>
        <div className="flex gap-6 mt-2 text-xs">
          <span className="text-muted">Mean std: <span className="text-foreground font-mono">{stats.mean.toFixed(3)}</span></span>
          <span className="text-muted">Max std: <span className="text-foreground font-mono">{stats.max.toFixed(3)}</span></span>
          <span className="text-muted">High-variance bins (σ≥0.1): <span className="text-foreground font-mono">{stats.highVar} / {stats.total}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ScatterPlot bins={bins} />
        <VarianceHeatmap bins={bins} />
      </div>
    </div>
  )
}
