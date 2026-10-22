export interface AnnotationFeedback {
  version?: number
  target: string
  session: string
  request: string
  generation: number
  viewport: { width: number; height: number; dpr: number; scrollX: number; scrollY: number }
  selections: Array<{ selector: string; tag: string; role: string; name: string; comment: string;
    bounds: { x: number; y: number; width: number; height: number }; styles: Record<string, string> }>
  images: Array<{ index: number; path: string; width: number; height: number; sha256: string }>
  captureCount?: number
}
export type AnnotationContent = Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: 'image/png'; data: string }>
export function formatPageAnnotation(result: AnnotationFeedback): string
export function annotationContent(result: AnnotationFeedback, captures: string): Promise<AnnotationContent>
