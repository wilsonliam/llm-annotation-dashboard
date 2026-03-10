import { useState } from 'react'
import type { SemanticBin } from '../lib/loader'

interface HighEntropyTableProps {
  bins: SemanticBin[]
}

const QUADRANT_COLORS: Record<string, string> = {
  robust_consensus: '#10B981',
  fragile_consensus: '#F59E0B',
  surprising_split: '#3B82F6',
  full_disagreement: '#EF4444',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT-4o',
  gemini: 'Gemini',
}

function truncate(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function HighEntropyTable({ bins }: HighEntropyTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!bins || bins.length === 0) return null

  const top15 = [...bins].sort((a, b) => b.cosine_entropy - a.cosine_entropy).slice(0, 15)
  const providers = ['anthropic', 'openai', 'gemini']

  const toggleRow = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1E293B',
    whiteSpace: 'nowrap',
  }

  const cellStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 12,
    color: '#CBD5E1',
    borderBottom: '1px solid #0F172A',
    verticalAlign: 'top',
  }

  return (
    <div
      style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #1E293B' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>
          Top 15 High-Entropy Bins
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
          Sorted by cosine divergence entropy (descending). Click a row to expand full reasoning.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0A0F1A' }}>
              <th style={headerStyle}>Stay ID</th>
              <th style={headerStyle}>Bin</th>
              <th style={headerStyle}>Label Agr.</th>
              <th style={headerStyle}>Cosine Ent.</th>
              <th style={headerStyle}>Cluster Ent.</th>
              <th style={headerStyle}>Quadrant</th>
              <th style={headerStyle}>Claude</th>
              <th style={headerStyle}>GPT-4o</th>
              <th style={headerStyle}>Gemini</th>
            </tr>
          </thead>
          <tbody>
            {top15.map(bin => {
              const key = `${bin.stayId}_${bin.binIndex}`
              const isExpanded = expanded.has(key)
              const qColor = QUADRANT_COLORS[bin.quadrant] || '#94A3B8'

              return (
                <>
                  <tr
                    key={key}
                    onClick={() => toggleRow(key)}
                    style={{
                      cursor: 'pointer',
                      background: isExpanded ? '#1E293B' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLTableRowElement).style.background = '#0D1B2A'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                      }
                    }}
                  >
                    <td style={{ ...cellStyle, color: '#94A3B8', fontFamily: 'monospace' }}>
                      {bin.stayId}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{bin.binIndex}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {(bin.label_agreement * 100).toFixed(0)}%
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 600, color: '#F1F5F9' }}>
                      {bin.cosine_entropy.toFixed(3)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {bin.cluster_entropy.toFixed(3)}
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: qColor + '22',
                          color: qColor,
                          fontSize: 10,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {bin.quadrant.replace(/_/g, ' ')}
                      </span>
                    </td>
                    {providers.map(p => (
                      <td key={p} style={{ ...cellStyle, maxWidth: 180, color: '#94A3B8' }}>
                        {truncate(bin.reasoning[p] || '', 60)}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr key={`${key}-expanded`}>
                      <td
                        colSpan={9}
                        style={{
                          padding: '12px 20px',
                          background: '#162032',
                          borderBottom: '1px solid #1E293B',
                          borderTop: '1px solid #1E293B',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                          {providers.map(p => (
                            <div key={p}>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#64748B',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.1em',
                                  marginBottom: 6,
                                }}
                              >
                                {PROVIDER_LABELS[p] || p}
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: bin.labels[p] ? '#10B981' : '#EF4444',
                                    fontSize: 9,
                                  }}
                                >
                                  ({bin.labels[p] ? 'Ready' : 'Not Ready'})
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: '#CBD5E1',
                                  lineHeight: 1.6,
                                  background: '#0F172A',
                                  borderRadius: 6,
                                  padding: '8px 12px',
                                }}
                              >
                                {bin.reasoning[p] || <span style={{ color: '#475569' }}>No reasoning</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
