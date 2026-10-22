import type { AnnotationFeedback } from './feedback.mjs'
export interface AnnotationTargetStatus {
  phase: 'booting' | 'idle' | 'active' | 'finishing' | 'cancelling' | 'blocked' | 'retired'
  generation: number
  target: string
  windowId: number | null
  hidden: boolean
}
export interface OwnedAnnotationLaunch {
  readonly retired: boolean
  readonly root: string
  readonly home: string
  readonly profile: string
  readonly captures: string
  readonly target: string
  readonly session: string
  readonly ready: AnnotationTargetStatus & {
    synthetic: boolean
    home: string
    profile: string
    permissions: { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean }
    appWorld: { bridge: string; node: string }
    isolatedStatus: AnnotationTargetStatus
    debug: { renderer: boolean; inspector: boolean }
  }
  status(): Promise<AnnotationTargetStatus>
  annotate(options?: { mode?: 'crop' | 'none'; timeoutMs?: number; signal?: AbortSignal }): Promise<AnnotationFeedback>
  cancel(): Promise<{ phase: string }>
  close(): Promise<{ code: number | null; signal: string | null; closeObserved: boolean; spawnFailed: boolean; terminationRequested: boolean }>
}
export function createOwnedAnnotationLaunch(options: { session: string; foregroundApproved?: boolean }): Promise<OwnedAnnotationLaunch>
