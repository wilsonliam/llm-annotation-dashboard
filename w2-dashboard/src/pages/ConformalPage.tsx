import { useDashboardData } from '../hooks/useDashboardData'
import { ConformalPanel } from '../components/ConformalPanel'

export function ConformalPage() {
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conformal Prediction</h1>
        <p className="text-muted text-sm mt-1">
          Finite-sample coverage guarantees on prediction sets
        </p>
        <div className="mt-2 text-xs text-muted font-mono">
          α = {data.conformal.alpha} · cal_frac = {data.conformal.cal_frac} · seed = {data.conformal.seed}
        </div>
      </div>

      <ConformalPanel conformal={data.conformal} />
    </div>
  )
}
