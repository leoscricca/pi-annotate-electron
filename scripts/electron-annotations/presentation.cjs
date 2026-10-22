const fs = require('node:fs/promises')
const path = require('node:path')

const { installPresentation } = require('./presentation-ui.cjs')

function scopedTokens(source) {
  const rules = [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  if (rules.length !== 3 || rules[0][1].trim() !== ':root' || rules[1][1].trim() !== ':root, [data-theme="dark"]'
    || rules[2][1].trim() !== '[data-theme="light"]') throw new Error('ANNOTATION_TOKEN_SOURCE_REFUSED')
  const owned = ':is(#pi-panel,.pi-note-card,#pi-highlight,#pi-tooltip,#pi-markers,.pi-connectors)'
  const dark = `[data-theme="dark"] ${owned},[data-preview-color-scheme="dark"] ${owned}`
  const light = `[data-theme="light"] ${owned},[data-preview-color-scheme="light"] ${owned}`
  return `${owned}{${rules[0][2]}${rules[1][2]}}\n@media(prefers-color-scheme:light){${owned}{${rules[2][2]}}}\n${dark}{${rules[1][2]}}\n${light}{${rules[2][2]}}`
}

async function presentationSource(repositoryRoot) {
  const tokenSource = await fs.readFile(path.join(repositoryRoot, 'design/openchamber/tokens.css'), 'utf8')
  const themeSource = await fs.readFile(path.join(repositoryRoot, 'scripts/electron-annotations/catppuccin.css'), 'utf8')
  const css = scopedTokens(tokenSource) + scopedTokens(themeSource) + await fs.readFile(path.join(repositoryRoot, 'scripts/electron-annotations/presentation.css'), 'utf8')
  const names = ['focus-3-line', 'eye-line', 'eye-off-line', 'arrow-go-back-line', 'arrow-go-forward-line', 'chat-3-line', 'arrow-up-line', 'subtract-line', 'add-line', 'delete-bin-6-line', 'image-line', 'code-s-slash-line', 'close', 'arrow-down-s']
  const assets = path.join(repositoryRoot, 'design/icons')
  const values = await Promise.all(names.map(name => fs.readFile(path.join(assets, `${name}.svg`), 'utf8')))
  return `(${installPresentation.toString()})(${JSON.stringify(css)},${JSON.stringify(Object.fromEntries(names.map((name, index) => [name, values[index]])))})`
}
module.exports = { presentationSource }
