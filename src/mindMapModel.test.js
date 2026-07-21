import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_MIND_MAP_STRUCTURE_ID,
  DEFAULT_MIND_MAP_STYLE_PRESET_ID,
  MIND_MAP_STRUCTURES,
  MIND_MAP_STYLE_PRESETS,
  buildMindMapGraph,
  collectMindMapBranchRecordIds,
  collectMindMapCascadeShapeIds,
  collectMindMapStyleTargets,
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
  getMindMapNodeDimensions,
  getMindMapPresetEdgeProps,
  getMindMapPresetNodeProps,
  getMindMapRootId,
  getMindMapStructureDefinition,
  getMindMapStructureId,
  resolveMindMapChildPlacement
} from './mindMapModel.js'

test('createMindMapTopicAtomically publishes a complete relation in one store operation', () => {
  const operations = []
  let atomicDepth = 0
  const createdShapeIds = []
  let bindingCount = 0
  const editor = {
    store: {
      atomic(operation) {
        operations.push('atomic:start')
        atomicDepth += 1
        operation()
        atomicDepth -= 1
        operations.push('atomic:end')
        assert.deepEqual(createdShapeIds, ['shape:child', 'shape:edge'])
        assert.equal(bindingCount, 2)
        operations.push('operation:complete')
      }
    },
    createShape(shape) {
      assert.equal(atomicDepth, 1)
      createdShapeIds.push(shape.id)
      operations.push(`shape:${shape.id}`)
    },
    createBindings(bindings) {
      assert.equal(atomicDepth, 1)
      bindingCount += bindings.length
      operations.push(`bindings:${bindings.length}`)
    },
    updateShape(shape) {
      assert.equal(atomicDepth, 1)
      operations.push(shape.id === 'shape:edge'
        ? `lock:${shape.id}:${shape.isLocked}`
        : `root:${shape.id}:${shape.meta.cowartMindMapAutoLayout}`)
    }
  }
  const nodeShape = { id: 'shape:child', type: 'geo' }
  const edgeShape = { id: 'shape:edge', type: 'arrow' }
  const bindings = [{ type: 'arrow' }, { type: 'arrow' }]
  const rootUpdate = {
    id: 'shape:root',
    type: 'geo',
    meta: { cowartMindMapAutoLayout: true }
  }

  const nodeId = createMindMapTopicAtomically(editor, nodeShape, edgeShape, bindings, rootUpdate)

  assert.equal(nodeId, nodeShape.id)
  assert.deepEqual(operations, [
    'atomic:start',
    'shape:shape:child',
    'shape:shape:edge',
    'bindings:2',
    'lock:shape:edge:true',
    'root:shape:root:true',
    'atomic:end',
    'operation:complete'
  ])
})

function node(id, {
  x = 0,
  y = 0,
  w = 160,
  h = 48,
  order = 'a0',
  side = null,
  collapsed = false,
  color = 'blue',
  fill = 'semi',
  dash = 'solid',
  size = 'm',
  font = 'sans',
  geo = 'rectangle'
} = {}) {
  return {
    id,
    typeName: 'shape',
    type: 'geo',
    x,
    y,
    props: { w, h, growY: 0, color, fill, dash, size, font, geo, labelColor: 'black' },
    meta: {
      cowartMindMapNode: true,
      cowartMindMapVersion: 1,
      cowartMindMapOrder: order,
      cowartMindMapSide: side,
      cowartMindMapCollapsed: collapsed
    }
  }
}

function edge(id, parentId, childId, { color = 'blue', dash = 'solid', size = 's', kind = 'elbow' } = {}) {
  const edgeShape = {
    id,
    typeName: 'shape',
    type: 'arrow',
    meta: { cowartMindMapEdge: true, cowartMindMapVersion: 1 },
    props: { color, labelColor: color, dash, size, kind }
  }
  const start = {
    id: `binding:${id}:start`,
    typeName: 'binding',
    type: 'arrow',
    fromId: id,
    toId: parentId,
    props: { terminal: 'start' }
  }
  const end = {
    id: `binding:${id}:end`,
    typeName: 'binding',
    type: 'arrow',
    fromId: id,
    toId: childId,
    props: { terminal: 'end' }
  }
  return { edgeShape, bindings: [start, end] }
}

