import type { CharacterSummary } from '@yggdrasil/api-client'

export function getCharacterName(character: CharacterSummary | null): string {
  return typeof character?.name === 'string' && character.name
    ? character.name
    : typeof character?.avatar === 'string' && character.avatar
      ? character.avatar.replace(/\.png$/i, '')
      : 'Unnamed Character'
}

export function getCharacterSummary(character: CharacterSummary | null): string {
  const fields = [character?.description, character?.scenario, character?.personality]

  for (const field of fields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim()
    }
  }

  return '暂无描述或场景信息。'
}

export function resolveSelectedCharacterAvatar(
  characters: CharacterSummary[],
  current: string,
): string {
  const availableAvatars = characters
    .map((item) => (typeof item.avatar === 'string' ? item.avatar : ''))
    .filter(Boolean)

  if (current && availableAvatars.includes(current)) {
    return current
  }

  return availableAvatars[0] ?? ''
}
