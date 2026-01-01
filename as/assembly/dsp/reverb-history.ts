import {
  REVERB_DATA_OFFSET,
  REVERB_ENTRY_SIZE,
  REVERB_HISTORY_SIZE,
  REVERB_WRITE_POS_OFFSET,
} from '../constants'

// Best-effort reverb history for UI widgets (no atomics needed).
// Stores the latest roomSize per reverb index.
//
// Why: the UI visualizer only needs a roomSize timeline per node.
// @ts-ignore
@inline
export function publishReverbRoomSize(hist: StaticArray<f32>, reverbIndex: i32, roomSize: f32): void {
  const writePos = i32(hist[REVERB_WRITE_POS_OFFSET])
  const slot = writePos % REVERB_HISTORY_SIZE
  const base = REVERB_DATA_OFFSET + slot * REVERB_ENTRY_SIZE
  hist[base] = f32(reverbIndex)
  hist[base + 1] = roomSize
  hist[REVERB_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
}


