import type { ProviderMetrics } from '../lib/loader'
import { PROVIDER_LABELS } from '../lib/utils'
import { Badge } from './ui/badge'
import { Card, CardHeader, CardTitle } from './ui/card'

interface KappaHeatmapProps {
  metrics: ProviderMetrics[]
  kappaMatrix: Record<string, Record<string, number>>
}

function kappaToColor(value: number): string {
  // Interpolate from dark blue (#1e3a5f) at 0 to bright blue (#3B82F6) at 1
  const t = Math.max(0, Math.min(1, value))
  const r = Math.round(0x1e + t * (0x3b - 0x1e))
  const g = Math.round(0x3a + t * (0x82 - 0x3a))
  const b = Math.round(0x5f + t * (0xf6 - 0x5f))
  return `rgb(${r},${g},${b})`
}

export function KappaHeatmap({ metrics, kappaMatrix }: KappaHeatmapProps) {
  const providers = metrics.map(m => m.provider)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pairwise Cohen's κ Heatmap</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2" />
              {providers.map(col => (
                <th key={col} className="p-2 text-center">
                  <Badge provider={col}>{PROVIDER_LABELS[col] ?? col}</Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map(row => (
              <tr key={row}>
                <td className="p-2 pr-4">
                  <Badge provider={row}>{PROVIDER_LABELS[row] ?? row}</Badge>
                </td>
                {providers.map(col => {
                  const value = kappaMatrix[row]?.[col] ?? 0
                  return (
                    <td
                      key={col}
                      className="p-3 text-center font-mono text-sm text-white"
                      style={{
                        backgroundColor: kappaToColor(value),
                        minWidth: '80px',
                        borderRadius: '4px',
                        margin: '2px',
                      }}
                    >
                      {value.toFixed(3)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
