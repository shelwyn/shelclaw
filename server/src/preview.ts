import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import { AppError } from './errors.js'
import type { PreviewPayload, PreviewSheet, WorkspaceFile } from './types.js'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'])
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.log', '.yaml', '.yml', '.toml', '.ini',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.php', '.swift', '.sh', '.bash', '.zsh', '.fish',
  '.html', '.htm', '.css', '.scss', '.less', '.sql', '.xml', '.vue', '.svelte', '.env', '.gitignore',
  '.dockerfile', '.makefile', '.graphql', '.prisma',
])
const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xlsm'])
const DOCUMENT_EXTENSIONS = new Set(['.docx'])

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_SHEET_BYTES = 25 * 1024 * 1024
const MAX_DOC_BYTES = 25 * 1024 * 1024
const MAX_TEXT_CHARS = 400_000
const MAX_SHEET_ROWS = 300
const MAX_SHEET_COLS = 40
const MAX_SHEETS = 12

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
}

export function detectMimeType(name: string, fallback = ''): string {
  return MIME_BY_EXTENSION[path.extname(name).toLowerCase()] || fallback || 'application/octet-stream'
}

export function resolveWorkspaceFile(root: string, relativePath: string): string {
  const rootPath = path.resolve(root)
  if (!fs.existsSync(rootPath)) {
    throw new AppError('Workspace folder is missing from the server.', 404)
  }
  const base = fs.realpathSync(rootPath)
  const candidate = path.resolve(base, relativePath)
  const target = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new AppError('Invalid file path.', 400)
  }
  return target
}

const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'chats', 'memory', 'embeddings', 'agents',
])

export function listWorkspaceFiles(root: string): WorkspaceFile[] {
  const files: WorkspaceFile[] = []
  const limit = 800
  if (!fs.existsSync(root)) return files

  const walk = (directory: string) => {
    if (files.length >= limit) return
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= limit) return
      if (entry.name.startsWith('.') && entry.isDirectory()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stat = fs.statSync(absolute)
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        })
      } catch {
        // Unreadable file; skip it.
      }
    }
  }

  walk(path.resolve(root))
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (rows.length >= MAX_SHEET_ROWS) return rows
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.slice(0, MAX_SHEET_ROWS).map((entry) => entry.slice(0, MAX_SHEET_COLS))
}

async function previewSpreadsheet(
  filePath: string,
  name: string,
  mimeType: string,
  size: number,
): Promise<PreviewPayload> {
  const extension = path.extname(name).toLowerCase()
  if (extension === '.csv' || extension === '.tsv') {
    const text = fs.readFileSync(filePath, 'utf8')
    const rows = parseDelimited(text, extension === '.tsv' ? '\t' : ',')
    return {
      kind: 'spreadsheet',
      name,
      mimeType,
      size,
      sheets: [{ name: 'Sheet 1', rows }],
      truncated: rows.length >= MAX_SHEET_ROWS,
    }
  }

  if (size > MAX_SHEET_BYTES) {
    return {
      kind: 'unsupported',
      name,
      mimeType,
      size,
      message: 'This spreadsheet is too large to preview (limit 25 MB). Download it instead.',
    }
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheets: PreviewSheet[] = []
  let truncated = false
  workbook.eachSheet((worksheet) => {
    if (sheets.length >= MAX_SHEETS) {
      truncated = true
      return
    }
    const rowCount = Math.min(worksheet.rowCount || 0, MAX_SHEET_ROWS)
    const columnCount = Math.min(worksheet.columnCount || 0, MAX_SHEET_COLS)
    if (worksheet.rowCount > MAX_SHEET_ROWS || worksheet.columnCount > MAX_SHEET_COLS) {
      truncated = true
    }
    const rows: string[][] = []
    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex)
      const values: string[] = []
      for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
        const cell = row.getCell(columnIndex)
        values.push(cell.text ?? (cell.value == null ? '' : String(cell.value)))
      }
      rows.push(values)
    }
    sheets.push({ name: worksheet.name, rows })
  })

  return {
    kind: 'spreadsheet',
    name,
    mimeType,
    size,
    sheets,
    truncated,
  }
}

async function previewDocument(
  filePath: string,
  name: string,
  mimeType: string,
  size: number,
): Promise<PreviewPayload> {
  if (size > MAX_DOC_BYTES) {
    return {
      kind: 'unsupported',
      name,
      mimeType,
      size,
      message: 'This document is too large to preview (limit 25 MB). Download it instead.',
    }
  }
  const result = await mammoth.convertToHtml({ path: filePath })
  return {
    kind: 'document',
    name,
    mimeType,
    size,
    html: result.value,
    warnings: result.messages.map((message) => message.message).slice(0, 8),
  }
}

export async function buildPreview(
  filePath: string,
  name: string,
  mimeType = '',
  size = 0,
): Promise<PreviewPayload> {
  const stat = fs.statSync(filePath)
  const resolvedMime = detectMimeType(name, mimeType)
  const extension = path.extname(name).toLowerCase()
  const actualSize = size || stat.size

  if (extension === '.pdf') {
    return { kind: 'pdf', name, mimeType: 'application/pdf', size: actualSize }
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return { kind: 'image', name, mimeType: resolvedMime, size: actualSize }
  }

  if (SPREADSHEET_EXTENSIONS.has(extension) || extension === '.xls' || extension === '.csv' || extension === '.tsv') {
    if (extension === '.xls') {
      return {
        kind: 'unsupported',
        name,
        mimeType: resolvedMime,
        size: actualSize,
        message: 'Legacy .xls files cannot be previewed. Download the file or convert it to .xlsx.',
      }
    }
    return previewSpreadsheet(filePath, name, resolvedMime, actualSize)
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return previewDocument(filePath, name, resolvedMime, actualSize)
  }

  if (extension === '.doc') {
    return {
      kind: 'unsupported',
      name,
      mimeType: resolvedMime,
      size: actualSize,
      message: 'Legacy .doc files cannot be previewed. Download the file or convert it to .docx.',
    }
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    if (actualSize > MAX_TEXT_BYTES) {
      return {
        kind: 'unsupported',
        name,
        mimeType: resolvedMime,
        size: actualSize,
        message: 'This text file is too large to preview (limit 2 MB). Download it instead.',
      }
    }
    const raw = fs.readFileSync(filePath)
    if (raw.includes(0)) {
      return {
        kind: 'unsupported',
        name,
        mimeType: resolvedMime,
        size: actualSize,
        message: 'This file looks binary and cannot be shown as text.',
      }
    }
    const text = raw.toString('utf8')
    return {
      kind: 'text',
      name,
      mimeType: resolvedMime,
      size: actualSize,
      content: text.slice(0, MAX_TEXT_CHARS),
      truncated: text.length > MAX_TEXT_CHARS,
    }
  }

  return {
    kind: 'unsupported',
    name,
    mimeType: resolvedMime,
    size: actualSize,
    message: 'No preview is available for this file type. Download it to open it locally.',
  }
}
