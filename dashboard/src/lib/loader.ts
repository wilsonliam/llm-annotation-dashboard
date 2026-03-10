import { computeParetoFront } from './pareto'

export interface BinAnnotation {
  binIndex: number
  start: string
  end: string
  dischargeReady: boolean
  confidence: number
  reasoning: string
}

export interface Prediction {
  stayId: number
  provider: string
  model_id: string
  timestamp: string
  elapsed_seconds: number
  input_tokens: number
  output_tokens: number
  annotation: {
    stayId: number
    bins: BinAnnotation[]
    overallAssessment: string
  }
}

export interface ProviderMetrics {
  provider: string
  agreement: number
  mean_confidence: number
  ready_rate: number
  brier_score: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  mean_latency_s: number
  n_visits: number
  n_bins: number
  avg_kappa: number
  pareto_optimal: boolean
}

export interface ConfidenceVarianceBin {
  stayId: number
  binIndex: number
  confidences: Record<string, number>
  mean_confidence: number
  std_confidence: number
  label_agreement: number
  labels: Record<string, boolean>
}

export interface SemanticBin {
  stayId: number
  binIndex: number
  cosine_entropy: number
  cluster_entropy: number
  pairwise_similarities: {
    anthropic_openai: number
    anthropic_gemini: number
    openai_gemini: number
  }
  n_clusters: number
  label_agreement: number
  quadrant: 'robust_consensus' | 'fragile_consensus' | 'surprising_split' | 'full_disagreement'
  reasoning: Record<string, string>
  labels: Record<string, boolean>
}

export interface SemanticData {
  bins: SemanticBin[]
  per_provider: Record<string, {
    mean_cosine_entropy_agree: number
    mean_cosine_entropy_disagree: number
    mean_cluster_entropy_agree: number
    mean_cluster_entropy_disagree: number
  }>
  summary: {
    n_bins: number
    mean_cosine_entropy: number
    mean_cluster_entropy: number
    quadrant_counts: Record<string, number>
    correlation_cosine_vs_cluster: number
  }
}

export interface DashboardData {
  predictions: Record<string, Prediction[]>
  metrics: ProviderMetrics[]
  kappaMatrix: Record<string, Record<string, number>>
  labelTable: Array<{ stayId: number; binIndex: number } & Record<string, boolean | null>>
  confidenceVariance: ConfidenceVarianceBin[]
  metadata: any
  conformal: any
  semantic?: SemanticData
}

async function fetchJsonl(path: string): Promise<Prediction[]> {
  const res = await fetch(path)
  const text = await res.text()
  return text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as Prediction)
}

