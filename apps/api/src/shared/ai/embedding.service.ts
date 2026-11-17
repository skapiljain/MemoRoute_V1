import { env } from '../../config/env.js'
import { cosineSimilarity } from '../utils/cosine-similarity.js'

const EMBEDDING_DIMENSIONS = 1536

export function buildNoteEmbeddingText(title: string, subject: string, content: string): string {
  return `Subject: ${subject}\nTitle: ${title}\n\n${content}`.trim().slice(0, 8000)
}

async function openAiEmbed(text: string): Promise<number[]> {
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for semantic search embeddings')
  }

  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding request failed (${response.status}): ${errorText}`)
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>
  }

  const embedding = payload.data?.[0]?.embedding
  if (!embedding?.length) {
    throw new Error('Embedding API returned an empty vector')
  }

  return embedding
}

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim()
  if (!trimmed) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0)
  }

  if (!env.EMBEDDING_ENABLED) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0)
  }

  return openAiEmbed(trimmed)
}

export function rankBySimilarity<T extends { embedding?: number[] | null }>(
  items: T[],
  queryEmbedding: number[],
  minScore = 0.25,
): Array<T & { similarity: number }> {
  return items
    .map((item) => ({
      ...item,
      similarity: item.embedding?.length ? cosineSimilarity(queryEmbedding, item.embedding) : 0,
    }))
    .filter((item) => item.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
}
