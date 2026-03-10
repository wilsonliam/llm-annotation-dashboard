import type { SemanticData } from '../lib/loader'

interface QuadrantSummaryProps {
  summary: SemanticData['summary']
}

const QUADRANT_CONFIG = {
  robust_consensus: {
    label: 'Robust Consensus',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.3)',
    description: 'Models agree on label and use similar reasoning — high-confidence decisions.',
  },
  fragile_consensus: {
    label: 'Fragile Consensus',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    description: 'Same label but divergent reasoning — agreement may be coincidental.',
  },
  surprising_split: {
    label: 'Surprising Split',
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    description: 'Labels differ but reasoning is similar — subtle clinical disagreement.',
  },
  full_disagreement: {
    label: 'Full Disagreement',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    description: 'Both labels and reasoning diverge — genuinely ambiguous clinical cases.',
  },
} as const

type QuadrantKey = keyof typeof QUADRANT_CONFIG

export function QuadrantSummary({ summary }: QuadrantSummaryProps) {
  const quadrantKeys = Object.keys(QUADRANT_CONFIG) as QuadrantKey[]

  return (
    <div className="grid grid-cols-4 gap-4">
      {quadrantKeys.map(key => {
        const config = QUADRANT_CONFIG[key]
        const count = summary.quadrant_counts[key] ?? 0
        const pct = summary.n_bins > 0 ? ((count / summary.n_bins) * 100).toFixed(1) : '0.0'

        return (
          <div
            key={key}
            style={{
              background: config.bg,
              border: `1px solid ${config.border}`,
              borderRadius: 8,
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: config.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: config.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {config.label}
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#F1F5F9', lineHeight: 1 }}>
              {count}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              {pct}% of bins
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 8, lineHeight: 1.4 }}>
              {config.description}
            </div>
          </div>
        )
      })}
    </div>
  )
}
