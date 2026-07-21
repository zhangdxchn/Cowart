import {
  Box,
  GeoShapeUtil,
  TldrawUiContextualToolbar,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  createShapeId,
  getColorValue,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { generateKeyBetween } from 'fractional-indexing'
import { useCallback, useEffect, useState } from 'react'

import {
  DEFAULT_MIND_MAP_STRUCTURE_ID,
  DEFAULT_MIND_MAP_STYLE_PRESET_ID,
  MIND_MAP_STRUCTURES,
  MIND_MAP_STYLE_PRESETS,
  MIND_MAP_VERSION,
  buildMindMapGraph,
  collectMindMapBranchRecordIds,
  collectMindMapCascadeShapeIds,
  computeMindMapLayout,
  createMindMapBindingUpdates,
  createMindMapDepthStyleUpdates,
  createMindMapLayoutUpdates,
  createMindMapPresetUpdates,
  createMindMapStyleUpdates,
  createMindMapTopicAtomically,
  createMindMapTranslationUpdates,
  getMindMapChildStyle,
  getMindMapConnectionAnchors,
  getMindMapDescendantIds,
  getMindMapLabelColor,
  getMindMapNodeDepth,
  getMindMapNodeDimensions,
  getMindMapPresetNodeProps,
  getMindMapRootId,
  getMindMapStructureDefinition,
  getMindMapStructureId,
  getMindMapStylePresetId,
  isMindMapEdge,
  isMindMapNode,
  resolveMindMapChildPlacement
} from './mindMapModel.js'

export const MIND_MAP_TOOL_ID = 'mind-map'
export const MIND_MAP_TOOL_LABEL = '思维导图'

const MIND_MAP_HORIZONTAL_GAP = 112
const MIND_MAP_VERTICAL_GAP = 32
const MIND_MAP_BRANCH_COLORS = ['orange', 'green', 'violet', 'red', 'light-blue', 'blue']
const MIND_MAP_COLOR_OPTIONS = ['black', 'grey', 'blue', 'light-blue', 'orange', 'green', 'light-green', 'violet', 'red', 'light-red']
const MIND_MAP_FILL_OPTIONS = [
  { value: 'none', label: '无填充' },
  { value: 'semi', label: '浅填充' },
  { value: 'solid', label: '实心' },
  { value: 'pattern', label: '纹理' }
]
const MIND_MAP_DASH_OPTIONS = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'draw', label: '手绘' }
]
const MIND_MAP_SIZE_OPTIONS = [
  { value: 's', label: '小' },
  { value: 'm', label: '中' },
  { value: 'l', label: '大' },
  { value: 'xl', label: '特大' }
]
const MIND_MAP_FONT_OPTIONS = [
  { value: 'sans', label: '无衬线' },
  { value: 'draw', label: '手写' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' }
]
const MIND_MAP_GEO_OPTIONS = [
  { value: 'rectangle', label: '矩形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'oval', label: '胶囊' }
]
const MIND_MAP_CONNECTOR_OPTIONS = [
  { value: 'elbow', label: '折线' },
  { value: 'arc', label: '直线' }
]

export const mindMapToolIcon = (
  <svg aria-hidden="true" className="cowart-mind-map-tool-icon" viewBox="0 0 24 24">
    <rect height="6" rx="2" width="8" x="8" y="9" />
    <rect height="4" rx="1.5" width="6" x="1" y="2" />
    <rect height="4" rx="1.5" width="6" x="17" y="2" />
    <rect height="4" rx="1.5" width="6" x="1" y="18" />
    <rect height="4" rx="1.5" width="6" x="17" y="18" />
    <path d="M8 12H5a2 2 0 0 1-2-2V6M16 12h3a2 2 0 0 0 2-2V6M8 12H5a2 2 0 0 0-2 2v4M16 12h3a2 2 0 0 1 2 2v4" />
  </svg>
)

function editorMindMapGraph(editor) {
  return buildMindMapGraph({
    shapes: editor.getCurrentPageShapes(),
    bindings: editor.store.allRecords().filter((record) => record?.typeName === 'binding')
  })
}

function nodeScale(editor) {
  return editor.getResizeScaleFactor()
}

function mindMapNodeMeta({
  order,
  side = 'center',
  autoLayout,
  collapsed = false,
  structure = null,
  stylePreset = null
}) {
  return {
    cowartMindMapNode: true,
    cowartMindMapVersion: MIND_MAP_VERSION,
    cowartMindMapOrder: order,
    cowartMindMapSide: side,
    cowartMindMapCollapsed: collapsed,
    cowartMindMapHidden: false,
    ...(structure ? { cowartMindMapStructure: structure } : {}),
    ...(stylePreset ? { cowartMindMapStylePreset: stylePreset } : {}),
    ...(typeof autoLayout === 'boolean' ? { cowartMindMapAutoLayout: autoLayout } : {})
  }
}

function nextChildOrder(graph, parentId, afterChildId = null) {
  const childIds = graph.childrenByParent.get(parentId) ?? []
  if (!childIds.length) return generateKeyBetween(null, null)

  if (afterChildId) {
    const index = childIds.indexOf(afterChildId)
    if (index >= 0) {
      const previous = graph.nodeById.get(childIds[index])?.meta?.cowartMindMapOrder ?? null
      const next = graph.nodeById.get(childIds[index + 1])?.meta?.cowartMindMapOrder ?? null
      return generateKeyBetween(previous, next)
    }
  }

  const lastOrder = graph.nodeById.get(childIds.at(-1))?.meta?.cowartMindMapOrder ?? null
  return generateKeyBetween(lastOrder, null)
}

function branchColor(graph, parentId, side) {
  const parent = graph.nodeById.get(parentId)
  if (!parent) return 'blue'
  if (graph.parentByChild.has(parentId)) return parent.props?.color ?? 'blue'

  const siblings = graph.childrenByParent.get(parentId) ?? []
  const sideIndex = siblings.filter((childId) => {
    const childSide = graph.nodeById.get(childId)?.meta?.cowartMindMapSide
    return childSide === side
  }).length
  return MIND_MAP_BRANCH_COLORS[sideIndex % MIND_MAP_BRANCH_COLORS.length]
}

function startEditingMindMapNode(editor, nodeId) {
  editor.select(nodeId)
  editor.setCurrentTool('select.idle')
  editor.timers.requestAnimationFrame(() => {
    if (!isMindMapNode(editor.getShape(nodeId))) return
    startEditingShapeWithRichText(editor, nodeId, { selectAll: true })
  })
}

function createMindMapRoot(editor) {
  const scale = nodeScale(editor)
  const { w: width, h: height } = getMindMapNodeDimensions(0, scale)
  const center = editor.getViewportPageBounds().center
  const nodeId = createShapeId()
  const nodeStyle = getMindMapPresetNodeProps(DEFAULT_MIND_MAP_STYLE_PRESET_ID, 0, 'blue')

  editor.markHistoryStoppingPoint('create_mind_map')
  editor.createShape({
    id: nodeId,
    type: 'geo',
    x: center.x - width / 2,
    y: center.y - height / 2,
    meta: mindMapNodeMeta({
      order: generateKeyBetween(null, null),
      side: 'center',
      autoLayout: true,
      structure: DEFAULT_MIND_MAP_STRUCTURE_ID,
      stylePreset: DEFAULT_MIND_MAP_STYLE_PRESET_ID
    }),
    props: {
      w: width,
      h: height,
      ...nodeStyle,
      align: 'middle',
      verticalAlign: 'middle',
      richText: toRichText('中心主题'),
      scale
    }
  })
  startEditingMindMapNode(editor, nodeId)
  return nodeId
}

function arrowBindingProps(terminal, normalizedAnchor) {
  return {
    terminal,
    normalizedAnchor,
    isPrecise: true,
    isExact: false,
    snap: 'none'
  }
}

function createMindMapEdgeRecords(parent, child, side, edgeStyle, scale, structureId) {
  const edgeId = createShapeId()
  const anchors = getMindMapConnectionAnchors(structureId, side)
  const parentCenter = {
    x: Number(parent.x) + Number(parent.props?.w || 0) / 2,
    y: Number(parent.y) + (Number(parent.props?.h || 0) + Number(parent.props?.growY || 0)) / 2
  }
  const childCenter = {
    x: Number(child.x) + Number(child.props?.w || 0) / 2,
    y: Number(child.y) + (Number(child.props?.h || 0) + Number(child.props?.growY || 0)) / 2
  }

  const edgeShape = {
    id: edgeId,
    type: 'arrow',
    x: parentCenter.x,
    y: parentCenter.y,
    meta: {
      cowartMindMapEdge: true,
      cowartMindMapVersion: MIND_MAP_VERSION,
      cowartMindMapHidden: false
    },
    props: {
      ...edgeStyle,
      fill: 'none',
      start: { x: 0, y: 0 },
      end: { x: childCenter.x - parentCenter.x, y: childCenter.y - parentCenter.y },
      arrowheadStart: 'none',
      arrowheadEnd: 'none',
      richText: toRichText(''),
      scale
    }
  }
  const bindings = [
    {
      type: 'arrow',
      fromId: edgeId,
      toId: parent.id,
      props: arrowBindingProps('start', anchors.start)
    },
    {
      type: 'arrow',
      fromId: edgeId,
      toId: child.id,
      props: arrowBindingProps('end', anchors.end)
    }
  ]
  return { edgeShape, bindings }
}

function createMindMapTopic(editor, parentId, { afterChildId = null, side = null, label = '子主题' } = {}) {
  const graph = editorMindMapGraph(editor)
  const parent = graph.nodeById.get(parentId)
  if (!parent) return null

  const rootId = getMindMapRootId(graph, parentId)
  const root = graph.nodeById.get(rootId)
  const structureId = getMindMapStructureId(root)
  const structure = getMindMapStructureDefinition(structureId)
  const { savedSide: resolvedSide, visualDirection: visualSide } = resolveMindMapChildPlacement({
    structureId,
    parentIsRoot: !graph.parentByChild.has(parentId),
    parentSide: parent.meta?.cowartMindMapSide,
    requestedSide: side
  })
  const color = branchColor(graph, parentId, resolvedSide)
  const scale = Number(root?.props?.scale || parent.props?.scale || 1)
  const presetId = getMindMapStylePresetId(root)
  const childStyle = getMindMapChildStyle(graph, parentId, {
    side: resolvedSide,
    color,
    presetId,
    preferredSiblingId: afterChildId
  })
  const { w: width, h: height } = getMindMapNodeDimensions(childStyle.depth, scale)
  const siblingCount = (graph.childrenByParent.get(parentId) ?? []).length
  const provisionalX = structure.direction === 'down'
    ? Number(parent.x) + siblingCount * (width + MIND_MAP_VERTICAL_GAP * scale)
    : visualSide === 'left'
      ? Number(parent.x) - width - MIND_MAP_HORIZONTAL_GAP * scale
      : Number(parent.x) + Number(parent.props?.w || 0) + MIND_MAP_HORIZONTAL_GAP * scale
  const provisionalY = structure.direction === 'down'
    ? Number(parent.y) + Number(parent.props?.h || 0) + MIND_MAP_HORIZONTAL_GAP * scale
    : Number(parent.y) + siblingCount * (height + MIND_MAP_VERTICAL_GAP * scale)
  const nodeId = createShapeId()
  const nodeShape = {
    id: nodeId,
    type: 'geo',
    x: provisionalX,
    y: provisionalY,
    meta: mindMapNodeMeta({
      order: nextChildOrder(graph, parentId, afterChildId),
      side: resolvedSide
    }),
    props: {
      w: width,
      h: height,
      ...childStyle.nodeProps,
      align: 'middle',
      verticalAlign: 'middle',
      richText: toRichText(label),
      scale
    }
  }
  const { edgeShape, bindings } = createMindMapEdgeRecords(
    parent,
    nodeShape,
    visualSide,
    childStyle.edgeProps,
    scale,
    structureId
  )
  const rootUpdate = root?.meta?.cowartMindMapAutoLayout !== false
    ? {
        id: root.id,
        type: root.type,
        meta: { ...root.meta, cowartMindMapAutoLayout: true }
      }
    : null

  editor.markHistoryStoppingPoint('create_mind_map_topic')
  editor.run(() => {
    createMindMapTopicAtomically(editor, nodeShape, edgeShape, bindings, rootUpdate)
  })
  startEditingMindMapNode(editor, nodeId)
  return nodeId
}

function createMindMapSibling(editor, nodeId) {
  const graph = editorMindMapGraph(editor)
  const parentId = graph.parentByChild.get(nodeId)
  if (!parentId) return createMindMapTopic(editor, nodeId)
  const node = graph.nodeById.get(nodeId)
  return createMindMapTopic(editor, parentId, {
    afterChildId: nodeId,
    side: node?.meta?.cowartMindMapSide,
    label: '主题'
  })
}

function promoteMindMapNode(editor, nodeId) {
  const graph = editorMindMapGraph(editor)
  const parentId = graph.parentByChild.get(nodeId)
  const grandparentId = parentId ? graph.parentByChild.get(parentId) : null
  if (!grandparentId) return false

  const node = graph.nodeById.get(nodeId)
  const parent = graph.nodeById.get(parentId)
  const grandparent = graph.nodeById.get(grandparentId)
  const edgeId = graph.edgeByChild.get(nodeId)
  const relation = edgeId ? graph.relationByEdge.get(edgeId) : null
  if (!node || !parent || !grandparent || !relation) return false

  const rootId = getMindMapRootId(graph, nodeId)
  const root = graph.nodeById.get(rootId)
  const structureId = getMindMapStructureId(root)
  const presetId = getMindMapStylePresetId(root)
  const currentDepth = getMindMapNodeDepth(graph, nodeId)
  const targetDepth = currentDepth - 1
  const depthStyleUpdates = createMindMapDepthStyleUpdates(graph, nodeId, { presetId, targetDepth })
  const nodeStyleUpdate = depthStyleUpdates.find((update) => update.id === node.id)
  const edgeStyleUpdates = depthStyleUpdates.filter((update) => update.id !== node.id)
  const promotedNodeProps = { ...nodeStyleUpdate?.props }
  const promotedToRoot = grandparentId === getMindMapRootId(graph, grandparentId)
  const { savedSide: side, visualDirection: visualSide } = resolveMindMapChildPlacement({
    structureId,
    parentIsRoot: promotedToRoot,
    parentSide: grandparent.meta?.cowartMindMapSide,
    requestedSide: node.meta?.cowartMindMapSide
  })
  const anchors = getMindMapConnectionAnchors(structureId, visualSide)

  editor.markHistoryStoppingPoint('promote_mind_map_topic')
  editor.run(() => {
    editor.updateBindings([
      {
        id: relation.startBinding.id,
        type: relation.startBinding.type,
        fromId: relation.startBinding.fromId,
        toId: grandparentId,
        props: arrowBindingProps('start', anchors.start)
      },
      {
        id: relation.endBinding.id,
        type: relation.endBinding.type,
        fromId: relation.endBinding.fromId,
        toId: node.id,
        props: arrowBindingProps('end', anchors.end)
      }
    ])
    editor.updateShape({
      id: node.id,
      type: node.type,
      ...(Object.keys(promotedNodeProps).length ? { props: promotedNodeProps } : {}),
      meta: {
        ...node.meta,
        cowartMindMapSide: side,
        cowartMindMapOrder: nextChildOrder(graph, grandparentId)
      }
    })
    if (edgeStyleUpdates.length) editor.updateShapes(edgeStyleUpdates)
  }, { ignoreShapeLock: true })
  editor.select(nodeId)
  return true
}

function toggleMindMapCollapse(editor, nodeId) {
  const node = editor.getShape(nodeId)
  if (!isMindMapNode(node)) return
  editor.markHistoryStoppingPoint('toggle_mind_map_branch')
  editor.updateShape({
    id: node.id,
    type: node.type,
    meta: {
      ...node.meta,
      cowartMindMapCollapsed: node.meta?.cowartMindMapCollapsed !== true
    }
  })
}

function requestMindMapLayout(editor, nodeId) {
  const graph = editorMindMapGraph(editor)
  const root = graph.nodeById.get(getMindMapRootId(graph, nodeId))
  if (!root) return
  editor.markHistoryStoppingPoint('layout_mind_map')
  editor.updateShape({
    id: root.id,
    type: root.type,
    meta: { ...root.meta, cowartMindMapAutoLayout: true }
  })
}

function applyMindMapStructure(editor, rootId, structureId) {
  const root = editor.getShape(rootId)
  if (!isMindMapNode(root) || !MIND_MAP_STRUCTURES[structureId]) return
  editor.markHistoryStoppingPoint('change_mind_map_structure')
  editor.updateShape({
    id: root.id,
    type: root.type,
    meta: {
      ...root.meta,
      cowartMindMapStructure: structureId,
      cowartMindMapAutoLayout: true
    }
  })
}

export function createMindMapToolDefinition(editor) {
  return {
    id: MIND_MAP_TOOL_ID,
    label: 'tool.mind-map',
    icon: mindMapToolIcon,
    onSelect() {
      createMindMapRoot(editor)
    },
    meta: { cowartTool: 'mind-map' }
  }
}

export function expandMindMapClipboardContent(editor, content) {
  if (content?.rootShapeIds?.length !== 1) return content
  const rootShapeId = content.rootShapeIds[0]
  const selectedNode = editor.getShape(rootShapeId)
  if (!isMindMapNode(selectedNode)) return content

  const graph = editorMindMapGraph(editor)
  const recordIds = collectMindMapBranchRecordIds(graph, rootShapeId)
  const shapeIds = recordIds.filter((recordId) => recordId.startsWith('shape:'))
  return editor.getContentFromCurrentPage(shapeIds) ?? content
}

export function getMindMapShapeVisibility(shape) {
  return shape?.meta?.cowartMindMapHidden === true ? 'hidden' : 'inherit'
}

export class CowartMindMapGeoShapeUtil extends GeoShapeUtil {
  onTranslateEnd(initial, current) {
    if (!isMindMapNode(initial) || !isMindMapNode(current)) return
    const graph = editorMindMapGraph(this.editor)
    const updates = createMindMapTranslationUpdates(
      graph,
      initial,
      current,
      new Set(this.editor.getSelectedShapeIds())
    )
    if (updates.length) this.editor.updateShapes(updates)
  }
}

function synchronizeMindMaps(editor) {
  const graph = editorMindMapGraph(editor)
  const updates = []
  const bindingUpdates = []

  for (const edgeId of graph.invalidEdgeIds) {
    const edge = graph.edgeById.get(edgeId)
    if (!edge) continue
    updates.push({
      id: edge.id,
      type: edge.type,
      isLocked: false,
      meta: {
        ...edge.meta,
        cowartMindMapEdge: false,
        cowartMindMapHidden: false
      }
    })
  }

  for (const rootId of graph.rootIds) {
    const root = graph.nodeById.get(rootId)
    if (!root) continue
    const autoLayout = root.meta?.cowartMindMapAutoLayout !== false
    const layout = computeMindMapLayout(graph, rootId, {
      horizontalGap: MIND_MAP_HORIZONTAL_GAP * Number(root.props?.scale || 1),
      verticalGap: MIND_MAP_VERTICAL_GAP * Number(root.props?.scale || 1)
    })
    updates.push(...createMindMapLayoutUpdates(graph, layout, {
      includePositions: autoLayout,
      autoLayout
    }))
    bindingUpdates.push(...createMindMapBindingUpdates(graph, layout))
  }

  if (updates.length || bindingUpdates.length) {
    editor.run(() => {
      if (updates.length) editor.updateShapes(updates)
      if (bindingUpdates.length) editor.updateBindings(bindingUpdates)
    }, { ignoreShapeLock: true })
  }
}

export function installMindMapLifecycle(editor) {
  let dirty = true
  let isSynchronizing = false
  let isCascadingDelete = false
  let lastCompleteGraph = editorMindMapGraph(editor)
  const pendingCascadeDeletes = new Map()

  const markDirty = () => {
    if (!isSynchronizing) dirty = true
  }
  const disposeShapeCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape) => {
    if (isMindMapNode(shape) || isMindMapEdge(shape)) markDirty()
  })
  const disposeShapeChange = editor.sideEffects.registerAfterChangeHandler('shape', (previous, next) => {
    if (isMindMapNode(previous) || isMindMapNode(next) || isMindMapEdge(previous) || isMindMapEdge(next)) markDirty()
  })
  const disposeShapeBeforeDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape) => {
    if (isCascadingDelete || !isMindMapNode(shape)) return
    const liveGraph = editorMindMapGraph(editor)
    pendingCascadeDeletes.set(shape.id, [
      ...new Set([
        ...collectMindMapCascadeShapeIds(lastCompleteGraph, shape.id),
        ...collectMindMapCascadeShapeIds(liveGraph, shape.id)
      ])
    ])
  })
  const disposeShapeDelete = editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
    markDirty()
    const cascadeIds = pendingCascadeDeletes.get(shape.id)
    pendingCascadeDeletes.delete(shape.id)
    if (!cascadeIds?.length) return

    const remainingIds = cascadeIds.filter((shapeId) => shapeId !== shape.id && editor.getShape(shapeId))
    if (!remainingIds.length) return
    isCascadingDelete = true
    try {
      editor.run(() => editor.deleteShapes(remainingIds), { ignoreShapeLock: true })
    } finally {
      isCascadingDelete = false
    }
  })
  const disposeBindingCreate = editor.sideEffects.registerAfterCreateHandler('binding', markDirty)
  const disposeBindingChange = editor.sideEffects.registerAfterChangeHandler('binding', markDirty)
  const disposeBindingDelete = editor.sideEffects.registerAfterDeleteHandler('binding', markDirty)
  const disposeOperation = editor.sideEffects.registerOperationCompleteHandler(() => {
    if (!dirty || isSynchronizing) return
    dirty = false
    isSynchronizing = true
    try {
      synchronizeMindMaps(editor)
      lastCompleteGraph = editorMindMapGraph(editor)
    } finally {
      isSynchronizing = false
    }
  })

  editor.timers.setTimeout(() => {
    isSynchronizing = true
    try {
      editor.run(() => synchronizeMindMaps(editor), { history: 'ignore', ignoreShapeLock: true })
      lastCompleteGraph = editorMindMapGraph(editor)
      dirty = false
    } finally {
      isSynchronizing = false
    }
  }, 100)

  return () => {
    disposeShapeCreate()
    disposeShapeChange()
    disposeShapeBeforeDelete()
    disposeShapeDelete()
    disposeBindingCreate()
    disposeBindingChange()
    disposeBindingDelete()
    disposeOperation()
  }
}

