export type LoopData = {
  id: string
  title: string
  artist: string
  artistId: string
  code?: string
  likesCount: number
  commentsCount: number
  remixOf?: LoopData
  isPublic?: boolean
  timestamp?: number
  comments?: CommentData[]
}

export type CommentData = {
  id: string
  content: string
  author: UserData
  timestamp: number
}

export type UserData = {
  id: string
  name: string
  email?: string
  isAdmin?: boolean
  createdAt?: number
  updatedAt?: number
}

export type SessionData = {
  user: UserData
  loops: LoopData[]
}