function graphFixture() {
  const root = node('shape:root', { x: 400, y: 300, w: 220, h: 64, side: 'center', fill: 'solid', size: 'l' })
  const left = node('shape:left', { order: 'a1', side: 'left', h: 56, color: 'green' })
  const right = node('shape:right', { order: 'a2', side: 'right', h: 72, color: 'violet' })
  const leftChildA = node('shape:left-a', { order: 'a1', side: 'left', h: 40, color: 'green', fill: 'none', size: 's' })
  const leftChildB = node('shape:left-b', { order: 'a2', side: 'left', h: 80, color: 'green', fill: 'none', size: 's' })
  const rightChild = node('shape:right-a', { order: 'a1', side: 'right', h: 44, color: 'violet', fill: 'none', size: 's' })
  const connections = [
    edge('shape:edge-left', root.id, left.id, { color: 'green' }),
    edge('shape:edge-right', root.id, right.id, { color: 'violet' }),
    edge('shape:edge-left-a', left.id, leftChildA.id, { color: 'green' }),
    edge('shape:edge-left-b', left.id, leftChildB.id, { color: 'green' }),
    edge('shape:edge-right-a', right.id, rightChild.id, { color: 'violet' })
  ]

  return {
    shapes: [root, left, right, leftChildA, leftChildB, rightChild, ...connections.map((item) => item.edgeShape)],
    bindings: connections.flatMap((item) => item.bindings)
  }
}

test('mind-map presets expose a stronger default hierarchy', () => {
  assert.equal(DEFAULT_MIND_MAP_STYLE_PRESET_ID, 'balanced')
  assert.deepEqual(Object.keys(MIND_MAP_STYLE_PRESETS), ['balanced', 'cards', 'sketch'])
  assert.deepEqual(getMindMapPresetNodeProps('balanced', 0, 'orange'), {
    geo: 'rectangle',
    color: 'blue',
    labelColor: 'white',
    fill: 'solid',
    dash: 'solid',
    size: 'l',
    font: 'sans'
  })
  assert.equal(getMindMapPresetNodeProps('balanced', 1, 'orange').fill, 'semi')
  assert.equal(getMindMapPresetNodeProps('balanced', 1, 'orange').size, 'm')
  assert.equal(getMindMapPresetNodeProps('balanced', 2, 'orange').fill, 'none')
  assert.equal(getMindMapPresetNodeProps('balanced', 2, 'orange').size, 's')
  assert.equal(getMindMapPresetEdgeProps('balanced', 1, 'orange').size, 'm')
  assert.equal(getMindMapPresetEdgeProps('balanced', 2, 'orange').size, 's')
  assert.equal(getMindMapPresetNodeProps('cards', 1, 'orange').labelColor, 'black')
  assert.equal(getMindMapPresetNodeProps('cards', 1, 'blue').labelColor, 'white')
})

test('mind-map structures default old canvases to balanced and expose directional anchors', () => {
  assert.equal(DEFAULT_MIND_MAP_STRUCTURE_ID, 'balanced')
  assert.deepEqual(Object.keys(MIND_MAP_STRUCTURES), ['balanced', 'right', 'left', 'org-down'])
  assert.equal(getMindMapStructureId(node('shape:legacy-root')), 'balanced')

  const root = node('shape:root')
  root.meta.cowartMindMapStructure = 'org-down'
  assert.equal(getMindMapStructureId(root), 'org-down')
  root.meta.cowartMindMapStructure = 'unknown'
  assert.equal(getMindMapStructureId(root), 'balanced')
  assert.deepEqual(getMindMapStructureDefinition('org-down'), {
    label: '组织结构图',
    direction: 'down',
    layout: 'vertical'
  })
  assert.equal(getMindMapStructureDefinition('unknown'), MIND_MAP_STRUCTURES.balanced)

  assert.deepEqual(getMindMapConnectionAnchors('balanced', 'left'), {
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 }
  })
  assert.deepEqual(getMindMapConnectionAnchors('right', 'right'), {
    start: { x: 1, y: 0.5 },
    end: { x: 0, y: 0.5 }
  })
  assert.deepEqual(getMindMapConnectionAnchors('org-down', 'down'), {
    start: { x: 0.5, y: 1 },
    end: { x: 0.5, y: 0 }
  })
})

