export const MIND_MAP_NODE_META_KEY = 'cowartMindMapNode'
export const MIND_MAP_EDGE_META_KEY = 'cowartMindMapEdge'
export const MIND_MAP_VERSION = 1
export const DEFAULT_MIND_MAP_STYLE_PRESET_ID = 'balanced'
export const DEFAULT_MIND_MAP_STRUCTURE_ID = 'balanced'

export const MIND_MAP_STRUCTURES = Object.freeze({
  balanced: Object.freeze({ label: '双向导图', direction: 'balanced', layout: 'horizontal' }),
  right: Object.freeze({ label: '向右逻辑图', direction: 'right', layout: 'horizontal' }),
  left: Object.freeze({ label: '向左逻辑图', direction: 'left', layout: 'horizontal' }),
  'org-down': Object.freeze({ label: '组织结构图', direction: 'down', layout: 'vertical' })
})

export const MIND_MAP_STYLE_PRESETS = Object.freeze({
  balanced: Object.freeze({
    label: '清爽',
    root: Object.freeze({
      node: Object.freeze({
        geo: 'rectangle', color: 'blue', labelColor: 'white', fill: 'solid', dash: 'solid', size: 'l', font: 'sans'
      })
    }),
    primary: Object.freeze({
      node: Object.freeze({ geo: 'rectangle', labelColor: 'black', fill: 'semi', dash: 'solid', size: 'm', font: 'sans' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'solid', size: 'm' })
    }),
    descendant: Object.freeze({
      node: Object.freeze({ geo: 'rectangle', labelColor: 'black', fill: 'none', dash: 'solid', size: 's', font: 'sans' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'solid', size: 's' })
    })
  }),
  cards: Object.freeze({
    label: '卡片',
    root: Object.freeze({
      node: Object.freeze({
        geo: 'rectangle', color: 'blue', labelColor: 'white', fill: 'solid', dash: 'solid', size: 'l', font: 'sans'
      })
    }),
    primary: Object.freeze({
      node: Object.freeze({ geo: 'rectangle', fill: 'solid', dash: 'solid', size: 'm', font: 'sans' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'solid', size: 'm' })
    }),
    descendant: Object.freeze({
      node: Object.freeze({ geo: 'rectangle', labelColor: 'black', fill: 'semi', dash: 'solid', size: 'm', font: 'sans' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'solid', size: 's' })
    })
  }),
  sketch: Object.freeze({
    label: '手绘',
    root: Object.freeze({
      node: Object.freeze({
        geo: 'oval', color: 'blue', labelColor: 'black', fill: 'semi', dash: 'draw', size: 'l', font: 'draw'
      })
    }),
    primary: Object.freeze({
      node: Object.freeze({ geo: 'oval', labelColor: 'black', fill: 'none', dash: 'draw', size: 'm', font: 'draw' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'draw', size: 'm' })
    }),
    descendant: Object.freeze({
      node: Object.freeze({ geo: 'oval', labelColor: 'black', fill: 'none', dash: 'draw', size: 's', font: 'draw' }),
      edge: Object.freeze({ kind: 'elbow', dash: 'draw', size: 's' })
    })
  })
})

const MIND_MAP_NODE_DIMENSIONS = Object.freeze({
  root: Object.freeze({ w: 220, h: 64 }),
  primary: Object.freeze({ w: 176, h: 48 }),
  descendant: Object.freeze({ w: 160, h: 44 })
})

const MIND_MAP_NODE_INHERITED_STYLE_KEYS = ['geo', 'fill', 'dash', 'size', 'font']
const MIND_MAP_EDGE_INHERITED_STYLE_KEYS = ['kind', 'dash', 'size']
const DARK_SOLID_LABEL_COLORS = new Set(['black', 'grey', 'violet', 'blue', 'green', 'red'])

function mindMapStylePreset(presetId) {
  return MIND_MAP_STYLE_PRESETS[presetId] ?? MIND_MAP_STYLE_PRESETS[DEFAULT_MIND_MAP_STYLE_PRESET_ID]
}

function mindMapStyleRole(depth) {
  if (depth <= 0) return 'root'
  return depth === 1 ? 'primary' : 'descendant'
}

export function getMindMapLabelColor(color, fill) {
  return fill === 'solid' && DARK_SOLID_LABEL_COLORS.has(color) ? 'white' : 'black'
}

export function getMindMapNodeDimensions(depth, scale = 1) {
  const resolvedScale = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1
  const dimensions = MIND_MAP_NODE_DIMENSIONS[mindMapStyleRole(depth)]
  return { w: dimensions.w * resolvedScale, h: dimensions.h * resolvedScale }
}