function cohenKappa(
  labelsA: boolean[],
  labelsB: boolean[]
): number {
  if (labelsA.length === 0) return 0
  const n = labelsA.length
  let agree = 0
  let aReady = 0
  let bReady = 0
  for (let i = 0; i < n; i++) {
    if (labelsA[i] === labelsB[i]) agree++
    if (labelsA[i]) aReady++
    if (labelsB[i]) bReady++
  }
  const po = agree / n
  const pAReady = aReady / n
  const pBReady = bReady / n
  const pANotReady = 1 - pAReady
  const pBNotReady = 1 - pBReady
  const pe = pAReady * pBReady + pANotReady * pBNotReady

  // Edge case: perfect expected agreement
  if (Math.abs(1 - pe) < 1e-10) {
    return po === 1 ? 1 : 0
  }

  return (po - pe) / (1 - pe)
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [anthropicPreds, openaiPreds, geminiPreds, metadata, conformal, semanticRaw] = await Promise.all([
    fetchJsonl('/data/anthropic_predictions.jsonl'),
    fetchJsonl('/data/openai_predictions.jsonl'),
    fetchJsonl('/data/gemini_predictions.jsonl'),
    fetch('/data/run_metadata.json').then(r => r.json()),
    fetch('/data/conformal_results.json').then(r => r.json()),
    fetch('/data/semantic_entropy.json').then(r => r.json()).catch(() => null),
  ])

  const predictions: Record<string, Prediction[]> = {
    anthropic: anthropicPreds,
    openai: openaiPreds,
    gemini: geminiPreds,
  }

  const providers = Object.keys(predictions)

  // Build label table: map from stayId -> binIndex -> provider -> dischargeReady
  type LabelKey = `${number}_${number}`
  const labelMap = new Map<LabelKey, { stayId: number; binIndex: number } & Record<string, boolean | null>>()

  for (const provider of providers) {
    for (const pred of predictions[provider]) {
      for (const bin of pred.annotation.bins) {
        const key: LabelKey = `${pred.stayId}_${bin.binIndex}`
        if (!labelMap.has(key)) {
          labelMap.set(key, { stayId: pred.stayId, binIndex: bin.binIndex } as any)
        }
        const entry = labelMap.get(key)!
        ;(entry as any)[provider] = bin.dischargeReady
      }
    }
  }

  // Ensure all providers present in each entry
  for (const entry of labelMap.values()) {
    for (const p of providers) {
      if ((entry as any)[p] === undefined) {
        (entry as any)[p] = null
      }
    }
  }

  const labelTable = Array.from(labelMap.values())

  // Compute majority vote per bin
  const majorityMap = new Map<LabelKey, boolean>()
  for (const entry of labelTable) {
    const key: LabelKey = `${entry.stayId}_${entry.binIndex}`
    const votes = providers.map(p => (entry as any)[p] as boolean | null).filter(v => v !== null) as boolean[]
    if (votes.length === 0) continue
    const readyCount = votes.filter(v => v).length
    const majority = readyCount > votes.length / 2
    majorityMap.set(key, majority)
  }

  // Compute per-provider metrics
  const metricsMap: Record<string, ProviderMetrics> = {}
  for (const provider of providers) {
    const preds = predictions[provider]
    let agreementCount = 0
    let totalBins = 0
    let sumConfidence = 0
    let readyCount = 0
    let brierSum = 0

    for (const pred of preds) {
      for (const bin of pred.annotation.bins) {
        const key: LabelKey = `${pred.stayId}_${bin.binIndex}`
        const majority = majorityMap.get(key)
        if (majority !== undefined) {
          if (bin.dischargeReady === majority) agreementCount++
          brierSum += Math.pow((bin.dischargeReady ? 1 : 0) - (majority ? 1 : 0), 2)
        }
        totalBins++
        sumConfidence += bin.confidence
        if (bin.dischargeReady) readyCount++
      }
    }

    const meta = metadata.models[provider]
    const totalTokens = (meta?.total_input_tokens ?? 0) + (meta?.total_output_tokens ?? 0)
    const meanLatency = preds.length > 0
      ? preds.reduce((s, p) => s + p.elapsed_seconds, 0) / preds.length
      : 0

    metricsMap[provider] = {
      provider,
      agreement: totalBins > 0 ? agreementCount / totalBins : 0,
      mean_confidence: totalBins > 0 ? sumConfidence / totalBins : 0,
      ready_rate: totalBins > 0 ? readyCount / totalBins : 0,
      brier_score: totalBins > 0 ? brierSum / totalBins : 0,
      total_tokens: totalTokens,
      input_tokens: meta?.total_input_tokens ?? 0,
      output_tokens: meta?.total_output_tokens ?? 0,
      mean_latency_s: meanLatency,
      n_visits: preds.length,
      n_bins: totalBins,
      avg_kappa: 0, // will fill in below
      pareto_optimal: false, // will fill in below
    }
  }

  // Compute pairwise Cohen's kappa
  const kappaMatrix: Record<string, Record<string, number>> = {}
  for (const p of providers) {
    kappaMatrix[p] = {}
    for (const q of providers) {
      if (p === q) {
        kappaMatrix[p][q] = 1
        continue
      }
      // Find shared bins
      const labelsP: boolean[] = []
      const labelsQ: boolean[] = []
      for (const entry of labelTable) {
        const pLabel = (entry as any)[p] as boolean | null
        const qLabel = (entry as any)[q] as boolean | null
        if (pLabel !== null && qLabel !== null) {
          labelsP.push(pLabel)
          labelsQ.push(qLabel)
        }
      }
      kappaMatrix[p][q] = cohenKappa(labelsP, labelsQ)
    }
  }

  // Compute avg kappa for each provider (mean of kappa with other providers)
  for (const provider of providers) {
    const others = providers.filter(p => p !== provider)
    const avgKappa = others.length > 0
      ? others.reduce((s, o) => s + kappaMatrix[provider][o], 0) / others.length
      : 1
    metricsMap[provider].avg_kappa = avgKappa
  }

  // Compute Pareto front (maximize agreement, minimize total tokens)
  const paretoPoints = providers.map(p => ({
    id: p,
    cost: metricsMap[p].total_tokens,
    quality: metricsMap[p].agreement,
  }))
  const paretoOptimal = computeParetoFront(paretoPoints)
  for (const provider of providers) {
    metricsMap[provider].pareto_optimal = paretoOptimal.has(provider)
  }

  const metrics = providers.map(p => metricsMap[p])

  // Build confidence variance per (stayId, binIndex)
  type LabelKey2 = `${number}_${number}`
  const confMap = new Map<LabelKey2, {
    stayId: number; binIndex: number
    confidences: Record<string, number>
    labels: Record<string, boolean>
  }>()
  for (const provider of providers) {
    for (const pred of predictions[provider]) {
      for (const bin of pred.annotation.bins) {
        const key: LabelKey2 = `${pred.stayId}_${bin.binIndex}`
        if (!confMap.has(key)) {
          confMap.set(key, { stayId: pred.stayId, binIndex: bin.binIndex, confidences: {}, labels: {} })
        }
        const entry = confMap.get(key)!
        entry.confidences[provider] = bin.confidence
        entry.labels[provider] = bin.dischargeReady
      }
    }
  }

  const confidenceVariance: ConfidenceVarianceBin[] = Array.from(confMap.values()).map(entry => {
    const vals = Object.values(entry.confidences)
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
    const std = Math.sqrt(variance)
    const labelVals = Object.values(entry.labels)
    const readyCount = labelVals.filter(Boolean).length
    const majorityReady = readyCount > labelVals.length / 2
    const agreeingWithMajority = majorityReady ? readyCount : labelVals.length - readyCount
    const label_agreement = labelVals.length > 0 ? agreeingWithMajority / labelVals.length : 1
    return { ...entry, mean_confidence: mean, std_confidence: std, label_agreement }
  })

  return {
    predictions,
    metrics,
    kappaMatrix,
    labelTable,
    confidenceVariance,
    metadata,
    conformal,
    semantic: semanticRaw ?? undefined,
  }
}
