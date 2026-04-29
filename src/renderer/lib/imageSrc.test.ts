import { describe, expect, it } from 'vitest'
import { buildLocalImageSrc } from './imageSrc'

describe('buildLocalImageSrc — 새로고침 cache busting', () => {
  it('절대 경로 + refreshKey=0 → ?r=0 부착 (첫 렌더 기본)', () => {
    expect(buildLocalImageSrc('/Users/jay/img.png', 0)).toBe(
      'app://local/Users/jay/img.png?r=0'
    )
  })

  it('refreshKey 가 다르면 URL 도 달라야 한다 (Chromium cache miss → 새 fetch)', () => {
    const a = buildLocalImageSrc('/a.png', 0)
    const b = buildLocalImageSrc('/a.png', 1)
    expect(a).not.toBe(b)
    expect(b).toBe('app://local/a.png?r=1')
  })

  it('공백/한글/# 세그먼트 인코딩', () => {
    expect(buildLocalImageSrc('/Users/한글 폴더/img#1.png', 1)).toBe(
      'app://local/Users/%ED%95%9C%EA%B8%80%20%ED%8F%B4%EB%8D%94/img%231.png?r=1'
    )
  })

  it("'/' 구분자는 보존 (host=local 뒤 path 첫 / 포함)", () => {
    const url = buildLocalImageSrc('/a/b/c.png', 7)
    // app://local + /a/b/c.png + ?r=7
    expect(url.startsWith('app://local/')).toBe(true)
    expect(url.split('?r=')[1]).toBe('7')
  })
})
