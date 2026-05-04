import type { AppSettings } from '@yggdrasil/api-client'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function getAvatarSrc(avatar: string): string {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return ''
  }

  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
}

export function formatDateTime(value: number | string | undefined): string {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return '未知时间'
  }

  return dateTimeFormatter.format(timestamp)
}

export function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '0 B'
  }

  if (value < 1024) {
    return `${Math.round(value)} B`
  }

  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function formatChatStamp(value: Date): string {
  return (
    [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-') +
    ' ' +
    [
      String(value.getHours()).padStart(2, '0'),
      String(value.getMinutes()).padStart(2, '0'),
      String(value.getSeconds()).padStart(2, '0'),
    ].join('-')
  )
}

export function toTimestamp(value: number | string | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

export function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }

  if (typeof cause === 'string' && cause.trim()) {
    return cause
  }

  if (cause && typeof cause === 'object') {
    const message = Reflect.get(cause, 'message')
    if (typeof message === 'string' && message.trim()) {
      return message
    }

    const error = Reflect.get(cause, 'error')
    if (typeof error === 'string' && error.trim()) {
      return error
    }

    const causeValue = Reflect.get(cause, 'cause')
    if (typeof causeValue === 'string' && causeValue.trim()) {
      return causeValue
    }

    try {
      const serialized = JSON.stringify(cause)
      if (serialized && serialized !== '{}') {
        return serialized
      }
    } catch {
      // ignore serialization errors and fall through
    }
  }

  return 'Unknown backend error'
}

export function stringifySettingValue(value: AppSettings[keyof AppSettings]): string {
  if (value === undefined || value === null || value === '') {
    return '未配置'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

export function formatProtocolLabel(protocol: string | undefined | null): string {
  const value = typeof protocol === 'string' ? protocol.trim() : ''
  if (!value) return '未配置'

  switch (value) {
    case 'openai_chat_completions':
      return 'OpenAI Chat Completions'
    case 'openai_responses':
      return 'OpenAI Responses'
    case 'openai_responses_compact':
      return 'OpenAI Responses Compact'
    case 'anthropic_messages':
      return 'Anthropic Messages'
    case 'gemini_generate_content':
      return 'Gemini Generate Content'
    case 'openai_embeddings':
      return 'OpenAI Embeddings'
    case 'ollama_chat':
      return 'Ollama Chat'
    case 'ollama_embeddings':
      return 'Ollama Embeddings'
    case 'jina_rerank':
      return 'Jina Rerank'
    case 'openai_image_generations':
      return 'OpenAI Image Generations'
    default:
      return value
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => {
          const lower = part.toLowerCase()
          if (lower === 'openai') return 'OpenAI'
          if (lower === 'api') return 'API'
          if (lower === 'url') return 'URL'
          if (lower === 'id') return 'ID'
          return lower.charAt(0).toUpperCase() + lower.slice(1)
        })
        .join(' ')
    }
}
