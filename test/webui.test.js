import assert from 'node:assert/strict'
import test from 'node:test'

import { dshNavigationUrl, isDshWebUiDocument, probeDshServer } from '../src/webui.js'

const VALID_DOCUMENT = `<!doctype html>
<html lang="zh-CN">
  <head><script>window.__DSH_BOOT__ = {"rev":"ok","entries":[]}</script></head>
  <body><script>document.body.dataset.ready = "true"</script><div id="root"></div></body>
</html>`

test('recognizes only a complete HTML DSH shell', () => {
  assert.equal(isDshWebUiDocument(VALID_DOCUMENT, 'text/html; charset=utf-8'), true)
  assert.equal(isDshWebUiDocument('window.__DSH_BOOT__ = {"rev":"partial"}', 'text/plain'), false)
  assert.equal(isDshWebUiDocument(VALID_DOCUMENT.replace('</script>', ''), 'text/html'), false)
  assert.equal(isDshWebUiDocument(VALID_DOCUMENT.replace('<div id="root"></div>', ''), 'text/html'), false)
})

test('probe rejects a successful response containing raw boot text', async () => {
  const fetchImpl = async () => new Response('window.__DSH_BOOT__ = {"rev":"partial"}', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
  assert.equal(await probeDshServer('http://127.0.0.1:3080', { fetchImpl }), false)
})

test('probe accepts a complete DSH document and disables request caching', async () => {
  let observedOptions
  const fetchImpl = async (_url, options) => {
    observedOptions = options
    return new Response(VALID_DOCUMENT, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  assert.equal(await probeDshServer('http://127.0.0.1:3080', { fetchImpl }), true)
  assert.equal(observedOptions.cache, 'no-store')
  assert.equal(observedOptions.method, 'GET')
})

test('navigation URL bypasses an old root cache entry without changing the route', () => {
  const result = new URL(dshNavigationUrl('http://127.0.0.1:3080?existing=1', 'cold-boot'))
  assert.equal(result.pathname, '/')
  assert.equal(result.searchParams.get('existing'), '1')
  assert.equal(result.searchParams.get('_dsh_desktop_boot'), 'cold-boot')
})