function CowartMindMapKeyboardShortcuts() {
  const editor = useEditor()

  useEffect(() => {
    const doc = editor.getContainerDocument()
    function handleKeyDown(event) {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      const editingShapeId = editor.getEditingShapeId()
      const selectedShape = editor.getOnlySelectedShape()
      const targetNode = editingShapeId ? editor.getShape(editingShapeId) : selectedShape
      if (!isMindMapNode(targetNode)) return

      const targetElement = event.target
      const isEditableTarget = targetElement?.closest?.('input, textarea, [contenteditable="true"]')
      if (isEditableTarget && editingShapeId !== targetNode.id) return

      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (event.shiftKey) {
          promoteMindMapNode(editor, targetNode.id)
        } else {
          createMindMapTopic(editor, targetNode.id)
        }
        return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        createMindMapSibling(editor, targetNode.id)
      }
    }

    doc.addEventListener('keydown', handleKeyDown, true)
    return () => doc.removeEventListener('keydown', handleKeyDown, true)
  }, [editor])

  return null
}

function applyMindMapStyle(editor, nodeId, scope, style) {
  const graph = editorMindMapGraph(editor)
  const updates = createMindMapStyleUpdates(graph, nodeId, scope, style)
  if (!updates.length) return
  editor.markHistoryStoppingPoint('change_mind_map_style')
  editor.run(() => editor.updateShapes(updates), { ignoreShapeLock: true })
}

