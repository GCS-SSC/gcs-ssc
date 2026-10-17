/* eslint-disable jsdoc/require-jsdoc -- internal browser snapshot helpers */
const svgNamespace = 'http://www.w3.org/2000/svg'
export type DiagramSvg = { source: string
  width: number
  height: number }
const svgElement = (name: string, attributes: Record<string, string | number> = {}) => {
  const element = document.createElementNS(svgNamespace, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}
const paint = (value: string) => value === 'rgba(0, 0, 0, 0)' || value === 'transparent' ? 'none' : value

/**
 * Snapshot the complete measured diagram as native SVG shapes and text, with no external assets.
 *
 * @param root - Rendered diagram including its description and legend.
 * @param title - Accessible and printed title.
 * @returns Standalone vector source and its dimensions in CSS pixels.
 */
export const diagramSvg = (root: HTMLElement, title: string): DiagramSvg => {
  const origin = root.getBoundingClientRect()
  const canvas = root.querySelector<HTMLElement>('.flow-canvas')
  const scroll = root.querySelector<HTMLElement>('.flow-scroll')
  const branches = root.classList.contains('flow-map--branches')
  const viewport = canvas && scroll
  const canvasBounds = canvas?.getBoundingClientRect()
  const scrollBounds = scroll?.getBoundingClientRect()
  const frame = root.querySelector<HTMLElement>('.flow-frame')
  const frameBounds = frame?.getBoundingClientRect() ?? scrollBounds
  const surface = root.querySelector<HTMLElement>('.flow-surface')
  const toolbarHeight = Number(frame?.dataset.flowToolbarHeight) || root.querySelector<HTMLElement>('.flow-canvas-toolbar')?.getBoundingClientRect().height || 0
  const surfaceBorder = surface?.classList.contains('flow-surface--fullscreen') ? 1 : surface?.clientTop ?? 0
  const scrollStyle = scroll ? getComputedStyle(scroll) : null
  const scale = viewport ? Number(canvas.dataset.flowZoom) || 1 : 1
  const insetX = parseFloat(scrollStyle?.paddingLeft ?? '') || 0
  const insetY = parseFloat(scrollStyle?.paddingTop ?? '') || 0
  const viewportHeight = viewport && frameBounds && surface ? frameBounds.height - toolbarHeight - surfaceBorder * 2 : scroll?.clientHeight ?? 0
  const expandedHeight = viewport ? canvas.scrollHeight + insetY + (parseFloat(scrollStyle?.paddingBottom ?? '') || 0) - viewportHeight : 0
  const canvasOrigin = viewport
    ? { x: frameBounds!.left - origin.left + surfaceBorder + insetX,
        y: frameBounds!.top - origin.top + surfaceBorder + toolbarHeight + insetY }
    : null
  const padding = 24, titleHeight = 38
  const rootStyle = getComputedStyle(root)
  const bg = rootStyle.getPropertyValue('--ui-bg').trim() || '#ffffff'
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;white-space:pre;font-family:${rootStyle.fontFamily};font-size:18px;font-weight:700`
  probe.textContent = title
  probe.style.color = bg
  root.append(probe)
  const titleWidth = probe.getBoundingClientRect().width
  const background = getComputedStyle(probe).color
  probe.remove()
  const width = Math.ceil(Math.max(origin.width, (canvasOrigin?.x ?? 0) + (canvas?.scrollWidth ?? 0), titleWidth) + padding * 2)
  const height = Math.ceil(Math.max(origin.height, root.scrollHeight) + expandedHeight + padding * 2 + titleHeight)
  const svg = svgElement('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' })
  const accessibleTitle = svgElement('title')
  accessibleTitle.textContent = title
  svg.append(accessibleTitle)
  svg.append(svgElement('rect', { width, height, fill: background }))
  const heading = svgElement('text', { 'x': padding, 'y': padding + 19, 'fill': rootStyle.color, 'font-family': rootStyle.fontFamily, 'font-size': 18, 'font-weight': 700 })
  heading.textContent = title
  svg.append(heading)
  const position = (element: Element, rect = element.getBoundingClientRect()) => {
    if (canvasOrigin && canvas?.contains(element)) return {
      x: canvasOrigin.x + (rect.left - canvasBounds!.left) / scale + padding,
      y: canvasOrigin.y + (rect.top - canvasBounds!.top) / scale + padding + titleHeight,
      width: rect.width / scale, height: rect.height / scale
    }
    return {
      x: rect.left - origin.left + padding + (canvas?.contains(element) ? scroll?.scrollLeft ?? 0 : 0),
      y: rect.top - origin.top + padding + titleHeight + (canvas?.contains(element) ? scroll?.scrollTop ?? 0 : 0)
        + (viewport && rect.top >= frameBounds!.bottom ? expandedHeight : 0),
      width: rect.width, height: rect.height
    }
  }
  const branchConnections = branches ? svgElement('g') : null
  if (branchConnections) svg.append(branchConnections)
  for (const element of root.querySelectorAll<HTMLElement>('.flow-routes')) {
    const rect = position(element), style = getComputedStyle(element)
    svg.append(svgElement('line', { 'x1': rect.x, 'x2': rect.x, 'y1': rect.y, 'y2': rect.y + rect.height,
      'stroke': style.borderLeftColor, 'stroke-width': parseFloat(style.borderLeftWidth) }))
  }
  // Each surface is rendered behind its labels
  // Edges keep their original measured geometry.
  for (const element of root.querySelectorAll<HTMLElement>('.flow-page-node, .flow-terminal-node, .flow-route, .flow-stats span')) {
    const rect = position(element), style = getComputedStyle(element)
    const common = { 'fill': paint(style.backgroundColor), 'stroke': paint(style.borderTopColor), 'stroke-width': parseFloat(style.borderTopWidth) || 0 }
    if (element.classList.contains('flow-page-node--decision')) {
      svg.append(svgElement('polygon', { points: `${rect.x + rect.width / 2},${rect.y} ${rect.x + rect.width},${rect.y + rect.height / 2} ${rect.x + rect.width / 2},${rect.y + rect.height} ${rect.x},${rect.y + rect.height / 2}`, ...common }))
    } else {
      svg.append(svgElement('rect', { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rx: parseFloat(style.borderTopLeftRadius), ...common }))
      if (parseFloat(style.borderLeftWidth) > parseFloat(style.borderTopWidth)) {
        svg.append(svgElement('rect', { x: rect.x, y: rect.y, width: parseFloat(style.borderLeftWidth), height: rect.height, fill: style.borderLeftColor }))
      }
    }
    if (element.classList.contains('flow-route')) {
      const dot = getComputedStyle(element, '::before')
      const size = parseFloat(dot.width)
      if (size && dot.content !== 'none') svg.append(svgElement('circle', { cx: rect.x + parseFloat(dot.left) + size / 2,
        cy: rect.y + parseFloat(dot.top) + size / 2, r: size / 2, fill: dot.backgroundColor }))
    }
  }
  for (const element of root.querySelectorAll<HTMLElement>('.flow-legend-line')) {
    const rect = position(element), style = getComputedStyle(element)
    svg.append(svgElement('line', { 'x1': rect.x, 'x2': rect.x + rect.width, 'y1': rect.y, 'y2': rect.y, 'stroke': style.borderTopColor, 'stroke-width': parseFloat(style.borderTopWidth),
      ...(style.borderTopStyle === 'dashed' ? { 'stroke-dasharray': '4 4' } : style.borderTopStyle === 'dotted' ? { 'stroke-dasharray': '2 3' } : {}) }))
  }
  for (const element of root.querySelectorAll<SVGSVGElement>('svg')) {
    if (element.closest('[data-export-ignore]')) continue
    const rect = position(element)
    const clone = element.cloneNode(true) as SVGSVGElement
    const originals = [element, ...element.querySelectorAll('*')]
    const copies = [clone, ...clone.querySelectorAll('*')]
    for (let index = 0; index < originals.length; index++) {
      const style = getComputedStyle(originals[index]!)
      const copy = copies[index]!
      for (const property of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity']) {
        copy.setAttribute(property, style.getPropertyValue(property))
      }
      copy.removeAttribute('class')
      copy.removeAttribute('style')
    }
    clone.setAttribute('x', String(rect.x))
    clone.setAttribute('y', String(rect.y))
    clone.setAttribute('width', String(rect.width))
    clone.setAttribute('height', String(rect.height))
    clone.setAttribute('overflow', 'visible')
    if (branchConnections && element.classList.contains('flow-connections')) branchConnections.append(clone)
    else svg.append(clone)
  }
  // Range measurements retain wrapping and exact positions while keeping text editable/searchable.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || parent.closest('svg, [data-export-ignore]') || !node.textContent?.trim()) continue
    const style = getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const range = document.createRange()
    let run = '', lastTop = -1, startX = 0, baseline = 0
    const append = () => {
      if (!run.trim()) return
      const text = svgElement('text', { 'x': startX, 'y': baseline, 'fill': style.color, 'font-family': style.fontFamily,
        'font-size': style.fontSize, 'font-weight': style.fontWeight, 'font-style': style.fontStyle,
        'letter-spacing': style.letterSpacing, 'xml:space': 'preserve' })
      text.textContent = style.textTransform === 'uppercase' ? run.toUpperCase() : run
      svg.append(text)
    }
    for (let index = 0; index < node.textContent.length; index++) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const rect = range.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (Math.abs(lastTop - rect.top) > 1) {
        append()
        run = ''
        lastTop = rect.top
        const point = position(parent, rect)
        startX = point.x
        baseline = point.y + point.height * 0.8
      }
      run += node.textContent[index]
    }
    append()
  }
  return { source: new XMLSerializer().serializeToString(svg), width, height }
}

/**
 * Rasterize the standalone SVG at exactly four times its CSS dimensions.
 *
 * @param svg - Self-contained measured vector diagram.
 * @returns PNG data ready to download.
 */
export const diagramPng = async (svg: DiagramSvg): Promise<Blob> => {
  const image = new Image()
  // A data URL keeps this native SVG canvas origin-clean in browser engines.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.source)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = svg.width * 4
  canvas.height = svg.height * 4
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'))
}

/**
 * Download a completed artifact and release its browser URL.
 *
 * @param blob - SVG or PNG artifact.
 * @param filename - Caller-owned suggested filename.
 */
export const downloadDiagram = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
