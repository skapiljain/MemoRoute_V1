import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../../config/env.js'
import { mimeForExtension } from '../utils/audio-format.js'

export function getAudioDir(): string {
  if (env.AUDIO_DIR) {
    return resolve(env.AUDIO_DIR)
  }
  return fileURLToPath(new URL('../../../storage', import.meta.url))
}

export interface AudioStorage {
  save(userId: string, evaluationId: string, buffer: Buffer, extension?: string): Promise<string>
  read(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }>
  delete(relativePath: string): Promise<void>
}

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function mimeForPath(relativePath: string): string {
  const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
  return mimeForExtension(ext)
}

class LocalAudioStorage implements AudioStorage {
  async save(
    userId: string,
    evaluationId: string,
    buffer: Buffer,
    extension = 'webm',
  ): Promise<string> {
    const sanitized = sanitizeUserId(userId)
    const userDir = join(getAudioDir(), 'audio', sanitized)
    await mkdir(userDir, { recursive: true })

    const filename = `${evaluationId}.${extension}`
    const fullPath = join(userDir, filename)
    await writeFile(fullPath, buffer)

    return `audio/${sanitized}/${filename}`
  }

  async read(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const fullPath = join(getAudioDir(), relativePath)
    const buffer = await readFile(fullPath)
    return { buffer, mimeType: mimeForPath(relativePath) }
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = join(getAudioDir(), relativePath)
    try {
      await unlink(fullPath)
    } catch (error) {
      // Ignore ENOENT — file may already be gone
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}

class S3AudioStorage implements AudioStorage {
  private client: S3Client
  private bucket: string

  constructor() {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY are required for AUDIO_STORAGE=s3')
    }

    this.bucket = env.S3_BUCKET
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    })
  }

  private objectKey(userId: string, evaluationId: string, extension: string): string {
    return `audio/${sanitizeUserId(userId)}/${evaluationId}.${extension}`
  }

  async save(
    userId: string,
    evaluationId: string,
    buffer: Buffer,
    extension = 'webm',
  ): Promise<string> {
    const key = this.objectKey(userId, evaluationId, extension)
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeForExtension(extension),
      }),
    )
    return key
  }

  async read(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
      }),
    )

    const body = response.Body
    if (!body) {
      throw new Error('S3 object body is empty')
    }

    const bytes = await body.transformToByteArray()
    return {
      buffer: Buffer.from(bytes),
      mimeType: mimeForPath(relativePath),
    }
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
      }),
    )
  }
}

let storageInstance: AudioStorage | null = null

export function getAudioStorage(): AudioStorage {
  if (!storageInstance) {
    storageInstance = env.AUDIO_STORAGE === 's3' ? new S3AudioStorage() : new LocalAudioStorage()
  }
  return storageInstance
}

/** Reset the singleton (for testing). */
export function resetAudioStorage(): void {
  storageInstance = null
}

export async function saveAudioFile(
  userId: string,
  evaluationId: string,
  buffer: Buffer,
  extension = 'webm',
): Promise<string> {
  return getAudioStorage().save(userId, evaluationId, buffer, extension)
}

export async function readAudioFile(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
  return getAudioStorage().read(relativePath)
}

export async function deleteAudioFile(relativePath: string): Promise<void> {
  return getAudioStorage().delete(relativePath)
}