function applyMindMapNodeStyle(editor, nodeId, scope, property, value) {
  if (property === 'color') {
    applyMindMapStyle(editor, nodeId, scope, {
      nodeProps: (node) => ({
        color: value,
        labelColor: getMindMapLabelColor(value, node.props?.fill)
      }),
      edgeProps: { color: value, labelColor: value }
    })
    return
  }
  if (property === 'fill') {
    applyMindMapStyle(editor, nodeId, scope, {
      nodeProps: (node) => ({
        fill: value,
        labelColor: getMindMapLabelColor(node.props?.color, value)
      })
    })
    return
  }
  applyMindMapStyle(editor, nodeId, scope, { nodeProps: { [property]: value } })
}

function applyMindMapEdgeStyle(editor, nodeId, scope, property, value) {
  const edgeProps = property === 'kind'
    ? { kind: value, ...(value === 'arc' ? { bend: 0 } : { elbowMidPoint: 0.5 }) }
    : { [property]: value }
  applyMindMapStyle(editor, nodeId, scope, { edgeProps })
}

function applyMindMapPreset(editor, rootId, presetId, { resetColors = false } = {}) {
  const graph = editorMindMapGraph(editor)
  const updates = createMindMapPresetUpdates(graph, rootId, presetId, {
    branchColors: resetColors ? MIND_MAP_BRANCH_COLORS : null
  })
  if (!updates.length) return
  editor.markHistoryStoppingPoint('change_mind_map_theme')
  editor.run(() => editor.updateShapes(updates), { ignoreShapeLock: true })
}

