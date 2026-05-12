import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import type { NodeApi, TreeApi } from 'react-arborist'
import { useTranslation } from 'react-i18next'
import type { Doc } from '../../../src/preload/types'
import { useAppStore } from '../state/store'
import { Checkbox } from './ui'
import { classifyAsset } from '../../lib/viewable'

interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  doc?: Doc
}

interface FileTreeProps {
  projectId: string
  rootPath: string
  docs: Doc[]
  extraFolders?: string[]
  onSelect: (doc: Doc) => void
  onFolderFocus?: (path: string) => void
  initialExpanded: string[]
  onExpandChange: (expanded: string[]) => void
}

// 디렉토리 → md → image → 그 외 순. 같은 타입 내에서는 localeCompare 알파벳.
// 분류는 doc.path 기반이 본질(확장자 포함 full path). 디렉토리 노드는
// doc이 없지만 `!!a.children`로 먼저 걸러지므로 이 분기에는 파일만 들어온다.
function compareTreeNodes(a: TreeNode, b: TreeNode): number {
  const aDir = !!a.children
  const bDir = !!b.children
  if (aDir !== bDir) return aDir ? -1 : 1
  if (!aDir) {
    const aKind = a.doc ? classifyAsset(a.doc.path) : null
    const bKind = b.doc ? classifyAsset(b.doc.path) : null
    // rank: md=0, image=1, null=2
    const rank = (k: ReturnType<typeof classifyAsset>) =>
      k === 'md' ? 0 : k === 'image' ? 1 : 2
    const r = rank(aKind) - rank(bKind)
    if (r !== 0) return r
  }
  return a.name.localeCompare(b.name)
}

function sortTreeRecursively(nodes: TreeNode[]): void {
  nodes.sort(compareTreeNodes)
  for (const node of nodes) {
    if (node.children) sortTreeRecursively(node.children)
  }
}

// Doc[] 배열을 디렉토리 트리 구조로 변환한다.
function buildTree(docs: Doc[], rootPath: string, extraFolders: string[] = []): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  nodeMap.set(rootPath, { id: rootPath, name: '', children: [] })

  const ensureFolder = (folderPath: string) => {
    if (folderPath === rootPath) return
    if (!folderPath.startsWith(rootPath + '/')) return
    const rel = folderPath.slice(rootPath.length + 1)
    const parts = rel.split('/').filter(Boolean)
    let currentPath = rootPath

    for (const part of parts) {
      const fullPath = currentPath + '/' + part
      let node = nodeMap.get(fullPath)
      if (!node) {
        node = { id: fullPath, name: part, children: [] }
        nodeMap.set(fullPath, node)
        const parent = nodeMap.get(currentPath)
        if (parent) {
          parent.children = parent.children ?? []
          parent.children.push(node)
        }
      } else {
        node.children = node.children ?? []
      }
      currentPath = fullPath
    }
  }

  for (const folder of extraFolders) ensureFolder(folder)

  for (const doc of docs) {
    // rootPath 기준 상대 경로 계산
    const rel = doc.path.startsWith(rootPath + '/')
      ? doc.path.slice(rootPath.length + 1)
      : doc.path

    const parts = rel.split('/')
    let currentPath = rootPath

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const fullPath = currentPath + '/' + part

      if (!nodeMap.has(fullPath)) {
        const node: TreeNode = {
          id: fullPath,
          name: part,
        }
        if (isLast) {
          node.doc = doc
        } else {
          node.children = []
        }
        nodeMap.set(fullPath, node)

        // 부모에 추가
        const parent = nodeMap.get(currentPath)
        if (parent) {
          parent.children = parent.children ?? []
          parent.children.push(node)
        }
      }
      const existing = nodeMap.get(fullPath)
      if (existing && isLast) existing.doc = doc

      currentPath = fullPath
    }
  }

  // rootPath의 직접 자식들을 루트 노드로 반환.
  // insertion 순서는 doc 등장 순서(mtime 기반일 수 있음)라 md/image가 섞인다.
  // 타입별 그룹(dir → md → image) + 알파벳으로 재정렬해 결정론적 표시.
  const root = nodeMap.get(rootPath)
  const result = root?.children ?? []
  sortTreeRecursively(result)
  return result
}

// depth 2까지의 노드 id를 수집한다 (treeExpanded 초기값 생성용)
function collectDepth2Ids(nodes: TreeNode[], depth = 0): string[] {
  if (depth >= 2) return []
  const ids: string[] = []
  for (const node of nodes) {
    if (node.children) {
      ids.push(node.id)
      ids.push(...collectDepth2Ids(node.children, depth + 1))
    }
  }
  return ids
}

// 아이콘들은 시각 의미(폴더/문서/이미지)를 스크린리더에도 전달해야 파일 종류 구분 가능.
// role="img" + aria-label 조합으로 SVG를 accessible graphic으로 선언.
const FolderIcon = ({ open }: { open: boolean }) => {
  const { t } = useTranslation()
  return (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="currentColor"
    role="img"
    aria-label={open ? t('fileTree.folderOpen') : t('fileTree.folder')}
  >
    {open ? (
      <path d="M.5 3a1 1 0 0 1 1-1h4l1.5 1.5h7.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V3z" />
    ) : (
      <path d="M0 4a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4z" />
    )}
  </svg>
  )
}

