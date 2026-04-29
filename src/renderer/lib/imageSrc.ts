/**
 * 로컬 이미지의 app:// URL 빌더. 새로고침 시 외부에서 변경된 이미지가
 * Chromium cache 에 hit 해 stale 한 이미지가 그대로 보이는 문제를 막기 위해
 * refreshKey 를 쿼리 파라미터로 부착한다. main 측 protocol handler 는
 * url.pathname 만 사용하므로 ?r= 쿼리는 파일 해석에 영향 없음.
 *
 * 세그먼트별 encodeURIComponent — '/'는 보존, '#'·'?'·공백·비ASCII 안전화.
 */
export function buildLocalImageSrc(absPath: string, refreshKey: number): string {
  const encoded = absPath.split('/').map(encodeURIComponent).join('/')
  return `app://local${encoded}?r=${refreshKey}`
}
