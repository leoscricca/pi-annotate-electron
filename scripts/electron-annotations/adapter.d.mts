import type { AnnotationContent, AnnotationFeedback } from './feedback.mjs'
import type { DevelopmentAdapter } from '../electron-development-ui/adapter.mjs'
export interface AnnotationContext {
  hasUI: boolean
  sessionManager: { getSessionId(): string }
  ui: { confirm(title: string, message: string): Promise<boolean>; notify(message: string, type: 'info' | 'error'): void }
}
export interface AdapterLaunch {
  readonly retired: boolean
  target: string
  captures: string
  annotate(options?: { mode?: string; signal?: AbortSignal }): Promise<AnnotationFeedback>
  close(): Promise<unknown>
  cancel(): Promise<unknown>
  status(): Promise<unknown>
}
export interface AdapterState { epoch: number; slots: Map<string, any> }
export function installAnnotationAdapter(pi: unknown, options: {
  schema: unknown
  development?: DevelopmentAdapter
  createLaunch?: (options: { session: string; foregroundApproved: boolean }) => Promise<AdapterLaunch>
  content?: (result: AnnotationFeedback, captures: string) => Promise<AnnotationContent>
  state?: AdapterState
}): { perform(ctx: AnnotationContext, action: string, mode?: string, signal?: AbortSignal): Promise<any>; state: AdapterState }
