import type { MiniSourceMapEntry } from './bytecode.ts'
import { allocateBytecode, writeEvent } from './bytecode.ts'
import type { Node, NodeSource } from './tokenizer.ts'
import { getDefaultMods, tokenize, tokensToNodes } from './tokenizer.ts'

interface CompiledEvent {
  start: number
  end: number
  value: number
  velocity: number
  hold: number
  glide: number
  prob: number
  index: number
  stretch: number
  source: NodeSource
}

function compileGroup(
  node: Node,
  parent: Node | null,
) {
  const events: CompiledEvent[][] = []
  const childStretches: number[] = []
  const childIsGroup: boolean[] = []
  const groupChildrenEvents: CompiledEvent[][][] = []

  let maxCycle = 1

  for (const child of node.children) {
    if (child.type === 'event') {
      const childEvents = compileEvent(child, node)
      maxCycle = Math.max(maxCycle, child.modifiers.stretch)
      events.push(childEvents)
      childStretches.push(child.modifiers.stretch)
      childIsGroup.push(false)
      groupChildrenEvents.push([])
    }
    else if (child.type === 'group') {
      if (child.modifiers.stretch > 1) {
        const groupChildEvents: CompiledEvent[][] = []
        for (const groupChild of child.children) {
          if (groupChild.type === 'event') {
            groupChildEvents.push(compileEvent(groupChild, child))
          }
          else if (groupChild.type === 'group') {
            groupChildEvents.push(compileGroup(groupChild, child))
          }
        }
        groupChildrenEvents.push(groupChildEvents)
        events.push([])
        maxCycle = Math.max(maxCycle, child.modifiers.stretch)
        childStretches.push(child.modifiers.stretch)
        childIsGroup.push(true)
      }
      else {
        const childEvents = compileGroup(child, node)
        maxCycle = Math.max(maxCycle, child.modifiers.stretch)
        events.push(childEvents)
        childStretches.push(child.modifiers.stretch)
        childIsGroup.push(false)
        groupChildrenEvents.push([])
      }
    }
  }

  let currentTime = 0
  const slotDuration = 1 / events.length
  for (const [index, childEvents] of events.entries()) {
    if (childIsGroup[index]!) {
      const groupChildEvents = groupChildrenEvents[index]!
      const groupSlotStart = currentTime
      currentTime += slotDuration
      const childStretch = childStretches[index]!
      const numChildren = groupChildEvents.length
      for (let childIndex = 0; childIndex < numChildren; childIndex++) {
        const targetCycle = numChildren === 1
          ? 0
          : Math.floor(childIndex * childStretch / numChildren)
        const midPoint = (childStretch - 1) / 2
        const cycleOffset = childIndex === 0 || targetCycle > midPoint || childStretch === numChildren
          ? 0
          : (targetCycle / (childStretch - 1)) * slotDuration
        const groupChildEventList = groupChildEvents[childIndex]!
        const childSlotDuration = (1 / groupChildEventList.length) * slotDuration
        for (const [eventIndex, event] of groupChildEventList.entries()) {
          event.start = groupSlotStart + cycleOffset + eventIndex * childSlotDuration
          event.end = event.start + childSlotDuration
        }
      }
    }
    else {
      const childSlotDuration = (1 / childEvents.length) * slotDuration
      for (const [eventIndex, event] of childEvents.entries()) {
        event.start = currentTime
        event.end = event.start + childSlotDuration // TODO: handle repeat
        currentTime += childSlotDuration
        console.log(event.source.text, event.index, event.stretch)
      }
    }
  }

  const result: CompiledEvent[] = []

  for (let c = 0; c < maxCycle; c++) {
    for (const [index, childEvents] of events.entries()) {
      const childStretch = childStretches[index]!
      if (childIsGroup[index]!) {
        const groupChildEvents = groupChildrenEvents[index]!
        const numChildren = groupChildEvents.length
        for (let childIndex = 0; childIndex < numChildren; childIndex++) {
          const targetCycle = numChildren === 1
            ? 0
            : Math.floor(childIndex * childStretch / numChildren)
          if (c === targetCycle) {
            const selectedChildEvents = groupChildEvents[childIndex]!
            for (const event of selectedChildEvents) {
              result.push({
                ...event,
                index,
                start: event.start + c,
                end: event.end + c,
              })
            }
          }
        }
      }
      else {
        if (c >= childStretch - 1) {
          for (const event of childEvents) {
            result.push({
              ...event,
              index,
              start: event.start + c,
              end: event.end + c,
            })
          }
        }
      }
    }
  }

  return result
}

function compileEvent(node: Node, parent: Node): CompiledEvent[] {
  const events: CompiledEvent[] = []
  for (const [index, value] of node.values.entries()) {
    events.push({
      start: 0,
      end: 1 * node.modifiers.stretch,
      value,
      velocity: node.modifiers.velocity,
      hold: node.modifiers.hold,
      glide: node.modifiers.glide,
      prob: node.modifiers.prob,
      index,
      stretch: parent.modifiers.stretch * node.modifiers.stretch,
      source: node.source,
    })
  }
  return events
}

export function compileMiniNotation(
  input: string,
  options: { seed?: number } = {},
) {
  const tokens = tokenize(input)
  const nodes = tokensToNodes(tokens, input)

  const root: Node = {
    type: 'group',
    values: [],
    children: nodes,
    modifiers: getDefaultMods(),
    angle: false,
    source: {
      start: 0,
      length: input.length,
      text: input,
    },
  }

  const events = compileGroup(root, null)

  const bytecode = allocateBytecode(events.length)
  bytecode[0] = events.length

  const sourceMap: MiniSourceMapEntry[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!
    writeEvent(
      bytecode,
      i,
      event.start,
      event.end,
      event.value,
      event.velocity,
      event.hold,
      event.glide,
      event.prob,
    )

    sourceMap.push({
      eventIndex: i,
      source: event.source,
    })
  }

  return { events, bytecode, sourceMap }
}