export function getMindMapStylePresetId(root) {
  const presetId = root?.meta?.cowartMindMapStylePreset
  return MIND_MAP_STYLE_PRESETS[presetId] ? presetId : DEFAULT_MIND_MAP_STYLE_PRESET_ID
}

export function getMindMapStructureId(root) {
  const structureId = root?.meta?.cowartMindMapStructure
  return MIND_MAP_STRUCTURES[structureId] ? structureId : DEFAULT_MIND_MAP_STRUCTURE_ID
}

export function getMindMapStructureDefinition(structureId) {
  return MIND_MAP_STRUCTURES[structureId] ?? MIND_MAP_STRUCTURES[DEFAULT_MIND_MAP_STRUCTURE_ID]
}

export function getMindMapConnectionAnchors(structureId, side = 'right') {
  const { direction } = getMindMapStructureDefinition(structureId)
  if (direction === 'down') {
    return {
      start: { x: 0.5, y: 1 },
      end: { x: 0.5, y: 0 }
    }
  }
  if (direction === 'left' || (direction === 'balanced' && side === 'left')) {
    return {
      start: { x: 0, y: 0.5 },
      end: { x: 1, y: 0.5 }
    }
  }
  return {
    start: { x: 1, y: 0.5 },
    end: { x: 0, y: 0.5 }
  }
}

export function getMindMapPresetNodeProps(presetId, depth, branchColor = 'blue') {
  const role = mindMapStyleRole(depth)
  const props = mindMapStylePreset(presetId)[role].node
  const color = role === 'root' ? props.color ?? 'blue' : branchColor
  return { ...props, color, labelColor: props.labelColor ?? getMindMapLabelColor(color, props.fill) }
}

export function getMindMapPresetEdgeProps(presetId, depth, branchColor = 'blue') {
  const role = depth <= 1 ? 'primary' : 'descendant'
  return {
    ...mindMapStylePreset(presetId)[role].edge,
    color: branchColor,
    labelColor: branchColor
  }
}

export function createMindMapEdgeAtomically(editor, edgeShape, bindings) {
  editor.store.atomic(() => {
    editor.createShape(edgeShape)
    editor.createBindings(bindings)
    editor.updateShape({ id: edgeShape.id, type: edgeShape.type, isLocked: true })
  })
  return edgeShape.id
}

export function isMindMapNode(shape) {
  return shape?.typeName === 'shape' && shape.type === 'geo' && shape.meta?.[MIND_MAP_NODE_META_KEY] === true
}

export function isMindMapEdge(shape) {
  return shape?.typeName === 'shape' && shape.type === 'arrow' && shape.meta?.[MIND_MAP_EDGE_META_KEY] === true
}

function mindMapOrder(shape) {
  return typeof shape?.meta?.cowartMindMapOrder === 'string' ? shape.meta.cowartMindMapOrder : ''
}

function sortNodeIds(nodeById, nodeIds) {
  return [...nodeIds].sort((leftId, rightId) => {
    const orderDelta = mindMapOrder(nodeById.get(leftId)).localeCompare(mindMapOrder(nodeById.get(rightId)))
    return orderDelta || leftId.localeCompare(rightId)
  })
}

function wouldCreateCycle(parentByChild, parentId, childId) {
  let currentId = parentId
  const visited = new Set()
  while (currentId && !visited.has(currentId)) {
    if (currentId === childId) return true
    visited.add(currentId)
    currentId = parentByChild.get(currentId)
  }
  return false
}

