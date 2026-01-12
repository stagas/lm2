import { z } from '@zod/zod'

export const UserDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  isAdmin: z.boolean().optional(),
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

export const CreateCommentRequestSchema = z.object({
  content: z.string().min(1),
}).strict()
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>

export type LoopData = {
  id: string
  title: string
  artist: string
  artistId: string
  code?: string
  likesCount: number
  commentsCount: number
  remixesCount: number
  remixOfId?: string
  remixOf?: LoopData
  isPublic?: boolean
  timestamp?: number
  comments?: CommentData[]
}

export type PublicLoopListEntry = readonly [
  loopId: string,
  artist: string,
  artistId: string,
  likesCount: number,
  commentsCount: number,
  remixesCount: number,
  title: string,
  timestamp: number,
  remixOfId: string,
]

export const LoopDataSchema: z.ZodType<LoopData> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string(),
    artistId: z.string(),
    code: z.string().optional(),
    likesCount: z.number().int(),
    commentsCount: z.number().int(),
    remixesCount: z.number().int(),
    remixOfId: z.string().min(1).optional(),
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

export const UpdateArtistNameRequestSchema = z.object({
  artistName: z.string().trim().min(1),
}).strict()
export type UpdateArtistNameRequest = z.infer<typeof UpdateArtistNameRequestSchema>

export const LoopUpsertRequestSchema = z.object({
  epoch: z.string().min(1),
  title: z.string().min(1),
  code: z.string(),
  isPublic: z.boolean(),
  remixOfId: z.string().min(1).nullable().optional(),
}).strict()
export type LoopUpsertRequest = z.infer<typeof LoopUpsertRequestSchema>

export const OkEpochResponseSchema = z.object({
  ok: z.literal(true),
  epoch: z.string().min(1),
}).strict()
export type OkEpochResponse = z.infer<typeof OkEpochResponseSchema>

export const SessionEpochResponseSchema = z.object({
  epoch: z.string().min(1),
  sessionData: SessionDataSchema,
}).strict()
export type SessionEpochResponse = z.infer<typeof SessionEpochResponseSchema>

export type AdminUser = {
  id: string
  name: string
  email: string
  loopsCount: number
  likesCount: number
  welcomeEmailSent: boolean
}

export type AdminLoop = {
  id: string
  userId: string
  title: string
  isPublic: boolean
  timestamp: number
  remixOfId?: string
}

export const AdminLoginAsRequestSchema = z.object({
  userId: z.string().min(1),
}).strict()
export type AdminLoginAsRequest = z.infer<typeof AdminLoginAsRequestSchema>

export const AdminSendWelcomeEmailRequestSchema = z.object({
  userId: z.string().min(1),
}).strict()
export type AdminSendWelcomeEmailRequest = z.infer<typeof AdminSendWelcomeEmailRequestSchema>

export const AdminImportV1RequestSchema = z.object({
  data: z.array(z.any()),
}).strict()
export type AdminImportV1Request = z.infer<typeof AdminImportV1RequestSchema>

export const AdminImportV1ResponseSchema = z.object({
  ok: z.literal(true),
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
}).strict()
export type AdminImportV1Response = z.infer<typeof AdminImportV1ResponseSchema>
