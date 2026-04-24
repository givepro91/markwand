import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// H8: rehype-highlight는 dynamic import로 지연 로드 (~1MB 번들 분리).
// MarkdownViewer.tsx에서 useEffect로 비동기 import 후 rehypePlugins에 주입.

// rehype-sanitize 스키마:
// - highlight.js가 생성하는 hljs-* className 허용
// - heading id 속성을 원본 그대로 유지 (defaultSchema의 clobber가 'id'를 'user-content-' 접두사로
//   변조하기 때문에 TOC의 slug와 DOM id가 어긋나 스크롤이 실패함 → 'id'를 clobber에서 제거)
export const sanitizeSchema = {
  ...defaultSchema,
  clobber: (defaultSchema.clobber ?? []).filter((a) => a !== 'id'),
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      'className',
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      'className',
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      'className',
      ['tabIndex', '0'],
    ],
    // heading 태그에 id 속성 명시적 허용 (defaultSchema의 '*' glob이 id를 누락하는 경우 대비)
    h1: [...(defaultSchema.attributes?.h1 ?? []), 'id'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id'],
    h4: [...(defaultSchema.attributes?.h4 ?? []), 'id'],
    h5: [...(defaultSchema.attributes?.h5 ?? []), 'id'],
    h6: [...(defaultSchema.attributes?.h6 ?? []), 'id'],
  },
}

export { rehypeSanitize, remarkGfm, remarkBreaks }
