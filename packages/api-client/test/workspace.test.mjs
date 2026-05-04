import test from 'node:test'
import assert from 'node:assert/strict'

import * as api from '../src/index.ts'

test('fetchSettings parses serialized settings and preserves preset collections', async () => {
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/settings/get') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    assert.deepEqual(JSON.parse(String(init.body)), {})

    return Response.json({
      settings: JSON.stringify({
        username: 'Desktop User',
        main_api: 'openai',
        max_context: 8192,
      }),
      openai_setting_names: ['default'],
      openai_settings: ['{"name":"default"}'],
      themes: [{ name: 'noir' }],
      enable_accounts: true,
    })
  }

  const result = await api.fetchSettings('csrf-token-value')

  assert.equal(result.rawSettings.includes('"username":"Desktop User"'), true)
  assert.equal(result.settings.username, 'Desktop User')
  assert.equal(result.settings.main_api, 'openai')
  assert.equal(result.settings.max_context, 8192)
  assert.deepEqual(result.openai_setting_names, ['default'])
  assert.deepEqual(result.themes, [{ name: 'noir' }])
  assert.equal(result.enable_accounts, true)
})

test('fetchCharacterChats posts the selected avatar and returns chat summaries', async () => {
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/characters/chats') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    assert.deepEqual(JSON.parse(String(init.body)), {
      avatar_url: 'heroine.png',
      metadata: true,
      simple: false,
    })

    return Response.json([
      {
        file_id: 'heroine-session',
        file_name: 'heroine-session.jsonl',
        chat_items: 12,
        mes: 'See you soon.',
        last_mes: '2026-04-20T09:30:00.000Z',
      },
    ])
  }

  const result = await api.fetchCharacterChats({
    avatarUrl: 'heroine.png',
    csrfToken: 'csrf-token-value',
    metadata: true,
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].file_name, 'heroine-session.jsonl')
  assert.equal(result[0].chat_items, 12)
})

test('fetchChat returns an empty list when the backend replies with an object payload', async () => {
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/chats/get') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    assert.deepEqual(JSON.parse(String(init.body)), {
      avatar_url: 'heroine.png',
      file_name: 'missing-chat',
    })

    return Response.json({})
  }

  const result = await api.fetchChat({
    avatarUrl: 'heroine.png',
    csrfToken: 'csrf-token-value',
    fileName: 'missing-chat',
  })

  assert.deepEqual(result, [])
})

test('saveChat posts the serialized chat transcript to the backend', async () => {
  const chat = [
    {
      chat_metadata: {
        integrity: 'chat-integrity-slug',
      },
      character_name: 'unused',
      user_name: 'unused',
    },
    {
      extra: {},
      is_system: false,
      is_user: true,
      mes: 'Hello from desktop.',
      name: 'Desktop User',
      send_date: '2026-04-20T10:00:00.000Z',
    },
  ]

  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/chats/save') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    assert.deepEqual(JSON.parse(String(init.body)), {
      avatar_url: 'heroine.png',
      chat,
      ch_name: 'Heroine',
      file_name: 'heroine-session',
      force: false,
    })

    return Response.json({ ok: true })
  }

  await assert.doesNotReject(() =>
    api.saveChat({
      avatarUrl: 'heroine.png',
      characterName: 'Heroine',
      chat,
      csrfToken: 'csrf-token-value',
      fileName: 'heroine-session',
    }),
  )
})

test('saveChat throws a ChatIntegrityError when the backend detects a conflict', async () => {
  globalThis.fetch = async (input) => {
    if (String(input) !== '/api/chats/save') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    return Response.json(
      {
        error: 'integrity',
      },
      { status: 400 },
    )
  }

  await assert.rejects(
    () =>
      api.saveChat({
        avatarUrl: 'heroine.png',
        characterName: 'Heroine',
        chat: [],
        csrfToken: 'csrf-token-value',
        fileName: 'heroine-session',
      }),
    (error) => {
      assert.ok(error instanceof api.ChatIntegrityError)
      assert.equal(error.message, 'Chat integrity check failed while saving the transcript')
      return true
    },
  )
})

test('fetchWorkspaceBootstrap returns authenticated workspace data', async () => {
  globalThis.fetch = async (input, init = {}) => {
    switch (String(input)) {
      case '/csrf-token':
        return Response.json({ token: 'csrf-token-value' })
      case '/version':
        return Response.json({
          agent: 'node-vtest',
          pkgVersion: '1.16.0',
          serverVersion: '1.16.0-dev',
        })
      case '/api/users/me':
        return Response.json({
          handle: 'desktop-user',
          name: 'Desktop User',
          avatar: null,
          admin: true,
          password: true,
          created: 0,
        })
      case '/api/users/list':
        return Response.json([
          {
            handle: 'desktop-user',
            name: 'Desktop User',
            avatar: null,
            password: true,
            created: 0,
          },
        ])
      case '/api/settings/get':
        assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
        return Response.json({
          settings: JSON.stringify({
            username: 'Desktop User',
            main_api: 'openai',
          }),
          themes: [],
        })
      case '/api/characters/all':
        assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
        return Response.json([
          {
            avatar: 'heroine.png',
            name: 'Heroine',
            description: 'A migrated character card.',
            chat: 'heroine-session',
            date_added: 1,
            date_last_chat: 2,
            chat_size: 3,
            data_size: 4,
          },
        ])
      default:
        throw new Error(`Unexpected request: ${String(input)}`)
    }
  }

  const result = await api.fetchWorkspaceBootstrap()

  assert.equal(result.auth.currentUser?.handle, 'desktop-user')
  assert.equal(result.settings?.settings.username, 'Desktop User')
  assert.equal(result.characters.length, 1)
  assert.equal(result.characters[0].avatar, 'heroine.png')
})

test('fetchWorkspaceBootstrap skips workspace requests when no user session exists', async () => {
  const calls = []

  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input: String(input), init })

    switch (String(input)) {
      case '/csrf-token':
        return Response.json({ token: 'csrf-token-value' })
      case '/version':
        return Response.json({
          agent: 'node-vtest',
          pkgVersion: '1.16.0',
          serverVersion: '1.16.0-dev',
        })
      case '/api/users/me':
        return new Response(null, { status: 403 })
      case '/api/users/list':
        return new Response(null, { status: 204 })
      case '/api/settings/get':
      case '/api/characters/all':
        throw new Error(`Workspace request should be skipped: ${String(input)}`)
      default:
        throw new Error(`Unexpected request: ${String(input)}`)
    }
  }

  const result = await api.fetchWorkspaceBootstrap()

  assert.equal(result.auth.currentUser, null)
  assert.equal(result.settings, null)
  assert.deepEqual(result.characters, [])
  assert.equal(calls.some((entry) => entry.input === '/api/settings/get'), false)
  assert.equal(calls.some((entry) => entry.input === '/api/characters/all'), false)
})
