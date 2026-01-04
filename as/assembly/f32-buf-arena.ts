// dprint-ignore-file

// Preallocated arena for reusing `StaticArray<f32>` buffers.
// AssemblyScript runtime can leak when repeatedly allocating at runtime; this arena avoids that.

class FixedF32Pool {
  private top: i32
  private free: StaticArray<i32>
  bufs: StaticArray<StaticArray<f32>>

  constructor(readonly len: i32, count: i32) {
    this.top = count
    this.free = new StaticArray<i32>(count)
    this.bufs = new StaticArray<StaticArray<f32>>(count)

    for (let i: i32 = 0; i < count; i++) {
      this.free[i] = count - 1 - i
      this.bufs[i] = new StaticArray<f32>(len)
    }
  }

  @inline
  acquire(): i32 {
    const t: i32 = this.top - 1
    if (t < 0) return -1
    this.top = t
    return this.free[t]
  }

  @inline
  release(slot: i32): void {
    const t: i32 = this.top
    this.free[t] = slot
    this.top = t + 1
  }
}

// @ts-ignore
@inline
function nextPow2(n: i32): i32 {
  let x: i32 = n <= 1 ? 1 : n - 1
  x |= x >> 1
  x |= x >> 2
  x |= x >> 4
  x |= x >> 8
  x |= x >> 16
  return x + 1
}

export class F32BufArena {
  // Power-of-two size classes.
  // Keep these sorted ascending.
  private readonly pools: StaticArray<FixedF32Pool>

  constructor() {
    // Tuning note:
    // - small sizes are abundant; very large sizes are scarce to keep memory reasonable.
    // - sizes cover typical DSP needs: delays, reverbs, predelays, etc.
    this.pools = new StaticArray<FixedF32Pool>(12)
    this.pools[0] = new FixedF32Pool(1024, 128)
    this.pools[1] = new FixedF32Pool(2048, 128)
    this.pools[2] = new FixedF32Pool(4096, 64)
    this.pools[3] = new FixedF32Pool(8192, 64)
    this.pools[4] = new FixedF32Pool(16384, 32)
    this.pools[5] = new FixedF32Pool(32768, 32)
    this.pools[6] = new FixedF32Pool(65536, 32)
    this.pools[7] = new FixedF32Pool(131072, 8)
    this.pools[8] = new FixedF32Pool(262144, 4)
    this.pools[9] = new FixedF32Pool(524288, 4)
    this.pools[10] = new FixedF32Pool(1048576, 2)
    this.pools[11] = new FixedF32Pool(2097152, 2)
  }

  @inline
  acquireAtLeast(minLen: i32): i32 {
    let need: i32 = minLen
    if (need < 1) need = 1
    need = nextPow2(need)

    const pools = this.pools
    for (let i: i32 = 0; i < pools.length; i++) {
      const p = pools[i]
      if (p.len < need) continue
      const slot = p.acquire()
      if (slot >= 0) {
        // Handle encodes pool index (high 16) and slot (low 16).
        return (i << 16) | (slot & 0xffff)
      }
    }

    throw new Error(`F32BufArena exhausted (minLen=${minLen})`)
  }

  @inline
  get(handle: i32): StaticArray<f32> {
    const i: i32 = (handle >>> 16) & 0xffff
    const slot: i32 = handle & 0xffff
    return this.pools[i].bufs[slot]
  }

  @inline
  len(handle: i32): i32 {
    const i: i32 = (handle >>> 16) & 0xffff
    return this.pools[i].len
  }

  @inline
  release(handle: i32): void {
    const i: i32 = (handle >>> 16) & 0xffff
    const slot: i32 = handle & 0xffff
    this.pools[i].release(slot)
  }
}

// Global arena instance (allocated at module init).
export const f32BufArena: F32BufArena = new F32BufArena()


