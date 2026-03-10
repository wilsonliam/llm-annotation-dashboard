import { useState, useMemo } from 'react'
import type { DashboardData } from '../lib/loader'
import { Card, CardHeader, CardTitle } from './ui/card'

interface BinAgreementHeatmapProps {
  labelTable: DashboardData['labelTable']
  providers: string[]
}

function agreementToColor(agreement: number): string {
  // 0.33 = red (#EF4444), 0.67 = yellow (#F59E0B), 1.0 = green (#10B981)
  if (agreement <= 0.5) {
    // red to yellow
    const t = (agreement - 0.33) / (0.67 - 0.33)
    const clamped = Math.max(0, Math.min(1, t))
    const r = Math.round(0xef + clamped * (0xf5 - 0xef))
    const g = Math.round(0x44 + clamped * (0x9e - 0x44))
    const b = Math.round(0x44 + clamped * (0x0b - 0x44))
    return `rgb(${r},${g},${b})`
  } else {
    // yellow to green
    const t = (agreement - 0.67) / (1.0 - 0.67)
    const clamped = Math.max(0, Math.min(1, t))
    const r = Math.round(0xf5 + clamped * (0x10 - 0xf5))
    const g = Math.round(0x9e + clamped * (0xb9 - 0x9e))
    const b = Math.round(0x0b + clamped * (0x81 - 0x0b))
    return `rgb(${r},${g},${b})`
  }
}

export function BinAgreementHeatmap({ labelTable, providers }: BinAgreementHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    stayId: number
    binIndex: number
    agreement: number
  } | null>(null)

  // Build grid data
  const { stayIds, binIndices, grid } = useMemo(() => {
    const staySet = new Set<number>()
    const binSet = new Set<number>()
    for (const entry of labelTable) {
      staySet.add(entry.stayId)
      binSet.add(entry.binIndex)
    }
    const stayIds = Array.from(staySet).sort((a, b) => a - b)
    const binIndices = Array.from(binSet).sort((a, b) => a - b)

    // Build agreement map
    const map = new Map<string, number>()
    for (const entry of labelTable) {
      const votes = providers
        .map(p => (entry as any)[p] as boolean | null)
        .filter(v => v !== null) as boolean[]
      if (votes.length === 0) continue
      const readyCount = votes.filter(v => v).length
      const majority = readyCount > votes.length / 2
      const agreeFrac = votes.filter(v => v === majority).length / votes.length
      map.set(`${entry.stayId}_${entry.binIndex}`, agreeFrac)
    }

    return { stayIds, binIndices, grid: map }
  }, [labelTable, providers])

  const CELL_SIZE = Math.max(8, Math.min(20, Math.floor(400 / Math.max(binIndices.length, 1))))
  const ROW_HEIGHT = Math.max(8, Math.min(16, Math.floor(300 / Math.max(stayIds.length, 1))))

  const svgWidth = binIndices.length * CELL_SIZE + 60
  const svgHeight = stayIds.length * ROW_HEIGHT + 30

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Bin Agreement Heatmap</CardTitle>
      </CardHeader>
      <div className="overflow-auto relative">
        <svg width={svgWidth} height={svgHeight}>
          {/* X axis labels (bin indices) */}
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
          {/* Y axis labels + cells */}
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
                const agreement = grid.get(`${sid}_${bi}`)
                const color = agreement !== undefined ? agreementToColor(agreement) : '#1E293B'
                return (
                  <rect
                    key={bi}
                    x={60 + bIdx * CELL_SIZE}
                    y={30 + sIdx * ROW_HEIGHT}
                    width={CELL_SIZE - 1}
                    height={ROW_HEIGHT - 1}
                    fill={color}
                    rx={1}
                    onMouseEnter={e =>
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        stayId: sid,
                        binIndex: bi,
                        agreement: agreement ?? 0,
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: 'pointer' }}
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
              padding: '6px 10px',
              fontSize: 11,
              color: '#F1F5F9',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <p>Stay {tooltip.stayId}</p>
            <p>Bin {tooltip.binIndex}</p>
            <p>Agreement: {(tooltip.agreement * 100).toFixed(0)}%</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted">
        <span>Low</span>
        <div
          style={{
            width: 80,
            height: 8,
            background: 'linear-gradient(to right, #EF4444, #F59E0B, #10B981)',
            borderRadius: 4,
          }}
        />
        <span>High agreement</span>
      </div>
    </Card>
  )
}