function MindMapStyleChoiceGroup({ disabled = false, label, options, value, onChange, testId }) {
  return (
    <section className="cowart-mind-map-style-section" data-disabled={disabled || undefined}>
      <div className="cowart-mind-map-style-heading">{label}</div>
      <div className="cowart-mind-map-style-options">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className="cowart-mind-map-style-option"
            data-testid={`${testId}.${option.value}`}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.label}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function MindMapStructurePreview({ structureId }) {
  const structure = getMindMapStructureDefinition(structureId)
  if (structure.direction === 'down') {
    return (
      <svg aria-hidden="true" className="cowart-mind-map-structure-preview" viewBox="0 0 72 38">
        <path d="M36 13V19M17 19H55M17 19V25M55 19V25" />
        <rect height="10" rx="2" width="22" x="25" y="3" />
        <rect height="9" rx="2" width="20" x="7" y="25" />
        <rect height="9" rx="2" width="20" x="45" y="25" />
      </svg>
    )
  }

  const pointsLeft = structure.direction === 'left'
  const isBalanced = structure.direction === 'balanced'
  const rootX = isBalanced ? 26 : pointsLeft ? 48 : 4
  return (
    <svg aria-hidden="true" className="cowart-mind-map-structure-preview" viewBox="0 0 72 38">
      {isBalanced ? (
        <>
          <path d="M26 19H17V9M46 19H55V9M26 19H17V29M46 19H55V29" />
          <rect height="8" rx="2" width="16" x="1" y="5" />
          <rect height="8" rx="2" width="16" x="55" y="5" />
          <rect height="8" rx="2" width="16" x="1" y="25" />
          <rect height="8" rx="2" width="16" x="55" y="25" />
        </>
      ) : pointsLeft ? (
        <>
          <path d="M48 19H36V9H30M36 19V29H30" />
          <rect height="8" rx="2" width="20" x="10" y="5" />
          <rect height="8" rx="2" width="20" x="10" y="25" />
        </>
      ) : (
        <>
          <path d="M24 19H36V9H42M36 19V29H42" />
          <rect height="8" rx="2" width="20" x="42" y="5" />
          <rect height="8" rx="2" width="20" x="42" y="25" />
        </>
      )}
      <rect height="12" rx="2" width="20" x={rootX} y="13" />
    </svg>
  )
}

function MindMapStructurePopover({ selected }) {
  const editor = useEditor()
  return (
    <TldrawUiPopover id={`mind-map-structure-${selected.root.id}`}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          aria-label="结构"
          className="cowart-mind-map-toolbar-button"
          data-testid="mind-map.structures"
          title="结构"
          type="icon"
        >
          <span aria-hidden="true" className="cowart-mind-map-toolbar-icon">⌘</span>
          <span className="cowart-mind-map-toolbar-label">结构</span>
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent align="center" collisionPadding={12} side="top">
        <div
          className="cowart-mind-map-structure-panel"
          data-testid="mind-map.structure-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="cowart-mind-map-style-title">思维导图结构</div>
          <div className="cowart-mind-map-structure-options">
            {Object.entries(MIND_MAP_STRUCTURES).map(([structureId, structure]) => (
              <button
                aria-label={structure.label}
                aria-pressed={selected.structureId === structureId}
                className="cowart-mind-map-structure-option"
                data-testid={`mind-map.structure.${structureId}`}
                key={structureId}
                onClick={() => applyMindMapStructure(editor, selected.root.id, structureId)}
                type="button"
              >
                <MindMapStructurePreview structureId={structureId} />
                <span>{structure.label}</span>
              </button>
            ))}
          </div>
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

function MindMapStylePopover({ selected }) {
  const editor = useEditor()
  const [scope, setScope] = useState('node')
  const themeColors = useValue(
    'cowart mind map style colors',
    () => editor.getCurrentTheme().colors[editor.getColorMode()],
    [editor]
  )
  const nodeProps = selected.node.props ?? {}
  const edgeProps = selected.incomingEdge?.props ?? {}
  const canStyleEdges = !selected.isRoot || scope !== 'node'
  const scopeOptions = [
    { value: 'node', label: '当前节点' },
    { value: 'branch', label: '当前分支' },
    { value: 'map', label: '整张导图' }
  ]

  return (
    <TldrawUiPopover id={`mind-map-style-${selected.node.id}`}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          aria-label="样式"
          className="cowart-mind-map-toolbar-button"
          data-testid="mind-map.styles"
          title="样式"
          type="icon"
        >
          <span aria-hidden="true" className="cowart-mind-map-toolbar-icon">◐</span>
          <span className="cowart-mind-map-toolbar-label">样式</span>
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent align="center" collisionPadding={12} side="top">
        <div
          className="cowart-mind-map-style-panel"
          data-testid="mind-map.style-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="cowart-mind-map-style-title">思维导图样式</div>
          <MindMapStyleChoiceGroup
            label="作用范围"
            onChange={setScope}
            options={scopeOptions}
            testId="mind-map.style-scope"
            value={scope}
          />
          <section className="cowart-mind-map-style-section">
            <div className="cowart-mind-map-style-heading">整图主题</div>
            <div className="cowart-mind-map-style-options">
              {Object.entries(MIND_MAP_STYLE_PRESETS).map(([presetId, preset]) => (
                <button
                  aria-pressed={selected.presetId === presetId}
                  className="cowart-mind-map-style-option cowart-mind-map-style-preset"
                  data-testid={`mind-map.style-preset.${presetId}`}
                  key={presetId}
                  onClick={() => applyMindMapPreset(editor, selected.root.id, presetId)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>
          <section className="cowart-mind-map-style-section">
            <div className="cowart-mind-map-style-heading">颜色</div>
            <div className="cowart-mind-map-color-options">
              {MIND_MAP_COLOR_OPTIONS.map((color) => (
                <button
                  aria-label={color}
                  aria-pressed={nodeProps.color === color}
                  className="cowart-mind-map-color-option"
                  data-testid={`mind-map.style-color.${color}`}
                  key={color}
                  onClick={() => applyMindMapNodeStyle(editor, selected.node.id, scope, 'color', color)}
                  style={{ '--cowart-mind-map-swatch': getColorValue(themeColors, color, 'solid') }}
                  title={color}
                  type="button"
                />
              ))}
            </div>
          </section>
          <MindMapStyleChoiceGroup
            label="填充"
            onChange={(value) => applyMindMapNodeStyle(editor, selected.node.id, scope, 'fill', value)}
            options={MIND_MAP_FILL_OPTIONS}
            testId="mind-map.style-fill"
            value={nodeProps.fill}
          />
          <MindMapStyleChoiceGroup
            label="节点形状"
            onChange={(value) => applyMindMapNodeStyle(editor, selected.node.id, scope, 'geo', value)}
            options={MIND_MAP_GEO_OPTIONS}
            testId="mind-map.style-geo"
            value={nodeProps.geo}
          />
          <MindMapStyleChoiceGroup
            label="字体"
            onChange={(value) => applyMindMapNodeStyle(editor, selected.node.id, scope, 'font', value)}
            options={MIND_MAP_FONT_OPTIONS}
            testId="mind-map.style-font"
            value={nodeProps.font}
          />
          <MindMapStyleChoiceGroup
            label="节点粗细"
            onChange={(value) => applyMindMapNodeStyle(editor, selected.node.id, scope, 'size', value)}
            options={MIND_MAP_SIZE_OPTIONS}
            testId="mind-map.style-size"
            value={nodeProps.size}
          />
          <MindMapStyleChoiceGroup
            label="节点轮廓"
            onChange={(value) => applyMindMapNodeStyle(editor, selected.node.id, scope, 'dash', value)}
            options={MIND_MAP_DASH_OPTIONS}
            testId="mind-map.style-node-dash"
            value={nodeProps.dash}
          />
          <MindMapStyleChoiceGroup
            disabled={!canStyleEdges}
            label="连接线"
            onChange={(value) => applyMindMapEdgeStyle(editor, selected.node.id, scope, 'kind', value)}
            options={MIND_MAP_CONNECTOR_OPTIONS}
            testId="mind-map.style-edge-kind"
            value={edgeProps.kind}
          />
          <MindMapStyleChoiceGroup
            disabled={!canStyleEdges}
            label="连接线粗细"
            onChange={(value) => applyMindMapEdgeStyle(editor, selected.node.id, scope, 'size', value)}
            options={MIND_MAP_SIZE_OPTIONS}
            testId="mind-map.style-edge-size"
            value={edgeProps.size}
          />
          <MindMapStyleChoiceGroup
            disabled={!canStyleEdges}
            label="连接线样式"
            onChange={(value) => applyMindMapEdgeStyle(editor, selected.node.id, scope, 'dash', value)}
            options={MIND_MAP_DASH_OPTIONS}
            testId="mind-map.style-edge-dash"
            value={edgeProps.dash}
          />
          <button
            className="cowart-mind-map-style-reset"
            data-testid="mind-map.style-reset"
            onClick={() => applyMindMapPreset(
              editor,
              selected.root.id,
              DEFAULT_MIND_MAP_STYLE_PRESET_ID,
              { resetColors: true }
            )}
            type="button"
          >
            恢复默认样式
          </button>
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

function MindMapToolbarButton({ icon, label, onClick }) {
  return (
    <TldrawUiToolbarButton
      aria-label={label}
      className="cowart-mind-map-toolbar-button"
      onClick={onClick}
      title={label}
      type="icon"
    >
      <span aria-hidden="true" className="cowart-mind-map-toolbar-icon">{icon}</span>
      <span className="cowart-mind-map-toolbar-label">{label}</span>
    </TldrawUiToolbarButton>
  )
}

function CowartMindMapToolbar() {
  const editor = useEditor()
  const selected = useValue(
    'cowart selected mind map node',
    () => {
      const node = editor.getOnlySelectedShape()
      if (!isMindMapNode(node)) return null
      const graph = editorMindMapGraph(editor)
      const parentId = graph.parentByChild.get(node.id) ?? null
      const grandparentId = parentId ? graph.parentByChild.get(parentId) ?? null : null
      const root = graph.nodeById.get(getMindMapRootId(graph, node.id))
      const incomingEdgeId = graph.edgeByChild.get(node.id)
      return {
        node,
        root,
        incomingEdge: incomingEdgeId ? graph.edgeById.get(incomingEdgeId) : null,
        presetId: getMindMapStylePresetId(root),
        structureId: getMindMapStructureId(root),
        isRoot: !parentId,
        canPromote: Boolean(grandparentId),
        hasChildren: (graph.childrenByParent.get(node.id) ?? []).length > 0,
        isCollapsed: node.meta?.cowartMindMapCollapsed === true,
        descendantCount: getMindMapDescendantIds(graph, node.id).length
      }
    },
    [editor]
  )
  const getSelectionBounds = useCallback(() => {
    const bounds = editor.getSelectionScreenBounds()
    return bounds ? new Box(bounds.x, bounds.y, bounds.width, 0) : undefined
  }, [editor])

  if (!selected || !editor.isInAny('select.idle', 'select.pointing_shape', 'select.editing_shape')) return null

  return (
    <TldrawUiContextualToolbar
      className="cowart-mind-map-toolbar"
      getSelectionBounds={getSelectionBounds}
      label="思维导图工具栏"
    >
      <MindMapStructurePopover selected={selected} />
      <MindMapStylePopover selected={selected} />
      {selected.isRoot ? (
        getMindMapStructureDefinition(selected.structureId).direction === 'balanced' ? (
          <>
            <MindMapToolbarButton
              icon="＋←"
              label="左分支"
              onClick={() => createMindMapTopic(editor, selected.node.id, { side: 'left' })}
            />
            <MindMapToolbarButton
              icon="→＋"
              label="右分支"
              onClick={() => createMindMapTopic(editor, selected.node.id, { side: 'right' })}
            />
          </>
        ) : (
          <MindMapToolbarButton
            icon="＋"
            label="子主题"
            onClick={() => createMindMapTopic(editor, selected.node.id)}
          />
        )
      ) : (
        <>
          <MindMapToolbarButton
            icon="＋"
            label="子主题"
            onClick={() => createMindMapTopic(editor, selected.node.id)}
          />
          <MindMapToolbarButton
            icon="＝＋"
            label="同级主题"
            onClick={() => createMindMapSibling(editor, selected.node.id)}
          />
        </>
      )}
      {selected.canPromote && (
        <MindMapToolbarButton icon="↥" label="提升一级" onClick={() => promoteMindMapNode(editor, selected.node.id)} />
      )}
      {selected.hasChildren && (
        <MindMapToolbarButton
          icon={selected.isCollapsed ? '＋' : '−'}
          label={selected.isCollapsed ? `展开分支 (${selected.descendantCount})` : '折叠分支'}
          onClick={() => toggleMindMapCollapse(editor, selected.node.id)}
        />
      )}
      <MindMapToolbarButton icon="↔" label="整理布局" onClick={() => requestMindMapLayout(editor, selected.node.id)} />
    </TldrawUiContextualToolbar>
  )
}

function CowartMindMapCollapseBadges() {
  const editor = useEditor()
  const badges = useValue(
    'cowart collapsed mind map badges',
    () => {
      const graph = editorMindMapGraph(editor)
      const items = []
      for (const node of graph.nodeById.values()) {
        if (node.meta?.cowartMindMapCollapsed !== true || node.meta?.cowartMindMapHidden === true) continue
        const count = getMindMapDescendantIds(graph, node.id).length
        const bounds = editor.getShapePageBounds(node.id)
        if (!count || !bounds) continue
        const root = graph.nodeById.get(getMindMapRootId(graph, node.id))
        const structureId = getMindMapStructureId(root)
        const direction = getMindMapStructureDefinition(structureId).direction
        const side = direction === 'balanced' ? node.meta?.cowartMindMapSide : direction
        const screenPoint = editor.pageToScreen({
          x: side === 'down' ? bounds.center.x : side === 'left' ? bounds.minX : bounds.maxX,
          y: side === 'down' ? bounds.maxY : bounds.center.y
        })
        items.push({ id: node.id, count, x: screenPoint.x, y: screenPoint.y })
      }
      return items
    },
    [editor]
  )

  return badges.map((badge) => (
    <button
      aria-label={`展开分支，包含 ${badge.count} 个主题`}
      className="cowart-mind-map-collapse-badge"
      key={badge.id}
      onClick={(event) => {
        event.stopPropagation()
        toggleMindMapCollapse(editor, badge.id)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: badge.x, top: badge.y }}
      title={`展开 ${badge.count} 个主题`}
      type="button"
    >
      {badge.count}
    </button>
  ))
}

export function CowartMindMapOverlay() {
  return (
    <>
      <CowartMindMapKeyboardShortcuts />
      <CowartMindMapCollapseBadges />
      <CowartMindMapToolbar />
    </>
  )
}
