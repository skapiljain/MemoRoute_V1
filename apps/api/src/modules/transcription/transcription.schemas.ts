import { z } from 'zod'

export const transcriptionFieldsSchema = z.object({
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$|^auto$/, 'language must be an ISO-639-1 code or auto')
    .optional(),
  topic: z.string().trim().max(80).optional(),
  durationSeconds: z.coerce.number().positive().optional(),
})

export type TranscriptionFields = z.infer<typeof transcriptionFieldsSchema>

export interface TranscriptionResponse {
  transcript: string
  metadata: {
    model: string
    mimeType: string
    sizeBytes: number
    language?: string
    durationSeconds?: number
  }
}
