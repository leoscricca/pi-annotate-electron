import type { App, BrowserWindow, IpcMain, Session } from 'electron'

export interface DevelopmentUiHost {
  registerWindow(window: BrowserWindow, target: { kind: 'file' | 'url'; value: string }): void
  close(): Promise<void>
}

export function installDevelopmentUi(options: {
  app: App
  ipcMain: IpcMain
  session: { defaultSession: Session }
  repositoryRoot: string
  directory?: string
}): Promise<DevelopmentUiHost>
