import { z } from 'zod'

export const UserDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
}).strict()
export type UserData = z.infer<typeof UserDataSchema>

export const CommentDataSchema = z.object({
  id: z.string(),
  loopId: z.string().optional(),
  content: z.string(),
  author: UserDataSchema,
  timestamp: z.number().int(),
}).strict()
export type CommentData = z.infer<typeof CommentDataSchema>

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

export const LoopDataSchema: z.ZodType<LoopData> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string(),
    artistId: z.string(),
    code: z.string().optional(),
    likesCount: z.number().int(),
    commentsCount: z.number().int(),
    remixOf: LoopDataSchema.optional(),
    isPublic: z.boolean().optional(),
    timestamp: z.number().int().optional(),
    comments: z.array(CommentDataSchema).optional(),
  }).strict()
)

export const SessionDataSchema = z.object({
  user: UserDataSchema,
  loops: z.array(LoopDataSchema),
  likedLoopIds: z.array(z.string()),
}).strict()
export type SessionData = z.infer<typeof SessionDataSchema>

export const ErrorResponseSchema = z.object({
  message: z.string(),
}).strict()
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict()
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>

export const AuthRegisterRequestSchema = z.object({
  artistName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
}).strict()
export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>

export const LoopUpsertRequestSchema = z.object({
  title: z.string().min(1),
  code: z.string(),
  isPublic: z.boolean(),
}).strict()
export type LoopUpsertRequest = z.infer<typeof LoopUpsertRequestSchema>
