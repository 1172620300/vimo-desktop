export type SerializedCanvas = any;
export type ActiveCanvasPromptReference = {
  start: number
  end: number
  query: string
}

export function activeCanvasPromptReference(prompt: string, cursor: number): ActiveCanvasPromptReference | null {
  const end = Math.max(0, Math.min(prompt.length, Math.round(cursor)))
  const prefix = prompt.slice(0, end)
  const start = prefix.lastIndexOf('@')
  if (start < 0) return null
  const query = prefix.slice(start + 1)
  if (query.length > 60 || /[@\s，,；;。.!！?？:：]/u.test(query)) return null
  return { start, end, query }
}

export function insertCanvasPromptReference(input: {
  prompt: string
  selectionStart: number
  selectionEnd: number
  referenceOrder: number
  referenceType?: 'image' | 'video' | 'audio'
}) {
  const start = Math.max(0, Math.min(input.prompt.length, Math.round(input.selectionStart)))
  const end = Math.max(start, Math.min(input.prompt.length, Math.round(input.selectionEnd)))
  const before = input.prompt.slice(0, start)
  const after = input.prompt.slice(end)
  const label = input.referenceType === 'video' ? '视频' : input.referenceType === 'audio' ? '音频' : '图片'
  const token = `@${label}${input.referenceOrder}`
  const leadingSpace = before && !/\s$/u.test(before) ? ' ' : ''
  const trailingSpace = after && !/^\s/u.test(after) ? ' ' : ''
  const insertion = `${leadingSpace}${token}${trailingSpace}`

  return {
    prompt: `${before}${insertion}${after}`,
    selection: before.length + insertion.length,
  }
}

