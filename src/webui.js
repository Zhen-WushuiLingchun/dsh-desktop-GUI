/** Pure DSH WebUI readiness and navigation helpers for the Electron main process. */

const DSH_BOOT_SCRIPT = /<script(?:\s[^>]*)?>\s*window\.__DSH_BOOT__\s*=/i
const ROOT_ELEMENT = /<div\s+[^>]*id=["']root["'][^>]*>/i

/**
 * Return whether one HTTP body is a complete DSH WebUI document.
 * @param {string} body - response body to validate.
 * @param {string | null} contentType - response Content-Type header.
 * @returns {boolean} true only for a complete HTML shell with the DSH boot script.
 */
export function isDshWebUiDocument(body, contentType) {
  if (!String(contentType ?? '').toLowerCase().startsWith('text/html')) return false
  if (!/^\s*<!doctype html>/i.test(body) || !/<\/html>\s*$/i.test(body)) return false

  const lower = body.toLowerCase()
  const headOpen = lower.indexOf('<head')
  const headClose = lower.indexOf('</head>')
  const bodyOpen = lower.indexOf('<body')
  const bodyClose = lower.indexOf('</body>')
  if (!(headOpen >= 0 && headOpen < headClose && headClose < bodyOpen && bodyOpen < bodyClose)) return false

  const scriptOpenCount = [...body.matchAll(/<script(?=\s|>)/gi)].length
  const scriptCloseCount = [...body.matchAll(/<\/script>/gi)].length
  return scriptOpenCount > 0
    && scriptOpenCount === scriptCloseCount
    && DSH_BOOT_SCRIPT.test(body)
    && ROOT_ELEMENT.test(body)
}

/**
 * Probe an HTTP endpoint without accepting partial or plain-text boot output.
 * @param {string} url - candidate DSH WebUI URL.
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} options - injectable request dependencies.
 * @returns {Promise<boolean>} whether the endpoint serves a complete DSH WebUI document.
 */
export async function probeDshServer(url, { fetchImpl = fetch, timeoutMs = 1_500 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return false
    const body = await response.text()
    return isDshWebUiDocument(body, response.headers.get('content-type'))
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Add a one-navigation cache key without changing the DSH route pathname.
 * @param {string} url - DSH WebUI root URL.
 * @param {string} token - unique token for this native navigation.
 * @returns {string} cache-bypassing URL.
 */
export function dshNavigationUrl(url, token) {
  const target = new URL(url)
  target.searchParams.set('_dsh_desktop_boot', token)
  return target.href
}