export function buildMindMapGraph({ shapes = [], bindings = [] } = {}) {
  const nodeById = new Map(shapes.filter(isMindMapNode).map((shape) => [shape.id, shape]))
  const edgeById = new Map(shapes.filter(isMindMapEdge).map((shape) => [shape.id, shape]))
  const bindingsByEdge = new Map()

  for (const binding of bindings) {
    if (binding?.typeName !== 'binding' || binding.type !== 'arrow' || !edgeById.has(binding.fromId)) continue
    const edgeBindings = bindingsByEdge.get(binding.fromId) ?? []
    edgeBindings.push(binding)
    bindingsByEdge.set(binding.fromId, edgeBindings)
  }

  const parentByChild = new Map()
  const childrenByParent = new Map()
  const edgeByChild = new Map()
  const relationByEdge = new Map()
  const invalidEdgeIds = []

  for (const edge of edgeById.values()) {
    const edgeBindings = bindingsByEdge.get(edge.id) ?? []
    const startBinding = edgeBindings.find((binding) => binding.props?.terminal === 'start')
    const endBinding = edgeBindings.find((binding) => binding.props?.terminal === 'end')
    const parentId = startBinding?.toId
    const childId = endBinding?.toId

    if (
      !parentId ||
      !childId ||
      parentId === childId ||
      !nodeById.has(parentId) ||
      !nodeById.has(childId) ||
      parentByChild.has(childId) ||
      wouldCreateCycle(parentByChild, parentId, childId)
    ) {
      invalidEdgeIds.push(edge.id)
      continue
    }

    parentByChild.set(childId, parentId)
    edgeByChild.set(childId, edge.id)
    relationByEdge.set(edge.id, { parentId, childId, startBinding, endBinding })
    const childIds = childrenByParent.get(parentId) ?? []
    childIds.push(childId)
    childrenByParent.set(parentId, childIds)
  }

  for (const [parentId, childIds] of childrenByParent) {
    childrenByParent.set(parentId, sortNodeIds(nodeById, childIds))
  }

  const rootIds = sortNodeIds(
    nodeById,
    [...nodeById.keys()].filter((nodeId) => !parentByChild.has(nodeId))
  )

  return {
    nodeById,
    edgeById,
    bindingsByEdge,
    parentByChild,
    childrenByParent,
    edgeByChild,
    relationByEdge,
    rootIds,
    invalidEdgeIds
  }
}

export function getMindMapDescendantIds(graph, nodeId) {
  const descendants = []
  const visit = (parentId) => {
    for (const childId of graph.childrenByParent.get(parentId) ?? []) {
      descendants.push(childId)
      visit(childId)
    }
  }
  visit(nodeId)
  return descendants
}

export function getMindMapNodeDepth(graph, nodeId) {
  if (!graph.nodeById.has(nodeId)) return -1
  let depth = 0
  let currentId = nodeId
  const visited = new Set()
  while (graph.parentByChild.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId)
    currentId = graph.parentByChild.get(currentId)
    depth += 1
  }
  return depth
}

export function getMindMapRootId(graph, nodeId) {
  if (!graph.nodeById.has(nodeId)) return null
  let rootId = nodeId
  const visited = new Set()
  while (graph.parentByChild.has(rootId) && !visited.has(rootId)) {
    visited.add(rootId)
    rootId = graph.parentByChild.get(rootId)
  }
  return rootId
}

function mindMapBranchColor(graph, nodeId) {
  const rootId = getMindMapRootId(graph, nodeId)
  if (!rootId || nodeId === rootId) return 'blue'
  let branchId = nodeId
  while (graph.parentByChild.get(branchId) && graph.parentByChild.get(branchId) !== rootId) {
    branchId = graph.parentByChild.get(branchId)
  }
  return graph.nodeById.get(branchId)?.props?.color ?? graph.nodeById.get(nodeId)?.props?.color ?? 'blue'
}

export function collectMindMapStyleTargets(graph, nodeId, scope = 'node') {
  const rootId = getMindMapRootId(graph, nodeId)
  if (!rootId) return { rootId: null, nodeIds: [], edgeIds: [] }

  const nodeIds = scope === 'map'
    ? [rootId, ...getMindMapDescendantIds(graph, rootId)]
    : scope === 'branch'
      ? [nodeId, ...getMindMapDescendantIds(graph, nodeId)]
      : [nodeId]
  const edgeIds = nodeIds.map((id) => graph.edgeByChild.get(id)).filter(Boolean)
  return { rootId, nodeIds, edgeIds }
}

export function createMindMapStyleUpdates(
  graph,
  nodeId,
  scope,
  { nodeProps = {}, edgeProps = {} } = {}
) {
  const targets = collectMindMapStyleTargets(graph, nodeId, scope)
  const updates = []
  for (const id of targets.nodeIds) {
    const node = graph.nodeById.get(id)
    if (!node) continue
    const props = typeof nodeProps === 'function' ? nodeProps(node) : nodeProps
    if (props && Object.keys(props).length) updates.push({ id: node.id, type: node.type, props })
  }
  for (const id of targets.edgeIds) {
    const edge = graph.edgeById.get(id)
    if (!edge) continue
    const props = typeof edgeProps === 'function' ? edgeProps(edge) : edgeProps
    if (props && Object.keys(props).length) updates.push({ id: edge.id, type: edge.type, props })
  }
  return updates
}

function createResetBranchColorMap(graph, rootId, branchColors) {
  const colorsByNode = new Map([[rootId, 'blue']])
  if (!branchColors?.length) return colorsByNode
  const sideCounts = { left: 0, right: 0 }
  for (const branchId of graph.childrenByParent.get(rootId) ?? []) {
    const side = graph.nodeById.get(branchId)?.meta?.cowartMindMapSide === 'left' ? 'left' : 'right'
    const color = branchColors[sideCounts[side] % branchColors.length]
    sideCounts[side] += 1
    colorsByNode.set(branchId, color)
    for (const descendantId of getMindMapDescendantIds(graph, branchId)) colorsByNode.set(descendantId, color)
  }
  return colorsByNode
}

