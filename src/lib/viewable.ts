// Markwand가 "Viewable Asset"으로 취급하는 파일 확장자 단일 진실원.
// - app:// ALLOWED_EXTENSIONS(src/main/security/protocol.ts)와 1:1 정렬되어야 한다.
// - scanner/watcher/useDocs 필터가 모두 이 모듈을 참조해 불일치 회귀를 막는다.

export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] as const
export const MD_EXTS = ['.md'] as const

export const VIEWABLE_EXTS: readonly string[] = [...MD_EXTS, ...IMAGE_EXTS]

export type AssetKind = 'md' | 'image'

// fast-glob이 해석할 수 있는 brace 패턴. `**/*.{md,png,...}`
// 확장자의 선행 `.`은 제거하고 합친다.
export const VIEWABLE_GLOB: string =
  `**/*.{${VIEWABLE_EXTS.map((e) => e.slice(1)).join(',')}}`

export function getExt(pathOrName: string): string {
  const dot = pathOrName.lastIndexOf('.')
  if (dot <= 0) return ''
  return pathOrName.slice(dot).toLowerCase()
}

export function classifyAsset(pathOrName: string): AssetKind | null {
  const ext = getExt(pathOrName)
  if (!ext) return null
  if ((MD_EXTS as readonly string[]).includes(ext)) return 'md'
  if ((IMAGE_EXTS as readonly string[]).includes(ext)) return 'image'
  return null
}

export function isViewable(pathOrName: string): boolean {
  return classifyAsset(pathOrName) !== null
}
