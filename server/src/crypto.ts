import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

const KEY_FILE = process.env.OCX_SECRET_KEY_FILE || path.join(config.dataDir, 'secret.key')
const PREFIX = 'enc:v1:'

let cachedKey: Buffer | null = null

function decodeEnvKey(raw: string): Buffer | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const hex = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : null
    if (hex && hex.length === 32) return hex
    const base64 = Buffer.from(value, 'base64')
    if (base64.length === 32) return base64
  } catch {
    // ignore invalid env key
  }
  return null
}

function masterKey(): Buffer {
  if (cachedKey) return cachedKey
  const fromEnv = decodeEnvKey(process.env.OCX_SECRET_KEY || '')
  if (fromEnv) {
    cachedKey = fromEnv
    return cachedKey
  }
  fs.mkdirSync(config.dataDir, { recursive: true })
  if (fs.existsSync(KEY_FILE)) {
    const stored = fs.readFileSync(KEY_FILE)
    if (stored.length !== 32) {
      throw new Error(`Invalid encryption key file at ${KEY_FILE}. Expected 32 bytes.`)
    }
    try {
      fs.chmodSync(KEY_FILE, 0o600)
    } catch {
      // best effort
    }
    cachedKey = stored
    return cachedKey
  }
  const key = crypto.randomBytes(32)
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 })
  cachedKey = key
  return key
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX)
}

/** Create/load the local encryption key so it is present in backups before credentials are saved. */
export function ensureSecretKey(): void {
  masterKey()
}

export function encryptSecret(value: string): string {
  if (!value) return ''
  if (isEncryptedSecret(value)) return value
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string): string {
  if (!value) return ''
  if (!isEncryptedSecret(value)) return value
  const payload = value.slice(PREFIX.length)
  const [ivPart, tagPart, dataPart] = payload.split(':')
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Stored credential is malformed.')
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKey(),
      Buffer.from(ivPart, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('Stored credential could not be decrypted.')
  }
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value ?? {}))
}

export function decryptJson<T>(value: string, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(decryptSecret(value)) as T
  } catch {
    return fallback
  }
}
