const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

import { computePeaks } from './peaks.ts'

export function detectSlices(
  samples: Float32Array,
  threshold: number,
  max: number,
): { points: Int32Array; count: number } {
  const m = Math.max(1, max | 0)
  const points = new Int32Array(m)
  const len = samples.length | 0
  if (len <= 0) return { points, count: 0 }

  let count = 0
  const thr = clamp(threshold, 0, 1)

  const desiredBuckets = Math.max(256, Math.min(16384, (m * 16) | 0))
  const minBucketSamples = 32
  const maxBucketsByMinSize = Math.max(1, Math.floor(len / minBucketSamples))
  const bucketCount = Math.max(1, Math.min(len, desiredBuckets, maxBucketsByMinSize))
  if (bucketCount <= 1) {
    points[0] = 0
    return { points, count: 1 }
  }

  const peaks = computePeaks(samples, bucketCount)
  const rise = new Float32Array(bucketCount)

  let riseMax = 0
  let prevAmp = 0
  for (let i = 0; i < bucketCount; i++) {
    const base = i * 2
    const mn = peaks[base] ?? 0
    const mx = peaks[base + 1] ?? 0
    const amp = Math.max(Math.abs(mn), Math.abs(mx))
    const d = i === 0 ? 0 : Math.max(0, amp - prevAmp)
    rise[i] = d
    if (d > riseMax) riseMax = d
    prevAmp = amp
  }

  if (riseMax <= 0) {
    points[0] = 0
    return { points, count: 1 }
  }

  const minRise = riseMax * (0.02 + thr * 0.28)
  const noveltyMin = riseMax * (0.01 + thr * 0.18)
  const ratioMin = thr * 0.9
  const minDistanceBuckets = 1 + ((thr * 24) | 0)
  const rearmLevel = riseMax * (0.006 + thr * 0.06)
  const cooldownFrames = 1 + ((thr * 10) | 0)

  const fastCoeff = 0.25
  const slowCoeff = 0.02

  let fast = rise[0] ?? 0
  let slow = fast

  let prev2 = 0
  let prev1 = 0
  let prevFast1 = fast
  let prevSlow1 = slow

  let lastPeakBucket = -0x3fffffff
  let armed = true
  let cooldown = 0
  let mg = 0

  const bucketStart = (b: number) => Math.floor((b * len) / bucketCount)

  for (let frame = 1; frame < bucketCount && count < m; frame++) {
    const e = rise[frame] ?? 0
    fast += (e - fast) * fastCoeff
    slow += (e - slow) * slowCoeff

    const novelty = Math.max(0, fast - slow)

    // "Machine gun" prevention: after firing, raise the effective threshold and spacing,
    // then release over time (compressor-like).
    const release = 0.995 + thr * 0.01
    mg *= release
    const mgMul = 1 + mg * (10 + thr * 12)
    const effMinRise = minRise * mgMul
    const effNoveltyMin = noveltyMin * mgMul
    const baseMinDistanceBuckets = Math.max(2, Math.floor(minDistanceBuckets * (1 + mg * 2)))
    const effMinDistanceBuckets = count <= 2
      ? Math.max(baseMinDistanceBuckets, 4 + ((thr * 8) | 0))
      : baseMinDistanceBuckets

    if (!armed && novelty <= rearmLevel) armed = true
    if (cooldown > 0) cooldown--

    if (frame >= 2) {
      const isPeak = prev1 > prev2 && prev1 >= novelty
      if (isPeak) {
        const posBucket = (frame - 1) | 0
        const bucketDelta = posBucket - lastPeakBucket
        const base = Math.max(prevSlow1, riseMax * 1e-5)
        const ratio = prevFast1 / base
        if (
          armed
          && cooldown <= 0
          && bucketDelta >= effMinDistanceBuckets
          && prevFast1 >= effMinRise
          && ratio >= 1 + ratioMin
          && prev1 >= effNoveltyMin
        ) {
          const s = bucketStart(posBucket)
          const last = count > 0 ? (points[count - 1] ?? 0) : -1
          if (s > last) {
            points[count++] = s
            lastPeakBucket = posBucket
            armed = false
            cooldown = cooldownFrames
            mg = Math.min(1, mg + 0.75)
          }
        }
      }
    }

    prev2 = prev1
    prev1 = novelty
    prevFast1 = fast
    prevSlow1 = slow
  }

  if (count <= 0) {
    points[0] = 0
    return { points, count: 1 }
  }

  return { points, count }
}
