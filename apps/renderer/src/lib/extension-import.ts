export interface ImportedExtensionDraft {
  contentText: string
  kind: string
  name: string
  tags: string[]
}

type ExtensionRecord = Record<string, unknown>

export function parseExtensionImport(raw: string, fileName = 'extension.json'): ImportedExtensionDraft {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${fileName} 不是有效的 JSON 文件。`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('扩展导入失败：文件结构不符合预期。')
  }

  const record = unwrapExtensionPayload(parsed as ExtensionRecord)
  const fallbackName = stripExtension(fileName)
  const name = readString(record, ['display_name', 'name', 'id']) || fallbackName

  if (!name.trim()) {
    throw new Error('扩展导入失败：缺少扩展名称。')
  }

  const version = readString(record, ['version'])
  const author = readString(record, ['author'])
  const homepage = readString(record, ['homepage', 'url', 'repo', 'repository'])
  const description = readString(record, ['description'])
  const tags = [
    readString(record, ['type']),
    version ? `version:${version}` : '',
    author ? `author:${author}` : '',
    homepage ? 'linked' : '',
  ].filter(Boolean)

  const normalized: ExtensionRecord = {
    ...record,
    name: name.trim(),
    version,
    author,
    homepage,
    description,
  }

  return {
    name: name.trim(),
    kind: 'extension',
    tags,
    contentText: JSON.stringify(normalized, null, 2),
  }
}

function unwrapExtensionPayload(record: ExtensionRecord): ExtensionRecord {
  const content = record.content
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const contentRecord = content as ExtensionRecord
    return {
      ...contentRecord,
      name:
        readString(contentRecord, ['display_name', 'name', 'id'])
        || readString(record, ['name'])
        || '',
    }
  }

  return record
}

function readString(record: ExtensionRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}
