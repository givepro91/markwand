export type ReferenceKind = 'at' | 'hint' | 'inline'

export interface Reference {
  raw: string
  resolvedPath: string
  kind: ReferenceKind
  line: number
  col: number
}
