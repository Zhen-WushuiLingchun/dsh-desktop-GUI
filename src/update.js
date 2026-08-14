const DEFAULT_REPOSITORY = 'Zhen-WushuiLingchun/dsh-desktop-GUI'
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

function parseIdentifier(value) {
  return /^\d+$/.test(value) ? Number(value) : value
}

/** Parse a conventional GitHub release tag such as v0.2.0. */
export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim())
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.').map(parseIdentifier) ?? [],
  }
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1
    if (right[index] === undefined) return 1
    if (left[index] === right[index]) continue
    if (typeof left[index] === 'number' && typeof right[index] === 'string') return -1
    if (typeof left[index] === 'string' && typeof right[index] === 'number') return 1
    return left[index] > right[index] ? 1 : -1
  }
  return 0
}

/** Compare two semantic versions. Invalid inputs raise a TypeError. */
export function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue)
  const right = parseVersion(rightValue)
  if (left === null || right === null) {
    throw new TypeError(`Invalid version comparison: ${leftValue} / ${rightValue}`)
  }

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

export function isNewerVersion(candidate, current) {
  try {
    return compareVersions(candidate, current) > 0
  } catch {
    return false
  }
}

/** Query the latest stable GitHub Release without downloading any artifact. */
export async function fetchLatestRelease({
  fetchImpl = fetch,
  repository = DEFAULT_REPOSITORY,
  signal,
  userAgent = 'DSH-Desktop',
} = {}) {
  const endpoint = `https://api.github.com/repos/${repository}/releases/latest`
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': userAgent,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal,
  })

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub release check failed with HTTP ${response.status}.`)

  const release = await response.json()
  if (release?.draft || release?.prerelease || parseVersion(release?.tag_name) === null) return null
  return {
    version: String(release.tag_name).replace(/^v/, ''),
    tagName: String(release.tag_name),
    url: `https://github.com/${repository}/releases/latest`,
  }
}
