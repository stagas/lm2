export type RemixOfData = Pick<
  LoopData,
  | 'id'
  | 'title'
  | 'artist'
  | 'artistId'
  | 'likesCount'
  | 'commentsCount'
>

export type LoopData = {
  id: string
  title: string
  artist: string
  artistId: string
  code: string
  likesCount: number
  commentsCount: number
  remixOf: RemixOfData | null
  isPublic: boolean
  timestamp: number
}
