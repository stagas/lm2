// dprint-ignore-file

// Utility for computing content hash of record() calls
// Used to match recordings across program swaps when indices differ

// @ts-ignore
@inline
export function recordContentHash(key: u32, sec: f32, depsHash: u32): u32 {
  let hash: u32 = 0x811c9dc5 // FNV-1a offset basis
  hash = hash ^ key
  hash = hash * 16777619
  const secBits = reinterpret<u32>(sec)
  hash = hash ^ secBits
  hash = hash * 16777619
  hash = hash ^ depsHash
  hash = hash * 16777619
  return hash
}