export function createMindMapPresetUpdates(
  graph,
  rootId,
  presetId,
  { branchColors = null } = {}
) {
  const resolvedPresetId = MIND_MAP_STYLE_PRESETS[presetId]
    ? presetId
    : DEFAULT_MIND_MAP_STYLE_PRESET_ID
  const targetIds = [rootId, ...getMindMapDescendantIds(graph, rootId)]
  const resetColorsByNode = createResetBranchColorMap(graph, rootId, branchColors)
  const updates = []

  for (const nodeId of targetIds) {
    const node = graph.nodeById.get(nodeId)
    if (!node) continue
    const depth = getMindMapNodeDepth(graph, nodeId)
    const color = branchColors?.length
      ? resetColorsByNode.get(nodeId) ?? 'blue'
      : mindMapBranchColor(graph, nodeId)
    updates.push({
      id: node.id,
      type: node.type,
      props: getMindMapPresetNodeProps(resolvedPresetId, depth, color),
      ...(nodeId === rootId
        ? { meta: { ...node.meta, cowartMindMapStylePreset: resolvedPresetId } }
        : {})
    })

    const edgeId = graph.edgeByChild.get(nodeId)
    const edge = edgeId ? graph.edgeById.get(edgeId) : null
    if (edge) {
      updates.push({
        id: edge.id,
        type: edge.type,
        props: getMindMapPresetEdgeProps(resolvedPresetId, depth, color)
      })
    }
  }

  return updates
}

function pickMindMapStyleProps(props, keys) {
  return Object.fromEntries(keys.filter((key) => props?.[key] !== undefined).map((key) => [key, props[key]]))
}

function mindMapStyleOverrides(props, baseline, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => props?.[key] !== undefined && props[key] !== baseline?.[key])
      .map((key) => [key, props[key]])
  )
}

function rebaseMindMapStyleProps(props, fromBaseline, toBaseline, keys) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      props?.[key] === fromBaseline?.[key] ? toBaseline?.[key] : props?.[key]
    ]).filter(([, value]) => value !== undefined)
  )
}

function mindMapPropsChanged(props, nextProps) {
  return Object.entries(nextProps).some(([key, value]) => props?.[key] !== value)
}

export function createMindMapDepthStyleUpdates(
  graph,
  nodeId,
  { presetId = DEFAULT_MIND_MAP_STYLE_PRESET_ID, targetDepth } = {}
) {
  const node = graph.nodeById.get(nodeId)
  const currentDepth = getMindMapNodeDepth(graph, nodeId)
  if (!node || currentDepth < 0 || !Number.isInteger(targetDepth) || targetDepth < 0 || currentDepth === targetDepth) {
    return []
  }

  const color = node.props?.color ?? mindMapBranchColor(graph, nodeId)
  const currentNodeBaseline = getMindMapPresetNodeProps(presetId, currentDepth, color)
  const targetNodeBaseline = getMindMapPresetNodeProps(presetId, targetDepth, color)
  const nodeProps = rebaseMindMapStyleProps(
    node.props,
    currentNodeBaseline,
    targetNodeBaseline,
    MIND_MAP_NODE_INHERITED_STYLE_KEYS
  )
  if (
    node.props?.fill === currentNodeBaseline.fill &&
    node.props?.labelColor === currentNodeBaseline.labelColor
  ) {
    nodeProps.labelColor = targetNodeBaseline.labelColor
  }
  const scale = Number(node.props?.scale || 1)
  const currentDimensions = getMindMapNodeDimensions(currentDepth, scale)
  const targetDimensions = getMindMapNodeDimensions(targetDepth, scale)
  if (
    Math.abs(Number(node.props?.w) - currentDimensions.w) < 0.01 &&
    Math.abs(Number(node.props?.h) - currentDimensions.h) < 0.01
  ) {
    nodeProps.w = targetDimensions.w
    nodeProps.h = targetDimensions.h
  }

  const updates = []
  if (mindMapPropsChanged(node.props, nodeProps)) {
    updates.push({ id: node.id, type: node.type, props: nodeProps })
  }

  const edgeId = graph.edgeByChild.get(nodeId)
  const edge = edgeId ? graph.edgeById.get(edgeId) : null
  if (edge) {
    const currentEdgeBaseline = getMindMapPresetEdgeProps(presetId, currentDepth, color)
    const targetEdgeBaseline = getMindMapPresetEdgeProps(presetId, targetDepth, color)
    const edgeProps = rebaseMindMapStyleProps(
      edge.props,
      currentEdgeBaseline,
      targetEdgeBaseline,
      MIND_MAP_EDGE_INHERITED_STYLE_KEYS
    )
    if (mindMapPropsChanged(edge.props, edgeProps)) {
      updates.push({ id: edge.id, type: edge.type, props: edgeProps })
    }
  }

  return updates
}

