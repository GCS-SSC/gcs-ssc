/* eslint-disable jsdoc/require-jsdoc -- internal ranked-layout helpers */
import type { FlowDiagramDefinition } from '@gcs-ssc/extensions/ui'

export const branchCardWidth = 264
const pitch = branchCardWidth + 48
export type FlowBranchLayout = { nodes: Record<string, { row: number; left: number }>; width: number; rows: number }

/**
 * Arrange a forward graph in stable, non-overlapping rows; shared successors occupy one card.
 * @param definition - Caller-owned graph, never mutated.
 * @returns Card positions and complete canvas width.
 */
export const flowBranchLayout = (definition: FlowDiagramDefinition): FlowBranchLayout => {
  const nodes = definition.nodes
  const byId = new Map(nodes.map(node => [node.id, node]))
  const incoming = new Map(nodes.map(node => [node.id, [] as string[]]))
  for (const node of nodes) for (const route of node.routes ?? []) {
    if (byId.has(route.targetId) && !incoming.get(route.targetId)!.includes(node.id)) incoming.get(route.targetId)!.push(node.id)
  }
  const remaining = new Map([...incoming].map(([id, parents]) => [id, parents.length]))
  const ranks = new Map<string, number>()
  const queue = nodes.filter(node => !remaining.get(node.id)).map(node => node.id)
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!
    ranks.set(id, Math.max(0, ...incoming.get(id)!.map(parent => (ranks.get(parent) ?? -1) + 1)))
    for (const target of new Set(byId.get(id)!.routes?.map(route => route.targetId))) {
      if (!remaining.has(target)) continue
      const count = remaining.get(target)! - 1
      remaining.set(target, count)
      if (!count) queue.push(target)
    }
  }
  // Malformed cyclic drafts remain visible, with their routes handled by outside rails.
  let extraRow = Math.max(-1, ...ranks.values()) + 1
  for (const node of nodes) if (!ranks.has(node.id)) ranks.set(node.id, extraRow++)
  const order = new Map<string, number>()
  const visit = (id: string) => {
    if (order.has(id) || !byId.has(id)) return
    order.set(id, order.size)
    for (const route of byId.get(id)!.routes ?? []) visit(route.targetId)
  }
  for (const id of queue) visit(id)
  for (const node of nodes) visit(node.id)
  const rows: string[][] = []
  for (const node of nodes) (rows[ranks.get(node.id)!] ??= []).push(node.id)
  for (const row of rows) row.sort((a, b) => order.get(a)! - order.get(b)!)
  const width = Math.max(1, ...rows.map(row => row.length)) * pitch - 48
  const centers = new Map<string, number>()
  for (const row of rows) row.forEach((id, index) => centers.set(id, (width - (row.length - 1) * pitch) / 2 + index * pitch))
  const align = (row: string[], parents: boolean) => {
    const desired = row.map(id => {
      const neighbours = parents ? incoming.get(id)! : [...new Set(byId.get(id)!.routes?.map(route => route.targetId))]
      const positions = neighbours.filter(target => centers.has(target)).map(target => centers.get(target)!)
      return positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : centers.get(id)!
    })
    const placed: number[] = []
    desired.forEach((value, index) => placed.push(Math.max(value, (placed[index - 1] ?? -Infinity) + pitch)))
    const shift = desired.reduce((sum, value, index) => sum + value - placed[index]!, 0) / row.length
    row.forEach((id, index) => centers.set(id, placed[index]! + shift))
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const row of [...rows].reverse()) align(row, false)
    for (const row of rows) align(row, true)
  }
  const minimum = Math.min(branchCardWidth / 2, ...centers.values()) - branchCardWidth / 2
  const positions = Object.fromEntries(nodes.map(node => [node.id, { row: ranks.get(node.id)!, left: centers.get(node.id)! - branchCardWidth / 2 - minimum }]))
  return { nodes: positions, width: Math.max(width, ...Object.values(positions).map(node => node.left + branchCardWidth)), rows: rows.length }
}
