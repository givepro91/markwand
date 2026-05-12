import { describe, expect, it, vi } from 'vitest'
import { checkForUpdates, compareReleaseVersions } from './update-checker'

const now = () => 123456

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn(async () => body),
  }
}

describe('update-checker', () => {
  it('compares beta tags in semver order', () => {
    expect(compareReleaseVersions('v0.4.0-beta.12', '0.4.0-beta.11')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.4.0', '0.4.0-beta.11')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.4.0-beta.10', '0.4.0-beta.11')).toBeLessThan(0)
  })

  it('reports an update when a newer GitHub release exists', async () => {
    const fetch = vi.fn(async () => response([
      {
        tag_name: 'v0.4.0-beta.12',
        name: 'Markwand v0.4.0-beta.12',
        html_url: 'https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.12',
        body: 'Release notes',
        assets: [
          { name: 'latest-mac.yml', browser_download_url: 'https://github.com/givepro91/markwand/releases/download/v0.4.0-beta.12/latest-mac.yml' },
          { name: 'Markwand.zip', browser_download_url: 'https://github.com/givepro91/markwand/releases/download/v0.4.0-beta.12/Markwand.zip' },
        ],
        draft: false,
      },
      {
        tag_name: 'v0.4.0-beta.10',
        name: 'Older',
        html_url: 'https://example.com/old',
        draft: false,
      },
    ]))

    const result = await checkForUpdates('0.4.0-beta.11', { fetch, now })

    expect(result).toMatchObject({
      status: 'update-available',
      currentVersion: '0.4.0-beta.11',
      latestVersion: '0.4.0-beta.12',
      releaseName: 'Markwand v0.4.0-beta.12',
      releaseUrl: 'https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.12',
      releaseNotes: 'Release notes',
      downloadUrl: 'https://github.com/givepro91/markwand/releases/download/v0.4.0-beta.12/Markwand.zip',
      checkedAt: 123456,
    })
  })

  it('reports up-to-date when the newest release is not newer', async () => {
    const fetch = vi.fn(async () => response([
      {
        tag_name: 'v0.4.0-beta.11',
        name: 'Current',
        html_url: 'https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.11',
        draft: false,
      },
    ]))

    await expect(checkForUpdates('0.4.0-beta.11', { fetch, now })).resolves.toMatchObject({
      status: 'up-to-date',
      latestVersion: '0.4.0-beta.11',
    })
  })

  it('returns an error result instead of throwing when GitHub is unavailable', async () => {
    const fetch = vi.fn(async () => response({ message: 'rate limited' }, false, 403))

    await expect(checkForUpdates('0.4.0-beta.11', { fetch, now })).resolves.toMatchObject({
      status: 'error',
      reason: 'HTTP_403',
    })
  })
})
