// Small statistics helpers for reporting on a small sample honestly.

/** Wilson score interval for a proportion, 95% by default. */
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 }
  const p = successes / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}

/** Nearest-rank percentile (p in 0..100). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface Agreement {
  agree: number
  n: number
  rate: number
  ci: { low: number; high: number }
}

export function agreement(pairs: Array<{ label: string; chosen: string | undefined }>): Agreement {
  const agree = pairs.filter((p) => p.chosen === p.label).length
  const n = pairs.length
  return { agree, n, rate: n ? agree / n : 0, ci: wilson(agree, n) }
}
