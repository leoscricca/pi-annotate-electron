#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { readLaunchConfig } = require('../scripts/electron-development-ui/launch-config.cjs')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const names = new Map([['--app','appRoot'],['--entry','entry'],['--renderer','renderer'],['--profile','profile'],['--adapter','adapter']])
const args = process.argv.slice(2)
if (!args.length || args.length === 1 && args[0] === '--help') {
  console.log('Usage: pi-annotate-electron --app APP_ROOT --renderer RELATIVE_HTML [--entry RELATIVE_MAIN] [--profile PROFILE_DIRECTORY]\n       pi-annotate-electron --app OPENCHAMBER_ROOT --adapter openchamber --profile DEVELOPMENT_PROFILE')
  process.exitCode = args.length ? 0 : 1
} else {
  try {
    const selected = {}
    if (args.length > 10 || args.length % 2) throw new Error('ANNOTATE_ELECTRON_LAUNCH_REFUSED')
    for (let i = 0; i < args.length; i += 2) {
      const key = names.get(args[i])
      if (!key || key in selected || !args[i+1]) throw new Error('ANNOTATE_ELECTRON_LAUNCH_REFUSED')
      selected[key] = args[i+1]
    }
    const config = readLaunchConfig(selected)
    const electron = require('electron')
    const env = { ...process.env, PI_ANNOTATE_APP_ROOT: config.appRoot, PI_ANNOTATE_APP_ENTRY: config.entry,
      PI_ANNOTATE_RENDERER_FILE: config.renderer }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.PI_ANNOTATE_ADAPTER
    if (config.adapter) env.PI_ANNOTATE_ADAPTER = config.adapter
    delete env.PI_ANNOTATE_PROFILE
    if (config.profile) env.PI_ANNOTATE_PROFILE = config.profile
    // The launcher owns terminal signals. Its referenced IPC channel joins normal app quit.
    const main = config.adapter === 'openchamber' ? 'openchamber-main.mjs' : 'external-main.cjs'
    const child = spawn(electron, [path.join(root, 'scripts/electron-development-ui', main)],
      { cwd: config.appRoot, env, detached: true, stdio: ['ignore','inherit','inherit','ipc'], serialization: 'json' })
    const signals = ['SIGINT','SIGTERM','SIGHUP']
    const requestQuit = () => {
      if (child.connected) child.send({ version: 1, kind: 'quit' }, error => {
        if (error) console.error('Normal quit request was not confirmed. No forced termination was requested.')
      })
    }
    for (const signal of signals) process.on(signal, requestQuit)
    child.once('error', () => { process.exitCode = 1; console.error('Electron startup failed. No cleanup result is claimed.') })
    child.once('close', (code, signal) => {
      for (const name of signals) process.off(name, requestQuit)
      process.exitCode = signal || code === null ? 1 : code
    })
  } catch {
    process.exitCode = 1
    console.error('Electron annotation launch was refused. Check the app root, entry, renderer, profile, and local dependencies.')
  }
}