test('resolveMindMapChildPlacement preserves sibling preferences independently from visual direction', () => {
  assert.deepEqual(resolveMindMapChildPlacement({
    structureId: 'balanced',
    parentIsRoot: true,
    requestedSide: 'left'
  }), { savedSide: 'left', visualDirection: 'left' })
  assert.deepEqual(resolveMindMapChildPlacement({
    structureId: 'right',
    parentIsRoot: true
  }), { savedSide: 'auto', visualDirection: 'right' })
  assert.deepEqual(resolveMindMapChildPlacement({
    structureId: 'right',
    parentIsRoot: true,
    requestedSide: 'left'
  }), { savedSide: 'left', visualDirection: 'right' })
  assert.deepEqual(resolveMindMapChildPlacement({
    structureId: 'org-down',
    parentIsRoot: false,
    parentSide: 'left'
  }), { savedSide: 'left', visualDirection: 'down' })
})

test('collectMindMapStyleTargets resolves node, branch, and map scopes with incoming edges', () => {
  const graph = buildMindMapGraph(graphFixture())

  assert.equal(getMindMapRootId(graph, 'shape:left-a'), 'shape:root')
  assert.equal(getMindMapRootId(graph, 'shape:missing'), null)
  assert.deepEqual(collectMindMapStyleTargets(graph, 'shape:left', 'node'), {
    rootId: 'shape:root',
    nodeIds: ['shape:left'],
    edgeIds: ['shape:edge-left']
  })
  assert.deepEqual(collectMindMapStyleTargets(graph, 'shape:left', 'branch'), {
    rootId: 'shape:root',
    nodeIds: ['shape:left', 'shape:left-a', 'shape:left-b'],
    edgeIds: ['shape:edge-left', 'shape:edge-left-a', 'shape:edge-left-b']
  })
  assert.deepEqual(collectMindMapStyleTargets(graph, 'shape:left', 'map'), {
    rootId: 'shape:root',
    nodeIds: ['shape:root', 'shape:left', 'shape:left-a', 'shape:left-b', 'shape:right', 'shape:right-a'],
    edgeIds: [
      'shape:edge-left',
      'shape:edge-left-a',
      'shape:edge-left-b',
      'shape:edge-right',
      'shape:edge-right-a'
    ]
  })
})

test('createMindMapStyleUpdates changes only the requested branch and its connectors', () => {
  const graph = buildMindMapGraph(graphFixture())
  const updates = createMindMapStyleUpdates(graph, 'shape:left', 'branch', {
    nodeProps: { color: 'red', fill: 'solid', labelColor: 'white' },
    edgeProps: { color: 'red', labelColor: 'red', dash: 'dashed' }
  })
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.equal(byId.get('shape:left').props.color, 'red')
  assert.equal(byId.get('shape:left-a').props.fill, 'solid')
  assert.equal(byId.get('shape:edge-left').props.dash, 'dashed')
  assert.equal(byId.get('shape:edge-left-b').props.color, 'red')
  assert.equal(byId.has('shape:root'), false)
  assert.equal(byId.has('shape:right'), false)
  assert.equal(byId.has('shape:edge-right'), false)
})

test('createMindMapPresetUpdates preserves branch colors and records the chosen theme', () => {
  const graph = buildMindMapGraph(graphFixture())
  const updates = createMindMapPresetUpdates(graph, 'shape:root', 'sketch')
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.equal(byId.get('shape:root').meta.cowartMindMapStylePreset, 'sketch')
  assert.equal(byId.get('shape:root').props.font, 'draw')
  assert.equal(byId.get('shape:left').props.color, 'green')
  assert.equal(byId.get('shape:left-a').props.color, 'green')
  assert.equal(byId.get('shape:right-a').props.color, 'violet')
  assert.equal(byId.get('shape:edge-left').props.color, 'green')
  assert.equal(byId.get('shape:edge-right-a').props.color, 'violet')
  assert.equal(byId.get('shape:edge-right-a').props.dash, 'draw')
})

