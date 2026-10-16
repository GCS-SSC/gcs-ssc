const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character]!)
const safeLink = (href: string): boolean => /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(href) && !/[\s\\]/.test(href) && !Array.from(href).some(character => character.charCodeAt(0) < 32)

/**
 * Intentionally small Markdown subset. Every authored token is escaped before rendering.
 * @returns HTML containing only escaped text and supported safe formatting.
 * @param text Untrusted authored instruction text.
 */
export const renderSafeMarkdown = (text: string): string => {
  const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\n]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\r?\n/g
  let html = ''
  let end = 0
  for (const match of text.matchAll(tokens)) {
    html += escapeHtml(text.slice(end, match.index))
    if (match[1] !== undefined) html += `<code>${escapeHtml(match[1])}</code>`
    else if (match[2] !== undefined && safeLink(match[3]!)) html += `<a href="${escapeHtml(match[3]!)}" rel="noopener noreferrer">${escapeHtml(match[2])}</a>`
    else if (match[4] !== undefined) html += `<strong>${escapeHtml(match[4])}</strong>`
    else if (match[5] !== undefined) html += `<em>${escapeHtml(match[5])}</em>`
    else if (match[0].endsWith('\n')) html += '<br>'
    else html += escapeHtml(match[0])
    end = match.index! + match[0].length
  }
  return html + escapeHtml(text.slice(end))
}
