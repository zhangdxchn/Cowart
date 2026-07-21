import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMindMapGraph,
  collectMindMapBranchRecordIds,
  computeMindMapLayout,
  createMindMapLayoutUpdates,
  createMindMapTranslationUpdates,
  getMindMapDescendantIds
} from './mindMapModel.js'

function node(id, { x = 0, y = 0, w = 160, h = 48, order = 'a0', side = null, collapsed = false } = {}) {
  return {
    id,
    typeName: 'shape',
    type: 'geo',
    x,
    y,
    props: { w, h, growY: 0 },
    meta: {
      cowartMindMapNode: true,
      cowartMindMapVersion: 1,
      cowartMindMapOrder: order,
      cowartMindMapSide: side,
      cowartMindMapCollapsed: collapsed
    }
  }
}

function edge(id, parentId, childId) {
  const edgeShape = {
    id,
    typeName: 'shape',
    type: 'arrow',
    meta: { cowartMindMapEdge: true, cowartMindMapVersion: 1 }
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
  const root = node('shape:root', { x: 400, y: 300, w: 220, h: 64, side: 'center' })
  const left = node('shape:left', { order: 'a1', side: 'left', h: 56 })
  const right = node('shape:right', { order: 'a2', side: 'right', h: 72 })
  const leftChildA = node('shape:left-a', { order: 'a1', side: 'left', h: 40 })
  const leftChildB = node('shape:left-b', { order: 'a2', side: 'left', h: 80 })
  const rightChild = node('shape:right-a', { order: 'a1', side: 'right', h: 44 })
  const connections = [
    edge('shape:edge-left', root.id, left.id),
    edge('shape:edge-right', root.id, right.id),
    edge('shape:edge-left-a', left.id, leftChildA.id),
    edge('shape:edge-left-b', left.id, leftChildB.id),
    edge('shape:edge-right-a', right.id, rightChild.id)
  ]

  return {
    shapes: [root, left, right, leftChildA, leftChildB, rightChild, ...connections.map((item) => item.edgeShape)],
    bindings: connections.flatMap((item) => item.bindings)
  }
}

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