test('createMindMapPresetUpdates can restore the default branch palette', () => {
  const graph = buildMindMapGraph(graphFixture())
  const updates = createMindMapPresetUpdates(graph, 'shape:root', 'balanced', {
    branchColors: ['orange', 'green', 'violet']
  })
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.equal(byId.get('shape:left').props.color, 'orange')
  assert.equal(byId.get('shape:left-a').props.color, 'orange')
  assert.equal(byId.get('shape:right').props.color, 'orange')
  assert.equal(byId.get('shape:edge-left-b').props.color, 'orange')
  assert.equal(byId.get('shape:edge-right-a').props.color, 'orange')
})

test('getMindMapChildStyle keeps hierarchy defaults and inherits explicit branch overrides', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const defaultChild = getMindMapChildStyle(graph, 'shape:left-a', {
    side: 'left',
    color: 'green',
    presetId: 'balanced'
  })

  assert.equal(defaultChild.depth, 3)
  assert.equal(defaultChild.nodeProps.fill, 'none')
  assert.equal(defaultChild.nodeProps.size, 's')

  graph.nodeById.get('shape:left-a').props.font = 'serif'
  graph.nodeById.get('shape:left-a').props.geo = 'oval'
  const customizedChild = getMindMapChildStyle(graph, 'shape:left-a', {
    side: 'left',
    color: 'green',
    presetId: 'balanced'
  })

  assert.equal(customizedChild.nodeProps.font, 'serif')
  assert.equal(customizedChild.nodeProps.geo, 'oval')
  assert.equal(customizedChild.nodeProps.fill, 'none')

  graph.nodeById.get('shape:left-b').props.font = 'mono'
  graph.edgeById.get('shape:edge-left-a').props.dash = 'dashed'
  graph.edgeById.get('shape:edge-left-b').props.dash = 'draw'
  const insertedSibling = getMindMapChildStyle(graph, 'shape:left', {
    side: 'left',
    color: 'green',
    presetId: 'balanced',
    preferredSiblingId: 'shape:left-a'
  })

  assert.equal(insertedSibling.nodeProps.font, 'serif')
  assert.equal(insertedSibling.edgeProps.dash, 'dashed')
})

test('createMindMapDepthStyleUpdates rebases defaults and preserves explicit overrides', () => {
  const graph = buildMindMapGraph(graphFixture())
  Object.assign(graph.nodeById.get('shape:left-a').props, getMindMapNodeDimensions(2))
  const defaultUpdates = createMindMapDepthStyleUpdates(graph, 'shape:left-a', {
    presetId: 'balanced',
    targetDepth: 1
  })
  const defaultById = new Map(defaultUpdates.map((update) => [update.id, update]))

  assert.equal(defaultById.get('shape:left-a').props.fill, 'semi')
  assert.equal(defaultById.get('shape:left-a').props.size, 'm')
  assert.equal(defaultById.get('shape:left-a').props.w, 176)
  assert.equal(defaultById.get('shape:left-a').props.h, 48)
  assert.equal(defaultById.get('shape:edge-left-a').props.size, 'm')

  graph.nodeById.get('shape:left-a').props.font = 'serif'
  graph.nodeById.get('shape:left-a').props.fill = 'solid'
  graph.nodeById.get('shape:left-a').props.labelColor = 'white'
  graph.nodeById.get('shape:left-a').props.w = 171
  graph.nodeById.get('shape:left-a').props.h = 45
  graph.edgeById.get('shape:edge-left-a').props.dash = 'dashed'
  const customizedUpdates = createMindMapDepthStyleUpdates(graph, 'shape:left-a', {
    presetId: 'balanced',
    targetDepth: 1
  })
  const customizedById = new Map(customizedUpdates.map((update) => [update.id, update]))

  assert.equal(customizedById.get('shape:left-a').props.font, 'serif')
  assert.equal(customizedById.get('shape:left-a').props.fill, 'solid')
  assert.equal(customizedById.get('shape:left-a').props.labelColor, undefined)
  assert.equal(customizedById.get('shape:left-a').props.w, undefined)
  assert.equal(customizedById.get('shape:left-a').props.h, undefined)
  assert.equal(customizedById.get('shape:edge-left-a').props.dash, 'dashed')
})

