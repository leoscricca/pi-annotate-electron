const menuTemplate = document.getElementById('fixture-menu-template')
const settingsTemplate = document.getElementById('fixture-settings-template')
const composer = document.querySelector('.cm-content')
const transcript = document.getElementById('fixture-transcript')
const listeners = new Set()
const messages = []
let sessionId = null
let sequence = 1
function getSnapshot() {
  return { workspaceId: 'synthetic-workspace', sessionId, mode: 'offline', configurationRevision: 1,
    connection: { revision: 1, status: 'offline' }, available: { sendInput: sessionId !== null }, sequence,
    messages: messages.map(message => ({ ...message })) }
}
function notify() { sequence++; for (const listener of listeners) listener(getSnapshot()) }
// These methods mutate synthetic DOM state and fixed test counters, not a product backend.
const recordOperation = operation => window.__ANNOTATION_FIXTURE__.recordOperation(operation)
window.conversation = Object.freeze({
  getSnapshot: async () => getSnapshot(),
  newSession: async () => { await recordOperation('new-session'); sessionId = 'synthetic-session-2'; transcript.replaceChildren(); messages.length = 0; notify(); return { accepted: true } },
  sendInput: async ({ text }) => { await recordOperation('send-input'); const line = document.createElement('p'); line.textContent = String(text); transcript.append(line); messages.push({ role: 'user', text: String(text) }); notify(); return { accepted: true } },
  cancelTurn: async () => ({ accepted: true }),
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
})
function closeMenu() { document.getElementById('fixture-menu')?.remove() }
function setTheme(light) {
  const value = light ? 'light' : 'dark'
  document.body.dataset.previewColorScheme = value
  document.documentElement.dataset.colorScheme = value
  document.documentElement.dataset.theme = value
  document.querySelector('[role=switch]')?.setAttribute('aria-checked', String(light))
}
function openSettings() {
  closeMenu()
  if (document.getElementById('fixture-settings')) return
  document.body.append(settingsTemplate.content.cloneNode(true))
  const dialog = document.getElementById('fixture-settings')
  const gap = document.createElement('div'); gap.className = 'fixture-settings-spacer'
  dialog.querySelector('p').after(gap)
  const tail = document.createElement('div'); tail.className = 'fixture-settings-tail'; dialog.append(tail)
  document.getElementById('sidebar-settings-dismiss').addEventListener('click', () => dialog.remove())
  dialog.querySelector('[role=switch]').setAttribute('aria-checked', String(document.body.dataset.previewColorScheme === 'light'))
  dialog.querySelector('[role=switch]').addEventListener('click', event => setTheme(event.currentTarget.getAttribute('aria-checked') !== 'true'))
  const actions = new Map([['Connect Codex','connect'],['Use saved app login','saved-login'],['Start live session','live-session']])
  for (const button of dialog.querySelectorAll('button')) {
    const operation = actions.get(button.textContent.trim())
    if (operation) button.addEventListener('click', () => { void recordOperation(operation) })
  }
}
function openMenu() {
  closeMenu()
  document.body.append(menuTemplate.content.cloneNode(true))
  const menu = document.getElementById('fixture-menu')
  menu.querySelector('[role=menuitem]').addEventListener('click', openSettings)
}
document.getElementById('composer-model').addEventListener('click', openMenu)
document.getElementById('sidebar-settings').addEventListener('click', openSettings)
document.querySelector('[aria-label="New session"]').addEventListener('click', () => window.conversation.newSession())
document.querySelector('[aria-label="Send offline test"]').addEventListener('click', () => {
  if (!composer.textContent.trim()) return
  void window.conversation.sendInput({ text: composer.textContent })
  composer.textContent = ''
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  closeMenu()
  document.getElementById('fixture-settings')?.remove()
})
setTheme(false)
