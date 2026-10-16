import { expect, it } from 'vitest'
import { renderSafeMarkdown } from '../../src/markdown'

it('renders only supported Markdown and keeps business instructions readable', () => {
  expect(renderSafeMarkdown('Enter **Name** and *save*.\nUse `Next`.\n[Help](https://example.com/help?a=1&b=2)')).toBe('Enter <strong>Name</strong> and <em>save</em>.<br>Use <code>Next</code>.<br><a href="https://example.com/help?a=1&amp;b=2" rel="noopener noreferrer">Help</a>')
})
it('escapes HTML and never creates links from unsafe protocols or encoded tricks', () => {
  const html = renderSafeMarkdown('<img src=x onerror="alert(1)"> [bad](javascript:alert) [bad](data:text/html,bad) [bad](//evil.test) [bad](java&#x73;cript:alert)')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<a')
  expect(html).toContain('&lt;img')
})
it('does not reparse authored code or link captions as markup', () => {
  expect(renderSafeMarkdown('`**literal**` [**caption**](https://example.com)')).toBe('<code>**literal**</code> <a href="https://example.com" rel="noopener noreferrer">**caption**</a>')
})