test('buildMindMapGraph derives a sorted tree from standard arrow bindings', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)

  assert.deepEqual(graph.rootIds, ['shape:root'])
  assert.equal(graph.parentByChild.get('shape:left'), 'shape:root')
  assert.deepEqual(graph.childrenByParent.get('shape:left'), ['shape:left-a', 'shape:left-b'])
  assert.equal(graph.edgeByChild.get('shape:right-a'), 'shape:edge-right-a')
  assert.deepEqual(graph.invalidEdgeIds, [])
})

test('buildMindMapGraph rejects a second parent and cycle without corrupting the valid tree', () => {
  const fixture = graphFixture()
  const duplicate = edge('shape:edge-duplicate', 'shape:right', 'shape:left-a')
  const cycle = edge('shape:edge-cycle', 'shape:left-a', 'shape:root')
  fixture.shapes.push(duplicate.edgeShape, cycle.edgeShape)
  fixture.bindings.push(...duplicate.bindings, ...cycle.bindings)

  const graph = buildMindMapGraph(fixture)

  assert.equal(graph.parentByChild.get('shape:left-a'), 'shape:left')
  assert.deepEqual(graph.invalidEdgeIds.sort(), ['shape:edge-cycle', 'shape:edge-duplicate'])
  assert.deepEqual(graph.rootIds, ['shape:root'])
})

test('computeMindMapLayout lays out variable-height branches on both sides without overlap', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const layout = computeMindMapLayout(graph, 'shape:root', { horizontalGap: 96, verticalGap: 28 })

  const root = layout.positions.get('shape:root')
  const left = layout.positions.get('shape:left')
  const right = layout.positions.get('shape:right')
  const leftA = layout.positions.get('shape:left-a')
  const leftB = layout.positions.get('shape:left-b')

  assert.deepEqual(root, { x: 400, y: 300, side: 'center', depth: 0 })
  assert.ok(left.x + 160 < root.x)
  assert.ok(right.x > root.x + 220)
  assert.equal(left.side, 'left')
  assert.equal(right.side, 'right')
  assert.ok(leftA.y + 40 + 28 <= leftB.y)
  assert.equal(layout.hiddenNodeIds.size, 0)
})

test('computeMindMapLayout supports left-only and right-only structures without moving the root', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const rootShape = graph.nodeById.get('shape:root')

  for (const structureId of ['left', 'right']) {
    const layout = computeMindMapLayout(graph, rootShape.id, {
      structureId,
      horizontalGap: 96,
      verticalGap: 28
    })
    assert.equal(layout.structureId, structureId)
    assert.deepEqual(layout.positions.get(rootShape.id), {
      x: rootShape.x,
      y: rootShape.y,
      side: 'center',
      depth: 0
    })
    for (const nodeId of getMindMapDescendantIds(graph, rootShape.id)) {
      assert.equal(layout.sides.get(nodeId), structureId)
      const position = layout.positions.get(nodeId)
      const parent = graph.nodeById.get(graph.parentByChild.get(nodeId))
      const parentPosition = layout.positions.get(parent.id)
      if (structureId === 'left') {
        assert.ok(position.x + graph.nodeById.get(nodeId).props.w < parentPosition.x)
      } else {
        assert.ok(position.x > parentPosition.x + parent.props.w)
      }
    }
  }
})

