import { Schema, model, type InferSchemaType, Types } from 'mongoose'

export type PipelineStageStatus = 'running' | 'succeeded' | 'failed'
export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type PipelineRunKind = 'evaluation' | 'note_index'

const stageSchema = new Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['running', 'succeeded', 'failed'],
      required: true,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    error: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false },
)

const pipelineRunSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: {
      type: String,
      enum: ['evaluation', 'note_index'],
      required: true,
      index: true,
    },
    refId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed'],
      default: 'queued',
      required: true,
      index: true,
    },
    stages: { type: [stageSchema], default: [] },
    tokensIn: { type: Number, default: 0 },
    tokensOut: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

pipelineRunSchema.index({ userId: 1, createdAt: -1 })

export type PipelineRunDocument = InferSchemaType<typeof pipelineRunSchema> & {
  _id: Types.ObjectId
  createdAt: Date
}

export const PipelineRun = model('PipelineRun', pipelineRunSchema)

export type StageFn<T> = (setMeta: (meta: Record<string, unknown>) => void) => Promise<T> | T

export async function runStage<T>(
  runId: Types.ObjectId | string,
  name: string,
  fn: StageFn<T>,
): Promise<T> {
  const id = typeof runId === 'string' ? new Types.ObjectId(runId) : runId
  const startedAt = new Date()
  let stageMeta: Record<string, unknown> | undefined

  const setMeta = (meta: Record<string, unknown>) => {
    stageMeta = { ...(stageMeta ?? {}), ...meta }
  }

  await PipelineRun.findByIdAndUpdate(id, {
    $push: {
      stages: {
        name,
        status: 'running',
        startedAt,
      },
    },
  })

  try {
    const result = await fn(setMeta)
    const endedAt = new Date()

    const updateQuery: Record<string, unknown> = {
      $set: {
        'stages.$.status': 'succeeded',
        'stages.$.endedAt': endedAt,
        ...(stageMeta ? { 'stages.$.meta': stageMeta } : {}),
      },
    }

    if (stageMeta) {
      const inc: Record<string, number> = {}
      if (typeof stageMeta.tokensIn === 'number') inc.tokensIn = stageMeta.tokensIn
      if (typeof stageMeta.tokensOut === 'number') inc.tokensOut = stageMeta.tokensOut
      if (typeof stageMeta.costUsd === 'number') inc.costUsd = stageMeta.costUsd
      if (Object.keys(inc).length > 0) {
        updateQuery.$inc = inc
      }
    }

    await PipelineRun.updateOne(
      { _id: id, 'stages.name': name, 'stages.status': 'running' },
      updateQuery,
    )

    return result
  } catch (error) {
    const endedAt = new Date()
    const errorMessage = error instanceof Error ? error.message : String(error)

    await PipelineRun.updateOne(
      { _id: id, 'stages.name': name, 'stages.status': 'running' },
      {
        $set: {
          'stages.$.status': 'failed',
          'stages.$.endedAt': endedAt,
          'stages.$.error': errorMessage,
          ...(stageMeta ? { 'stages.$.meta': stageMeta } : {}),
        },
      },
    )

    throw error
  }
}
