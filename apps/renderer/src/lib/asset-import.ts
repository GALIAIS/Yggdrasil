export interface ImportedAssetPayload {
  contentText: string
  domain: 'assets' | 'backgrounds'
  kind: 'asset' | 'audio' | 'background' | 'image' | 'video'
  name: string
  tags: string[]
}

type AssetExportRecord = {
  content?: unknown
  domain?: unknown
  kind?: unknown
  name?: unknown
  tags?: unknown
}

export async function importAssetFile(
  file: File,
  domain: 'assets' | 'backgrounds' = 'assets',
): Promise<ImportedAssetPayload> {
  if (isJsonLikeFile(file)) {
    return parseAssetImport(await file.text(), file.name, domain)
  }

  const dataUrl = await readFileAsDataUrl(file)
  const kind = inferAssetKind(file.type, domain)

  return {
    domain,
    kind,
    name: stripExtension(file.name),
    tags: buildAssetTags(file.type, domain),
    contentText: JSON.stringify(
      {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      },
      null,
      2,
    ),
  }
}

export function parseAssetImport(
  raw: string,
  fileName = 'asset.json',
  fallbackDomain: 'assets' | 'backgrounds' = 'assets',
): ImportedAssetPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${fileName} 不是有效的 JSON 文件。`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('资源导入失败：文件结构不符合预期。')
  }

  const record = parsed as AssetExportRecord
  const domain = normalizeAssetDomain(record.domain, fallbackDomain)
  const kind = normalizeAssetKind(record.kind, domain)
  const name =
    typeof record.name === 'string' && record.name.trim() ? record.name.trim() : stripExtension(fileName)
  const content = record.content

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('资源导入失败：缺少 content 载荷。')
  }

  return {
    contentText: JSON.stringify(content, null, 2),
    domain,
    kind,
    name,
    tags: normalizeAssetTags(record.tags, domain, kind),
  }
}

export function inferAssetKind(
  mimeType: string,
  domain: 'assets' | 'backgrounds' = 'assets',
): ImportedAssetPayload['kind'] {
  if (domain === 'backgrounds') return 'background'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'asset'
}

function buildAssetTags(mimeType: string, domain: 'assets' | 'backgrounds'): string[] {
  const tags = [domain === 'backgrounds' ? 'background' : 'asset']
  if (mimeType.startsWith('image/')) tags.push('image')
  if (mimeType.startsWith('audio/')) tags.push('audio')
  if (mimeType.startsWith('video/')) tags.push('video')
  return tags
}

function normalizeAssetDomain(
  value: unknown,
  fallback: 'assets' | 'backgrounds',
): 'assets' | 'backgrounds' {
  return value === 'backgrounds' ? 'backgrounds' : fallback
}

function normalizeAssetKind(
  value: unknown,
  domain: 'assets' | 'backgrounds',
): ImportedAssetPayload['kind'] {
  if (domain === 'backgrounds') {
    return 'background'
  }

  switch (value) {
    case 'image':
    case 'audio':
    case 'video':
    case 'asset':
      return value
    default:
      return 'asset'
  }
}

function normalizeAssetTags(
  value: unknown,
  domain: 'assets' | 'backgrounds',
  kind: ImportedAssetPayload['kind'],
): string[] {
  const tags = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : []

  if (tags.length > 0) {
    return tags
  }

  const fallbackTags = [domain === 'backgrounds' ? 'background' : 'asset']
  if (kind === 'image') fallbackTags.push('image')
  if (kind === 'audio') fallbackTags.push('audio')
  if (kind === 'video') fallbackTags.push('video')
  return fallbackTags
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

function isJsonLikeFile(file: File): boolean {
  return file.type === 'application/json' || /\.json$/i.test(file.name)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('资源文件读取失败。'))
    }
    reader.onerror = () => reject(new Error('资源文件读取失败。'))
    reader.readAsDataURL(file)
  })
}