test('computeMindMapLayout lays out an organization chart in non-overlapping rows', () => {
  const fixture = graphFixture()
  const rootShape = fixture.shapes.find((shape) => shape.id === 'shape:root')
  rootShape.meta.cowartMindMapStructure = 'org-down'
  const graph = buildMindMapGraph(fixture)
  const layout = computeMindMapLayout(graph, rootShape.id, { horizontalGap: 96, verticalGap: 28 })

  assert.equal(layout.structureId, 'org-down')
  assert.deepEqual(layout.positions.get(rootShape.id), {
    x: rootShape.x,
    y: rootShape.y,
    side: 'center',
    depth: 0
  })
  for (const nodeId of getMindMapDescendantIds(graph, rootShape.id)) {
    const nodeShape = graph.nodeById.get(nodeId)
    const position = layout.positions.get(nodeId)
    const parent = graph.nodeById.get(graph.parentByChild.get(nodeId))
    const parentPosition = layout.positions.get(parent.id)
    assert.equal(layout.sides.get(nodeId), 'down')
    assert.ok(position.y >= parentPosition.y + parent.props.h + 96)
    assert.ok(Number.isFinite(position.x))
    assert.ok(Number.isFinite(nodeShape.props.w))
  }

  const leftA = layout.positions.get('shape:left-a')
  const leftB = layout.positions.get('shape:left-b')
  assert.ok(leftA.x + graph.nodeById.get('shape:left-a').props.w + 28 <= leftB.x)
})

test('createMindMapBindingUpdates follows the selected structure without rewriting saved side preferences', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const layout = computeMindMapLayout(graph, 'shape:root', { structureId: 'org-down' })
  const bindingUpdates = createMindMapBindingUpdates(graph, layout)
  const byId = new Map(bindingUpdates.map((update) => [update.id, update]))

  assert.deepEqual(byId.get('binding:shape:edge-left:start').props.normalizedAnchor, { x: 0.5, y: 1 })
  assert.deepEqual(byId.get('binding:shape:edge-left:end').props.normalizedAnchor, { x: 0.5, y: 0 })
  assert.equal(bindingUpdates.length, layout.edgeIds.size * 2)

  const shapeUpdates = createMindMapLayoutUpdates(graph, layout)
  const shapeById = new Map(shapeUpdates.map((update) => [update.id, update]))
  assert.equal(shapeById.get('shape:left').meta.cowartMindMapSide, 'left')
  assert.equal(shapeById.get('shape:right').meta.cowartMindMapSide, 'right')
})

test('non-balanced layout repairs a transient child root side without discarding valid preferences', () => {
  const fixture = graphFixture()
  fixture.shapes.find((shape) => shape.id === 'shape:left-a').meta.cowartMindMapSide = 'center'
  const graph = buildMindMapGraph(fixture)
  const layout = computeMindMapLayout(graph, 'shape:root', { structureId: 'org-down' })
  const updates = createMindMapLayoutUpdates(graph, layout)
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.equal(byId.get('shape:left').meta.cowartMindMapSide, 'left')
  assert.equal(byId.get('shape:right').meta.cowartMindMapSide, 'right')
  assert.equal(byId.get('shape:left-a').meta.cowartMindMapSide, 'auto')
})

test('computeMindMapLayout hides every descendant and relation below a collapsed node', () => {
  const fixture = graphFixture()
  const left = fixture.shapes.find((shape) => shape.id === 'shape:left')
  left.meta.cowartMindMapCollapsed = true
  const graph = buildMindMapGraph(fixture)

  const layout = computeMindMapLayout(graph, 'shape:root')

  assert.deepEqual([...layout.hiddenNodeIds].sort(), ['shape:left-a', 'shape:left-b'])
  assert.deepEqual([...layout.hiddenEdgeIds].sort(), ['shape:edge-left-a', 'shape:edge-left-b'])
  assert.equal(layout.positions.has('shape:left-a'), false)
  assert.equal(layout.positions.has('shape:left'), true)
})

