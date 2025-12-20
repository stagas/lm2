export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

type WaitAsyncResult = 'ok' | 'not-equal' | 'timed-out'

function canUseWaitAsync(): boolean {
  return typeof Atomics.waitAsync === 'function'
}

/**
 * Waits until `arr[valueIndex]` becomes non-zero, or the timeout elapses.
 *
 * Why: `Atomics.waitAsync()` can return `'not-equal'` (which some call sites
 * previously treated as "keep looping" without yielding, causing tight spins),
 * and in rare cases can hang. This helper is bounded and always yields.
 */
export async function waitForNonZero(
  arr: Int32Array,
  valueIndex: number,
  eventIndex: number,
  timeoutMs: number,
  {
    pollMs = 8,
  }: {
    pollMs?: number
  } = {},
): Promise<number> {
  const deadline = performance.now() + timeoutMs

  while (true) {
    const v = Atomics.load(arr, valueIndex)
    if (v !== 0) return v

    const remaining = deadline - performance.now()
    if (remaining <= 0) return 0

    const step = Math.min(remaining, pollMs)

    // Ensure we're waiting for the current event cycle.
    Atomics.store(arr, eventIndex, 0)

    if (canUseWaitAsync()) {
      try {
        const raced = await Promise.race([
          Atomics.waitAsync(arr, eventIndex, 0, step).value as Promise<WaitAsyncResult>,
          sleep(step).then(() => 'timed-out' as WaitAsyncResult),
        ])
        if (raced === 'ok') continue
        if (raced === 'not-equal') {
          // Avoid spinning if the event slot was not in the expected state.
          await sleep(0)
          continue
        }
        // timed-out
        continue
      }
      catch {
        await sleep(step)
      }
    }
    else {
      await sleep(step)
    }
  }
}

/**
 * Acquire a CAS-based int32 spin lock, but never hang forever.
 *
 * Returns `true` if acquired, `false` on timeout.
 */
export async function acquireSpinLock(
  lock: Int32Array,
  timeoutMs: number,
  {
    pollMs = 4,
  }: {
    pollMs?: number
  } = {},
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs

  while (true) {
    const prev = Atomics.compareExchange(lock, 0, 0, 1)
    if (prev === 0) return true

    const remaining = deadline - performance.now()
    if (remaining <= 0) return false

    const step = Math.min(remaining, pollMs)

    if (canUseWaitAsync()) {
      try {
        const raced = await Promise.race([
          Atomics.waitAsync(lock, 0, 1, step).value as Promise<WaitAsyncResult>,
          sleep(step).then(() => 'timed-out' as WaitAsyncResult),
        ])
        if (raced === 'ok') continue
        if (raced === 'not-equal') continue
        continue
      }
      catch {
        await sleep(step)
      }
    }
    else {
      await sleep(step)
    }
  }
}


