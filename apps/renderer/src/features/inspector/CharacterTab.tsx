import { useEffect, useState } from 'react'
import type { CharacterSummary } from '@yggdrasil/api-client'

import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

export interface CharacterTabProps {
  character: CharacterSummary | null
  onFieldChange?: (field: string, value: string) => void
}

export function CharacterTab({
  character,
  onFieldChange,
}: CharacterTabProps) {
  const { t } = useI18n()
  const isEditable = typeof onFieldChange === 'function'
  const editableFields = [
    { key: 'description', label: t('characterTab.fields.description') },
    { key: 'personality', label: t('characterTab.fields.personality') },
    { key: 'scenario', label: t('characterTab.fields.scenario') },
    { key: 'first_mes', label: t('characterTab.fields.firstMessage') },
    { key: 'mes_example', label: t('characterTab.fields.exampleMessages') },
    { key: 'system_prompt', label: t('characterEditor.fields.systemPrompt') },
    { key: 'post_history_instructions', label: t('characterEditor.fields.postHistoryInstructions') },
    { key: 'alternate_greetings', label: t('characterEditor.fields.alternateGreetings') },
  ] as const

  const rawExampleDialogue = character?.mes_example as unknown
  const exampleDialogue =
    typeof rawExampleDialogue === 'string'
      ? rawExampleDialogue
      : Array.isArray(rawExampleDialogue)
        ? rawExampleDialogue
            .filter((item): item is string => typeof item === 'string')
            .join('\n')
        : ''
  const alternateGreetings = Array.isArray(character?.alternate_greetings)
    ? character.alternate_greetings
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('\n')
    : ''
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    createFieldValues(character, exampleDialogue, alternateGreetings),
  )

  useEffect(() => {
    setFieldValues(createFieldValues(character, exampleDialogue, alternateGreetings))
  }, [character, exampleDialogue, alternateGreetings])

  if (!character) {
    return (
      <div className="ref-inspector-scroll">
        <div className="ref-inspector-panel">
          <div className="ref-inspector-head">
            <span>{t('inspector.character')}</span>
            <strong>{t('characterTab.none')}</strong>
          </div>
          <div className="ref-inspector-body-block">
            <div className="ref-inspector-row">
              <span>{t('characterTab.noCharacterSelected')}</span>
              <strong>—</strong>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ref-inspector-scroll">
      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{character.name || t('common.character')}</span>
          <strong>{isEditable ? t('characterTab.editable') : t('characterTab.readOnly')}</strong>
        </div>
        <div className="ref-inspector-body-block">
          {editableFields.map((field) => (
            <div className="ref-character-field" key={field.key}>
              <div className="ref-inspector-row">
                <span>{field.label}</span>
                <strong>{(fieldValues[field.key] || '').length}</strong>
              </div>
              <Textarea
                className="ref-character-textarea"
                onBlur={() => onFieldChange?.(field.key, fieldValues[field.key] || '')}
                onChange={(event) =>
                  setFieldValues((previous) => ({
                    ...previous,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={isEditable ? t('characterTab.placeholder', { field: field.label.toLowerCase() }) : undefined}
                readOnly={!isEditable}
                value={fieldValues[field.key] || ''}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function createFieldValues(
  character: CharacterSummary | null,
  exampleDialogue: string,
  alternateGreetings: string,
): Record<string, string> {
  return {
    description: character?.description || '',
    personality: character?.personality || '',
    scenario: character?.scenario || '',
    first_mes: character?.first_mes || '',
    mes_example: exampleDialogue,
    system_prompt: typeof character?.system_prompt === 'string' ? character.system_prompt : '',
    post_history_instructions:
      typeof character?.post_history_instructions === 'string' ? character.post_history_instructions : '',
    alternate_greetings: alternateGreetings,
  }
}
