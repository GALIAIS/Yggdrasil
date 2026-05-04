/**
 * Streaming request utility for handling Server-Sent Events (SSE) from the backend.
 * Supports multiple response formats including OpenAI-style SSE and generic text completion.
 */

export interface StreamChunk {
  /** The text delta to append to the streaming response */
  delta: string
  /** Whether the stream has completed */
  done: boolean
  /** Optional metadata from the response */
  meta?: Record<string, unknown>
}

export type StreamChunkCallback = (chunk: StreamChunk) => void

export interface StreamRequestOptions {
  /** The URL to stream from */
  url: string
  /** HTTP method (default: POST) */
  method?: 'POST' | 'GET'
  /** Request headers */
  headers?: Record<string, string>
  /** Request body */
  body?: unknown
  /** AbortSignal for cancellation */
  signal?: AbortSignal
  /** Callback invoked for each streamed chunk */
  onChunk: StreamChunkCallback
}

/**
 * Attempts to extract delta text from various response formats
 */
function extractDeltaFromResponse(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return ''
  }

  const obj = data as Record<string, unknown>

  // OpenAI-style format: { choices: [{ delta: { content: "..." } }] }
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choice = obj.choices[0] as Record<string, unknown>
    if (choice.delta && typeof choice.delta === 'object') {
      const delta = choice.delta as Record<string, unknown>
      if (typeof delta.content === 'string') {
        return delta.content
      }
    }
  }

  // Text completion style: { text: "..." }
  if (typeof obj.text === 'string') {
    return obj.text
  }

  // Direct delta field: { delta: "..." }
  if (typeof obj.delta === 'string') {
    return obj.delta
  }

  // Fallback: try common field names
  if (typeof obj.content === 'string') {
    return obj.content
  }
  if (typeof obj.message === 'string') {
    return obj.message
  }

  return ''
}

/**
 * Makes a streaming fetch request and parses SSE format responses.
 * Handles connection state changes and parsing errors gracefully.
 *
 * @param options - Configuration for the streaming request
 * @returns Promise that resolves when the stream ends
 * @throws Error if the initial fetch fails or parsing encounters unrecoverable issues
 */
export async function requestStream(options: StreamRequestOptions): Promise<void> {
  const {
    url,
    method = 'POST',
    headers = {},
    body,
    signal,
    onChunk,
  } = options

  const requestHeaders: Record<string, string> = {
    'Accept': 'text/event-stream',
    ...headers,
  }

  // Don't set Content-Type for GET requests
  if (method !== 'GET' && body && !headers['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  const fetchInit: RequestInit = {
    method,
    headers: requestHeaders,
    signal,
  }

  if (body && method !== 'GET') {
    fetchInit.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(url, fetchInit)

  if (!response.ok) {
    throw new Error(
      `Streaming request failed with status ${response.status}: ${response.statusText}`
    )
  }

  if (!response.body) {
    throw new Error('Response body is not readable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        // Flush any remaining data in the buffer
        if (buffer.trim()) {
          processSseLine(buffer, onChunk)
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')

      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1]

      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]
        if (line.trim()) {
          processSseLine(line, onChunk)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Processes a single SSE line and calls the onChunk callback if it contains data
 */
function processSseLine(line: string, onChunk: StreamChunkCallback): void {
  const trimmed = line.trim()

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith(':')) {
    return
  }

  // Check for [DONE] token (used by some implementations)
  if (trimmed === '[DONE]' || trimmed === 'data: [DONE]') {
    onChunk({
      delta: '',
      done: true,
    })
    return
  }

  // Parse SSE data format
  if (trimmed.startsWith('data: ')) {
    const dataStr = trimmed.slice(6)

    // Handle multiple data: lines for a single event
    if (!dataStr) {
      return
    }

    try {
      const parsed = JSON.parse(dataStr)
      const delta = extractDeltaFromResponse(parsed)

      // Only emit if we extracted meaningful content
      if (delta || parsed.done || parsed.finished) {
        onChunk({
          delta,
          done: parsed.done === true || parsed.finished === true,
          meta: parsed,
        })
      }
    } catch {
      // Log parse errors but don't fail the stream
      console.warn(`Failed to parse SSE data: ${dataStr}`)
    }
  }
}
