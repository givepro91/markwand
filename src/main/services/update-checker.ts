import type { UpdateCheckResult } from '../../preload/types'

const RELEASES_API_URL = 'https://api.github.com/repos/givepro91/markwand/releases'
const RELEASES_PAGE_URL = 'https://github.com/givepro91/markwand/releases'

interface FetchResponseLike {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type FetchLike = (url: string, init?: {
  headers?: Record<string, string>
  signal?: AbortSignal
}) => Promise<FetchResponseLike>

interface UpdateCheckerDeps {
  fetch?: FetchLike
  now?: () => number
}

interface ReleaseLike {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  body?: unknown
  assets?: unknown
  draft?: unknown
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

function parseVersion(raw: string): ParsedVersion | null {
  const cleaned = raw.trim().replace(/^v/i, '').split('+')[0]
  const hyphenIndex = cleaned.indexOf('-')
  const core = hyphenIndex >= 0 ? cleaned.slice(0, hyphenIndex) : cleaned
  const prereleaseRaw = hyphenIndex >= 0 ? cleaned.slice(hyphenIndex + 1) : ''
  const parts = core.split('.').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null
  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    prerelease: prereleaseRaw ? prereleaseRaw.split('.').filter(Boolean) : [],
  }
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const leftNumber = /^\d+$/.test(left) ? Number(left) : null
    const rightNumber = /^\d+$/.test(right) ? Number(right) : null
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber > rightNumber ? 1 : -1
    }
    if (leftNumber !== null && rightNumber === null) return -1
    if (leftNumber === null && rightNumber !== null) return 1
    if (left !== right) return left > right ? 1 : -1
  }
  return 0
}

export function compareReleaseVersions(leftRaw: string, rightRaw: string): number {
  const left = parseVersion(leftRaw)
  const right = parseVersion(rightRaw)
  if (!left || !right) return 0
  if (left.major !== right.major) return left.major > right.major ? 1 : -1
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1
  return comparePrerelease(left.prerelease, right.prerelease)
}

function isParseableVersion(raw: string): boolean {
  return parseVersion(raw) !== null
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}

function releaseFromUnknown(value: unknown): ReleaseLike[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ReleaseLike => typeof item === 'object' && item !== null)
}

function downloadUrlFromAssets(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const assets = value
    .filter((item): item is { name?: unknown; browser_download_url: string } => (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { browser_download_url?: unknown }).browser_download_url === 'string'
    ))
    .map((asset) => ({
      name: typeof asset.name === 'string' ? asset.name : '',
      url: asset.browser_download_url,
    }))
  const preferred = assets.find((asset) => /\.(zip|dmg)$/i.test(asset.name))
  return preferred?.url ?? assets[0]?.url
}

export async function checkForUpdates(
  currentVersion: string,
  deps: UpdateCheckerDeps = {},
): Promise<UpdateCheckResult> {
  const checkedAt = deps.now?.() ?? Date.now()
  const fetchImpl: FetchLike | undefined =
    deps.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (!fetchImpl) {
    return { status: 'error', currentVersion, checkedAt, reason: 'FETCH_UNAVAILABLE' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7_000)
  try {
    const response = await fetchImpl(RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'markwand-update-checker',
      },
    })
    if (!response.ok) {
      return { status: 'error', currentVersion, checkedAt, reason: `HTTP_${response.status}` }
    }

    const releases = releaseFromUnknown(await response.json())
      .filter((release) => release.draft !== true && typeof release.tag_name === 'string')
      .map((release) => ({
        version: normalizeTag(release.tag_name as string),
        releaseName: typeof release.name === 'string' ? release.name : release.tag_name as string,
        releaseUrl: typeof release.html_url === 'string' ? release.html_url : RELEASES_PAGE_URL,
        releaseNotes: typeof release.body === 'string' ? release.body : undefined,
        downloadUrl: downloadUrlFromAssets(release.assets),
      }))
      .filter((release) => isParseableVersion(release.version))
      .sort((a, b) => compareReleaseVersions(b.version, a.version))

    const latest = releases[0]
    if (!latest) {
      return { status: 'error', currentVersion, checkedAt, reason: 'NO_RELEASES' }
    }

    if (compareReleaseVersions(latest.version, currentVersion) > 0) {
      return {
        status: 'update-available',
        currentVersion,
        checkedAt,
        latestVersion: latest.version,
        releaseName: latest.releaseName,
        releaseUrl: latest.releaseUrl,
        releaseNotes: latest.releaseNotes,
        downloadUrl: latest.downloadUrl,
      }
    }

    return {
      status: 'up-to-date',
      currentVersion,
      checkedAt,
      latestVersion: latest.version,
      releaseName: latest.releaseName,
      releaseUrl: latest.releaseUrl,
      releaseNotes: latest.releaseNotes,
      downloadUrl: latest.downloadUrl,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { status: 'error', currentVersion, checkedAt, reason }
  } finally {
    clearTimeout(timer)
  }
}
