import type { VerifiedReference } from '../../preload/types'

export function driftRefKey(ref: Pick<VerifiedReference, 'resolvedPath' | 'raw' | 'line' | 'col' | 'kind'>): string {
  return [ref.resolvedPath, ref.line, ref.col, ref.kind, ref.raw].join('\u001f')
}

export function isDriftRefIgnored(ignored: Set<string>, ref: VerifiedReference): boolean {
  return ignored.has(driftRefKey(ref))
}
