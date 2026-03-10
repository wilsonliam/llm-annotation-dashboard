import { useDashboardData } from '../hooks/useDashboardData'
import { MetricsTable } from '../components/MetricsTable'
import { ConfidenceHistogram } from '../components/ConfidenceHistogram'
import { BinAgreementHeatmap } from '../components/BinAgreementHeatmap'

export function DetailsPage() {
  const { data, loading, error } = useDashboardData()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted text-sm">Loading data...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-sm">Error: {error ?? 'Failed to load data'}</div>
      </div>
    )
  }

  const providers = data.metrics.map(m => m.provider)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Model Details</h1>
        <p className="text-muted text-sm mt-1">
          Per-model metrics, confidence distributions, and bin-level agreement
        </p>
      </div>

      <MetricsTable metrics={data.metrics} />

      <div className="grid grid-cols-2 gap-4">
        <ConfidenceHistogram predictions={data.predictions} />
        <BinAgreementHeatmap labelTable={data.labelTable} providers={providers} />
      </div>
    </div>
  )
}
