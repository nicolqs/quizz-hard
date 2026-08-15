// Shared OpenAI plumbing used by both /api/generate-questions and /api/generate-deck.
//
// Extracted so the two routes cannot drift on model quirks (gpt-5.x wants
// max_completion_tokens, older chat models want max_tokens) or on the error
// contract the client and the smoke test rely on.

export class LlmConfigError extends Error {}
export class LlmCallError extends Error {}

// gpt-5.x and o-series models use `max_completion_tokens`. Kept general so an
// older or third-party model id still gets the `max_tokens` it expects.
export function usesMaxCompletionTokens(model: string): boolean {
  return /^(gpt-5|o\d|gpt-6)/i.test(model)
}

/**
 * The gpt-5.x and o-series models only accept the default temperature, and
 * reject the request outright if one is supplied. Older models still allow it.
 */
export function supportsTemperature(model: string): boolean {
  return !/^(gpt-5|o\d|gpt-6)/i.test(model)
}

export function temperatureParam(model: string, value: number): Record<string, number> {
  return supportsTemperature(model) ? { temperature: value } : {}
}

/**
 * The 5.x models also reject top_p and the two penalties. They are sampling
 * knobs we only ever used to add variety between calls, and the per-request
 * angle/era/seed prompt does that job anyway.
 */
export function samplingParams(
  model: string,
  params: { top_p?: number; presence_penalty?: number; frequency_penalty?: number },
): Record<string, number> {
  return supportsTemperature(model) ? (params as Record<string, number>) : {}
}

export function tokenLimitParam(model: string, value: number): Record<string, number> {
  return usesMaxCompletionTokens(model)
    ? { max_completion_tokens: value }
    : { max_tokens: value }
}

/**
 * Strip the kind of self-commentary LLMs sometimes inject into generated text:
 * trailing parenthetical disclaimers like "(also not matching accurate scenario)",
 * "(approximate)", "(note: ...)", or stray newlines/control chars.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return ''
  let s = input
  // Replace any newline/tab with a space so text stays single-line.
  s = s.replace(/[\r\n\t]+/g, ' ')
  // Drop trailing parenthetical asides whose content looks like model commentary.
  const commentaryParen = /\s*\((?:note|also|approx(?:imate(?:ly)?)?|approx\.|fyi|disclaimer|caveat|source|see|ref|n\/a|not (?:exact|matching|accurate|sure)|may (?:vary|differ)|roughly)\b[^()]*\)\s*$/i
  while (commentaryParen.test(s)) s = s.replace(commentaryParen, '')
  // Drop trailing bracketed asides like " [note: ...]"
  const commentaryBracket = /\s*\[[^[\]]*\]\s*$/
  if (commentaryBracket.test(s) && /(note|approx|fyi|source)/i.test(s)) s = s.replace(commentaryBracket, '')
  // Collapse any runs of internal whitespace.
  s = s.replace(/\s{2,}/g, ' ').trim()
  return s
}

export function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY || ''
  if (!key || key === 'YOUR_KEY_HERE') {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set on the server. Add it to your env (Vercel project settings or .env.local) and restart.',
    )
  }
  return key
}

/** One chat completion, with the token param picked to match the model family. */
export async function chatCompletion(options: {
  model: string
  messages: { role: 'system' | 'user'; content: string }[]
  temperature?: number
  maxTokens: number
  jsonMode?: boolean
  label?: string
}): Promise<string> {
  const key = requireApiKey()

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.temperature !== undefined ? temperatureParam(options.model, options.temperature) : {}),
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...tokenLimitParam(options.model, options.maxTokens),
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new LlmCallError(
      `OpenAI HTTP ${res.status}${options.label ? ` when ${options.label}` : ''}: ${errText.slice(0, 200)}`,
    )
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new LlmCallError(`OpenAI returned empty content${options.label ? ` when ${options.label}` : ''}`)
  }
  return content
}
