// LocalTransport — 설계서 §2.2 rev. M1.
//
// 모듈 레벨 싱글톤. M3까지 로컬은 인스턴스 1개로 충분 (stateless). watcher/exec는 M4/M6에서
// 추가 예정 — 현재는 undefined.

import { localFs } from './fs'
import { localScanner } from './scanner'
import type { Transport } from '../types'
import { LOCAL_TRANSPORT_ID } from '../types'

export const localTransport: Transport = {
  id: LOCAL_TRANSPORT_ID,
  kind: 'local',
  fs: localFs,
  scanner: localScanner,
  watcher: undefined, // M4
  exec: undefined, // M6
  async dispose(): Promise<void> {
    // 로컬은 소유한 소켓·파일 핸들이 없으므로 no-op.
  },
}