const FileIcon = () => {
  const { t } = useTranslation()
  return (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    role="img"
    aria-label={t('fileTree.docFile')}
  >
    <path d="M4 1.5h6.5L13 4v10.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" />
    <path d="M10 1.5V4h2.5" />
  </svg>
  )
}

// 이미지 파일을 md와 시각 구분하기 위한 16px 아이콘. 사각 프레임 + 산/해 실루엣.
const ImageIcon = () => {
  const { t } = useTranslation()
  return (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    role="img"
    aria-label={t('fileTree.imageFile')}
  >
    <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
    <circle cx="5.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <path d="M2 12l3.5-3.5 3 3 2.5-2.5L14 12" />
  </svg>
  )
}

function getAssetIcon(name: string) {
  return classifyAsset(name) === 'image' ? <ImageIcon /> : <FileIcon />
}

function FileTreeNode({
  node,
  style,
  onFolderFocus,
}: {
  node: NodeApi<TreeNode>
  style: React.CSSProperties
  onFolderFocus?: (path: string) => void
}) {
  const { t } = useTranslation()
  const isDir = !!node.data.children || node.isInternal
  const isSelected = node.isSelected
  const docPath = node.data.doc?.path
  const composerChecked = useAppStore((s) =>
    docPath ? s.selectedDocPaths.has(docPath) : false
  )
  const toggleDocSelection = useAppStore((s) => s.toggleDocSelection)
  const isComposerPicked = !isDir && composerChecked

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-1)',
        paddingLeft: `calc(${node.level} * 18px + var(--sp-2))`,
        paddingRight: 'var(--sp-2)',
        height: '30px',
        cursor: 'pointer',
        borderRadius: 'var(--r-sm)',
        // arborist isSelected가 배경 우선, Composer 체크는 좌측 border로 보조 표시
        // → "지금 보는 파일이 Composer에도 담겨있음"이 시각적으로 소실되지 않음.
        background: isSelected
          ? 'var(--bg-hover)'
          : isComposerPicked
            ? 'var(--color-success-bg)'
            : 'transparent',
        borderLeft: isComposerPicked
          ? '2px solid var(--color-success)'
          : '2px solid transparent',
        color: 'var(--text)',
        fontSize: 'var(--fs-sm)',
        fontWeight: isDir ? 'var(--fw-medium)' : 'var(--fw-normal)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onClick={() => {
        // 폴더는 펼침/접힘, 파일은 선택. select는 onSelect 콜백을 트리거한다.
        if (isDir) {
          onFolderFocus?.(node.id)
          node.toggle()
        }
        else node.select()
      }}
    >
      {!isDir && docPath && classifyAsset(node.data.name) === 'md' ? (
        <Checkbox
          checked={composerChecked}
          size="sm"
          stopPropagation
          aria-label={t('fileTree.composerSelectAria', { name: node.data.name })}
          onChange={() => toggleDocSelection(docPath)}
        />
      ) : (
        // 이미지 등 non-md 자산은 Composer 선택 대상 아님.
        // `@/path/image.png` 복사가 Claude/Codex에서 무의미하거나 토큰 낭비.
        <span style={{ width: 14, flexShrink: 0 }} />
      )}
      <span
        style={{
          color: isDir ? 'var(--accent)' : 'var(--text-muted)',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {isDir ? <FolderIcon open={node.isOpen} /> : getAssetIcon(node.data.name)}
      </span>
      <span
        title={node.data.name}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {node.data.name}
      </span>
    </div>
  )
}

