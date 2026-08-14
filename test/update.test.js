import assert from 'node:assert/strict'
import test from 'node:test'

import { compareVersions, fetchLatestRelease, isNewerVersion, parseVersion } from '../src/update.js'

test('parses conventional release versions', () => {
  assert.deepEqual(parseVersion('v0.2.0'), {
    major: 0,
    minor: 2,
    patch: 0,
    prerelease: [],
  })
  assert.equal(parseVersion('desktop-0.2.0'), null)
})

test('compares stable and prerelease versions', () => {
  assert.equal(compareVersions('0.3.0', '0.2.9'), 1)
  assert.equal(compareVersions('v0.2.0', '0.2.0'), 0)
  assert.equal(compareVersions('0.2.0-beta.2', '0.2.0-beta.1'), 1)
  assert.equal(compareVersions('0.2.0', '0.2.0-beta.2'), 1)
  assert.equal(isNewerVersion('unexpected', '0.2.0'), false)
})

test('returns the latest stable release and a fixed GitHub download page', async () => {
  const calls = []
  const release = await fetchLatestRelease({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ tag_name: 'v0.3.0', draft: false, prerelease: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.github.com/repos/Zhen-WushuiLingchun/dsh-desktop-GUI/releases/latest')
  assert.equal(release.version, '0.3.0')
  assert.equal(release.url, 'https://github.com/Zhen-WushuiLingchun/dsh-desktop-GUI/releases/latest')
})

test('treats a repository without releases as up to date', async () => {
  const release = await fetchLatestRelease({
    fetchImpl: async () => new Response('', { status: 404 }),
  })
  assert.equal(release, null)
})

test('ignores draft, prerelease, and malformed release tags', async () => {
  for (const body of [
    { tag_name: 'v0.3.0', draft: true, prerelease: false },
    { tag_name: 'v0.3.0-beta.1', draft: false, prerelease: true },
    { tag_name: 'latest', draft: false, prerelease: false },
  ]) {
    const release = await fetchLatestRelease({
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }),
    })
    assert.equal(release, null)
  }
})