export function getMindMapChildStyle(
  graph,
  parentId,
  {
    side = 'right',
    color = 'blue',
    presetId = DEFAULT_MIND_MAP_STYLE_PRESET_ID,
    preferredSiblingId = null
  } = {}
) {
  const parent = graph.nodeById.get(parentId)
  const depth = Math.max(1, getMindMapNodeDepth(graph, parentId) + 1)
  const nodeBase = getMindMapPresetNodeProps(presetId, depth, color)
  const edgeBase = getMindMapPresetEdgeProps(presetId, depth, color)
  if (!parent) return { depth, nodeProps: nodeBase, edgeProps: edgeBase }

  const sameSideSiblingIds = (graph.childrenByParent.get(parentId) ?? []).filter(
    (childId) => graph.nodeById.get(childId)?.meta?.cowartMindMapSide === side
  )
  const siblingId = sameSideSiblingIds.includes(preferredSiblingId)
    ? preferredSiblingId
    : sameSideSiblingIds.at(-1)
  const sibling = graph.nodeById.get(siblingId)
  const siblingEdge = sibling ? graph.edgeById.get(graph.edgeByChild.get(sibling.id)) : null
  let nodeOverrides = {}
  let edgeOverrides = {}

  if (sibling) {
    nodeOverrides = pickMindMapStyleProps(sibling.props, MIND_MAP_NODE_INHERITED_STYLE_KEYS)
    edgeOverrides = pickMindMapStyleProps(siblingEdge?.props, MIND_MAP_EDGE_INHERITED_STYLE_KEYS)
  } else if (depth > 1) {
    const parentDepth = depth - 1
    const parentColor = mindMapBranchColor(graph, parent.id)
    nodeOverrides = mindMapStyleOverrides(
      parent.props,
      getMindMapPresetNodeProps(presetId, parentDepth, parentColor),
      MIND_MAP_NODE_INHERITED_STYLE_KEYS
    )
    const parentEdge = graph.edgeById.get(graph.edgeByChild.get(parent.id))
    edgeOverrides = mindMapStyleOverrides(
      parentEdge?.props,
      getMindMapPresetEdgeProps(presetId, parentDepth, parentColor),
      MIND_MAP_EDGE_INHERITED_STYLE_KEYS
    )
  }

  const nodeProps = { ...nodeBase, ...nodeOverrides, color }
  nodeProps.labelColor = getMindMapLabelColor(color, nodeProps.fill)
  return {
    depth,
    nodeProps,
    edgeProps: { ...edgeBase, ...edgeOverrides, color, labelColor: color }
  }
}

export function collectMindMapBranchRecordIds(graph, nodeId) {
  const nodeIds = [nodeId, ...getMindMapDescendantIds(graph, nodeId)]
  const recordIds = new Set(nodeIds)

  for (const childId of nodeIds.slice(1)) {
    const edgeId = graph.edgeByChild.get(childId)
    if (!edgeId) continue
    recordIds.add(edgeId)
    for (const binding of graph.bindingsByEdge.get(edgeId) ?? []) recordIds.add(binding.id)
  }

  return [...recordIds]
}

export function collectMindMapCascadeShapeIds(graph, nodeId) {
  const shapeIds = new Set(
    collectMindMapBranchRecordIds(graph, nodeId).filter((recordId) => recordId.startsWith('shape:'))
  )
  const incomingEdgeId = graph.edgeByChild.get(nodeId)
  if (incomingEdgeId) shapeIds.add(incomingEdgeId)
  return [...shapeIds]
}

export function createMindMapTranslationUpdates(graph, initial, current, selectedShapeIds = new Set()) {
  const dx = Number(current?.x) - Number(initial?.x)
  const dy = Number(current?.y) - Number(initial?.y)
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return []

  let selectedAncestorId = graph.parentByChild.get(initial.id)
  while (selectedAncestorId) {
    if (selectedShapeIds.has(selectedAncestorId)) return []
    selectedAncestorId = graph.parentByChild.get(selectedAncestorId)
  }

  const updates = []
  for (const descendantId of getMindMapDescendantIds(graph, initial.id)) {
    if (selectedShapeIds.has(descendantId)) continue
    const descendant = graph.nodeById.get(descendantId)
    if (!descendant) continue
    updates.push({
      id: descendant.id,
      type: descendant.type,
      x: Number(descendant.x) + dx,
      y: Number(descendant.y) + dy
    })
  }

  const root = graph.nodeById.get(getMindMapRootId(graph, initial.id))
  if (root) {
    updates.push({
      id: root.id,
      type: root.type,
      meta: {
        ...root.meta,
        cowartMindMapAutoLayout: false
      }
    })
  }

  return updates
}

