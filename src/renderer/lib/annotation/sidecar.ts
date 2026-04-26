import type { AnnotationFile, Annotation } from './types'
import { CURRENT_ANNOTATION_VERSION } from './types'

export async function loadAnnotations(docPath: string): Promise<Annotation[]> {
  const file = await window.api.annotation.load(docPath)
  if (!file) return []
  return file.annotations
}

export async function saveAnnotations(
  docPath: string,
  annotations: Annotation[]
): Promise<void> {
  // runtime-only 필드 (orphan) 제거 후 직렬화.
  const sanitized = annotations.map(({ orphan: _orphan, ...rest }) => rest)
  const payload: AnnotationFile = {
    version: CURRENT_ANNOTATION_VERSION,
    annotations: sanitized,
  }
  await window.api.annotation.save(docPath, payload)
}