test('collectMindMapBranchRecordIds includes descendant nodes, edges, and their bindings', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)

  assert.deepEqual(getMindMapDescendantIds(graph, 'shape:left'), ['shape:left-a', 'shape:left-b'])
  assert.deepEqual(
    collectMindMapBranchRecordIds(graph, 'shape:left').sort(),
    [
      'binding:shape:edge-left-a:end',
      'binding:shape:edge-left-a:start',
      'binding:shape:edge-left-b:end',
      'binding:shape:edge-left-b:start',
      'shape:edge-left-a',
      'shape:edge-left-b',
      'shape:left',
      'shape:left-a',
      'shape:left-b'
    ].sort()
  )
})

test('collectMindMapCascadeShapeIds preserves the incoming edge from the last complete graph', () => {
  const fixture = graphFixture()
  const completeGraph = buildMindMapGraph(fixture)
  const bindingsAfterTldrawCleanup = fixture.bindings.filter(
    (binding) => binding.id !== 'binding:shape:edge-left:end'
  )
  const graphDuringDelete = buildMindMapGraph({
    shapes: fixture.shapes,
    bindings: bindingsAfterTldrawCleanup
  })

  assert.equal(graphDuringDelete.edgeByChild.has('shape:left'), false)
  assert.deepEqual(
    collectMindMapCascadeShapeIds(completeGraph, 'shape:left').sort(),
    [
      'shape:edge-left',
      'shape:edge-left-a',
      'shape:edge-left-b',
      'shape:left',
      'shape:left-a',
      'shape:left-b'
    ].sort()
  )
})

test('createMindMapTranslationUpdates moves the unselected subtree and disables automatic layout', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const initial = graph.nodeById.get('shape:left')
  const current = { ...initial, x: initial.x + 30, y: initial.y - 12 }

  const updates = createMindMapTranslationUpdates(graph, initial, current, new Set(['shape:left']))
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.deepEqual(byId.get('shape:left-a'), { id: 'shape:left-a', type: 'geo', x: 30, y: -12 })
  assert.deepEqual(byId.get('shape:left-b'), { id: 'shape:left-b', type: 'geo', x: 30, y: -12 })
  assert.equal(byId.get('shape:root').meta.cowartMindMapAutoLayout, false)
  assert.equal(byId.has('shape:left'), false)
})

test('createMindMapTranslationUpdates lets only the top-most selected node move a shared subtree', () => {
  const fixture = graphFixture()
  const graph = buildMindMapGraph(fixture)
  const initial = graph.nodeById.get('shape:left')
  const current = { ...initial, x: initial.x + 30, y: initial.y - 12 }

  const updates = createMindMapTranslationUpdates(
    graph,
    initial,
    current,
    new Set(['shape:root', 'shape:left'])
  )

  assert.deepEqual(updates, [])
})

test('createMindMapLayoutUpdates persists positions, sides, and derived visibility', () => {
  const fixture = graphFixture()
  fixture.shapes.push(node('shape:other-root', { x: 900, y: 900, side: 'center' }))
  fixture.shapes.find((shape) => shape.id === 'shape:left').meta.cowartMindMapCollapsed = true
  const graph = buildMindMapGraph(fixture)
  const layout = computeMindMapLayout(graph, 'shape:root')

  const updates = createMindMapLayoutUpdates(graph, layout)
  const byId = new Map(updates.map((update) => [update.id, update]))

  assert.equal(byId.get('shape:root').meta.cowartMindMapAutoLayout, true)
  assert.equal(byId.get('shape:left').meta.cowartMindMapSide, 'left')
  assert.equal(byId.get('shape:left-a').meta.cowartMindMapHidden, true)
  assert.equal(byId.get('shape:edge-left-a').meta.cowartMindMapHidden, true)
  assert.equal(byId.get('shape:edge-right').meta.cowartMindMapHidden, false)
  assert.equal(byId.has('shape:other-root'), false)

  const manualUpdates = createMindMapLayoutUpdates(graph, layout, {
    includePositions: false,
    autoLayout: false
  })
  const manualRoot = manualUpdates.find((update) => update.id === 'shape:root')
  assert.equal('x' in manualRoot, false)
  assert.equal('y' in manualRoot, false)
  assert.equal(manualRoot.meta.cowartMindMapAutoLayout, false)
})
