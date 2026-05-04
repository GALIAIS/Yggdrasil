export interface ImportedCharacterDraft {
  alternate_greetings?: string[]
  avatar_data_url?: string
  description?: string
  first_mes?: string
  mes_example?: string
  name: string
  personality?: string
  post_history_instructions?: string
  scenario?: string
  system_prompt?: string
}

type CharacterRecord = Record<string, unknown>

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export async function importCharacterFile(file: File): Promise<ImportedCharacterDraft> {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.json')) {
    return parseCharacterJson(await file.text(), file.name)
  }

  if (lowerName.endsWith('.png')) {
    return parseCharacterPng(file)
  }

  throw new Error(`暂不支持的角色导入格式：${file.name}`)
}

export function parseCharacterJson(raw: string, fileName = 'character.json'): ImportedCharacterDraft {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`角色文件 ${fileName} 不是有效的 JSON。`)
  }

  return normalizeImportedCharacter(parsed, stripExtension(fileName))
}

export function parseCharacterSpec(data: unknown, fallbackName: string): ImportedCharacterDraft {
  return normalizeImportedCharacter(data, fallbackName)
}

async function parseCharacterPng(file: File): Promise<ImportedCharacterDraft> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasPngSignature(bytes)) {
    throw new Error(`角色文件 ${file.name} 不是有效的 PNG。`)
  }

  const textChunks = extractPngTextChunks(bytes)
  const charaRaw = textChunks.get('chara')
  const dataUrl = await readFileAsDataUrl(file)

  if (typeof charaRaw === 'string' && charaRaw.trim()) {
    const decoded = decodeCharacterChunk(charaRaw.trim())
    const parsed = JSON.parse(decoded) as unknown
    return {
      ...normalizeImportedCharacter(parsed, stripExtension(file.name)),
      avatar_data_url: dataUrl,
    }
  }

  return {
    name: stripExtension(file.name),
    avatar_data_url: dataUrl,
    description: 'Imported from PNG avatar card.',
  }
}

function normalizeImportedCharacter(data: unknown, fallbackName: string): ImportedCharacterDraft {
  const record = resolveCharacterRecord(data)
  const dataRecord = resolveNestedCharacterRecord(record)

  const name = readString(dataRecord, ['name']) || readString(record, ['name']) || fallbackName
  if (!name.trim()) {
    throw new Error('角色导入失败：缺少名称。')
  }

  const alternateGreetings = readStringList(dataRecord, [
    ['alternate_greetings'],
    ['alternateGreetings'],
    ['alternate_greetings_json'],
  ])

  return {
    name: name.trim(),
    description: readString(dataRecord, ['description']) || readString(record, ['description']) || '',
    personality: readString(dataRecord, ['personality']) || '',
    scenario: readString(dataRecord, ['scenario']) || '',
    first_mes:
      readString(dataRecord, ['first_mes', 'firstMessage']) ||
      readString(record, ['first_mes', 'firstMessage']) ||
      '',
    mes_example:
      readString(dataRecord, ['mes_example', 'example_dialogue', 'exampleMessages']) ||
      readString(record, ['mes_example', 'example_dialogue', 'exampleMessages']) ||
      '',
    system_prompt:
      readString(dataRecord, ['system_prompt', 'systemPrompt']) ||
      readString(record, ['system_prompt', 'systemPrompt']) ||
      '',
    post_history_instructions:
      readString(dataRecord, ['post_history_instructions', 'postHistoryInstructions']) ||
      readString(record, ['post_history_instructions', 'postHistoryInstructions']) ||
      '',
    alternate_greetings: alternateGreetings,
  }
}

function resolveCharacterRecord(data: unknown): CharacterRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('角色导入失败：文件结构不符合预期。')
  }
  return data as CharacterRecord
}

function resolveNestedCharacterRecord(record: CharacterRecord): CharacterRecord {
  const candidateKeys = ['data', 'character', 'chara', 'json_data']
  for (const key of candidateKeys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as CharacterRecord
    }
  }
  return record
}

function readString(record: CharacterRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function readStringList(record: CharacterRecord, keyGroups: string[][]): string[] {
  for (const group of keyGroups) {
    const value = record[group[0]]
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        }
      } catch {
        return [value.trim()]
      }
    }
  }
  return []
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value)
}

function extractPngTextChunks(bytes: Uint8Array): Map<string, string> {
  const chunks = new Map<string, string>()
  let offset = 8

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const type = decodeAscii(bytes.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) {
      break
    }

    if (type === 'tEXt') {
      const chunk = bytes.subarray(dataStart, dataEnd)
      const separatorIndex = chunk.indexOf(0)
      if (separatorIndex > 0) {
        const key = decodeAscii(chunk.subarray(0, separatorIndex))
        const value = decodeUtf8(chunk.subarray(separatorIndex + 1))
        if (key && value) {
          chunks.set(key, value)
        }
      }
    }

    if (type === 'IEND') {
      break
    }

    offset = dataEnd + 4
  }

  return chunks
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0
}

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function decodeCharacterChunk(value: string): string {
  try {
    return decodeBase64(value)
  } catch {
    return value
  }
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  throw new Error('Base64 decoder unavailable')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('角色头像读取失败。'))
    }
    reader.onerror = () => reject(new Error('角色头像读取失败。'))
    reader.readAsDataURL(file)
  })
}