export function createMindMapLayoutUpdates(
  graph,
  layout,
  { includePositions = true, autoLayout = true } = {}
) {
  const updates = []
  const persistSides = getMindMapStructureDefinition(layout.structureId).direction === 'balanced'

  for (const node of graph.nodeById.values()) {
    if (!layout.nodeIds.has(node.id)) continue
    const position = layout.positions.get(node.id)
    const side = layout.sides.get(node.id) ?? node.meta?.cowartMindMapSide ?? 'center'
    const savedSide = node.meta?.cowartMindMapSide
    const normalizedSide = position?.depth === 0
      ? 'center'
      : persistSides
        ? side
        : savedSide === 'left' || savedSide === 'right' || savedSide === 'auto'
          ? savedSide
          : 'auto'
    updates.push({
      id: node.id,
      type: node.type,
      ...(includePositions && position ? { x: position.x, y: position.y } : {}),
      meta: {
        ...node.meta,
        cowartMindMapSide: normalizedSide,
        cowartMindMapHidden: layout.hiddenNodeIds.has(node.id),
        ...(position?.depth === 0 ? { cowartMindMapAutoLayout: autoLayout } : {})
      }
    })
  }

  for (const edge of graph.edgeById.values()) {
    if (!layout.edgeIds.has(edge.id)) continue
    updates.push({
      id: edge.id,
      type: edge.type,
      meta: {
        ...edge.meta,
        cowartMindMapHidden: layout.hiddenEdgeIds.has(edge.id)
      }
    })
  }

  return updates
}

function anchorsEqual(left, right) {
  return Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y)
}

export function createMindMapBindingUpdates(graph, layout) {
  const updates = []
  for (const edgeId of layout.edgeIds) {
    const relation = graph.relationByEdge.get(edgeId)
    if (!relation) continue
    const side = layout.sides.get(relation.childId) ?? graph.nodeById.get(relation.childId)?.meta?.cowartMindMapSide
    const anchors = getMindMapConnectionAnchors(layout.structureId, side)
    for (const [binding, anchor] of [
      [relation.startBinding, anchors.start],
      [relation.endBinding, anchors.end]
    ]) {
      if (!binding || anchorsEqual(binding.props?.normalizedAnchor, anchor)) continue
      updates.push({
        id: binding.id,
        type: binding.type,
        fromId: binding.fromId,
        toId: binding.toId,
        props: { ...binding.props, normalizedAnchor: anchor }
      })
    }
  }
  return updates
}

function nodeWidth(shape) {
  return Math.max(1, Number(shape?.props?.w) || 1)
}

function nodeHeight(shape) {
  return Math.max(1, (Number(shape?.props?.h) || 1) + (Number(shape?.props?.growY) || 0))
}

function collectHiddenRecords(graph, collapsedNodeId, hiddenNodeIds, hiddenEdgeIds) {
  for (const childId of graph.childrenByParent.get(collapsedNodeId) ?? []) {
    hiddenNodeIds.add(childId)
    const edgeId = graph.edgeByChild.get(childId)
    if (edgeId) hiddenEdgeIds.add(edgeId)
    collectHiddenRecords(graph, childId, hiddenNodeIds, hiddenEdgeIds)
  }
}

function emptyMindMapLayout(structureId) {
  return {
    structureId,
    positions: new Map(),
    sides: new Map(),
    hiddenNodeIds: new Set(),
    hiddenEdgeIds: new Set(),
    nodeIds: new Set(),
    edgeIds: new Set()
  }
}

