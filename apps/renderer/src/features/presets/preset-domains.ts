import type { WorkspaceCatalogEntry } from '@yggdrasil/api-client'

export type PresetDomain =
  | 'openaiPresets'
  | 'novelPresets'
  | 'textgenPresets'
  | 'koboldPresets'
  | 'quickReplies'
  | 'sysprompts'
  | 'contexts'
  | 'instructs'
  | 'reasonings'
  | 'themes'

export type PresetScope = PresetDomain | 'all'

export type PresetDomainConfig = {
  domain: PresetDomain
  kind: string
  labelKey: string
}

export const PRESET_DOMAIN_CONFIGS: PresetDomainConfig[] = [
  { domain: 'textgenPresets', kind: 'textgen-preset', labelKey: 'settingsData.inventory.textgenPresets' },
  { domain: 'openaiPresets', kind: 'openai-preset', labelKey: 'settingsData.inventory.openAiPresets' },
  { domain: 'novelPresets', kind: 'novel-preset', labelKey: 'settingsData.inventory.novelAiPresets' },
  { domain: 'koboldPresets', kind: 'kobold-preset', labelKey: 'settingsData.inventory.koboldPresets' },
  { domain: 'sysprompts', kind: 'sysprompt', labelKey: 'presetsPanel.scopes.sysprompts' },
  { domain: 'contexts', kind: 'context', labelKey: 'presetsPanel.scopes.contexts' },
  { domain: 'instructs', kind: 'instruct', labelKey: 'settingsData.inventory.instructs' },
  { domain: 'reasonings', kind: 'reasoning', labelKey: 'presetsPanel.scopes.reasonings' },
  { domain: 'quickReplies', kind: 'quick-reply', labelKey: 'settingsData.inventory.quickReplies' },
  { domain: 'themes', kind: 'theme', labelKey: 'settingsData.inventory.themes' },
]

export function getPresetDomainConfig(domain: string): PresetDomainConfig | null {
  return PRESET_DOMAIN_CONFIGS.find((item) => item.domain === domain) ?? null
}

export function resolvePresetDomainFromKind(kind: string): PresetDomain | null {
  return PRESET_DOMAIN_CONFIGS.find((item) => item.kind === kind)?.domain ?? null
}

export function buildPresetSectionParams(entry: WorkspaceCatalogEntry): Record<string, string> {
  const params: Record<string, string> = { name: entry.name, kind: entry.kind }
  const domain = resolvePresetDomainFromKind(entry.kind)
  if (domain) {
    params.domain = domain
  }
  return params
}
