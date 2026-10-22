export {}

declare global {
  interface Window {
    /** Synthetic sample API. No product backend or agent session is present. */
    conversation?: {
      getSnapshot(): Promise<{ sessionId: string | null; messages: unknown[] }>
    }
  }
}
