// 토큰 추정 휴리스틱.
// Claude 기본 값 1 token ≈ 3.5 bytes + Opus 4.7 토크나이저 증가율 1.35× 반영(보수적 상한).
// 정확하진 않지만 tiktoken/API 호출 없이 UI 경고용으로 충분(±30% 허용).
export function estimateTokens(bytes: number): number {
  if (bytes <= 0) return 0
  return Math.ceil((bytes / 3.5) * 1.35)
}

// Claude 200k 기준 경고. 1M 이상은 위험 구간.
export const TOKEN_WARN = 200_000
export const TOKEN_CRIT = 1_000_000

// S5-5 — 비용 추정. Claude Sonnet $3 per 1M input tokens 기준 (보수적 표시만, 청구 근거 아님).
const COST_PER_1M_TOKENS = 3.0
export function estimateCost(tokens: number): string {
  if (tokens <= 0) return '0.00'
  const cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS
  if (cost < 0.01) return '<0.01'
  return cost.toFixed(2)
}