function computeHorizontalMindMapPositions(
  graph,
  rootId,
  rootShape,
  visibleChildren,
  direction,
  horizontalGap,
  verticalGap
) {
  const sides = new Map([[rootId, 'center']])
  const subtreeHeightCache = new Map()
  const measureSubtreeHeight = (nodeId) => {
    if (subtreeHeightCache.has(nodeId)) return subtreeHeightCache.get(nodeId)
    const shape = graph.nodeById.get(nodeId)
    const children = shape?.meta?.cowartMindMapCollapsed === true ? [] : visibleChildren(nodeId)
    const childrenHeight = children.length
      ? children.reduce((sum, childId) => sum + measureSubtreeHeight(childId), 0) + verticalGap * (children.length - 1)
      : 0
    const height = Math.max(nodeHeight(shape), childrenHeight)
    subtreeHeightCache.set(nodeId, height)
    return height
  }

  const leftRoots = []
  const rightRoots = []
  let leftHeight = 0
  let rightHeight = 0
  for (const childId of visibleChildren(rootId)) {
    const child = graph.nodeById.get(childId)
    const requestedSide = child?.meta?.cowartMindMapSide
    const height = measureSubtreeHeight(childId)
    let side
    if (direction === 'left' || direction === 'right') {
      side = direction
    } else {
      side = requestedSide === 'left' || requestedSide === 'right'
        ? requestedSide
        : leftHeight < rightHeight
          ? 'left'
          : 'right'
      if (requestedSide !== 'left' && requestedSide !== 'right' && leftHeight === rightHeight) {
        side = rightRoots.length <= leftRoots.length ? 'right' : 'left'
      }
    }
    sides.set(childId, side)
    if (side === 'left') {
      leftRoots.push(childId)
      leftHeight += height + (leftRoots.length > 1 ? verticalGap : 0)
    } else {
      rightRoots.push(childId)
      rightHeight += height + (rightRoots.length > 1 ? verticalGap : 0)
    }
  }

  const maxWidthBySideAndDepth = {
    left: new Map(),
    right: new Map()
  }
  const collectColumns = (nodeId, side, depth) => {
    sides.set(nodeId, side)
    const shape = graph.nodeById.get(nodeId)
    const widths = maxWidthBySideAndDepth[side]
    widths.set(depth, Math.max(widths.get(depth) ?? 0, nodeWidth(shape)))
    for (const childId of visibleChildren(nodeId)) collectColumns(childId, side, depth + 1)
  }
  for (const childId of leftRoots) collectColumns(childId, 'left', 1)
  for (const childId of rightRoots) collectColumns(childId, 'right', 1)

  const columnX = { left: new Map(), right: new Map() }
  const rootWidth = nodeWidth(rootShape)
  const maxDepth = Math.max(
    0,
    ...maxWidthBySideAndDepth.left.keys(),
    ...maxWidthBySideAndDepth.right.keys()
  )
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const rightPreviousX = depth === 1
      ? Number(rootShape.x) + rootWidth
      : columnX.right.get(depth - 1) + (maxWidthBySideAndDepth.right.get(depth - 1) ?? 0)
    columnX.right.set(depth, rightPreviousX + horizontalGap)

    const leftRightEdge = depth === 1 ? Number(rootShape.x) : columnX.left.get(depth - 1)
    columnX.left.set(depth, leftRightEdge - horizontalGap - (maxWidthBySideAndDepth.left.get(depth) ?? 0))
  }

  const positions = new Map([
    [rootId, { x: Number(rootShape.x), y: Number(rootShape.y), side: 'center', depth: 0 }]
  ])
  const layoutBranch = (nodeId, side, depth, top) => {
    const shape = graph.nodeById.get(nodeId)
    const height = measureSubtreeHeight(nodeId)
    positions.set(nodeId, {
      x: columnX[side].get(depth),
      y: top + (height - nodeHeight(shape)) / 2,
      side,
      depth
    })

    const children = shape?.meta?.cowartMindMapCollapsed === true ? [] : visibleChildren(nodeId)
    if (!children.length) return
    const childrenHeight = children.reduce((sum, childId) => sum + measureSubtreeHeight(childId), 0) +
      verticalGap * (children.length - 1)
    let childTop = top + (height - childrenHeight) / 2
    for (const childId of children) {
      layoutBranch(childId, side, depth + 1, childTop)
      childTop += measureSubtreeHeight(childId) + verticalGap
    }
  }

  const rootCenterY = Number(rootShape.y) + nodeHeight(rootShape) / 2
  const layoutSide = (branchIds, side) => {
    const totalHeight = branchIds.reduce((sum, branchId) => sum + measureSubtreeHeight(branchId), 0) +
      Math.max(0, branchIds.length - 1) * verticalGap
    let top = rootCenterY - totalHeight / 2
    for (const branchId of branchIds) {
      layoutBranch(branchId, side, 1, top)
      top += measureSubtreeHeight(branchId) + verticalGap
    }
  }
  layoutSide(leftRoots, 'left')
  layoutSide(rightRoots, 'right')

  return { positions, sides }
}

