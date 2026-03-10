export function computeParetoFront(
  points: Array<{ id: string; cost: number; quality: number }>
): Set<string> {
  // A point is Pareto-optimal if no other point has both lower cost AND higher quality
  const optimal = new Set<string>()
  for (const p of points) {
    const dominated = points.some(
      q =>
        q.id !== p.id &&
        q.cost <= p.cost &&
        q.quality >= p.quality &&
        (q.cost < p.cost || q.quality > p.quality)
    )
    if (!dominated) optimal.add(p.id)
  }
  return optimal
}
