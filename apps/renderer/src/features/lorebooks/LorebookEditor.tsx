import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Copy } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { WorkspaceEditorDialog } from '@/components/ui/workspace-editor-dialog'

export interface LorebookEntry {
  id: string
  keys: string[]
  content: string
  comment: string
  enabled: boolean
  selective: boolean
  scanDepth: number
  tokenBudget: number
}

interface LorebookEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (payload: { entries: LorebookEntry[]; name: string }) => void | Promise<void>
  initialName?: string
  initialEntries?: LorebookEntry[]
}

const EMPTY_ENTRIES: LorebookEntry[] = []

function createEmptyLorebookEntry(): LorebookEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    keys: [],
    content: '',
    comment: '',
    enabled: true,
    selective: false,
    scanDepth: 2,
    tokenBudget: 400,
  }
}

export const LorebookEditor: React.FC<LorebookEditorProps> = ({
  open,
  onOpenChange,
  onSave,
  initialName,
  initialEntries,
}) => {
  const { t } = useI18n()
  const entriesSeed = initialEntries ?? EMPTY_ENTRIES
  const [entries, setEntries] = useState<LorebookEntry[]>(entriesSeed)
  const [name, setName] = useState(initialName ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setEntries(entriesSeed)
    setName(initialName ?? '')
    if (entriesSeed.length > 0) {
      setSelectedId(entriesSeed[0].id)
    } else {
      setSelectedId(null)
    }
  }, [entriesSeed, initialName, open])

  const selectedEntry = entries.find((e) => e.id === selectedId)

  const handleAddEntry = () => {
    const newEntry = createEmptyLorebookEntry()
    setEntries([...entries, newEntry])
    setSelectedId(newEntry.id)
  }

  const handleDeleteEntry = (id: string) => {
    const updatedEntries = entries.filter((e) => e.id !== id)
    setEntries(updatedEntries)
    if (selectedId === id) {
      setSelectedId(updatedEntries.length > 0 ? updatedEntries[0].id : null)
    }
  }

  const handleDuplicateEntry = (id: string) => {
    const entry = entries.find((e) => e.id === id)
    if (entry) {
      const newEntry: LorebookEntry = {
        ...entry,
        id: `entry-${Date.now()}`,
      }
      setEntries([...entries, newEntry])
      setSelectedId(newEntry.id)
    }
  }

  const updateSelectedEntry = (updates: Partial<LorebookEntry>) => {
    setEntries(
      entries.map((e) => (e.id === selectedId ? { ...e, ...updates } : e))
    )
  }

  const handleKeysChange = (value: string) => {
    const keys = value
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
    updateSelectedEntry({ keys })
  }

  const handleSave = () => {
    void onSave({
      entries,
      name,
    })
  }

  return (
    <WorkspaceEditorDialog
      bodyClassName="h-[calc(min(84vh,940px)-124px)] overflow-hidden p-0"
      description={t('lorebookEditor.description')}
      footer={(
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t('common.cancel')}
          </Button>
          <Button disabled={!name.trim()} onClick={handleSave} type="button">
            {t('lorebookEditor.saveEntries')}
          </Button>
        </>
      )}
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton
      style={{
        width: 'min(1540px, calc(100vw - 40px))',
        maxWidth: 'min(1540px, calc(100vw - 40px))',
        height: 'min(84vh, 940px)',
      }}
      title={t('lorebookEditor.title')}
    >
      <div className="grid h-full min-h-0 w-full overflow-hidden [grid-template-columns:380px_minmax(0,1fr)] max-[1240px]:[grid-template-columns:minmax(0,1fr)]">
          {/* Entries List */}
          <div className="flex min-h-[320px] min-w-0 flex-col border-r border-[rgba(120,92,55,0.34)] max-[1240px]:min-h-[260px] max-[1240px]:border-r-0 max-[1240px]:border-b">
            <div className="flex items-center justify-between border-b border-[rgba(120,92,55,0.34)] px-5 py-4">
              <h3 className="font-semibold text-sm">{t('lorebookEditor.entries')}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddEntry}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t('lorebookEditor.addEntry')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-0 py-0">
              {entries.length === 0 ? (
                <div className="grid min-h-[320px] place-items-center px-6 py-8 text-center text-sm text-gray-500">
                  {t('lorebookEditor.noEntries')}
                </div>
              ) : (
                <div className="divide-y">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedId(entry.id)}
                      className={`w-full border-l-2 px-5 py-3 text-left text-sm transition-colors ${
                        selectedId === entry.id
                          ? 'border-l-amber-400 bg-[rgba(214,171,96,0.12)]'
                          : 'border-l-transparent hover:bg-[rgba(255,245,222,0.04)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 truncate">
                          <div className="font-medium truncate">
                            {entry.keys.length > 0
                              ? entry.keys.join(', ')
                              : t('lorebookEditor.noKeys')}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {entry.content.substring(0, 40) || t('lorebookEditor.emptyContent')}
                          </div>
                        </div>
                        {!entry.enabled && (
                          <div className="whitespace-nowrap rounded-sm border border-[rgba(120,92,55,0.4)] bg-[rgba(255,245,222,0.06)] px-2 py-1 text-xs text-stone-300">
                            {t('common.disabled')}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Entry Editor */}
          <div className="min-h-0 min-w-0 overflow-hidden px-6 py-5">
            <div className="grid h-full min-h-0 gap-6 [grid-template-columns:minmax(0,1fr)_320px] max-[1360px]:[grid-template-columns:minmax(0,1fr)]">
              <div className="flex min-h-0 min-w-0 flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lorebookName">{t('lorebookEditor.fields.name')}</Label>
                  <Input
                    id="lorebookName"
                    placeholder={t('lorebookEditor.placeholders.name')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {selectedEntry ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="keys">{t('lorebookEditor.fields.keys')}</Label>
                      <Input
                        id="keys"
                        placeholder={t('lorebookEditor.placeholders.keys')}
                        value={selectedEntry.keys.join(', ')}
                        onChange={(e) => handleKeysChange(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content">{t('lorebookEditor.fields.content')} *</Label>
                      <Textarea
                        id="content"
                        className="min-h-[260px] flex-1 resize-y"
                        placeholder={t('lorebookEditor.placeholders.content')}
                        value={selectedEntry.content}
                        onChange={(e) =>
                          updateSelectedEntry({ content: e.target.value })
                        }
                        rows={12}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-sm border border-[rgba(120,92,55,0.34)] bg-[rgba(255,245,222,0.03)] px-8 text-center text-sm text-gray-500">
                    {t('lorebookEditor.noSelection')}
                  </div>
                )}
              </div>

              <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
                {selectedEntry ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="comment">{t('lorebookEditor.fields.comment')}</Label>
                      <Input
                        id="comment"
                        placeholder={t('lorebookEditor.placeholders.comment')}
                        value={selectedEntry.comment}
                        onChange={(e) =>
                          updateSelectedEntry({ comment: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="scanDepth">{t('lorebookEditor.fields.scanDepth')}</Label>
                        <Select
                          value={selectedEntry.scanDepth.toString()}
                          onValueChange={(val) =>
                            updateSelectedEntry({ scanDepth: parseInt(val, 10) })
                          }
                        >
                          <SelectTrigger id="scanDepth">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((depth) => (
                              <SelectItem key={depth} value={depth.toString()}>
                                {depth}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tokenBudget">{t('lorebookEditor.fields.tokenBudget')}</Label>
                        <Input
                          id="tokenBudget"
                          type="number"
                          min="0"
                          step="100"
                          value={selectedEntry.tokenBudget}
                          onChange={(e) =>
                            updateSelectedEntry({
                              tokenBudget: parseInt(e.target.value, 10) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-[rgba(120,92,55,0.34)] pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="enabled">{t('lorebookEditor.fields.enabled')}</Label>
                        <Switch
                          id="enabled"
                          checked={selectedEntry.enabled}
                          onCheckedChange={(checked) =>
                            updateSelectedEntry({ enabled: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="selective">{t('lorebookEditor.fields.selective')}</Label>
                        <Switch
                          id="selective"
                          checked={selectedEntry.selective}
                          onCheckedChange={(checked) =>
                            updateSelectedEntry({ selective: checked })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-[rgba(120,92,55,0.34)] pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicateEntry(selectedEntry.id)}
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        {t('lorebookEditor.duplicate')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteEntry(selectedEntry.id)}
                        className="ml-auto gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('lorebookEditor.delete')}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
      </div>
    </WorkspaceEditorDialog>
  )
}
