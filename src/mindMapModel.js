export const MIND_MAP_NODE_META_KEY = 'cowartMindMapNode'
export const MIND_MAP_EDGE_META_KEY = 'cowartMindMapEdge'
export const MIND_MAP_VERSION = 1

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

  let rootId = initial.id
  while (graph.parentByChild.has(rootId)) rootId = graph.parentByChild.get(rootId)
  const root = graph.nodeById.get(rootId)
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

  for (const node of graph.nodeById.values()) {
    if (!layout.nodeIds.has(node.id)) continue
    const position = layout.positions.get(node.id)
    const side = layout.sides.get(node.id) ?? node.meta?.cowartMindMapSide ?? 'center'
    updates.push({
      id: node.id,
      type: node.type,
      ...(includePositions && position ? { x: position.x, y: position.y } : {}),
      meta: {
        ...node.meta,
        cowartMindMapSide: side,
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

export function computeMindMapLayout(
  graph,
  rootId,
  { horizontalGap = 112, verticalGap = 32 } = {}
) {
  const rootShape = graph.nodeById.get(rootId)
  if (!rootShape) {
    return {
      positions: new Map(),
      sides: new Map(),
      hiddenNodeIds: new Set(),
      hiddenEdgeIds: new Set(),
      nodeIds: new Set(),
      edgeIds: new Set()
    }
  }

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

  const sides = new Map([[rootId, 'center']])
  const visibleChildren = (nodeId) =>
    hiddenNodeIds.has(nodeId) ? [] : (graph.childrenByParent.get(nodeId) ?? []).filter((id) => !hiddenNodeIds.has(id))
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
    let side = requestedSide === 'left' || requestedSide === 'right'
      ? requestedSide
      : leftHeight < rightHeight
        ? 'left'
        : 'right'
    if (requestedSide !== 'left' && requestedSide !== 'right' && leftHeight === rightHeight) {
      side = rightRoots.length <= leftRoots.length ? 'right' : 'left'
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

  return { positions, sides, hiddenNodeIds, hiddenEdgeIds, nodeIds, edgeIds }
}
