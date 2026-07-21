import {
  Box,
  GeoShapeUtil,
  TldrawUiContextualToolbar,
  TldrawUiToolbarButton,
  createShapeId,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { generateKeyBetween } from 'fractional-indexing'
import { useCallback, useEffect } from 'react'

import {
  MIND_MAP_VERSION,
  buildMindMapGraph,
  collectMindMapBranchRecordIds,
  collectMindMapCascadeShapeIds,
  computeMindMapLayout,
  createMindMapEdgeAtomically,
  createMindMapLayoutUpdates,
  createMindMapTranslationUpdates,
  getMindMapDescendantIds,
  isMindMapEdge,
  isMindMapNode
} from './mindMapModel.js'

export const MIND_MAP_TOOL_ID = 'mind-map'
export const MIND_MAP_TOOL_LABEL = '思维导图'

const ROOT_NODE_W = 220
const ROOT_NODE_H = 64
const TOPIC_NODE_W = 176
const TOPIC_NODE_H = 48
const MIND_MAP_HORIZONTAL_GAP = 112
const MIND_MAP_VERTICAL_GAP = 32
const MIND_MAP_BRANCH_COLORS = ['orange', 'green', 'violet', 'red', 'yellow', 'blue']

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

function mindMapRootId(graph, nodeId) {
  let rootId = nodeId
  const visited = new Set()
  while (graph.parentByChild.has(rootId) && !visited.has(rootId)) {
    visited.add(rootId)
    rootId = graph.parentByChild.get(rootId)
  }
  return rootId
}

function nodeScale(editor) {
  return editor.getResizeScaleFactor()
}

function mindMapNodeMeta({ order, side = 'center', autoLayout, collapsed = false }) {
  return {
    cowartMindMapNode: true,
    cowartMindMapVersion: MIND_MAP_VERSION,
    cowartMindMapOrder: order,
    cowartMindMapSide: side,
    cowartMindMapCollapsed: collapsed,
    cowartMindMapHidden: false,
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
  const width = ROOT_NODE_W * scale
  const height = ROOT_NODE_H * scale
  const center = editor.getViewportPageBounds().center
  const nodeId = createShapeId()

  editor.markHistoryStoppingPoint('create_mind_map')
  editor.createShape({
    id: nodeId,
    type: 'geo',
    x: center.x - width / 2,
    y: center.y - height / 2,
    meta: mindMapNodeMeta({
      order: generateKeyBetween(null, null),
      side: 'center',
      autoLayout: true
    }),
    props: {
      w: width,
      h: height,
      geo: 'rectangle',
      color: 'blue',
      fill: 'solid',
      dash: 'solid',
      font: 'sans',
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

function createMindMapEdge(editor, parent, child, side, color, scale) {
  const edgeId = createShapeId()
  const parentCenter = {
    x: Number(parent.x) + Number(parent.props?.w || 0) / 2,
    y: Number(parent.y) + (Number(parent.props?.h || 0) + Number(parent.props?.growY || 0)) / 2
  }
  const childCenter = {
    x: Number(child.x) + Number(child.props?.w || 0) / 2,
    y: Number(child.y) + (Number(child.props?.h || 0) + Number(child.props?.growY || 0)) / 2
  }

  return createMindMapEdgeAtomically(editor, {
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
      kind: 'elbow',
      dash: 'solid',
      size: 's',
      fill: 'none',
      color,
      labelColor: color,
      start: { x: 0, y: 0 },
      end: { x: childCenter.x - parentCenter.x, y: childCenter.y - parentCenter.y },
      arrowheadStart: 'none',
      arrowheadEnd: 'none',
      richText: toRichText(''),
      scale
    }
  }, [
    {
      type: 'arrow',
      fromId: edgeId,
      toId: parent.id,
      props: arrowBindingProps('start', { x: side === 'left' ? 0 : 1, y: 0.5 })
    },
    {
      type: 'arrow',
      fromId: edgeId,
      toId: child.id,
      props: arrowBindingProps('end', { x: side === 'left' ? 1 : 0, y: 0.5 })
    }
  ])
}

function createMindMapTopic(editor, parentId, { afterChildId = null, side = null, label = '子主题' } = {}) {
  const graph = editorMindMapGraph(editor)
  const parent = graph.nodeById.get(parentId)
  if (!parent) return null

  const rootId = mindMapRootId(graph, parentId)
  const root = graph.nodeById.get(rootId)
  const resolvedSide = graph.parentByChild.has(parentId)
    ? parent.meta?.cowartMindMapSide === 'left' ? 'left' : 'right'
    : side === 'left' ? 'left' : 'right'
  const color = branchColor(graph, parentId, resolvedSide)
  const scale = Number(root?.props?.scale || parent.props?.scale || 1)
  const width = TOPIC_NODE_W * scale
  const height = TOPIC_NODE_H * scale
  const siblingCount = (graph.childrenByParent.get(parentId) ?? []).length
  const provisionalX = resolvedSide === 'left'
    ? Number(parent.x) - width - MIND_MAP_HORIZONTAL_GAP * scale
    : Number(parent.x) + Number(parent.props?.w || 0) + MIND_MAP_HORIZONTAL_GAP * scale
  const provisionalY = Number(parent.y) + siblingCount * (height + MIND_MAP_VERTICAL_GAP * scale)
  const nodeId = createShapeId()

  editor.markHistoryStoppingPoint('create_mind_map_topic')
  editor.run(() => {
    editor.createShape({
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
        geo: 'rectangle',
        color,
        fill: 'semi',
        dash: 'solid',
        font: 'sans',
        align: 'middle',
        verticalAlign: 'middle',
        richText: toRichText(label),
        scale
      }
    })
    const child = editor.getShape(nodeId)
    if (child) createMindMapEdge(editor, parent, child, resolvedSide, color, scale)
    if (root?.meta?.cowartMindMapAutoLayout !== false) {
      editor.updateShape({
        id: root.id,
        type: root.type,
        meta: { ...root.meta, cowartMindMapAutoLayout: true }
      })
    }
  })
  startEditingMindMapNode(editor, nodeId)
  return nodeId
}

function createMindMapSibling(editor, nodeId) {
  const graph = editorMindMapGraph(editor)
  const parentId = graph.parentByChild.get(nodeId)
  if (!parentId) return createMindMapTopic(editor, nodeId, { side: 'right' })
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

  const side = grandparentId === mindMapRootId(graph, grandparentId)
    ? node.meta?.cowartMindMapSide === 'left' ? 'left' : 'right'
    : grandparent.meta?.cowartMindMapSide === 'left' ? 'left' : 'right'

  editor.markHistoryStoppingPoint('promote_mind_map_topic')
  editor.run(() => {
    editor.updateBinding({
      id: relation.startBinding.id,
      type: relation.startBinding.type,
      fromId: relation.startBinding.fromId,
      toId: grandparentId,
      props: arrowBindingProps('start', { x: side === 'left' ? 0 : 1, y: 0.5 })
    })
    editor.updateShape({
      id: node.id,
      type: node.type,
      meta: {
        ...node.meta,
        cowartMindMapSide: side,
        cowartMindMapOrder: nextChildOrder(graph, grandparentId)
      }
    })
  })
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
  const root = graph.nodeById.get(mindMapRootId(graph, nodeId))
  if (!root) return
  editor.markHistoryStoppingPoint('layout_mind_map')
  editor.updateShape({
    id: root.id,
    type: root.type,
    meta: { ...root.meta, cowartMindMapAutoLayout: true }
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
  }

  if (updates.length) {
    editor.run(() => editor.updateShapes(updates), { ignoreShapeLock: true })
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
      return {
        node,
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
      {selected.isRoot ? (
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
        const side = node.meta?.cowartMindMapSide
        const screenPoint = editor.pageToScreen({
          x: side === 'left' ? bounds.minX : bounds.maxX,
          y: bounds.center.y
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
