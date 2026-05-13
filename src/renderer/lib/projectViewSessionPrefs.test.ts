import { describe, expect, it } from 'vitest'
import { normalizeProjectViewSessions } from './projectViewSessionPrefs'

describe('normalizeProjectViewSessions', () => {
  it('object record가 아니면 빈 세션으로 복원한다', () => {
    expect(normalizeProjectViewSessions(null)).toEqual({})
    expect(normalizeProjectViewSessions(['p1'])).toEqual({})
  })

  it('저장된 프로젝트별 문서/위키/스크롤 상태를 복원한다', () => {
    expect(
      normalizeProjectViewSessions({
        p1: { selectedDocPath: '/proj/a.md', showWiki: false, scrollTop: 120 },
        p2: { selectedDocPath: null, showWiki: true, scrollTop: 0 },
      })
    ).toEqual({
      p1: { selectedDocPath: '/proj/a.md', showWiki: false, scrollTop: 120 },
      p2: { selectedDocPath: null, showWiki: true, scrollTop: 0 },
    })
  })

  it('깨진 세션 값은 안전한 기본값으로 정규화하고 음수 스크롤은 0으로 보정한다', () => {
    expect(
      normalizeProjectViewSessions({
        p1: { selectedDocPath: 123, showWiki: 'no', scrollTop: -20 },
        p2: 'broken',
        '': { selectedDocPath: '/ignored.md', showWiki: false, scrollTop: 10 },
      })
    ).toEqual({
      p1: { selectedDocPath: null, showWiki: true, scrollTop: 0 },
    })
  })
})
