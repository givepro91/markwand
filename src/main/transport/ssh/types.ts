// SSH Transport 전용 타입 — Plan §S1 (remote-fs-transport-m3-m4.md §S1.2).
//
// Transport 공용 인터페이스(FsDriver/ScannerDriver 등)는 `../types.ts` 를 따르고,
// SSH 고유 연결·인증·호스트키 관련만 이 파일에 선언한다.
// S2 에서 ProxyJump/TOFU/reconnect 확장 — S1 은 기본 PoC 범위.

export interface SshConnectOptions {
  host: string
  port: number
  username: string
  auth: SshAuth
  /**
   * hostVerifier — 서버가 제시한 호스트 키를 검증하는 콜백.
   * 반환값 true 면 신뢰, false 면 연결 중단.
   * S2 TOFU 플로우에서 renderer 모달 응답을 여기로 연결 (nonce IPC + 20s 타임아웃).
   * S1 PoC 단계에서는 자동 trust(verify-ssh2-abi.ts) 또는 명시적 fingerprint 비교.
   */
  hostVerifier?: (info: HostKeyInfo) => Promise<boolean>
  /** keepaliveInterval ms — 기본 30000 (Plan §S2.4, Design §3.1) */
  keepaliveInterval?: number
  /** keepaliveCountMax — 기본 3. 30s × 3 = 90s 무응답 = 연결 종료 판정 */
  keepaliveCountMax?: number
  /** 초기 handshake timeout ms — 기본 20000 (ssh2 default 유지) */
  readyTimeout?: number
}

/**
 * 인증 방식 — v1.0 은 ssh-agent + key-file 만 지원 (Design §4.3, password 배제).
 */
export type SshAuth =
  | { kind: 'agent'; socketPath?: string }
  | { kind: 'key-file'; path: string; passphrase?: string }

/**
 * hostVerifier 콜백에 전달되는 호스트 키 정보.
 * S2 TOFU 모달이 4필드(host:port · username · algorithm · SHA256) 를 이 구조에서 읽는다.
 */
export interface HostKeyInfo {
  host: string
  port: number
  /** SSH 서명 알고리즘 — e.g. 'ssh-ed25519' / 'ssh-rsa' / 'ecdsa-sha2-nistp256' */
  algorithm: string
  /** SHA256 fingerprint, base64, no trailing '=' */
  sha256: string
  /** MD5 legacy fingerprint, hex colon-separated. 접힌 표시 용도 (S2 fold-out) */
  md5?: string
}

/**
 * SSH 전용 에러 코드. IPC 경계에서 사용자 UI 로 매핑되는 식별자.
 * FILE_TOO_LARGE 는 FsDriver 공통이므로 여기 포함하지 않는다.
 */
export const SshErrorCode = {
  CONNECT_TIMEOUT: 'SSH_CONNECT_TIMEOUT',
  CONN_REFUSED: 'SSH_CONN_REFUSED', // ECONNREFUSED — 즉시 거부 (타임아웃과 구분, S1 Evaluator M-1)
  HOST_UNREACHABLE: 'SSH_HOST_UNREACHABLE', // ENOTFOUND · EHOSTUNREACH — DNS 실패
  HOST_KEY_MISMATCH: 'SSH_HOST_KEY_MISMATCH',
  HOST_KEY_REJECTED: 'SSH_HOST_KEY_REJECTED',
  AUTH_FAILED: 'SSH_AUTH_FAILED',
  PERMISSION_DENIED: 'SSH_PERMISSION_DENIED',
  NOT_CONNECTED: 'SSH_NOT_CONNECTED',
  DISCONNECTED: 'SSH_DISCONNECTED',
} as const

export type SshErrorCodeT = (typeof SshErrorCode)[keyof typeof SshErrorCode]
