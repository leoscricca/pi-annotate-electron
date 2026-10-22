const { contextBridge, ipcRenderer } = require('electron')
const operations = new Set(['new-session', 'send-input', 'connect', 'saved-login', 'live-session'])
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('__ANNOTATION_FIXTURE__', Object.freeze({
    legacy: process.argv.includes('--annotation-fixture-legacy'),
    synthetic: true,
    recordOperation: operation => operations.has(operation)
      ? ipcRenderer.invoke('conversation:' + operation)
      : Promise.reject(new Error('FIXTURE_OPERATION_REFUSED')),
  }))
}
