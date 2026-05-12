import { useCallback, useEffect, useRef, useState, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { getExt } from '../../lib/viewable'
import { useAppStore } from '../state/store'
import { buildLocalImageSrc } from '../lib/imageSrc'

type FitMode = 'fit' | '100%'

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

const FIT_MODES: { id: FitMode; labelKey: string }[] = [
  { id: 'fit', labelKey: 'imageViewer.fitMode' },
  { id: '100%', labelKey: 'imageViewer.actualSize' },
]

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function ImageViewerInner({ path, name, size, workspaceId }: ImageViewerProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<FitMode>('fit')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [errored, setErrored] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  // FS9-B — SSH workspace 인 경우 IPC 로 바이너리 수신 후 blob URL 생성.
  // 로컬 workspace 는 기존대로 app://local 직통.
  const [sshBlobUrl, setSshBlobUrl] = useState<string | null>(null)
  const isSsh = workspaceId?.startsWith('ssh:') ?? false
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  // 각 radio 버튼 ref — arrow-key 이동 후 focus 전이에 사용.
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  // URL 계약: app://local/<absolute-path>?r=<refreshKey>
  // - `local`은 고정 host placeholder. path 세그먼트를 host에 두면 Chromium이
  //   host를 소문자로 정규화하면서 /Users → /users 가 되어 워크스페이스 경로
  //   비교(startsWith)가 실패한다. protocol.ts 주석 참고.
  // - 세그먼트별 encodeURIComponent로 `#`·`?`·공백·비ASCII 안전화. `/`는 보존.
  // - ?r 쿼리는 새로고침 시 cache busting 토큰. main protocol handler 는
  //   url.pathname 만 사용하므로 파일 해석에는 영향 없음.
  const refreshKey = useAppStore((s) => s.refreshKey)
  const localSrc = buildLocalImageSrc(path, refreshKey)
  const src = isSsh ? (sshBlobUrl ?? '') : localSrc

  // path가 바뀌면 errored/dims/blob URL 리셋. memo된 컴포넌트라 state가 유지되는데,
  // errored=true 상태에서 <img>가 언마운트되므로 onLoad가 다시 호출되지 않아
  // 새 경로로 바꿔도 영구 에러 화면에 고착되는 문제를 막는다.
  useEffect(() => {
    setMode('fit')
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setErrored(false)
    setDims(null)
    setSshBlobUrl(null)
    setIsPanning(false)
    panRef.current = null
  }, [path])

  // FS9-B — SSH 분기. path 또는 workspaceId 변경 시 재요청. cleanup 에서 URL.revokeObjectURL.
  // 명시 새로고침 시에도 IPC 재요청해 외부에서 변경된 원격 이미지를 가져오도록
  // refreshKey 도 deps 에 포함. blob URL 은 매번 새로 생성되므로 Chromium cache 와 무관.
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
  }, [isSsh, workspaceId, path, refreshKey])

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setDims({ w: img.naturalWidth, h: img.naturalHeight })
    setErrored(false)
  }, [])

  const handleError = useCallback(() => {
    setErrored(true)
  }, [])

  const clampPan = useCallback(
    (candidate: { x: number; y: number }, nextZoom: number) => {
      const el = viewportRef.current
      if (!dims || !el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const viewportWidth = el.clientWidth || rect.width
      const viewportHeight = el.clientHeight || rect.height
      if (!viewportWidth || !viewportHeight) return candidate
      const maxX = Math.max(0, (dims.w * nextZoom - viewportWidth) / 2)
      const maxY = Math.max(0, (dims.h * nextZoom - viewportHeight) / 2)
      return {
        x: Math.max(-maxX, Math.min(maxX, candidate.x)),
        y: Math.max(-maxY, Math.min(maxY, candidate.y)),
      }
    },
    [dims]
  )

  const canPan = useCallback(
    (nextZoom = zoom) => {
      const el = viewportRef.current
      if (!dims || !el) return false
      const rect = el.getBoundingClientRect()
      const viewportWidth = el.clientWidth || rect.width
      const viewportHeight = el.clientHeight || rect.height
      if (!viewportWidth || !viewportHeight) return false
      return dims.w * nextZoom > viewportWidth || dims.h * nextZoom > viewportHeight
    },
    [dims, zoom]
  )

  const selectMode = useCallback((nextMode: FitMode) => {
    setMode(nextMode)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleZoom = useCallback((direction: 1 | -1) => {
    setMode('100%')
    setZoom((current) => {
      const next = clampZoom(Number((current + direction * ZOOM_STEP).toFixed(2)))
      setPan((currentPan) => clampPan(currentPan, next))
      return next
    })
  }, [clampPan])

  const handleResetZoom = useCallback(() => {
    setMode('100%')
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const endPan = useCallback((target?: HTMLDivElement | null) => {
    const state = panRef.current
    if (target && state) {
      try {
        target.releasePointerCapture(state.pointerId)
      } catch {
        // Pointer capture may already be gone after pointercancel.
      }
    }
    panRef.current = null
    setIsPanning(false)
  }, [])

  const handlePanStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== '100%' || e.button > 0 || !canPan()) return
      e.preventDefault()
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      }
      setIsPanning(true)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // jsdom and some browser edge paths may not support capture here.
      }
    },
    [canPan, mode, pan.x, pan.y]
  )

  const handlePanMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = panRef.current
    if (!state || e.pointerId !== state.pointerId) return
    e.preventDefault()
    const next = {
      x: state.startPanX + (e.clientX - state.startX),
      y: state.startPanY + (e.clientY - state.startY),
    }
    setPan(clampPan(next, zoom))
  }, [clampPan, zoom])

  const handlePanEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || e.pointerId !== panRef.current.pointerId) return
    endPan(e.currentTarget)
  }, [endPan])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!dims || errored || (isSsh && !sshBlobUrl)) return
      e.preventDefault()
      const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1
      const currentZoom = mode === '100%' ? zoom : 1
      const nextZoom = clampZoom(Number((currentZoom + direction * ZOOM_STEP).toFixed(2)))
      if (nextZoom === currentZoom) return

      const el = viewportRef.current
      const rect = el?.getBoundingClientRect()
      const viewportCenterX = (rect?.left ?? 0) + (el?.clientWidth || rect?.width || 0) / 2
      const viewportCenterY = (rect?.top ?? 0) + (el?.clientHeight || rect?.height || 0) / 2
      const ratio = nextZoom / currentZoom
      const cursorX = e.clientX - viewportCenterX
      const cursorY = e.clientY - viewportCenterY
      const nextPan = {
        x: pan.x + (cursorX - pan.x) * (1 - ratio),
        y: pan.y + (cursorY - pan.y) * (1 - ratio),
      }

      setMode('100%')
      setZoom(nextZoom)
      setPan(clampPan(nextPan, nextZoom))
    },
    [clampPan, dims, errored, isSsh, mode, pan.x, pan.y, sshBlobUrl, zoom]
  )

  const toggleActualSize = useCallback(() => {
    if (!dims || errored || (isSsh && !sshBlobUrl)) return
    if (mode === '100%') {
      selectMode('fit')
      return
    }
    handleResetZoom()
  }, [dims, errored, handleResetZoom, isSsh, mode, selectMode, sshBlobUrl])

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!dims || errored || (isSsh && !sshBlobUrl)) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        handleZoom(1)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        handleZoom(-1)
      } else if (e.key === '0') {
        e.preventDefault()
        handleResetZoom()
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        selectMode('fit')
      }
    },
    [dims, errored, handleResetZoom, handleZoom, isSsh, selectMode, sshBlobUrl]
  )

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
      selectMode(FIT_MODES[nextIdx].id)
      radioRefs.current[nextIdx]?.focus()
    },
    [selectMode]
  )

  // Fit: contain, 최대 영역 내. 100%: 실픽셀 + transform zoom/pan.
  const isManualZoom = mode === '100%'
  const canPanImage = isManualZoom && canPan()
  const imgStyle: React.CSSProperties = {
    display: 'block',
    flexShrink: 0,
    maxWidth: isManualZoom ? 'none' : '100%',
    maxHeight: isManualZoom ? 'none' : '100%',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    transform: isManualZoom ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform var(--duration-fast) var(--ease-standard)',
  }
  if (isManualZoom && dims) {
    imgStyle.width = `${dims.w}px`
    imgStyle.height = `${dims.h}px`
  }

  const ext = getExt(name) || ''
  const shortcutKeyStyle: React.CSSProperties = {
    minWidth: '20px',
    padding: '1px 5px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-elev)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 'var(--fs-xs)',
    fontWeight: 'var(--fw-semibold)',
    textAlign: 'center',
  }

  return (
    <div
      className="image-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-3)',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* 상단 툴바: Fit/100%/Fill 토글 + 파일명 */}
      <div
        role="toolbar"
        aria-label={t('imageViewer.toolbarAria')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--sp-3)',
          flexShrink: 0,
          padding: 'var(--sp-2) var(--sp-3)',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          fontSize: 'var(--fs-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <div
            role="radiogroup"
            aria-label={t('imageViewer.fitAria')}
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
                  onClick={() => selectMode(m.id)}
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
                  {t(m.labelKey)}
                </button>
              )
            })}
          </div>
          <div
            role="group"
            aria-label={t('imageViewer.zoomAria')}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(56px, auto) 28px',
              alignItems: 'center',
              gap: 'var(--sp-1)',
              padding: '2px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              background: 'var(--bg)',
            }}
          >
            <button
              type="button"
              aria-label={t('imageViewer.zoomOut')}
              title={t('imageViewer.zoomOut')}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => handleZoom(-1)}
              style={{
                width: '28px',
                height: '28px',
                border: 0,
                borderRadius: 'var(--r-pill)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: zoom <= MIN_ZOOM ? 'not-allowed' : 'pointer',
                fontSize: 'var(--fs-md)',
                fontFamily: 'inherit',
              }}
            >
              −
            </button>
            <button
              type="button"
              aria-label={t('imageViewer.resetZoom')}
              title={t('imageViewer.resetZoom')}
              onClick={handleResetZoom}
              style={{
                minWidth: '56px',
                height: '28px',
                border: 0,
                borderRadius: 'var(--r-pill)',
                background: isManualZoom ? 'var(--bg-elev)' : 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-semibold)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label={t('imageViewer.zoomIn')}
              title={t('imageViewer.zoomIn')}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => handleZoom(1)}
              style={{
                width: '28px',
                height: '28px',
                border: 0,
                borderRadius: 'var(--r-pill)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: zoom >= MAX_ZOOM ? 'not-allowed' : 'pointer',
                fontSize: 'var(--fs-md)',
                fontFamily: 'inherit',
              }}
            >
              +
            </button>
          </div>
          <div
            role="note"
            aria-label={t('imageViewer.shortcutsAria')}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--sp-2)',
              minWidth: 0,
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-xs)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <span style={{ fontWeight: 'var(--fw-semibold)' }}>{t('imageViewer.shortcutsLabel')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={shortcutKeyStyle}>+ / −</kbd>
              <span>{t('imageViewer.shortcutZoom')}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={shortcutKeyStyle}>0</kbd>
              <span>{t('imageViewer.shortcutReset')}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={shortcutKeyStyle}>F</kbd>
              <span>{t('imageViewer.shortcutFit')}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={shortcutKeyStyle}>{t('imageViewer.shortcutDoubleClickKey')}</kbd>
              <span>{t('imageViewer.shortcutToggle')}</span>
            </span>
          </div>
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
        ref={viewportRef}
        role="region"
        aria-label={t('imageViewer.canvasAria')}
        aria-keyshortcuts="+ - 0 F"
        tabIndex={0}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
        onDoubleClick={toggleActualSize}
        onKeyDown={handleCanvasKeyDown}
        onWheel={handleWheel}
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          cursor: isPanning ? 'grabbing' : canPanImage ? 'grab' : 'default',
          userSelect: isPanning ? 'none' : undefined,
          touchAction: 'none',
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
        <div
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--sp-3)',
            boxSizing: 'border-box',
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
              {t('imageViewer.loadFailed')}
              <div style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)' }}>
                {t('imageViewer.loadFailedDetail')}
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
              <div style={{ marginTop: 'var(--sp-2)' }}>{t('imageViewer.remoteLoading')}</div>
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
          flexShrink: 0,
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
