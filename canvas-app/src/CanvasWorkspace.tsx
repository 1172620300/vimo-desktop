'use client'
import { localRequest } from './store'

import { Link } from './Link'
import {
  Background,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from '@xyflow/react'
import {
  ArrowLeft,
  AudioLines,
  Camera,
  Check,
  CircleHelp,
  Download,
  Film,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Images,
  Keyboard,
  LayoutList,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Workflow,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  activeCanvasPromptReference,
  insertCanvasPromptReference,
  type ActiveCanvasPromptReference,
  type SerializedCanvas,
} from './creative-canvas'
import { captureVideoTailFrame } from './video-tail-frame'
import { VideoModelSelect } from './VideoModelSelectOptions'

type CanvasSummary = {
  id: string
  name: string
  nodeCount: number
  taskCount: number
  coverUrl: string | null
  coverType: string | null
  updatedAt: string
}

type CanvasNodeRecord = SerializedCanvas['nodes'][number]

type VideoModelOption = {
  id: string
  label: string
  priceLabel: string
  standardPriceLabel?: string
  isDiscounted?: boolean
  discountLabel?: string | null
  available: boolean | null
  minimumDuration: number
  maximumDuration: number
  supportedDurations: number[] | null
  maximumReferenceImages: number
  maximumReferenceVideos?: number
  maximumReferenceAudios?: number
  supportsAudio: boolean
  resolutions: Array<'480p' | '720p' | '1080p' | '2k' | '4k'>
  defaultResolution: '480p' | '720p' | '1080p' | '2k' | '4k'
  aspectRatios: string[]
}

type ImageModelOption = {
  id: string
  label: string
  priceLabel: string
  standardPriceLabel: string | null
  unitPrice: number | null
  available: boolean
  isDiscounted: boolean
  discountLabel: string | null
}

type AudioModelOption = ImageModelOption

function canvasPriceAmount(value: number) {
  return `¥${value.toFixed(3).replace(/\.0+$/u, '').replace(/(\.\d*?)0+$/u, '$1')}`
}

type ReferenceItem = {
  nodeId: string
  title: string
  order: number
  kind: 'image' | 'video' | 'audio'
  thumbnailUrl: string | null
}

type CanvasNodeData = Record<string, unknown> & {
  node: CanvasNodeRecord
  references: ReferenceItem[]
  models: VideoModelOption[]
  imageModels: ImageModelOption[]
  audioModels: AudioModelOption[]
}

type FlowNode = Node<CanvasNodeData, 'creative'>
type FlowEdge = Edge

type CanvasActions = {
  updateNode: (nodeId: string, patch: Partial<CanvasNodeRecord>) => void
  saveNode: (nodeId: string, patch: Record<string, unknown>) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  generateImage: (nodeId: string, prompt?: string, count?: number) => Promise<void>
  generateAudio: (nodeId: string, prompt?: string) => Promise<void>
  generateVideo: (nodeId: string, prompt?: string) => Promise<void>
  captureTailFrame: (nodeId: string) => Promise<void>
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await localRequest(url, init)
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) throw new Error(payload?.error?.message || `请求失败 (${response.status})`)
  return payload as T
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function modelDurations(model: VideoModelOption | undefined) {
  if (!model) return [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  return model.supportedDurations
    || Array.from({ length: model.maximumDuration - model.minimumDuration + 1 }, (_, index) => model.minimumDuration + index)
}

const canvasReferenceKindLabels = {
  image: '图片',
  video: '视频',
  audio: '音频',
} as const

function canvasReferenceToken(reference: ReferenceItem) {
  return `@${canvasReferenceKindLabels[reference.kind]}${reference.order}`
}

function CanvasReferencePreview({ reference, size = 18 }: { reference: ReferenceItem, size?: number }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [reference.thumbnailUrl])
  if (reference.thumbnailUrl && !failed) {
    return <img src={reference.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
  }
  if (reference.kind === 'audio') return <AudioLines size={size} />
  if (reference.kind === 'video') return <Video size={size} />
  return <Images size={size} />
}

function CanvasPromptTextarea(props: {
  nodeId: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  references: ReferenceItem[]
  value: string
  className?: string
  placeholder: string
  ariaLabel: string
  onChange: (value: string) => void
  onBlur: (value: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: (value: string) => void
}) {
  const [mention, setMention] = useState<ActiveCanvasPromptReference | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState<{ left: number, top: number, width: number } | null>(null)
  const menuId = `canvas-reference-options-${props.nodeId}`
  const candidates = useMemo(() => {
    const query = mention?.query.toLocaleLowerCase() || ''
    return props.references.filter((reference) => {
      if (!query) return true
      const searchable = `${canvasReferenceKindLabels[reference.kind]}${reference.order} ${reference.title}`.toLocaleLowerCase()
      return searchable.includes(query)
    })
  }, [mention?.query, props.references])

  function updateMention(input: HTMLTextAreaElement) {
    const next = input.selectionStart === input.selectionEnd
      ? activeCanvasPromptReference(input.value, input.selectionStart)
      : null
    setMention(next)
    setActiveIndex(0)
  }

  function updateMenuPosition() {
    const input = props.inputRef.current
    if (!mention || !input) {
      setMenuPosition(null)
      return
    }
    const rect = input.getBoundingClientRect()
    const viewportPadding = 12
    const width = Math.min(360, Math.max(280, Math.min(rect.width, window.innerWidth - viewportPadding * 2)))
    const estimatedHeight = Math.min(370, 82 + Math.max(1, Math.min(candidates.length, 6)) * 57)
    const opensBelow = window.innerHeight - rect.bottom >= estimatedHeight + 8
    setMenuPosition({
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      top: opensBelow ? rect.bottom + 6 : Math.max(viewportPadding, rect.top - estimatedHeight - 6),
      width,
    })
  }

  useLayoutEffect(() => {
    updateMenuPosition()
  }, [mention?.start, mention?.end, mention?.query, candidates.length, props.value])

  useEffect(() => {
    if (!mention) return
    const reposition = () => updateMenuPosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [mention, candidates.length])

  useEffect(() => {
    if (!mention || !candidates[activeIndex]) return
    document.getElementById(`${menuId}-${candidates[activeIndex].nodeId}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, candidates, mention, menuId])

  useEffect(() => {
    setActiveIndex((index) => candidates.length ? Math.min(index, candidates.length - 1) : 0)
  }, [candidates.length])

  function selectReference(reference: ReferenceItem) {
    if (!mention) return
    const result = insertCanvasPromptReference({
      prompt: props.value,
      selectionStart: mention.start,
      selectionEnd: mention.end,
      referenceOrder: reference.order,
      referenceType: reference.kind,
    })
    const needsTrailingSpace = result.selection === result.prompt.length
    const prompt = needsTrailingSpace ? `${result.prompt} ` : result.prompt
    const selection = result.selection + (needsTrailingSpace ? 1 : 0)
    props.onChange(prompt)
    setMention(null)
    setMenuPosition(null)
    window.requestAnimationFrame(() => {
      props.inputRef.current?.focus()
      props.inputRef.current?.setSelectionRange(selection, selection)
    })
  }

  const menu = mention && menuPosition && typeof document !== 'undefined'
    ? createPortal((
      <div
        id={menuId}
        className="canvasMentionPopover nodrag nowheel"
        role="listbox"
        aria-label="可引用的关联素材"
        style={menuPosition}
      >
        <div className="canvasMentionHeader">
          <span><strong>可引用的关联素材</strong><small>{mention.query ? `筛选“${mention.query}”` : '输入名称可继续筛选'}</small></span>
          <span>{candidates.length} 项</span>
        </div>
        {candidates.length ? <div className="canvasMentionOptions">
          {candidates.map((reference, index) => (
            <button
              id={`${menuId}-${reference.nodeId}`}
              className={index === activeIndex ? 'active' : ''}
              key={reference.nodeId}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectReference(reference)}
            >
              <span className="canvasMentionThumbnail" aria-hidden="true"><CanvasReferencePreview reference={reference} size={19} /></span>
              <span className="canvasMentionCopy"><strong>{canvasReferenceToken(reference)}</strong><small>{reference.title}</small></span>
              <span className={`canvasMentionKind ${reference.kind}`}>{canvasReferenceKindLabels[reference.kind]}</span>
            </button>
          ))}
        </div> : <div className="canvasMentionEmpty">{props.references.length ? '没有匹配的关联素材' : '请先把图片、视频或音频连线到当前节点'}</div>}
        <div className="canvasMentionFooter"><span>↑↓ 选择</span><span>Enter 确认</span><span>Esc 关闭</span></div>
      </div>
    ), document.body)
    : null

  return <>
    <textarea
      ref={props.inputRef}
      className={`${props.className || ''} canvasTextControl nodrag nowheel`.trim()}
      value={props.value}
      maxLength={12_000}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      aria-autocomplete="list"
      aria-controls={mention ? menuId : undefined}
      aria-expanded={Boolean(mention)}
      aria-activedescendant={mention && candidates[activeIndex] ? `${menuId}-${candidates[activeIndex].nodeId}` : undefined}
      lang="zh-CN"
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        props.onChange(event.currentTarget.value)
        updateMention(event.currentTarget)
      }}
      onFocus={(event) => updateMention(event.currentTarget)}
      onSelect={(event) => updateMention(event.currentTarget)}
      onBlur={(event) => {
        setMention(null)
        props.onBlur(event.currentTarget.value)
      }}
      onCompositionStart={() => props.onCompositionStart?.()}
      onCompositionEnd={(event) => {
        props.onCompositionEnd?.(event.currentTarget.value)
        updateMention(event.currentTarget)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (!mention || event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          setMention(null)
          return
        }
        if (!candidates.length) return
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveIndex((index) => (index + 1) % candidates.length)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length)
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          selectReference(candidates[activeIndex])
        }
      }}
    />
    {menu}
  </>
}

function updateNodeInCanvas(
  canvas: SerializedCanvas | null,
  nodeId: string,
  patch: Partial<CanvasNodeRecord>,
) {
  if (!canvas) return canvas
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node),
  }
}

function CanvasNodeTitleInput({ node, ariaLabel }: { node: CanvasNodeRecord, ariaLabel: string }) {
  const actions = useContext(CanvasActionsContext)
  const [draft, setDraft] = useState(node.title)
  const editing = useRef(false)
  const composing = useRef(false)
  const originalTitle = useRef(node.title)
  const revertOnBlur = useRef(false)

  useEffect(() => {
    if (!editing.current) setDraft(node.title)
  }, [node.id, node.title])

  function commit(rawTitle: string) {
    const normalized = rawTitle.trim()
    const reverting = revertOnBlur.current
    const nextTitle = reverting
      ? originalTitle.current
      : normalized || originalTitle.current || '未命名节点'
    const changed = nextTitle !== originalTitle.current
    revertOnBlur.current = false
    editing.current = false
    composing.current = false
    setDraft(nextTitle)
    actions?.updateNode(node.id, { title: nextTitle })
    if (!reverting && changed) void actions?.saveNode(node.id, { title: nextTitle })
  }

  return (
    <input
      className="canvasNodeTitle canvasTextControl nodrag nowheel"
      value={draft}
      maxLength={100}
      aria-label={ariaLabel}
      title="点击修改名称"
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onFocus={() => {
        editing.current = true
        originalTitle.current = node.title
        revertOnBlur.current = false
      }}
      onChange={(event) => {
        setDraft(event.currentTarget.value)
      }}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={() => { composing.current = false }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || composing.current) return
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          revertOnBlur.current = true
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  )
}

function ImageCanvasNode({ data, selected }: NodeProps<FlowNode>) {
  const actions = useContext(CanvasActionsContext)
  const { node, references, imageModels } = data
  const generator = Boolean(node.model)
  const [promptDraft, setPromptDraft] = useState(node.prompt)
  const [count, setCount] = useState(1)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const promptDirty = useRef(false)
  const task = node.latestTask
  const busy = task?.status === 'queued' || task?.status === 'processing'
  const selectedModel = imageModels.find((model) => model.id === node.model && model.available)
    || imageModels.find((model) => model.available)

  useEffect(() => {
    if (!promptDirty.current) setPromptDraft(node.prompt)
  }, [node.id, node.prompt])

  function commitPrompt(value: string) {
    promptDirty.current = false
    setPromptDraft(value)
    actions?.updateNode(node.id, { prompt: value })
    void actions?.saveNode(node.id, { prompt: value })
  }

  function insertReference(order: number) {
    const input = promptInput.current
    const result = insertCanvasPromptReference({
      prompt: promptDraft,
      selectionStart: input?.selectionStart ?? promptDraft.length,
      selectionEnd: input?.selectionEnd ?? promptDraft.length,
      referenceOrder: order,
      referenceType: 'image',
    })
    promptDirty.current = true
    setPromptDraft(result.prompt)
    window.requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(result.selection, result.selection)
    })
  }

  if (!generator) {
    return (
      <article className={`canvasFlowNode imageNode ${selected ? 'selected' : ''}`}>
        <header className="canvasNodeDragHandle">
          <span><Images size={15} />图片</span>
          <button className="canvasNodeIconButton nodrag" type="button" title="删除图片" aria-label="删除图片" onClick={() => void actions?.deleteNode(node.id)}>
            <Trash2 size={14} />
          </button>
        </header>
        <CanvasNodeTitleInput node={node} ariaLabel="图片名称" />
        <div className="canvasImagePreview">
          {node.media ? <img src={node.media.url} alt={node.title} draggable={false} /> : <Loader2 className="spin" size={20} />}
        </div>
        <footer>拖出右侧连接点</footer>
        <Handle className="canvasHandle source" type="source" position={Position.Right} />
      </article>
    )
  }

  return (
    <article className={`canvasFlowNode imageNode imageGeneratorNode ${selected ? 'selected' : ''}`}>
      <Handle className="canvasHandle target" type="target" position={Position.Left} />
      <header className="canvasNodeDragHandle">
        <span><ImagePlus size={15} />生成图片</span>
        <button className="canvasNodeIconButton nodrag" type="button" title="删除图片生成节点" aria-label="删除图片生成节点" disabled={busy} onClick={() => void actions?.deleteNode(node.id)}>
          <Trash2 size={14} />
        </button>
      </header>
      <CanvasNodeTitleInput node={node} ariaLabel="图片生成节点名称" />
      <div className="canvasImagePreview canvasGeneratedImagePreview" style={{ aspectRatio: node.aspectRatio.replace(':', ' / ') }}>
        {node.media ? <img src={node.media.url} alt={node.title} draggable={false} /> : (
          <div className="canvasImageEmptyPrompt"><ImagePlus size={24} /><span>请在下方描述需求</span></div>
        )}
        {busy ? <div className="canvasImageGenerating"><Loader2 className="spin" size={20} /><span>正在生成 {task.progress}%</span></div> : null}
        {node.media && !busy ? <a className="canvasImageDownload nodrag" href={node.media.downloadUrl} title="下载图片" aria-label="下载图片"><Download size={14} /></a> : null}
      </div>

      <div className="canvasReferenceStrip nodrag">
        {references.length > 0 ? references.map((reference) => (
          <button key={reference.nodeId} type="button" title={`在光标处插入 ${reference.title}`} onClick={() => insertReference(reference.order)}>
            <span className="canvasReferenceThumbnail" aria-hidden="true">
              <CanvasReferencePreview reference={reference} size={15} />
            </span>
            <span className="canvasReferenceCopy"><strong>@图片{reference.order}</strong><small>{reference.title}</small></span>
          </button>
        )) : <span className="canvasReferenceHint"><ImagePlus size={13} />可连接图片作为参考</span>}
      </div>

      <div className="canvasImagePromptComposer nodrag nowheel">
        <CanvasPromptTextarea
          nodeId={node.id}
          inputRef={promptInput}
          references={references}
          value={promptDraft}
          placeholder="描述画面、人物状态、构图与光线；输入 @ 引用连线图片…"
          ariaLabel="图片提示词"
          onChange={(value) => {
            promptDirty.current = true
            setPromptDraft(value)
          }}
          onBlur={commitPrompt}
          onCompositionStart={() => { promptDirty.current = true }}
        />
        <button
          className="canvasPromptPolish"
          type="button"
          disabled={!promptDraft.trim() || busy}
          onClick={() => {
            const suffix = '，电影感构图，主体清晰，光影自然，细节统一'
            const next = promptDraft.includes('电影感构图') ? promptDraft : `${promptDraft.replace(/[，。,.\s]+$/u, '')}${suffix}`
            commitPrompt(next)
          }}
        ><Sparkles size={13} />提示增强</button>
      </div>

      <div className="canvasImageSettings nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <label className="canvasWideSetting"><span>模型</span><select value={selectedModel?.id || node.model} disabled={busy || imageModels.length === 0} onChange={(event) => {
          actions?.updateNode(node.id, { model: event.target.value })
          void actions?.saveNode(node.id, { model: event.target.value })
        }}>{imageModels.map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.label} · {model.isDiscounted && model.standardPriceLabel ? `${model.standardPriceLabel} → ${model.priceLabel} · 内测九折` : model.priceLabel}</option>)}</select></label>
        <label><span>清晰度</span><select value={node.resolution} disabled={busy} onChange={(event) => {
          actions?.updateNode(node.id, { resolution: event.target.value })
          void actions?.saveNode(node.id, { resolution: event.target.value })
        }}><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></label>
        <label><span>画幅</span><select value={node.aspectRatio} disabled={busy} onChange={(event) => {
          actions?.updateNode(node.id, { aspectRatio: event.target.value })
          void actions?.saveNode(node.id, { aspectRatio: event.target.value })
        }}><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option></select></label>
        <label><span>数量</span><select value={count} disabled={busy} onChange={(event) => setCount(Number(event.target.value))}>
          {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}
        </select></label>
        {selectedModel ? <div className={`canvasPriceDisclosure ${selectedModel.isDiscounted ? 'discounted' : ''}`}>
          <span>{selectedModel.isDiscounted && selectedModel.standardPriceLabel ? <s>{selectedModel.standardPriceLabel}</s> : null}<strong>{selectedModel.priceLabel}</strong>{selectedModel.isDiscounted ? <b>内测九折</b> : null}</span>
          <small>本次预计 {canvasPriceAmount((selectedModel.unitPrice || 0) * count)}</small>
        </div> : null}
      </div>

      {task?.status === 'failed' ? <p className="canvasTaskError nodrag">{task.error}</p> : null}
      <button className="canvasGenerateButton nodrag" type="button" disabled={busy || !promptDraft.trim() || !selectedModel} onClick={() => {
        commitPrompt(promptDraft)
        void actions?.generateImage(node.id, promptDraft, count)
      }}>{busy ? <><Loader2 className="spin" size={15} />生成中 {task.progress}%</> : <><Sparkles size={15} />生成图片{selectedModel?.unitPrice != null ? ` · ${canvasPriceAmount(selectedModel.unitPrice * count)}` : ''}</>}</button>
      <Handle className="canvasHandle source" type="source" position={Position.Right} />
    </article>
  )
}

function VideoCanvasNode({ data, selected }: NodeProps<FlowNode>) {
  const actions = useContext(CanvasActionsContext)
  const { node, references, models } = data
  const [promptDraft, setPromptDraft] = useState(node.prompt)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const promptDirty = useRef(false)
  const composingPrompt = useRef(false)
  const selectedModel = models.find((model) => model.id === node.model)
    || models.find((model) => model.available !== false)
  const task = node.latestTask
  const busy = task?.status === 'queued' || task?.status === 'processing'
  const audioAvailable = selectedModel?.supportsAudio !== false

  useEffect(() => {
    if (!promptDirty.current) setPromptDraft(node.prompt)
  }, [node.id, node.prompt])

  function commitPrompt(value: string) {
    promptDirty.current = false
    setPromptDraft(value)
    actions?.updateNode(node.id, { prompt: value })
    if (!node.media) void actions?.saveNode(node.id, { prompt: value })
  }

  function insertReference(reference: ReferenceItem) {
    const input = promptInput.current
    const result = insertCanvasPromptReference({
      prompt: promptDraft,
      selectionStart: input?.selectionStart ?? promptDraft.length,
      selectionEnd: input?.selectionEnd ?? promptDraft.length,
      referenceOrder: reference.order,
      referenceType: reference.kind,
    })
    promptDirty.current = true
    setPromptDraft(result.prompt)
    window.requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(result.selection, result.selection)
    })
  }

  return (
    <article className={`canvasFlowNode videoNode ${selected ? 'selected' : ''}`}>
      <Handle className="canvasHandle target" type="target" position={Position.Left} />
      <header className="canvasNodeDragHandle">
        <span><Video size={15} />视频生成</span>
        <button className="canvasNodeIconButton nodrag" type="button" title="删除视频节点" aria-label="删除视频节点" disabled={busy} onClick={() => void actions?.deleteNode(node.id)}>
          <Trash2 size={14} />
        </button>
      </header>
      <CanvasNodeTitleInput node={node} ariaLabel="视频节点名称" />

      <div className="canvasReferenceStrip nodrag">
        {references.length > 0 ? references.map((reference) => (
          <button
            key={reference.nodeId}
            type="button"
            title={`在光标处插入 ${reference.title}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertReference(reference)}
          >
            <span className="canvasReferenceThumbnail" aria-hidden="true">
              <CanvasReferencePreview reference={reference} size={15} />
            </span>
            <span className="canvasReferenceCopy"><strong>@{reference.kind === 'image' ? '图片' : reference.kind === 'video' ? '视频' : '音频'}{reference.order}</strong><small>{reference.title}</small></span>
          </button>
        )) : <span>未连接参考素材</span>}
      </div>

      <CanvasPromptTextarea
        nodeId={node.id}
        inputRef={promptInput}
        references={references}
        className="canvasPromptInput canvasTextControl nodrag nowheel"
        value={promptDraft}
        placeholder="描述画面、动作和镜头；输入 @ 查看关联图片、视频和音频"
        ariaLabel="视频提示词"
        onChange={(value) => {
          promptDirty.current = true
          setPromptDraft(value)
        }}
        onCompositionStart={() => { composingPrompt.current = true }}
        onCompositionEnd={(value) => {
          composingPrompt.current = false
          promptDirty.current = true
          setPromptDraft(value)
        }}
        onBlur={(value) => {
          if (composingPrompt.current) setPromptDraft(value)
          composingPrompt.current = false
          commitPrompt(value)
        }}
      />

      <div className="canvasVideoSettings nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <label>
          模型
          <VideoModelSelect
            tone="dark"
            models={models.filter((model) => model.available !== false)}
            value={selectedModel?.id || ''}
            onChange={(modelId) => {
              const next = models.find((model) => model.id === modelId)
              if (!next) return
              const generateAudio = next.supportsAudio && (
                selectedModel == null || selectedModel.supportsAudio === false || node.generateAudio
              )
              actions?.updateNode(node.id, {
                model: next.id,
                resolution: next.defaultResolution,
                generateAudio,
              })
              if (!node.media) {
                void actions?.saveNode(node.id, {
                  model: next.id,
                  resolution: next.defaultResolution,
                  generateAudio,
                })
              }
            }}
          />
        </label>
        <div className="canvasSettingsGrid">
          <label>
            时长
            <select value={node.duration} onChange={(event) => {
              const duration = Number(event.target.value)
              actions?.updateNode(node.id, { duration })
              if (!node.media) void actions?.saveNode(node.id, { duration })
            }}>
              {modelDurations(selectedModel).map((duration) => <option key={duration} value={duration}>{duration} 秒</option>)}
            </select>
          </label>
          <label>
            清晰度
            <select value={node.resolution} onChange={(event) => {
              const resolution = event.target.value
              actions?.updateNode(node.id, { resolution })
              if (!node.media) void actions?.saveNode(node.id, { resolution })
            }}>
              {(selectedModel?.resolutions || ['480p', '720p']).map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
            </select>
          </label>
          <label>
            画幅
            <select value={node.aspectRatio} onChange={(event) => {
              const aspectRatio = event.target.value
              actions?.updateNode(node.id, { aspectRatio })
              if (!node.media) void actions?.saveNode(node.id, { aspectRatio })
            }}>
              {(selectedModel?.aspectRatios || ['16:9', '9:16']).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
          <label className="canvasAudioToggle">
            <input
              type="checkbox"
              checked={audioAvailable && node.generateAudio}
              disabled={!audioAvailable}
              onChange={(event) => {
                actions?.updateNode(node.id, { generateAudio: event.target.checked })
                if (!node.media) void actions?.saveNode(node.id, { generateAudio: event.target.checked })
              }}
            />
            生成声音
          </label>
        </div>
      </div>

      {task ? (
        <div className={`canvasTaskState ${task.status}`}>
          <span>{busy ? <Loader2 className="spin" size={14} /> : task.status === 'completed' ? <Check size={14} /> : <X size={14} />}</span>
          <div><strong>{task.status === 'queued' ? '排队中' : task.status === 'processing' ? '生成中' : task.status === 'completed' ? '生成完成' : '生成失败'}</strong><small>{task.error || (task.progress == null ? (task.stage || '正在处理') : `${task.progress}%`)}</small></div>
        </div>
      ) : null}

      {node.media?.kind === 'video' ? (
        <div className="canvasVideoResult nodrag nowheel">
          <video src={node.media.directUrl} controls playsInline preload="metadata" />
          <div>
            <button type="button" title="截取视频尾帧" onClick={() => void actions?.captureTailFrame(node.id)}><Camera size={14} />尾帧</button>
            <a href={node.media.downloadUrl} title="下载视频"><Download size={14} />下载</a>
          </div>
        </div>
      ) : null}

      <button
        className="canvasGenerateButton nodrag"
        type="button"
        title={node.media ? '保留当前视频，并在右侧新建窗口生成' : '在当前窗口生成视频'}
        disabled={busy || !promptDraft.trim() || !selectedModel}
        onClick={() => void actions?.generateVideo(node.id, promptDraft)}
      >
        {busy ? <Loader2 className="spin" size={15} /> : node.media ? <Plus size={15} /> : <Film size={15} />}
        {busy ? `生成中 ${task?.progress || 0}%` : node.media ? '新建窗口并生成' : '生成视频'}
      </button>
      {node.media?.kind === 'video' ? <Handle className="canvasHandle source" type="source" position={Position.Right} /> : null}
    </article>
  )
}

function AudioCanvasNode({ data, selected }: NodeProps<FlowNode>) {
  const actions = useContext(CanvasActionsContext)
  const { node, audioModels } = data
  const generator = Boolean(node.model)
  const [promptDraft, setPromptDraft] = useState(node.prompt)
  const promptDirty = useRef(false)
  const task = node.latestTask
  const busy = task?.status === 'queued' || task?.status === 'processing'
  const selectedModel = audioModels.find((model) => model.id === node.model && model.available)
    || audioModels.find((model) => model.available)

  useEffect(() => {
    if (!promptDirty.current) setPromptDraft(node.prompt)
  }, [node.id, node.prompt])

  function commitPrompt(value: string) {
    promptDirty.current = false
    setPromptDraft(value)
    actions?.updateNode(node.id, { prompt: value })
    void actions?.saveNode(node.id, { prompt: value })
  }

  return (
    <article className={`canvasFlowNode audioNode ${generator ? 'audioGeneratorNode' : ''} ${selected ? 'selected' : ''}`}>
      <header className="canvasNodeDragHandle">
        <span><AudioLines size={15} />{generator ? '生成参考音频' : '参考音频'}</span>
        <button className="canvasNodeIconButton nodrag" type="button" title="删除音频节点" aria-label="删除音频节点" disabled={busy} onClick={() => void actions?.deleteNode(node.id)}>
          <Trash2 size={14} />
        </button>
      </header>
      <CanvasNodeTitleInput node={node} ariaLabel="参考音频名称" />

      {generator ? (
        <>
          <textarea
            className="canvasPromptInput canvasAudioPrompt canvasTextControl nodrag nowheel"
            value={promptDraft}
            maxLength={5_000}
            placeholder="描述音频内容、风格、情绪和用途，例如：紧张悬疑的夜间追逐配乐，鼓点逐渐加快…"
            aria-label="参考音频提示词"
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              promptDirty.current = true
              setPromptDraft(event.target.value)
            }}
            onBlur={(event) => commitPrompt(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <div className="canvasAudioModel nodrag">
            <span>模型</span>
            <strong>{selectedModel?.label || 'Gemini Music'}</strong>
            <span className={`canvasAudioPrice ${selectedModel?.isDiscounted ? 'discounted' : ''}`}>
              {selectedModel?.isDiscounted ? <b>内测九折</b> : null}
              <em>{selectedModel?.priceLabel || '价格读取中'}</em>
              {selectedModel?.isDiscounted && selectedModel.standardPriceLabel ? <small>原 {selectedModel.standardPriceLabel}</small> : null}
            </span>
          </div>
          {task ? (
            <div className={`canvasTaskState ${task.status}`}>
              <span>{busy ? <Loader2 className="spin" size={14} /> : task.status === 'completed' ? <Check size={14} /> : <X size={14} />}</span>
              <div><strong>{task.status === 'queued' ? '排队中' : task.status === 'processing' ? '生成中' : task.status === 'completed' ? '生成完成' : '生成失败'}</strong><small>{task.error || (task.progress == null ? (task.stage || '正在处理') : `${task.progress}%`)}</small></div>
            </div>
          ) : null}
        </>
      ) : <p className="canvasAudioUploadHint nodrag">已上传的参考音频，可拖出右侧连接点用于视频生成。</p>}

      {node.media?.kind === 'audio' ? (
        <div className="canvasAudioResult nodrag nowheel">
          <audio src={node.media.directUrl} controls preload="metadata" />
          <a href={node.media.downloadUrl} title="下载参考音频"><Download size={14} />下载</a>
        </div>
      ) : generator && !busy ? (
        <div className="canvasAudioEmpty"><AudioLines size={24} /><span>生成后可试听并连接到视频节点</span></div>
      ) : null}

      {generator ? (
        <button
          className="canvasGenerateButton nodrag"
          type="button"
          disabled={busy || promptDraft.trim().length < 2 || !selectedModel}
          onClick={() => {
            commitPrompt(promptDraft)
            void actions?.generateAudio(node.id, promptDraft)
          }}
        >{busy ? <Loader2 className="spin" size={15} /> : <AudioLines size={15} />}{busy ? `生成中 ${task?.progress || 0}%` : node.media ? `重新生成音频 · ${selectedModel?.priceLabel || ''}` : `生成参考音频 · ${selectedModel?.priceLabel || ''}`}</button>
      ) : null}
      {node.media?.kind === 'audio' ? <Handle className="canvasHandle source" type="source" position={Position.Right} /> : null}
    </article>
  )
}

function CreativeCanvasNode(props: NodeProps<FlowNode>) {
  return props.data.node.type === 'image'
    ? <ImageCanvasNode {...props} />
    : props.data.node.type === 'audio' ? <AudioCanvasNode {...props} /> : <VideoCanvasNode {...props} />
}

const nodeTypes = { creative: CreativeCanvasNode }

async function imageDimensions(file: File) {
  const bitmap = await createImageBitmap(file)
  const result = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return result
}

export function CanvasWorkspace(props: {
  user: { id: string, name: string, email: string }
  initialCanvases: CanvasSummary[]
  initialCanvas: SerializedCanvas | null
}) {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}

function CanvasWorkspaceInner({ user, initialCanvases, initialCanvas }: {
  user: { id: string, name: string, email: string }
  initialCanvases: CanvasSummary[]
  initialCanvas: SerializedCanvas | null
}) {
  const [canvases, setCanvases] = useState(initialCanvases)
  const [canvas, setCanvas] = useState<SerializedCanvas | null>(initialCanvas)
  const [models, setModels] = useState<VideoModelOption[]>([])
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([])
  const [audioModels, setAudioModels] = useState<AudioModelOption[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [creating, setCreating] = useState(initialCanvases.length === 0)
  const [newCanvasName, setNewCanvasName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sidePanel, setSidePanel] = useState<'canvases' | 'nodes' | 'shortcuts' | null>(initialCanvases.length === 0 ? 'canvases' : null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(Math.round((initialCanvas?.viewport.zoom || 1) * 100))
  const [nodeSearch, setNodeSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<null | {
    clientX: number
    clientY: number
    flowPosition: { x: number, y: number }
  }>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const audioFileInput = useRef<HTMLInputElement>(null)
  const pendingUploadPosition = useRef<{ x: number, y: number } | null>(null)
  const pendingAudioUploadPosition = useRef<{ x: number, y: number } | null>(null)
  const refreshing = useRef(false)
  const { screenToFlowPosition, fitView, setCenter, zoomIn, zoomOut } = useReactFlow()

  const replaceCanvas = useCallback((next: SerializedCanvas) => {
    setCanvas(next)
    setCanvases((current) => current.map((item) => item.id === next.id
      ? { ...item, name: next.name, nodeCount: next.nodes.length, updatedAt: next.updatedAt }
      : item))
  }, [])

  const refreshCanvas = useCallback(async (canvasId = canvas?.id) => {
    if (!canvasId || refreshing.current) return
    refreshing.current = true
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvasId}`)
      replaceCanvas(payload.canvas)
    } finally {
      refreshing.current = false
    }
  }, [canvas?.id, replaceCanvas])

  useEffect(() => {
    const reloadModels=()=>{void requestJson<{models:VideoModelOption[]}>('/api/video-models?refresh=1').then(p=>setModels(p.models)).catch(()=>{})};
    window.addEventListener('video-settings-changed',reloadModels);
    return ()=>window.removeEventListener('video-settings-changed',reloadModels);
  }, []);

  useEffect(() => {
    void requestJson<{ models: VideoModelOption[] }>('/api/video-models?refresh=1')
      .then((payload) => setModels(payload.models))
      .catch((caught) => setError(caught instanceof Error ? caught.message : '视频模型读取失败'))
  }, [])

  useEffect(() => {
    void requestJson<{ models: ImageModelOption[] }>('/api/image-models?refresh=1')
      .then((payload) => setImageModels(payload.models))
      .catch((caught) => setError(caught instanceof Error ? caught.message : '图片模型读取失败'))
  }, [])

  useEffect(() => {
    void requestJson<{ models: AudioModelOption[] }>('/api/audio-models')
      .then((payload) => setAudioModels(payload.models))
      .catch((caught) => setError(caught instanceof Error ? caught.message : '音乐价格读取失败'))
  }, [])

  useEffect(() => {
    if (!canvas) {
      setNodes([])
      setEdges([])
      return
    }
    const referencesByTarget = new Map<string, ReferenceItem[]>()
    const referenceCountsByTarget = new Map<string, Record<'image' | 'video' | 'audio', number>>()
    for (const edge of canvas.edges) {
      const source = canvas.nodes.find((node) => node.id === edge.source)
      if (!source) continue
      const kind = source.type as 'image' | 'video' | 'audio'
      const counts = referenceCountsByTarget.get(edge.target) || { image: 0, video: 0, audio: 0 }
      counts[kind] += 1
      referenceCountsByTarget.set(edge.target, counts)
      const list = referencesByTarget.get(edge.target) || []
      list.push({
        nodeId: source.id,
        title: source.title,
        order: counts[kind],
        kind,
        thumbnailUrl: source.media?.kind === 'image' ? source.media.thumbnailUrl : null,
      })
      referencesByTarget.set(edge.target, list)
    }
    setNodes(canvas.nodes.map((node): FlowNode => ({
      id: node.id,
      type: 'creative',
      position: node.position,
      data: {
        node,
        references: referencesByTarget.get(node.id) || [],
        models,
        imageModels,
        audioModels,
      },
      dragHandle: '.canvasNodeDragHandle',
      selectable: true,
      deletable: false,
    })))
    setEdges(canvas.edges.map((edge): FlowEdge => {
      const reference = referencesByTarget.get(edge.target)?.find((item) => item.nodeId === edge.source)
      const label = reference?.kind === 'video' ? '视频' : reference?.kind === 'audio' ? '音频' : '图片'
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: `@${label}${reference?.order || edge.referenceOrder}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 2 },
        labelStyle: { fontSize: 11, fontWeight: 700 },
      }
    }))
  }, [audioModels, canvas, imageModels, models, setEdges, setNodes])

  useEffect(() => {
    const hasActive = canvas?.nodes.some((node) => (
      node.latestTask?.status === 'queued' || node.latestTask?.status === 'processing'
    ))
    if (!hasActive) return
    const timer = window.setInterval(() => void refreshCanvas(), 3000)
    return () => window.clearInterval(timer)
  }, [canvas?.nodes, refreshCanvas])

  async function createCanvas(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newCanvasName.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = await requestJson<{ canvas: { id: string, name: string } }>('/api/canvases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newCanvasName }),
      })
      const summary: CanvasSummary = {
        id: payload.canvas.id,
        name: payload.canvas.name,
        nodeCount: 0,
        taskCount: 0,
        coverUrl: null,
        coverType: null,
        updatedAt: new Date().toISOString(),
      }
      setCanvases((current) => [summary, ...current])
      setNewCanvasName('')
      setCreating(false)
      await openCanvas(summary.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '新建画布失败')
    } finally {
      setBusy(false)
    }
  }

  async function openCanvas(canvasId: string) {
    setBusy(true)
    setError('')
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvasId}`)
      setCanvas(payload.canvas)
      
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '画布读取失败')
    } finally {
      setBusy(false)
    }
  }

  async function uploadImage(file: File, position?: { x: number, y: number }, title?: string) {
    if (!canvas) return
    const dimensions = await imageDimensions(file)
    const form = new FormData()
    form.set('file', file)
    form.set('title', title || file.name.replace(/\.[^.]+$/, ''))
    form.set('positionX', String(position?.x ?? 80 + canvas.nodes.length * 30))
    form.set('positionY', String(position?.y ?? 80 + canvas.nodes.length * 24))
    form.set('width', String(dimensions.width))
    form.set('height', String(dimensions.height))
    const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/upload-image`, {
      method: 'POST',
      body: form,
    })
    replaceCanvas(payload.canvas)
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!canvas || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const origin = pendingUploadPosition.current
        || screenToFlowPosition({ x: window.innerWidth * 0.46, y: window.innerHeight * 0.34 })
      pendingUploadPosition.current = null
      for (let index = 0; index < files.length; index++) {
        await uploadImage(files[index], { x: origin.x + index * 36, y: origin.y + index * 36 })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function uploadAudio(file: File, position?: { x: number, y: number }) {
    if (!canvas) return
    const form = new FormData()
    form.set('file', file)
    form.set('title', file.name.replace(/\.[^.]+$/, ''))
    form.set('positionX', String(position?.x ?? 80 + canvas.nodes.length * 30))
    form.set('positionY', String(position?.y ?? 80 + canvas.nodes.length * 24))
    const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/upload-audio`, {
      method: 'POST',
      body: form,
    })
    replaceCanvas(payload.canvas)
  }

  async function handleAudioFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!canvas || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const origin = pendingAudioUploadPosition.current
        || screenToFlowPosition({ x: window.innerWidth * 0.48, y: window.innerHeight * 0.38 })
      pendingAudioUploadPosition.current = null
      for (let index = 0; index < files.length; index++) {
        await uploadAudio(files[index], { x: origin.x + index * 36, y: origin.y + index * 36 })
      }
      setNotice(files.length > 1 ? `已上传 ${files.length} 个参考音频` : '参考音频上传完成')
      window.setTimeout(() => setNotice(''), 2200)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考音频上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function addVideoNode(requestedPosition?: { x: number, y: number }) {
    if (!canvas) return
    setBusy(true)
    setError('')
    try {
      const position = requestedPosition
        || screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.32 })
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'video', title: '视频生成', positionX: position.x, positionY: position.y }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '视频节点创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function addImageNode(requestedPosition?: { x: number, y: number }) {
    if (!canvas) return
    setBusy(true)
    setError('')
    try {
      const position = requestedPosition
        || screenToFlowPosition({ x: window.innerWidth * 0.52, y: window.innerHeight * 0.28 })
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'image', title: '图片生成', positionX: position.x, positionY: position.y }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片节点创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function addAudioNode(requestedPosition?: { x: number, y: number }) {
    if (!canvas) return
    setBusy(true)
    setError('')
    try {
      const position = requestedPosition
        || screenToFlowPosition({ x: window.innerWidth * 0.54, y: window.innerHeight * 0.3 })
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'audio', title: '生成参考音频', positionX: position.x, positionY: position.y }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考音频节点创建失败')
    } finally {
      setBusy(false)
    }
  }

  const updateNode = useCallback((nodeId: string, patch: Partial<CanvasNodeRecord>) => {
    setCanvas((current) => updateNodeInCanvas(current, nodeId, patch))
  }, [])

  const saveNode = useCallback(async (nodeId: string, patch: Record<string, unknown>) => {
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvas-nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setCanvas((current) => current?.id === payload.canvas.id
        ? { ...current, updatedAt: payload.canvas.updatedAt }
        : current)
      setCanvases((current) => current.map((item) => item.id === payload.canvas.id
        ? { ...item, updatedAt: payload.canvas.updatedAt }
        : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '节点保存失败')
    }
  }, [])

  const deleteNode = useCallback(async (nodeId: string) => {
    setError('')
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvas-nodes/${nodeId}`, { method: 'DELETE' })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '节点删除失败')
    }
  }, [replaceCanvas])

  const generateVideo = useCallback(async (nodeId: string, promptOverride?: string) => {
    const node = canvas?.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const prompt = promptOverride ?? node.prompt
    const selectedModel = models.find((model) => model.id === node.model && model.available !== false)
      || models.find((model) => model.available !== false)
    if (!selectedModel) {
      setError('当前没有可用的视频模型')
      return
    }
    const durations = modelDurations(selectedModel)
    const duration = durations.includes(node.duration) ? node.duration : durations[0]
    const resolution = selectedModel.resolutions.includes(node.resolution as '480p' | '720p' | '1080p' | '2k' | '4k')
      ? node.resolution
      : selectedModel.defaultResolution
    const supportedRatios = selectedModel.aspectRatios
    const aspectRatio = supportedRatios.some((ratio) => ratio === node.aspectRatio)
      ? node.aspectRatio
      : supportedRatios[0]
    setError('')
    try {
      const payload = await requestJson<{
        createdNode: boolean
        nodeId: string
        canvas: SerializedCanvas
        task: { id: string, status: string, progress: number, error: string | null }
      }>(`/api/canvas-nodes/${nodeId}/generate-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel.id,
          duration,
          aspectRatio,
          resolution,
          generateAudio: selectedModel.supportsAudio && node.generateAudio,
        }),
      })
      replaceCanvas(payload.canvas)
      if (payload.createdNode) {
        setNotice('已在右侧新建视频窗口，原视频已保留')
        window.setTimeout(() => setNotice(''), 2600)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '视频任务提交失败')
    }
  }, [canvas?.nodes, models, replaceCanvas])

  const generateImage = useCallback(async (nodeId: string, promptOverride?: string, count = 1) => {
    const node = canvas?.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const prompt = promptOverride ?? node.prompt
    const selectedModel = imageModels.find((model) => model.id === node.model && model.available)
      || imageModels.find((model) => model.available)
    if (!selectedModel) {
      setError('当前没有可用的图片模型')
      return
    }
    setError('')
    try {
      const payload = await requestJson<{ task: { id: string, status: string, progress: number, error: string | null } }>(`/api/canvas-nodes/${nodeId}/generate-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel.id,
          aspectRatio: node.aspectRatio,
          resolution: node.resolution,
          count,
        }),
      })
      setCanvas((current) => updateNodeInCanvas(current, nodeId, {
        latestTask: {
          id: payload.task.id,
          status: payload.task.status as 'queued',
          progress: payload.task.progress,
          error: payload.task.error || '',
          model: selectedModel.id,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片任务提交失败')
    }
  }, [canvas?.nodes, imageModels])

  const generateAudio = useCallback(async (nodeId: string, promptOverride?: string) => {
    const node = canvas?.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const prompt = (promptOverride ?? node.prompt).trim()
    if (prompt.length < 2) {
      setError('请先描述参考音频的内容、风格或情绪')
      return
    }
    const selectedModel = audioModels.find((model) => model.id === node.model && model.available)
      || audioModels.find((model) => model.available)
    if (!selectedModel) {
      setError('当前音乐价格暂不可用，请稍后刷新')
      return
    }
    setError('')
    try {
      const payload = await requestJson<{
        canvas: SerializedCanvas
        task: { id: string, status: string, progress: number, error: string | null }
      }>(`/api/canvas-nodes/${nodeId}/generate-audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, model: selectedModel.id }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考音频任务提交失败')
    }
  }, [audioModels, canvas?.nodes, replaceCanvas])

  const captureTailFrame = useCallback(async (nodeId: string) => {
    const node = canvas?.nodes.find((candidate) => candidate.id === nodeId)
    if (!node?.media || node.media.kind !== 'video') return
    setBusy(true)
    setError('')
    setNotice('正在截取尾帧')
    try {
      const frame = await captureVideoTailFrame(node.media.url)
      const file = new File([frame.blob], `${node.title}-尾帧.png`, { type: 'image/png' })
      await uploadImage(file, { x: node.position.x + 440, y: node.position.y + 60 }, `${node.title} 尾帧`)
      setNotice('尾帧已生成图片节点')
      window.setTimeout(() => setNotice(''), 2200)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '尾帧截图失败')
      setNotice('')
    } finally {
      setBusy(false)
    }
  }, [canvas])

  const actions = useMemo<CanvasActions>(() => ({
    updateNode,
    saveNode,
    deleteNode,
    generateImage,
    generateAudio,
    generateVideo,
    captureTailFrame,
  }), [captureTailFrame, deleteNode, generateAudio, generateImage, generateVideo, saveNode, updateNode])

  async function connectNodes(connection: Connection) {
    if (!canvas || !connection.source || !connection.target) return
    setError('')
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}/edges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceNodeId: connection.source, targetNodeId: connection.target }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '节点连线失败')
    }
  }

  async function deleteEdges(deleted: FlowEdge[]) {
    try {
      for (const edge of deleted) {
        const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvas-edges/${edge.id}`, { method: 'DELETE' })
        replaceCanvas(payload.canvas)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '连线删除失败')
      await refreshCanvas()
    }
  }

  function persistPositions(nextNodes: FlowNode[], viewport?: Viewport) {
    if (!canvas) return
    void requestJson(`/api/canvases/${canvas.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nodes: nextNodes.map((node) => ({ id: node.id, positionX: node.position.x, positionY: node.position.y })),
        ...(viewport ? { viewport } : {}),
      }),
    }).catch((caught) => setError(caught instanceof Error ? caught.message : '画布位置保存失败'))
  }

  async function renameCanvas(name: string) {
    if (!canvas) return
    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('画布名称不能为空')
      await refreshCanvas()
      return
    }
    try {
      const payload = await requestJson<{ canvas: SerializedCanvas }>(`/api/canvases/${canvas.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: normalizedName }),
      })
      replaceCanvas(payload.canvas)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '画布名称保存失败')
    }
  }

  const filteredCanvasNodes = useMemo(() => {
    const query = nodeSearch.trim().toLocaleLowerCase('zh-CN')
    if (!query) return canvas?.nodes || []
    return (canvas?.nodes || []).filter((node) => (
      node.title.toLocaleLowerCase('zh-CN').includes(query)
      || node.type.toLocaleLowerCase('zh-CN').includes(query)
      || node.id.toLocaleLowerCase('zh-CN').includes(query)
    ))
  }, [canvas?.nodes, nodeSearch])

  function openUpload(position?: { x: number, y: number }) {
    pendingUploadPosition.current = position || null
    setAddMenuOpen(false)
    setContextMenu(null)
    fileInput.current?.click()
  }

  function openAudioUpload(position?: { x: number, y: number }) {
    pendingAudioUploadPosition.current = position || null
    setAddMenuOpen(false)
    setContextMenu(null)
    audioFileInput.current?.click()
  }

  function focusCanvasNode(nodeId: string) {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    setNodes((current) => current.map((candidate) => ({
      ...candidate,
      selected: candidate.id === nodeId,
    })))
    const imageGenerator = node.data.node.type === 'image' && Boolean(node.data.node.model)
    const audioGenerator = node.data.node.type === 'audio' && Boolean(node.data.node.model)
    void setCenter(node.position.x + (node.data.node.type === 'image' && imageGenerator ? 196 : 180), node.position.y + (imageGenerator ? 300 : audioGenerator ? 215 : node.data.node.type === 'video' ? 280 : 130), {
      zoom: 1,
      duration: 420,
    })
  }

  function arrangeCanvas() {
    if (!canvas || nodes.length === 0) return
    const imageNodes = nodes.filter((node) => node.data.node.type === 'image')
    const videoNodes = nodes.filter((node) => node.data.node.type === 'video')
    const audioNodes = nodes.filter((node) => node.data.node.type === 'audio')
    const nextNodes = nodes.map((node) => {
      const isImage = node.data.node.type === 'image'
      const isVideo = node.data.node.type === 'video'
      const group = isImage ? imageNodes : isVideo ? videoNodes : audioNodes
      const index = group.findIndex((candidate) => candidate.id === node.id)
      return {
        ...node,
        position: {
          x: isImage ? 120 : isVideo ? 560 : 980,
          y: 100 + index * (isImage ? 660 : isVideo ? 580 : 470),
        },
      }
    })
    setNodes(nextNodes)
    setCanvas((current) => current ? {
      ...current,
      nodes: current.nodes.map((item) => {
        const flow = nextNodes.find((node) => node.id === item.id)
        return flow ? { ...item, position: flow.position } : item
      }),
    } : current)
    persistPositions(nextNodes)
    window.setTimeout(() => void fitView({ padding: 0.16, duration: 520, maxZoom: 1 }), 40)
    setNotice('画布已整理')
    window.setTimeout(() => setNotice(''), 1800)
  }

  async function deleteSelectedNodes() {
    const selected = nodes.filter((node) => node.selected)
    for (const node of selected) await deleteNode(node.id)
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setNodes((current) => current.map((node) => ({ ...node, selected: true })))
        return
      }
      if (event.key === 'Escape') {
        setAddMenuOpen(false)
        setContextMenu(null)
        setSidePanel(null)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && nodes.some((node) => node.selected)) {
        event.preventDefault()
        void deleteSelectedNodes()
        return
      }
      if (!canvas || event.ctrlKey || event.metaKey || event.altKey) return
      switch (event.key.toLowerCase()) {
        case 'a':
          setAddMenuOpen((open) => !open)
          break
        case 'v':
          void addVideoNode()
          break
        case 'i':
          void addImageNode()
          break
        case 'u':
          openUpload()
          break
        case 'f':
          void fitView({ padding: 0.16, duration: 420, maxZoom: 1 })
          break
        case 'm':
          setShowMinimap((shown) => !shown)
          break
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [canvas, fitView, nodes, setNodes])

  return (
    <CanvasActionsContext.Provider value={actions}>
      <main className="canvasAppShell">
        <header className="canvasTopbar">
          <div className="canvasBrand">
            <Link className="canvasLogoButton" href="/canvas" title="返回画布列表" aria-label="返回画布列表"><Workflow size={18} /></Link>
            <span className="canvasBrandName">Vimo <em>Desktop</em></span>
          </div>
          {canvas ? (
            <div className="canvasTitleCluster">
              <input
                className="canvasDocumentName canvasTextControl"
                value={canvas.name}
                maxLength={80}
                aria-label="画布名称"
                spellCheck={false}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
                onChange={(event) => setCanvas((current) => current ? { ...current, name: event.target.value } : current)}
                onBlur={(event) => void renameCanvas(event.target.value)}
              />
              <span><Save size={11} />已自动保存</span>
            </div>
          ) : <span />}
          <div className="canvasUserBadge" title={`${user.name} · ${user.email}`}>
            <span>{user.name.slice(0, 1).toUpperCase()}</span>
            <strong>{user.name}</strong>
          </div>
        </header>

        <section className="canvasStage">
          {canvas ? (
            <ReactFlow<FlowNode, FlowEdge>
              key={canvas.id}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange as (changes: NodeChange<FlowNode>[]) => void}
              onEdgesChange={onEdgesChange as (changes: EdgeChange<FlowEdge>[]) => void}
              onConnect={(connection) => void connectNodes(connection)}
              onEdgesDelete={(deleted) => void deleteEdges(deleted)}
              onPaneClick={() => {
                setAddMenuOpen(false)
                setContextMenu(null)
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                setAddMenuOpen(false)
                setContextMenu({
                  clientX: Math.min(event.clientX, window.innerWidth - 232),
                  clientY: Math.min(event.clientY, window.innerHeight - 360),
                  flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                })
              }}
              onNodeDragStop={(_event, _node, selectedNodes) => {
                const nextNodes = selectedNodes.length > 0 ? nodes.map((node) => selectedNodes.find((selected) => selected.id === node.id) || node) : nodes
                setCanvas((current) => current ? {
                  ...current,
                  nodes: current.nodes.map((item) => {
                    const flow = nextNodes.find((node) => node.id === item.id)
                    return flow ? { ...item, position: flow.position } : item
                  }),
                } : current)
                persistPositions(nextNodes)
              }}
              onMoveEnd={(_event, viewport) => {
                setZoomPercent(Math.round(viewport.zoom * 100))
                persistPositions(nodes, viewport)
              }}
              defaultViewport={canvas.viewport}
              minZoom={0.2}
              maxZoom={2}
              snapToGrid
              snapGrid={[16, 16]}
              deleteKeyCode={null}
              selectionOnDrag
              panOnDrag={[1, 2]}
              multiSelectionKeyCode={['Meta', 'Control']}
              fitView={canvas.nodes.length === 0}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} color="#d5dbe5" />
              {showMinimap ? (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  ariaLabel="小地图，可拖动或点击跳转到指定位置"
                  nodeColor={(node) => (node.data as CanvasNodeData).node.type === 'image'
                    ? '#52525b'
                    : (node.data as CanvasNodeData).node.type === 'audio' ? '#8b5cf6' : '#ef5a49'}
                  maskColor="rgba(9, 9, 11, 0.46)"
                />
              ) : null}
              <Panel position="bottom-left" className={`canvasViewportToolbar ${showMinimap ? 'withMinimap' : ''}`}>
                <button type="button" title="全局搜索" aria-label="全局搜索" onClick={() => setSidePanel(sidePanel === 'nodes' ? null : 'nodes')}><Search size={15} /></button>
                <button type="button" title="画布整理" aria-label="画布整理" onClick={arrangeCanvas}><Sparkles size={15} /></button>
                <button className={showMinimap ? 'active' : ''} type="button" title="小地图" aria-label="小地图" onClick={() => setShowMinimap((shown) => !shown)}><Grid2X2 size={15} /></button>
                <span className="canvasToolbarDivider" />
                <button type="button" title="缩小" aria-label="缩小" onClick={() => void zoomOut({ duration: 180 })}><Minus size={15} /></button>
                <button className="canvasZoomValue" type="button" title="重置缩放" onClick={() => void fitView({ padding: 0.16, duration: 420, maxZoom: 1 })}>{zoomPercent}%</button>
                <button type="button" title="放大" aria-label="放大" onClick={() => void zoomIn({ duration: 180 })}><ZoomIn size={15} /></button>
                <button type="button" title="适应内容" aria-label="适应内容" onClick={() => void fitView({ padding: 0.16, duration: 420, maxZoom: 1 })}><Maximize2 size={14} /></button>
              </Panel>
              {nodes.some((node) => node.selected) ? (
                <Panel position="bottom-center" className="canvasSelectionBar">
                  <MousePointer2 size={14} />
                  <span>已选 {nodes.filter((node) => node.selected).length} 个节点</span>
                  <button type="button" disabled={busy} onClick={() => void deleteSelectedNodes()}><Trash2 size={14} />删除</button>
                </Panel>
              ) : null}
            </ReactFlow>
          ) : (
            <div className="canvasEmptyState">
              <Workflow size={34} />
              <strong>新建画布开始创作</strong>
              <button type="button" onClick={() => {
                setCreating(true)
                setSidePanel('canvases')
              }}><Plus size={16} />新建画布</button>
            </div>
          )}

          <nav className="canvasToolRail" aria-label="画布工具">
            <button className={addMenuOpen ? 'primary active' : 'primary'} type="button" title="添加新内容 (A)" aria-label="添加新内容" onClick={() => {
              setAddMenuOpen((open) => !open)
              setSidePanel(null)
              setContextMenu(null)
            }}><Plus size={20} /></button>
            <span className="canvasRailDivider" />
            <button className={sidePanel === 'canvases' ? 'active' : ''} type="button" title="我的画布" aria-label="我的画布" onClick={() => {
              setSidePanel(sidePanel === 'canvases' ? null : 'canvases')
              setAddMenuOpen(false)
            }}><FolderOpen size={19} /></button>
            <button className={sidePanel === 'nodes' ? 'active' : ''} type="button" title="节点管理" aria-label="节点管理" onClick={() => {
              setSidePanel(sidePanel === 'nodes' ? null : 'nodes')
              setAddMenuOpen(false)
            }}><LayoutList size={19} /></button>
            <button type="button" title="画布整理" aria-label="画布整理" onClick={arrangeCanvas}><Sparkles size={19} /></button>
            <button type="button" title="刷新画布" aria-label="刷新画布" disabled={busy} onClick={() => void refreshCanvas()}><RefreshCw className={busy ? 'spin' : ''} size={18} /></button>
            <span className="canvasRailDivider" />
            <button className={sidePanel === 'shortcuts' ? 'active' : ''} type="button" title="快捷键与帮助" aria-label="快捷键与帮助" onClick={() => {
              setSidePanel(sidePanel === 'shortcuts' ? null : 'shortcuts')
              setAddMenuOpen(false)
            }}><CircleHelp size={19} /></button>
            <Link href="/" title="返回首页" aria-label="返回首页"><ArrowLeft size={19} /></Link>
          </nav>

          {addMenuOpen ? (
            <section className="canvasAddMenu" role="dialog" aria-label="添加节点">
              <header><strong>添加节点</strong><kbd>A</kbd></header>
              <div className="canvasAddMenuGrid">
                <button type="button" onClick={() => openUpload()}><span><Upload size={18} /></span><strong>上传图片</strong><small>JPG、PNG、WebP</small></button>
                <button type="button" onClick={() => {
                  setAddMenuOpen(false)
                  void addVideoNode()
                }}><span><Video size={18} /></span><strong>生成视频</strong><small>文生视频 · 图生视频</small></button>
                <button type="button" onClick={() => {
                  setAddMenuOpen(false)
                  void addImageNode()
                }}><span><ImagePlus size={18} /></span><strong>生成图片</strong><small>文生图 · 参考图生图</small></button>
                <button type="button" onClick={() => openAudioUpload()}><span><Upload size={18} /></span><strong>上传参考音频</strong><small>MP3、WAV、M4A、AAC、OGG</small></button>
                <button type="button" onClick={() => {
                  setAddMenuOpen(false)
                  void addAudioNode()
                }}><span><AudioLines size={18} /></span><strong>生成参考音频</strong><small>内容 · 风格 · 情绪 · 用途</small></button>
                <button type="button" disabled title="后续版本接入"><span><Film size={18} /></span><strong>时间线</strong><small>即将接入</small></button>
              </div>
              <footer>也可以在画布空白处点击右键</footer>
            </section>
          ) : null}

          {sidePanel ? (
            <aside className="canvasSidebar" aria-label={sidePanel === 'canvases' ? '我的画布' : sidePanel === 'nodes' ? '节点管理' : '快捷键说明'}>
              <div className="canvasSidebarHeader">
                <strong>{sidePanel === 'canvases' ? '我的画布' : sidePanel === 'nodes' ? '节点管理' : '快捷键说明'}</strong>
                <div>
                  {sidePanel === 'canvases' ? <button className="canvasNodeIconButton" type="button" title="新建画布" aria-label="新建画布" onClick={() => setCreating(true)}><Plus size={15} /></button> : null}
                  <button className="canvasNodeIconButton" type="button" title="关闭" aria-label="关闭" onClick={() => setSidePanel(null)}><X size={15} /></button>
                </div>
              </div>
              {sidePanel === 'canvases' ? (
                <>
                  {creating ? (
                    <form className="canvasCreateForm" onSubmit={(event) => void createCanvas(event)}>
                      <input className="canvasTextControl" value={newCanvasName} onChange={(event) => setNewCanvasName(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="画布名称" maxLength={80} autoFocus />
                      <button type="submit" disabled={busy || !newCanvasName.trim()} title="创建" aria-label="创建画布"><Check size={14} /></button>
                      {canvases.length > 0 ? <button type="button" title="取消" aria-label="取消" onClick={() => setCreating(false)}><X size={14} /></button> : null}
                    </form>
                  ) : null}
                  <nav className="canvasDocumentList">
                    {canvases.map((item) => (
                      <button key={item.id} className={canvas?.id === item.id ? 'active' : ''} type="button" onClick={() => void openCanvas(item.id)}>
                        <span className="canvasDocumentThumb">{item.coverUrl ? <img src={item.coverUrl} alt="" /> : <Workflow size={17} />}</span>
                        <span><strong>{item.name}</strong><small>{item.nodeCount} 个节点 · {formatUpdatedAt(item.updatedAt)}</small></span>
                      </button>
                    ))}
                  </nav>
                </>
              ) : sidePanel === 'nodes' ? (
                <>
                  <label className="canvasNodeSearch"><Search size={15} /><input className="canvasTextControl" value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="搜索节点名称或编号" /></label>
                  <div className="canvasManagedNodeList">
                    {filteredCanvasNodes.map((node) => (
                      <button key={node.id} type="button" onClick={() => focusCanvasNode(node.id)}>
                        <span>{node.type === 'image' ? <Images size={15} /> : node.type === 'audio' ? <AudioLines size={15} /> : <Video size={15} />}</span>
                        <span><strong>{node.title}</strong><small>{node.type === 'image' ? (node.model ? '图片生成' : '图片') : node.type === 'audio' ? (node.model ? '参考音频生成' : '参考音频') : '视频生成'} · {node.id.slice(-6)}</small></span>
                      </button>
                    ))}
                    {filteredCanvasNodes.length === 0 ? <p>暂无匹配搜索的内容</p> : null}
                  </div>
                </>
              ) : (
                <div className="canvasShortcutList">
                  <p><Keyboard size={16} />常用操作</p>
                  <dl>
                    <div><dt>添加节点</dt><dd><kbd>A</kbd></dd></div>
                    <div><dt>上传图片</dt><dd><kbd>U</kbd></dd></div>
                    <div><dt>生成视频</dt><dd><kbd>V</kbd></dd></div>
                    <div><dt>生成图片</dt><dd><kbd>I</kbd></dd></div>
                    <div><dt>适应内容</dt><dd><kbd>F</kbd></dd></div>
                    <div><dt>切换小地图</dt><dd><kbd>M</kbd></dd></div>
                    <div><dt>全选节点</dt><dd><kbd>Ctrl</kbd><span>+</span><kbd>A</kbd></dd></div>
                    <div><dt>删除节点</dt><dd><kbd>Delete</kbd></dd></div>
                    <div><dt>关闭面板</dt><dd><kbd>Esc</kbd></dd></div>
                  </dl>
                </div>
              )}
            </aside>
          ) : null}

          {contextMenu ? (
            <div className="canvasContextMenu" role="menu" style={{ left: contextMenu.clientX, top: contextMenu.clientY }}>
              <strong>添加节点</strong>
              <button type="button" role="menuitem" onClick={() => openUpload(contextMenu.flowPosition)}><Upload size={15} />上传图片 <kbd>U</kbd></button>
              <button type="button" role="menuitem" onClick={() => {
                const position = contextMenu.flowPosition
                setContextMenu(null)
                void addVideoNode(position)
              }}><Video size={15} />生成视频 <kbd>V</kbd></button>
              <button type="button" role="menuitem" onClick={() => {
                const position = contextMenu.flowPosition
                setContextMenu(null)
                void addImageNode(position)
              }}><ImagePlus size={15} />生成图片 <kbd>I</kbd></button>
              <button type="button" role="menuitem" onClick={() => openAudioUpload(contextMenu.flowPosition)}><Upload size={15} />上传参考音频</button>
              <button type="button" role="menuitem" onClick={() => {
                const position = contextMenu.flowPosition
                setContextMenu(null)
                void addAudioNode(position)
              }}><AudioLines size={15} />生成参考音频</button>
              <span />
              <button type="button" role="menuitem" onClick={arrangeCanvas}><Sparkles size={15} />画布整理</button>
              <button type="button" role="menuitem" onClick={() => void fitView({ padding: 0.16, duration: 420, maxZoom: 1 })}><Maximize2 size={15} />适应内容 <kbd>F</kbd></button>
            </div>
          ) : null}

          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void handleFiles(event)} />
          <input ref={audioFileInput} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg" multiple hidden onChange={(event) => void handleAudioFiles(event)} />
          {busy ? <div className="canvasBusyIndicator"><Loader2 className="spin" size={15} />处理中</div> : null}
          {notice ? <div className="canvasNotice"><Save size={15} />{notice}</div> : null}
          {error ? <div className="canvasError" role="alert"><span>{error}{error.includes('余额不足') ? <Link href="/billing">去充值</Link> : null}</span><button type="button" title="关闭" aria-label="关闭错误" onClick={() => setError('')}><X size={14} /></button></div> : null}
        </section>
      </main>
    </CanvasActionsContext.Provider>
  )
}

