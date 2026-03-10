import { useDashboard } from '../hooks/DashboardContext'
import { QuadrantSummary } from '../components/QuadrantSummary'
import { AgreementVsEntropyScatter } from '../components/AgreementVsEntropyScatter'
import { EntropyDistribution } from '../components/EntropyDistribution'
import { SemanticEntropyHeatmap } from '../components/SemanticEntropyHeatmap'
import { HighEntropyTable } from '../components/HighEntropyTable'
import { ConfidenceVariancePanel } from '../components/ConfidenceVariancePanel'

export function SemanticPage() {
  const { data, loading } = useDashboard()

  if (loading) {
    return (
      <div className="p-8" style={{ color: '#64748B' }}>
        Loading...
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* Semantic Entropy section */}
      {data?.semantic ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Semantic Entropy</h1>
            <p className="text-muted mt-1">
              How much do model <em>reasoning</em> texts diverge, independent of label agreement?
              Two methods: cosine divergence and clustering entropy (all-MiniLM-L6-v2 embeddings).
              <span className="ml-2 text-xs font-mono text-blue-400">
                r = {data.semantic.summary.correlation_cosine_vs_cluster.toFixed(3)} inter-method correlation
              </span>
            </p>
          </div>
          <QuadrantSummary summary={data.semantic.summary} />
          <AgreementVsEntropyScatter bins={data.semantic.bins} />
          <EntropyDistribution perProvider={data.semantic.per_provider} />
          <SemanticEntropyHeatmap bins={data.semantic.bins} />
          <HighEntropyTable bins={data.semantic.bins} />
        </>
      ) : (
        <div className="p-4 rounded-lg border border-border text-muted text-sm">
          Semantic entropy data not available — run <code className="font-mono text-xs">python -m analysis.semantic_entropy</code> to generate it.
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Confidence Variance section */}
      {data && (
        <ConfidenceVariancePanel bins={data.confidenceVariance} />
      )}
    </div>
  )
}
