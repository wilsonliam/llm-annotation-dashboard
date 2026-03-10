import { useState, useMemo } from 'react'
import { useDashboardData } from '../hooks/useDashboardData'
import { VisitTimeline } from '../components/VisitTimeline'
import { PROVIDER_COLORS, PROVIDER_LABELS, formatPct } from '../lib/utils'
import { Card, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

const selectStyle: React.CSSProperties = {
  background: '#1E293B',
  border: '1px solid #334155',
  color: '#F1F5F9',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '13px',
}

export function VisitExplorerPage() {
  const { data, loading, error } = useDashboardData()
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null)
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(['anthropic', 'openai', 'gemini'])
  )

  const allProviders = useMemo(() => {
    if (!data) return []
    return data.metrics.map(m => m.provider)
  }, [data])

  // Stay IDs present in ALL providers
  const sharedStayIds = useMemo(() => {
    if (!data) return []
    const sets = allProviders.map(p => new Set(data.predictions[p].map(pr => pr.stayId)))
    if (sets.length === 0) return []
    const intersection = Array.from(sets[0]).filter(id => sets.every(s => s.has(id)))
    return intersection.sort((a, b) => a - b)
  }, [data, allProviders])

  const activeStayId = selectedStayId ?? sharedStayIds[0] ?? null

  const activeProviders = useMemo(
    () => allProviders.filter(p => selectedProviders.has(p)),
    [allProviders, selectedProviders]
  )

  function toggleProvider(p: string) {
    setSelectedProviders(prev => {
      const next = new Set(prev)
      if (next.has(p)) {
        if (next.size > 1) next.delete(p)
      } else {
        next.add(p)
      }
      return next
    })
  }

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

  // Per-visit stats for selected stay and providers
  const visitStats = useMemo(() => {
    if (!activeStayId || !data) return []
    return activeProviders.map(p => {
      const pred = data.predictions[p].find(pr => pr.stayId === activeStayId)
      if (!pred) return { provider: p, readyRate: 0, meanConf: 0, bins: 0 }
      const bins = pred.annotation.bins
      const readyCount = bins.filter(b => b.dischargeReady).length
      const meanConf = bins.reduce((s, b) => s + b.confidence, 0) / (bins.length || 1)
      return {
        provider: p,
        readyRate: readyCount / (bins.length || 1),
        meanConf,
        bins: bins.length,
      }
    })
  }, [activeStayId, activeProviders, data])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Visit Explorer</h1>
        <p className="text-muted text-sm mt-1">
          Explore per-visit discharge readiness predictions across time bins
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted font-medium">Visit:</label>
          <select
            style={selectStyle}
            value={activeStayId ?? ''}
            onChange={e => setSelectedStayId(Number(e.target.value))}
          >
            {sharedStayIds.map(sid => (
              <option key={sid} value={sid}>
                Stay {sid}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted font-medium">Models:</label>
          <div className="flex gap-2">
            {allProviders.map(p => (
              <button
                key={p}
                onClick={() => toggleProvider(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: selectedProviders.has(p) ? PROVIDER_COLORS[p] + '22' : 'transparent',
                  border: `1px solid ${PROVIDER_COLORS[p]}`,
                  color: selectedProviders.has(p) ? PROVIDER_COLORS[p] : '#94A3B8',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: selectedProviders.has(p) ? PROVIDER_COLORS[p] : '#334155',
                    display: 'inline-block',
                  }}
                />
                {PROVIDER_LABELS[p] ?? p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeStayId !== null && (
        <VisitTimeline
          stayId={activeStayId}
          predictions={data.predictions}
          providers={activeProviders}
        />
      )}

      {/* Per-visit stats table */}
      {visitStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Visit Stats — Stay {activeStayId}</CardTitle>
          </CardHeader>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs text-muted uppercase tracking-wider">Model</th>
                <th className="px-3 py-2 text-left text-xs text-muted uppercase tracking-wider">Ready %</th>
                <th className="px-3 py-2 text-left text-xs text-muted uppercase tracking-wider">Mean Confidence</th>
                <th className="px-3 py-2 text-left text-xs text-muted uppercase tracking-wider">Bins</th>
              </tr>
            </thead>
            <tbody>
              {visitStats.map(row => (
                <tr key={row.provider} className="border-b border-border/50 hover:bg-white/5">
                  <td className="px-3 py-2.5">
                    <Badge provider={row.provider}>{PROVIDER_LABELS[row.provider] ?? row.provider}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-foreground/90">{formatPct(row.readyRate)}</td>
                  <td className="px-3 py-2.5 text-foreground/90">{formatPct(row.meanConf)}</td>
                  <td className="px-3 py-2.5 text-foreground/90">{row.bins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
