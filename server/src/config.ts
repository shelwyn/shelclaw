import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(here, '..')
export const projectRoot = path.resolve(serverRoot, '..')

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(projectRoot, 'data')

fs.mkdirSync(dataDir, { recursive: true })

let dbPath = path.join(dataDir, 'shelclaw.db')
const legacyDbPath = path.join(dataDir, 'opencodex.db')
if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  try {
    fs.renameSync(legacyDbPath, dbPath)
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(`${legacyDbPath}${suffix}`)) {
        fs.renameSync(`${legacyDbPath}${suffix}`, `${dbPath}${suffix}`)
      }
    }
  } catch {
    dbPath = legacyDbPath
  }
}

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  appToken: (process.env.APP_TOKEN || '').trim(),
  dataDir,
  dbPath,
  webDist: path.join(projectRoot, 'web', 'dist'),
  projectRoot,
  isProd: process.env.NODE_ENV === 'production' || !process.env.TSX_DEV,
  opencodeBin: process.env.OPENCODE_BIN || 'opencode',
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  activepiecesMcpUrl: (process.env.ACTIVEPIECES_MCP_URL || '').trim(),
  activepiecesUiUrl: (process.env.ACTIVEPIECES_UI_URL || '').trim(),
}
