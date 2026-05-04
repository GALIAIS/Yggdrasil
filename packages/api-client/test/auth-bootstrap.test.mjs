import test from 'node:test'
import assert from 'node:assert/strict'

import * as api from '../src/index.ts'

test('fetchCurrentUser returns null when the backend reports 403', async () => {
  const calls = []

  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input: String(input), init })

    if (String(input) === '/api/users/me') {
      return new Response(null, { status: 403 })
    }

    throw new Error(`Unexpected request: ${String(input)}`)
  }

  const currentUser = await api.fetchCurrentUser()

  assert.equal(currentUser, null)
  assert.equal(calls[0].init.credentials, 'include')
})

test('fetchAuthBootstrap returns backend info, current user, and login candidates', async () => {
  const csrfToken = 'csrf-token-value'

  globalThis.fetch = async (input, init = {}) => {
    switch (String(input)) {
      case '/csrf-token':
        return Response.json({ token: csrfToken })
      case '/version':
        return Response.json({
          agent: 'node-vtest',
          pkgVersion: '1.16.0',
          serverVersion: '1.16.0-dev',
        })
      case '/api/users/me':
        return Response.json({
          handle: 'default-user',
          name: 'Default User',
          avatar: null,
          admin: false,
          password: false,
          created: 0,
        })
      case '/api/users/list':
        assert.equal(init.method, 'POST')
        assert.equal(new Headers(init.headers).get('X-CSRF-Token'), csrfToken)
        return Response.json([
          {
            handle: 'default-user',
            name: 'Default User',
            avatar: null,
            password: false,
            created: 0,
          },
        ])
      default:
        throw new Error(`Unexpected request: ${String(input)}`)
    }
  }

  const bootstrap = await api.fetchAuthBootstrap()

  assert.equal(bootstrap.csrfToken, csrfToken)
  assert.equal(bootstrap.backend.pkgVersion, '1.16.0')
  assert.equal(bootstrap.currentUser?.handle, 'default-user')
  assert.equal(bootstrap.availableUsers.length, 1)
  assert.equal(bootstrap.discreetLogin, false)
})

test('fetchAuthBootstrap marks discreet login when the backend hides the user list', async () => {
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
        return new Response(null, { status: 403 })
      case '/api/users/list':
        assert.equal(init.method, 'POST')
        return new Response(null, { status: 204 })
      default:
        throw new Error(`Unexpected request: ${String(input)}`)
    }
  }

  const bootstrap = await api.fetchAuthBootstrap()

  assert.equal(bootstrap.currentUser, null)
  assert.equal(bootstrap.availableUsers.length, 0)
  assert.equal(bootstrap.discreetLogin, true)
})

test('login posts credentials and returns the logged-in handle', async () => {
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/users/login') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    assert.deepEqual(JSON.parse(String(init.body)), {
      handle: 'default-user',
      password: 'secret',
    })

    return Response.json({ handle: 'default-user' })
  }

  const result = await api.login({
    handle: 'default-user',
    password: 'secret',
    csrfToken: 'csrf-token-value',
  })

  assert.equal(result.handle, 'default-user')
})

test('logout posts the CSRF token and resolves on 204', async () => {
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== '/api/users/logout') {
      throw new Error(`Unexpected request: ${String(input)}`)
    }

    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('X-CSRF-Token'), 'csrf-token-value')
    return new Response(null, { status: 204 })
  }

  await assert.doesNotReject(() =>
    api.logout({
      csrfToken: 'csrf-token-value',
    }),
  )
})
