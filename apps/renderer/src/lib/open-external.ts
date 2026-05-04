export function openExternalUrl(url: string) {
  if (typeof window === 'undefined') {
    return
  }

  const nextUrl = url.trim()
  if (!nextUrl) {
    return
  }

  window.open(nextUrl, '_blank', 'noopener,noreferrer')
}
