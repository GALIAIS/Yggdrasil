export type JsonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type JsonRequestOptions = {
  body?: unknown
  csrfToken?: string
  headers?: HeadersInit
  method?: JsonMethod
  omitContentType?: boolean
  signal?: AbortSignal
}

export async function request(
  input: string | URL,
  {
    body,
    csrfToken,
    headers,
    method = 'GET',
    omitContentType = false,
    signal,
  }: JsonRequestOptions = {},
): Promise<Response> {
  const nextHeaders = new Headers(headers)

  if (!omitContentType) {
    nextHeaders.set('Content-Type', 'application/json')
  }

  if (csrfToken) {
    nextHeaders.set('X-CSRF-Token', csrfToken)
  }

  const response = await fetch(input, {
    method,
    headers: nextHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
    signal,
  })

  return response
}

function assertOk(response: Response, input: string | URL) {
  if (!response.ok) {
    throw new Error(`Request to ${String(input)} failed with status ${response.status}`)
  }
}

export async function requestJson<T>(
  input: string | URL,
  options: JsonRequestOptions = {},
): Promise<T> {
  const response = await request(input, options)
  assertOk(response, input)

  return (await response.json()) as T
}

export async function requestText(
  input: string | URL,
  {
    headers,
    method = 'GET',
    signal,
  }: Pick<JsonRequestOptions, 'headers' | 'method' | 'signal'> = {},
): Promise<string> {
  const response = await request(input, {
    method,
    headers,
    omitContentType: true,
    signal,
  })
  assertOk(response, input)

  return response.text()
}

export async function requestVoid(
  input: string | URL,
  options: JsonRequestOptions = {},
): Promise<void> {
  const response = await request(input, options)
  assertOk(response, input)
}
