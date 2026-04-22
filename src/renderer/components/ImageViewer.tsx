import { useCallback, useEffect, useRef, useState, memo } from 'react'
import { getExt } from '../../lib/viewable'

type FitMode = 'fit' | '100%' | 'fill'

interface ImageViewerProps {
  // 절대 파일 경로. app:// 프로토콜에 그대로 붙여 스트리밍한다.
  path: string
  name: string
  // 바이트 크기. Doc.size에서 전달 (scanner가 stat 시 채움).
  size?: number
  // FS9-B — 현재 문서가 속한 workspace id. ssh:… 이면 IPC 스트리밍 경유.
  workspaceId?: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const FIT_MODES: { id: FitMode; label: string }[] = [
  { id: 'fit', label: 'Fit' },
  { id: '100%', label: '100%' },
  { id: 'fill', label: 'Fill' },
]

function ImageViewerInner({ path, name, size, workspaceId }: ImageViewerProps) {
  const [mode, setMode] = useState<FitMode>('fit')
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [errored, setErrored] = useState(false)
  // FS9-B — SSH workspace 인 경우 IPC 로 바이너리 수신 후 blob URL 생성.
  // 로컬 workspace 는 기존대로 app://local 직통.
  const [sshBlobUrl, setSshBlobUrl] = useState<string | null>(null)
  const isSsh = workspaceId?.startsWith('ssh:') ?? false
  // 각 radio 버튼 ref — arrow-key 이동 후 focus 전이에 사용.
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  // URL 계약: app://local/<absolute-path>
  // - `local`은 고정 host placeholder. path 세그먼트를 host에 두면 Chromium이
  //   host를 소문자로 정규화하면서 /Users → /users 가 되어 워크스페이스 경로
  //   비교(startsWith)가 실패한다. protocol.ts 주석 참고.
  // - 세그먼트별 encodeURIComponent로 `#`·`?`·공백·비ASCII 안전화. `/`는 보존.
  const localSrc = `app://local${path.split('/').map(encodeURIComponent).join('/')}`
  const src = isSsh ? (sshBlobUrl ?? '') : localSrc

  // path가 바뀌면 errored/dims/blob URL 리셋. memo된 컴포넌트라 state가 유지되는데,
  // errored=true 상태에서 <img>가 언마운트되므로 onLoad가 다시 호출되지 않아
  // 새 경로로 바꿔도 영구 에러 화면에 고착되는 문제를 막는다.
  useEffect(() => {
    setErrored(false)
    setDims(null)
    setSshBlobUrl(null)
  }, [path])

  // FS9-B — SSH 분기. path 또는 workspaceId 변경 시 재요청. cleanup 에서 URL.revokeObjectURL.
  useEffect(() => {
    if (!isSsh || !workspaceId) return
    let cancelled = false
    let currentUrl: string | null = null
    window.api.ssh
      .readImage({ workspaceId, path })
      .then((result) => {
        if (cancelled) return
        const u8 =
          result.data instanceof Uint8Array
            ? result.data
            : new Uint8Array(result.data as unknown as ArrayBuffer)
        const ab = new ArrayBuffer(u8.byteLength)
        new Uint8Array(ab).set(u8)
        const blob = new Blob([ab], { type: result.mime })
        currentUrl = URL.createObjectURL(blob)
        setSshBlobUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [isSsh, workspaceId, path])

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setDims({ w: img.naturalWidth, h: img.naturalHeight })
    setErrored(false)
  }, [])

  const handleError = useCallback(() => {
    setErrored(true)
  }, [])

  // WAI-ARIA radiogroup 계약: ←/→로 이전/다음, Home/End로 처음/끝. 이동 시 focus+select 동시 전이.
  // radio 그룹 안에서는 양끝에서 감싸는(순환) 동작이 스펙. space/enter는 <button>의 기본 동작으로 setMode가 호출됨.
  const handleRadioKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let nextIdx: number | null = null
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + FIT_MODES.length) % FIT_MODES.length
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % FIT_MODES.length
      } else if (e.key === 'Home') {
        nextIdx = 0
      } else if (e.key === 'End') {
        nextIdx = FIT_MODES.length - 1
      }
      if (nextIdx === null) return
      e.preventDefault()
      setMode(FIT_MODES[nextIdx].id)
      radioRefs.current[nextIdx]?.focus()
    },
    []
  )

  // Fit: contain, 최대 영역 내. 100%: 실픽셀. Fill: cover (과하게 크면 잘릴 수 있음).
  const imgStyle: React.CSSProperties = {
    display: 'block',
    maxWidth: mode === '100%' ? 'none' : '100%',
    maxHeight: mode === '100%' ? 'none' : 'calc(100vh - 220px)',
    width: mode === 'fill' ? '100%' : 'auto',
    height: mode === 'fill' ? '100%' : 'auto',
    objectFit: mode === 'fill' ? 'cover' : 'contain',
  }

  const ext = getExt(name) || ''

  return (
    <div
      className="image-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-3)',
        minHeight: 0,
      }}
    >
      {/* 상단 툴바: Fit/100%/Fill 토글 + 파일명 */}
      <div
        role="toolbar"
        aria-label="이미지 보기 옵션"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-2) var(--sp-3)',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          fontSize: 'var(--fs-sm)',
        }}
      >
        <div
          role="radiogroup"
          aria-label="맞춤 모드"
          style={{ display: 'flex', gap: 'var(--sp-1)' }}
        >
          {FIT_MODES.map((m, idx) => {
            const active = m.id === mode
            return (
              <button
                key={m.id}
                ref={(el) => {
                  radioRefs.current[idx] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                // roving tabindex — 선택된 라디오만 Tab 타겟. 그룹 내부는 화살표로 이동.
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(m.id)}
                onKeyDown={(e) => handleRadioKeyDown(e, idx)}
                style={{
                  padding: 'var(--sp-1) var(--sp-3)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--bg)',
                  color: active ? 'var(--bg)' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: active ? 'var(--fw-medium)' : 'var(--fw-normal)',
                  fontSize: 'var(--fs-sm)',
                  fontFamily: 'inherit',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <span
          title={name}
          style={{
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '40%',
          }}
        >
          {name}
        </span>
      </div>

      {/* 이미지 영역 — 체스보드 배경(투명 영역 인지) + 중앙 정렬 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--sp-3)',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          overflow: mode === '100%' ? 'auto' : 'hidden',
          // 체스보드(투명 알파 채널 인지) — 전용 대비 토큰 사용.
          // 일반 레이아웃 토큰(--bg/--bg-elev)은 차이가 작아 단색으로 보였다.
          backgroundImage:
            'linear-gradient(45deg, var(--image-checker-b) 25%, transparent 25%), ' +
            'linear-gradient(-45deg, var(--image-checker-b) 25%, transparent 25%), ' +
            'linear-gradient(45deg, transparent 75%, var(--image-checker-b) 75%), ' +
            'linear-gradient(-45deg, transparent 75%, var(--image-checker-b) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          backgroundColor: 'var(--image-checker-a)',
        }}
      >
        {errored ? (
          <div
            role="status"
            style={{
              padding: 'var(--sp-6)',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: 'var(--sp-2)' }} aria-hidden="true">
              🖼️
            </div>
            이미지를 불러올 수 없습니다
            <div style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)' }}>
              파일이 이동되었거나 접근 권한이 없습니다.
            </div>
          </div>
        ) : isSsh && !sshBlobUrl ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: 'var(--sp-6)',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-sm)',
              textAlign: 'center',
            }}
          >
            <span className="ui-spinner" aria-hidden="true" />
            <div style={{ marginTop: 'var(--sp-2)' }}>원격 이미지 불러오는 중…</div>
          </div>
        ) : (
          <img
            src={src}
            alt={name}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            draggable={false}
            style={imgStyle}
          />
        )}
      </div>

      {/* 푸터 메타 */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-3)',
          flexWrap: 'wrap',
          padding: 'var(--sp-1) var(--sp-3)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {dims ? <span>{dims.w} × {dims.h}</span> : <span>—</span>}
        {size !== undefined && <span>·</span>}
        {size !== undefined && <span>{formatBytes(size)}</span>}
        {ext && <span>·</span>}
        {ext && <span>{ext}</span>}
      </div>
    </div>
  )
}

export const ImageViewer = memo(ImageViewerInner)
