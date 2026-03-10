import { useState } from 'react'
import type { ProviderMetrics } from '../lib/loader'
import { PROVIDER_COLORS, PROVIDER_LABELS, formatNum, formatPct } from '../lib/utils'
import { Badge } from './ui/badge'
import { Card, CardHeader, CardTitle } from './ui/card'

interface MetricsTableProps {
  metrics: ProviderMetrics[]
}

type SortKey = keyof ProviderMetrics
type SortDir = 'asc' | 'desc'

export function MetricsTable({ metrics }: MetricsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('agreement')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...metrics].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av
    }
    return 0
  })

  const columns: { key: SortKey; label: string; format: (m: ProviderMetrics) => React.ReactNode }[] = [
    {
      key: 'provider',
      label: 'Model',
      format: m => (
        <Badge provider={m.provider} variant="default">
          {PROVIDER_LABELS[m.provider] ?? m.provider}
        </Badge>
      ),
    },
    { key: 'agreement', label: 'Agreement', format: m => formatPct(m.agreement) },
    { key: 'mean_confidence', label: 'Confidence', format: m => formatPct(m.mean_confidence) },
    { key: 'avg_kappa', label: 'Avg κ', format: m => formatNum(m.avg_kappa) },
    { key: 'brier_score', label: 'Brier Score', format: m => formatNum(m.brier_score) },
    {
      key: 'total_tokens',
      label: 'Total Tokens',
      format: m => m.total_tokens.toLocaleString(),
    },
    { key: 'mean_latency_s', label: 'Latency', format: m => m.mean_latency_s.toFixed(2) + 's' },
    { key: 'ready_rate', label: 'Ready Rate', format: m => formatPct(m.ready_rate) },
    { key: 'n_visits', label: 'Visits', format: m => m.n_visits.toString() },
    { key: 'n_bins', label: 'Bins', format: m => m.n_bins.toString() },
    {
      key: 'pareto_optimal',
      label: 'Pareto',
      format: m =>
        m.pareto_optimal ? (
          <span className="text-yellow-400 font-bold">★</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Metrics</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{' '}
                  {sortKey === col.key && (
                    <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <tr
                key={m.provider}
                className="border-b border-border/50 hover:bg-white/5 transition-colors"
                style={
                  m.pareto_optimal
                    ? {
                        borderLeft: `3px solid ${PROVIDER_COLORS[m.provider] ?? '#888'}`,
                      }
                    : {}
                }
              >
                {columns.map(col => (
                  <td key={String(col.key)} className="px-3 py-2.5 text-foreground/90">
                    {col.format(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
