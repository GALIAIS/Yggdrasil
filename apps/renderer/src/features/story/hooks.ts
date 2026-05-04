import { useMemo } from 'react'
import type { LibraryDocument } from '@yggdrasil/api-client'

import { useDeleteLibraryDocumentMutation, useLibraryDocumentsQuery, useSaveLibraryDocumentMutation } from '@/features/workspace/hooks'

export const STORY_DOMAIN = 'story'

export type StoryAssetKind = 'chapters' | 'scenes' | 'story_cards' | 'plot_threads'
export type StoryAssetStatus = 'idea' | 'draft' | 'active' | 'paused' | 'complete' | 'archived'

export type LinkedStorySession = {
  avatar?: string | null
  fileId?: string | null
  fileName?: string | null
}

export type StoryAssetPayload = {
  title: string
  status: StoryAssetStatus
  summary: string
  notes: string
  tags: string[]
  chapterId?: string | null
  linkedSession?: LinkedStorySession | null
  priority?: string
  type?: string
  sceneIds?: string[]
}

export type StoryAssetRecord = {
  id: string
  name: string
  document: LibraryDocument
  kind: StoryAssetKind
  payload: StoryAssetPayload
}

export function useStoryDocumentsQuery() {
  return useLibraryDocumentsQuery(STORY_DOMAIN)
}

export function useStorySaveMutation() {
  return useSaveLibraryDocumentMutation()
}

export function useStoryDeleteMutation() {
  return useDeleteLibraryDocumentMutation()
}

export function useStoryAssetRecords(documents: LibraryDocument[] | undefined) {
  return useMemo(() => {
    return (documents ?? [])
      .map((document) => parseStoryAssetDocument(document))
      .filter((record): record is StoryAssetRecord => record !== null)
      .sort(
        (left, right) =>
          (right.document.updatedAt ?? 0) - (left.document.updatedAt ?? 0)
          || left.name.localeCompare(right.name, 'zh-CN'),
      )
  }, [documents])
}

export function parseStoryAssetDocument(document: LibraryDocument): StoryAssetRecord | null {
  if (!isStoryAssetKind(document.kind)) {
    return null
  }

  try {
    const rawPayload =
      document.contentText && document.contentText.trim().length > 0
        ? JSON.parse(document.contentText)
        : {}

    const payload = normalizeStoryPayload(document.name, rawPayload)
    return {
      id: `${document.kind}:${document.name}`,
      name: document.name,
      document,
      kind: document.kind,
      payload,
    }
  } catch {
    return {
      id: `${document.kind}:${document.name}`,
      name: document.name,
      document,
      kind: document.kind,
      payload: normalizeStoryPayload(document.name, {}),
    }
  }
}

export function isStoryAssetKind(value: string): value is StoryAssetKind {
  return value === 'chapters'
    || value === 'scenes'
    || value === 'story_cards'
    || value === 'plot_threads'
}

export function normalizeStoryPayload(name: string, value: unknown): StoryAssetPayload {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : name,
    status: coerceStoryAssetStatus(source.status),
    summary: typeof source.summary === 'string' ? source.summary : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
    tags: normalizeStringArray(source.tags),
    chapterId: typeof source.chapterId === 'string' && source.chapterId.trim() ? source.chapterId.trim() : null,
    linkedSession: normalizeLinkedSession(source.linkedSession),
    priority: typeof source.priority === 'string' ? source.priority : '',
    type: typeof source.type === 'string' ? source.type : '',
    sceneIds: normalizeStringArray(source.sceneIds),
  }
}

function coerceStoryAssetStatus(value: unknown): StoryAssetStatus {
  switch (value) {
    case 'idea':
    case 'draft':
    case 'active':
    case 'paused':
    case 'complete':
    case 'archived':
      return value
    default:
      return 'draft'
  }
}

function normalizeLinkedSession(value: unknown): LinkedStorySession | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Record<string, unknown>
  const avatar = typeof source.avatar === 'string' && source.avatar.trim() ? source.avatar.trim() : null
  const fileId = typeof source.fileId === 'string' && source.fileId.trim() ? source.fileId.trim() : null
  const fileName = typeof source.fileName === 'string' && source.fileName.trim() ? source.fileName.trim() : null

  if (!avatar && !fileId && !fileName) {
    return null
  }

  return { avatar, fileId, fileName }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}
