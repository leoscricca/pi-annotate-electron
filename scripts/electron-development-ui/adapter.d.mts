export interface DevelopmentContext {
  hasUI: boolean
  sessionManager: { getSessionId(): string }
  ui: { select(title: string, choices: string[]): Promise<string | undefined>; notify(message: string, type: 'info' | 'error'): void }
}
export interface DevelopmentAdapter {
  perform(ctx: DevelopmentContext, action: string, mode?: string, signal?: AbortSignal): Promise<any>
  execute(ctx: DevelopmentContext, params: Record<string, unknown>, signal?: AbortSignal): Promise<any>
  has(ctx: { sessionManager: { getSessionId(): string } }): boolean
  blocked(): boolean
  retire(): Promise<unknown>
  state: { epoch: number; slots: Map<string, any> }
}
export function installDevelopmentAdapter(pi: unknown, options: {
  schema: unknown
  discover?: () => Promise<any[]>
  connect?: (target: any, options: { session: string; onEvent(event: any): void }) => Promise<any>
  content?: (event: any) => Promise<any[]>
  state?: { epoch: number; slots: Map<string, any> }
}): DevelopmentAdapter
