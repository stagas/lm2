export type GridOwnerKind = 'pianoroll' | 'timeline'

export type GridOwner = {
  kind: GridOwnerKind
  seqIndex: number
  line: number
  column: number
  length: number
}

export type GridOwnerByLine = ReadonlyMap<number, GridOwner>


