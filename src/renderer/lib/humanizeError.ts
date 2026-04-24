// humanizeError — 기술 에러 메시지를 사용자 자연어 문자열로 변환.
// SshWorkspaceAddModal, DriftPanel, AllProjectsView, InboxView, ProjectView 에서 공유.

type TFn = (key: string, opts?: Record<string, unknown>) => string

export function humanizeError(t: TFn, message: string): string {
  if (message === 'SSH_TRANSPORT_DISABLED') return t('error.sshTransportDisabled')
  if (message === 'SSH_WORKSPACE_ALREADY_EXISTS') return t('error.sshWorkspaceExists')
  if (message.includes('INVALID_SSH_ROOT')) return t('error.invalidRoot')
  if (message.includes('ECONNREFUSED') || message.includes('CONN_REFUSED')) return t('error.connRefused')
  if (message.includes('ETIMEDOUT') || message.includes('CONNECT_TIMEOUT')) return t('error.connTimeout')
  if (message.includes('ENOTFOUND') || message.includes('HOST_UNREACHABLE')) return t('error.hostUnreachable')
  if (message.includes('AUTH_FAILED') || message.toLowerCase().includes('authentication')) return t('error.authFailed')
  if (message.includes('HOST_KEY_REJECTED')) return t('error.hostKeyRejected')
  if (message.includes('HOST_KEY_MISMATCH')) return t('error.hostKeyMismatch')
  if (message.includes('ENOENT') && message.includes('.ssh')) return t('error.keyFileMissing')
  if (message === 'FILE_TOO_LARGE') return t('error.fs.tooLarge')
  if (message === 'NOT_A_TEXT_DOC') return t('error.fs.notTextDoc')
  if (message.includes('DRIFT_REVALIDATE_FAILED')) return t('error.drift.revalidateFailed')
  if (message.includes('DRIFT_FILE_TOO_LARGE')) return t('error.drift.fileTooLarge')
  return t('error.generic', { message })
}
