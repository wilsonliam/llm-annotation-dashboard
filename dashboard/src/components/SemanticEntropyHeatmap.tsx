import { useState, useMemo } from 'react'
import type { SemanticBin } from '../lib/loader'
import { Card, CardHeader, CardTitle } from './ui/card'

interface SemanticEntropyHeatmapProps {
  bins: SemanticBin[]
}

function entropyToColor(entropy: number): string {
  // Blue (#1e3a8a) at 0 -> yellow (#F59E0B) at 0.5 -> red (#EF4444) at 1.0
  const clamped = Math.max(0, Math.min(1, entropy))
  if (clamped <= 0.5) {
    const t = clamped / 0.5
    const r = Math.round(0x1e + t * (0xf5 - 0x1e))
    const g = Math.round(0x3a + t * (0x9e - 0x3a))
    const b = Math.round(0x8a + t * (0x0b - 0x8a))
    return `rgb(${r},${g},${b})`
  } else {
    const t = (clamped - 0.5) / 0.5
    const r = Math.round(0xf5 + t * (0xef - 0xf5))
    const g = Math.round(0x9e + t * (0x44 - 0x9e))
    const b = Math.round(0x0b + t * (0x44 - 0x0b))
    return `rgb(${r},${g},${b})`
  }
}

export function SemanticEntropyHeatmap({ bins }: SemanticEntropyHeatmapProps) {
  const [mode, setMode] = useState<'cosine' | 'cluster'>('cosine')
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    bin: SemanticBin
  } | null>(null)

  const { stayIds, binIndices, grid } = useMemo(() => {
    const staySet = new Set<number>()
    const binSet = new Set<number>()
    const map = new Map<string, SemanticBin>()

    for (const bin of bins) {
      staySet.add(bin.stayId)
      binSet.add(bin.binIndex)
      map.set(`${bin.stayId}_${bin.binIndex}`, bin)
    }

    const stayIds = Array.from(staySet).sort((a, b) => a - b)
    const binIndices = Array.from(binSet).sort((a, b) => a - b)

    return { stayIds, binIndices, grid: map }
  }, [bins])

  const CELL_SIZE = Math.max(8, Math.min(20, Math.floor(400 / Math.max(binIndices.length, 1))))
  const ROW_HEIGHT = Math.max(8, Math.min(16, Math.floor(300 / Math.max(stayIds.length, 1))))

  const svgWidth = binIndices.length * CELL_SIZE + 60
  const svgHeight = stayIds.length * ROW_HEIGHT + 30

  return (
    <Card className="h-full">
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle>Semantic Entropy Heatmap</CardTitle>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('cosine')}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'cosine' ? '#3B82F6' : '#1E293B',
                color: mode === 'cosine' ? '#fff' : '#94A3B8',
                fontWeight: mode === 'cosine' ? 600 : 400,
              }}
            >
              Cosine
            </button>
            <button
              onClick={() => setMode('cluster')}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: mode === 'cluster' ? '#3B82F6' : '#1E293B',
                color: mode === 'cluster' ? '#fff' : '#94A3B8',
                fontWeight: mode === 'cluster' ? 600 : 400,
              }}
            >
              Cluster
            </button>
          </div>
        </div>
      </CardHeader>
      <div className="overflow-auto relative">
        <svg width={svgWidth} height={svgHeight}>
          {/* X axis labels */}
          {binIndices.map((bi, bIdx) => (
            <text
              key={bi}
              x={60 + bIdx * CELL_SIZE + CELL_SIZE / 2}
              y={14}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize={9}
            >
              {bi}
            </text>
          ))}
          {/* Rows */}
          {stayIds.map((sid, sIdx) => (
            <g key={sid}>
              <text
                x={55}
                y={30 + sIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
                textAnchor="end"
                fill="#94A3B8"
                fontSize={9}
              >
                {sid.toString().slice(-4)}
              </text>
              {binIndices.map((bi, bIdx) => {
                const bin = grid.get(`${sid}_${bi}`)
                const entropy = bin
                  ? mode === 'cosine'
                    ? bin.cosine_entropy
                    : bin.cluster_entropy
                  : undefined
                const color = entropy !== undefined ? entropyToColor(entropy) : '#0F172A'
                return (
                  <rect
                    key={bi}
                    x={60 + bIdx * CELL_SIZE}
                    y={30 + sIdx * ROW_HEIGHT}
                    width={CELL_SIZE - 1}
                    height={ROW_HEIGHT - 1}
                    fill={color}
                    rx={1}
                    onMouseEnter={e => {
                      if (bin) {
                        setTooltip({ x: e.clientX, y: e.clientY, bin })
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: bin ? 'pointer' : 'default' }}
                  />
                )
              })}
            </g>
          ))}
        </svg>
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x + 10,
              top: tooltip.y - 30,
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 11,
              color: '#F1F5F9',
              pointerEvents: 'none',
              zIndex: 50,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, color: '#94A3B8' }}>
              Stay {tooltip.bin.stayId} · Bin {tooltip.bin.binIndex}
            </div>
            <div>Cosine Entropy: {tooltip.bin.cosine_entropy.toFixed(3)}</div>
            <div>Cluster Entropy: {tooltip.bin.cluster_entropy.toFixed(3)}</div>
            <div>Clusters: {tooltip.bin.n_clusters}</div>
            <div>Quadrant: {tooltip.bin.quadrant.replace(/_/g, ' ')}</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted px-4 pb-3">
        <span>Low (0)</span>
        <div
          style={{
            width: 100,
            height: 8,
            background: 'linear-gradient(to right, #1e3a8a, #F59E0B, #EF4444)',
            borderRadius: 4,
          }}
        />
        <span>High (1) entropy</span>
      </div>
    </Card>
  )
}
