import { z } from 'zod'

export const UserDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  passwordEncrypted: z.string().optional(),
  welcomeEmailSent: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
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
export type LoopData = z.infer<typeof LoopDataSchema>

export const SessionDataSchema = z.object({
  user: UserDataSchema,
  loops: z.array(LoopDataSchema),
}).strict()
export type SessionData = z.infer<typeof SessionDataSchema>

export const ErrorResponseSchema = z.object({
  message: z.string(),
}).strict()
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export const AuthLoginRequestSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
}).strict()
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>

export const AuthRegisterRequestSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
}).strict()
export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>

export const LoopUpsertRequestSchema = z.object({
  title: z.string().min(1),
  code: z.string(),
  isPublic: z.boolean(),
  timestamp: z.number().int(),
}).strict()
export type LoopUpsertRequest = z.infer<typeof LoopUpsertRequestSchema>
