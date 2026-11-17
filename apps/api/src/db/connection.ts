import mongoose from 'mongoose'
import { env } from '../config/env.js'

let isConnected = false
let listenersAttached = false

function attachConnectionListeners(): void {
  if (listenersAttached) return
  listenersAttached = true

  mongoose.connection.on('disconnected', () => {
    isConnected = false
  })

  mongoose.connection.on('error', () => {
    isConnected = false
  })
}

export async function connectDatabase(): Promise<void> {
  attachConnectionListeners()
  mongoose.set('strictQuery', true)

  if (mongoose.connection.readyState === 1) {
    isConnected = true
    return
  }

  const uri = process.env.MONGODB_URI ?? env.MONGODB_URI

  await mongoose.connect(uri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 3_000,
  })
  isConnected = true
  console.log('[DB] Connected to MongoDB at', uri)
}

export async function ensureDatabaseConnection(): Promise<void> {
  attachConnectionListeners()

  if (mongoose.connection.readyState !== 1) {
    isConnected = false
    await connectDatabase()
    return
  }

  try {
    await mongoose.connection.db?.admin().ping()
    isConnected = true
  } catch {
    isConnected = false
    await mongoose.disconnect().catch(() => {})
    await connectDatabase()
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected && mongoose.connection.readyState === 0) return
  await mongoose.disconnect()
  isConnected = false
}

export function getDatabaseStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 && isConnected ? 'connected' : 'disconnected'
}

export async function pingDatabase(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) {
    return false
  }

  try {
    await mongoose.connection.db?.admin().ping()
    isConnected = true
    return true
  } catch {
    isConnected = false
    return false
  }
}