export function FileTree({
  projectId,
  rootPath,
  docs,
  extraFolders = [],
  onSelect,
  onFolderFocus,
  initialExpanded,
  onExpandChange,
}: FileTreeProps) {
  const { t } = useTranslation()
  const treeRef = useRef<TreeApi<TreeNode> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  // 초기값 0 — 실제 측정 전까지 Tree 렌더를 유보 (400px 기본값이 실제 컨테이너보다 크면
  // overflow:hidden으로 하단 잘림을 유발하므로 측정 실패 시에만 폴백 300을 쓴다).
  const [containerHeight, setContainerHeight] = useState(0)
  const [searchRaw, setSearchRaw] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // 검색어 debounce (100ms)
  const handleSearchChange = useCallback((value: string) => {
    setSearchRaw(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setSearchQuery(value), 100)
  }, [])

  // ESC로 검색 클리어
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleSearchChange('')
      searchInputRef.current?.blur()
    }
  }, [handleSearchChange])

  // 검색 필터된 docs
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs
    const q = searchQuery.toLowerCase()
    return docs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.path.toLowerCase().includes(q)
    )
  }, [docs, searchQuery])

  const treeData = useMemo(() => buildTree(filteredDocs, rootPath, extraFolders), [filteredDocs, rootPath, extraFolders])

  // 검색 중일 때는 모든 노드를 펼침 (매칭 파일의 부모 폴더 자동 expand)
  // 초기 expanded 설정: initialExpanded가 없으면 depth 2까지 기본 펼침
  const defaultOpenIds = useMemo(
    () => initialExpanded.length > 0 ? initialExpanded : collectDepth2Ids(treeData),
    [initialExpanded, treeData]
  )

  // 검색 결과에서 모든 디렉토리 id 수집 (자동 expand용)
  const searchOpenIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const ids: string[] = []
    function collect(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children) {
          ids.push(node.id)
          collect(node.children)
        }
      }
    }
    collect(treeData)
    return ids
  }, [searchQuery, treeData])

  // 컨테이너 높이를 측정해 Tree 가상화에 전달한다.
  // `position:absolute inset:0`로 부모를 100% 채우도록 했으므로 getBoundingClientRect가 신뢰 가능.
  // useLayoutEffect로 paint 전 초기 측정 → 플래시 제거.
  // 첫 측정이 0이면 **즉시** 300px 폴백을 세워 Tree가 첫 paint에 렌더되도록 하고,
  // rAF와 ResizeObserver로 실제 값이 확정되는 대로 덮어쓴다 (Suspense 첫 resolve 직후
  // 레이아웃이 늦게 안착하는 케이스 대응 — 사용자가 "두 번 클릭해야 보임" 증상 방지).
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    let rafId = 0
    const measure = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) {
        setContainerHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev))
        return true
      }
      return false
    }
    if (!measure()) {
      // 즉시 300px 폴백 — 오버슈트보다 작은 값을 써서 overflow:hidden 상위 잘림 방지.
      // 이후 실제 값이 측정되면 rAF/RO가 덮어쓴다.
      setContainerHeight(300)
      let tries = 0
      const retry = () => {
        if (measure()) return
        if (++tries >= 10) return
        rafId = requestAnimationFrame(retry)
      }
      rafId = requestAnimationFrame(retry)
    }
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  // docs가 처음 로드되는 시점(filteredDocs.length: 0→N)에 재측정.
  // 첫 Suspense resolve 직후의 useLayoutEffect는 레이아웃이 아직 안 안착해 0을 반환할 수 있는데,
  // docs가 채워지는 순간엔 DOM이 확실히 안정화되어 있으므로 이때 한 번 더 측정해
  // "프로젝트 첫 클릭 시 트리가 비어 보임" 증상을 원천 차단한다.
  useLayoutEffect(() => {
    if (filteredDocs.length === 0) return
    const el = containerRef.current
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h > 0) {
      setContainerHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev))
    }
  }, [filteredDocs.length])

  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNode>[]) => {
      const node = nodes[0]
      if (!node || !node.data.doc) return
      onSelect(node.data.doc)
    },
    [onSelect]
  )

  const handleToggle = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!treeRef.current) return
      const openIds: string[] = []
      treeRef.current.visibleNodes.forEach((n: NodeApi<TreeNode>) => {
        if (n.isOpen) openIds.push(n.id)
      })
      onExpandChange(openIds)
    }, 500)
  }, [onExpandChange])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  // projectId가 바뀌면 tree 갱신을 위해 key로 처리됨 (parent에서 key=projectId 사용)
  void projectId

  if (docs.length === 0 && extraFolders.length === 0) {
    return (
      <div style={{ padding: 'var(--sp-4)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
        {t('fileTree.noDocs')}
      </div>
    )
  }

  // 검색 중일 때 열림 상태: 모든 디렉토리 펼침
  const openState = searchOpenIds
    ? Object.fromEntries(searchOpenIds.map((id) => [id, true]))
    : Object.fromEntries(defaultOpenIds.map((id) => [id, true]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 검색 박스 */}
      <div style={{ padding: 'var(--sp-2) var(--sp-2) var(--sp-1)', flexShrink: 0 }}>
        <input
          ref={searchInputRef}
          type="search"
          value={searchRaw}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('fileTree.searchPlaceholder')}
          aria-label={t('fileTree.searchAria')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text)',
            fontSize: 'var(--fs-xs)',
            padding: 'var(--sp-1) var(--sp-2)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* 검색 결과 없음 */}
      {searchQuery.trim() && filteredDocs.length === 0 && (
        <div style={{ padding: 'var(--sp-3) var(--sp-3)', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
          {t('fileTree.noResults')}
        </div>
      )}

      {/* 트리 — position:relative 부모 + absolute 채움으로 flex:1 내 측정을 100% 신뢰할 수 있게. */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {treeData.length > 0 && containerHeight > 0 && (
            <Tree<TreeNode>
              ref={treeRef}
              data={treeData}
              openByDefault={!!searchQuery.trim()}
              initialOpenState={openState}
              onSelect={handleSelect}
              onToggle={handleToggle}
              rowHeight={30}
              indent={0}
              width="100%"
              height={containerHeight}
              className="file-tree"
            >
              {(props) => <FileTreeNode {...props} onFolderFocus={onFolderFocus} />}
            </Tree>
          )}
        </div>
      </div>
    </div>
  )
}
