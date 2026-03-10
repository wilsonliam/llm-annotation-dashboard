import type { ProviderMetrics } from '../lib/loader'
import { PROVIDER_LABELS, formatPct } from '../lib/utils'
import { Card, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

interface KPICardsProps {
  metrics: ProviderMetrics[]
}

export function KPICards({ metrics }: KPICardsProps) {
  if (metrics.length === 0) return null

  const bestAgreement = metrics.reduce((a, b) => (a.agreement > b.agreement ? a : b))
  const lowestCost = metrics.reduce((a, b) => (a.total_tokens < b.total_tokens ? a : b))
  const fastest = metrics.reduce((a, b) => (a.mean_latency_s < b.mean_latency_s ? a : b))
  const totalBins = metrics.reduce((s, m) => s + m.n_bins, 0)

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Best Agreement</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 mt-1">
          <Badge provider={bestAgreement.provider}>{PROVIDER_LABELS[bestAgreement.provider]}</Badge>
        </div>
        <p className="text-2xl font-bold text-foreground mt-2">
          {formatPct(bestAgreement.agreement)}
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lowest Cost</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 mt-1">
          <Badge provider={lowestCost.provider}>{PROVIDER_LABELS[lowestCost.provider]}</Badge>
        </div>
        <p className="text-2xl font-bold text-foreground mt-2">
          {lowestCost.total_tokens.toLocaleString()} tok
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fastest</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 mt-1">
          <Badge provider={fastest.provider}>{PROVIDER_LABELS[fastest.provider]}</Badge>
        </div>
        <p className="text-2xl font-bold text-foreground mt-2">
          {fastest.mean_latency_s.toFixed(2)}s
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models × Bins</CardTitle>
        </CardHeader>
        <p className="text-2xl font-bold text-foreground mt-3">
          {metrics.length} models
        </p>
        <p className="text-sm text-muted mt-0.5">{totalBins.toLocaleString()} total bins</p>
      </Card>
    </div>
  )
}