function computeDownwardMindMapPositions(
  graph,
  rootId,
  rootShape,
  visibleChildren,
  levelGap,
  siblingGap
) {
  const sides = new Map([[rootId, 'center']])
  const subtreeWidthCache = new Map()
  const maxHeightByDepth = new Map()
  const measureSubtreeWidth = (nodeId) => {
    if (subtreeWidthCache.has(nodeId)) return subtreeWidthCache.get(nodeId)
    const shape = graph.nodeById.get(nodeId)
    const children = shape?.meta?.cowartMindMapCollapsed === true ? [] : visibleChildren(nodeId)
    const childrenWidth = children.length
      ? children.reduce((sum, childId) => sum + measureSubtreeWidth(childId), 0) + siblingGap * (children.length - 1)
      : 0
    const width = Math.max(nodeWidth(shape), childrenWidth)
    subtreeWidthCache.set(nodeId, width)
    return width
  }
  const collectDepthHeights = (nodeId, depth) => {
    const shape = graph.nodeById.get(nodeId)
    maxHeightByDepth.set(depth, Math.max(maxHeightByDepth.get(depth) ?? 0, nodeHeight(shape)))
    for (const childId of visibleChildren(nodeId)) collectDepthHeights(childId, depth + 1)
  }
  measureSubtreeWidth(rootId)
  collectDepthHeights(rootId, 0)

  const rowY = new Map([[0, Number(rootShape.y)]])
  const maxDepth = Math.max(0, ...maxHeightByDepth.keys())
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    rowY.set(depth, rowY.get(depth - 1) + (maxHeightByDepth.get(depth - 1) ?? 0) + levelGap)
  }

  const positions = new Map()
  const layoutBranch = (nodeId, depth, left) => {
    const shape = graph.nodeById.get(nodeId)
    const width = measureSubtreeWidth(nodeId)
    sides.set(nodeId, depth === 0 ? 'center' : 'down')
    positions.set(nodeId, {
      x: left + (width - nodeWidth(shape)) / 2,
      y: rowY.get(depth),
      side: depth === 0 ? 'center' : 'down',
      depth
    })

    const children = shape?.meta?.cowartMindMapCollapsed === true ? [] : visibleChildren(nodeId)
    if (!children.length) return
    const childrenWidth = children.reduce((sum, childId) => sum + measureSubtreeWidth(childId), 0) +
      siblingGap * (children.length - 1)
    let childLeft = left + (width - childrenWidth) / 2
    for (const childId of children) {
      layoutBranch(childId, depth + 1, childLeft)
      childLeft += measureSubtreeWidth(childId) + siblingGap
    }
  }

  const rootCenterX = Number(rootShape.x) + nodeWidth(rootShape) / 2
  layoutBranch(rootId, 0, rootCenterX - measureSubtreeWidth(rootId) / 2)
  return { positions, sides }
}

export function computeMindMapLayout(
  graph,
  rootId,
  { horizontalGap = 112, verticalGap = 32, structureId: requestedStructureId = null } = {}
) {
  const rootShape = graph.nodeById.get(rootId)
  const structureId = MIND_MAP_STRUCTURES[requestedStructureId]
    ? requestedStructureId
    : getMindMapStructureId(rootShape)
  if (!rootShape) return emptyMindMapLayout(structureId)
  const structure = getMindMapStructureDefinition(structureId)

  const nodeIds = new Set([rootId, ...getMindMapDescendantIds(graph, rootId)])
  const edgeIds = new Set(
    [...nodeIds]
      .filter((nodeId) => nodeId !== rootId)
      .map((nodeId) => graph.edgeByChild.get(nodeId))
      .filter(Boolean)
  )
  const hiddenNodeIds = new Set()
  const hiddenEdgeIds = new Set()
  for (const nodeId of nodeIds) {
    const node = graph.nodeById.get(nodeId)
    if (node.meta?.cowartMindMapCollapsed === true) {
      collectHiddenRecords(graph, node.id, hiddenNodeIds, hiddenEdgeIds)
    }
  }

  const visibleChildren = (nodeId) =>
    hiddenNodeIds.has(nodeId) ? [] : (graph.childrenByParent.get(nodeId) ?? []).filter((id) => !hiddenNodeIds.has(id))
  const { positions, sides } = structure.layout === 'vertical'
    ? computeDownwardMindMapPositions(
      graph,
      rootId,
      rootShape,
      visibleChildren,
      horizontalGap,
      verticalGap
    )
    : computeHorizontalMindMapPositions(
      graph,
      rootId,
      rootShape,
      visibleChildren,
      structure.direction,
      horizontalGap,
      verticalGap
    )

  return { structureId, positions, sides, hiddenNodeIds, hiddenEdgeIds, nodeIds, edgeIds }
}
