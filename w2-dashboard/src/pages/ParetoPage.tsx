import { useDashboardData } from '../hooks/useDashboardData'
import { KPICards } from '../components/KPICards'
import { ParetoScatter } from '../components/ParetoScatter'
import { RadarChart } from '../components/RadarChart'
import { KappaHeatmap } from '../components/KappaHeatmap'

export function ParetoPage() {
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
        <h1 className="text-2xl font-bold text-foreground">Pareto Analysis</h1>
        <p className="text-muted text-sm mt-1">
          Compare LLM annotators across cost, accuracy, and calibration
        </p>
      </div>

      <KPICards metrics={data.metrics} />

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <ParetoScatter metrics={data.metrics} />
        </div>
        <div className="col-span-2">
          <RadarChart metrics={data.metrics} />
        </div>
      </div>

      <KappaHeatmap metrics={data.metrics} kappaMatrix={data.kappaMatrix} />
    </div>
  )
}
