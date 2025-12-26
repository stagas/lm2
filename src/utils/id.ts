const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function newId(len = 6): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!
  }
  return out
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local:')
}

export function makeLocalId(): string {
  return `local:${newId(6)}`
}


