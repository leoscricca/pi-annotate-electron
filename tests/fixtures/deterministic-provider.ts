import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type JsonObject,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type ToolCall,
  type TranscriptContext,
} from '@earendil-works/pi-ai'

export const DETERMINISTIC_PROVIDER_ID = 'cnc-offline'
export const DETERMINISTIC_MODEL_ID = 'offline-probe'
export const DETERMINISTIC_ALTERNATE_MODEL_ID = 'offline-probe-alternate'
export const DETERMINISTIC_CONFIGURATION_PROBE_MODEL_ID = 'offline-configuration-probe'
export const DETERMINISTIC_RESPONSE_PREFIX = 'Offline deterministic response:'

export type DeterministicResponse =
  | { type: 'text'; text: string; delayMs?: number; chunkSize?: number; chunkDelayMs?: number; preservePartialOnAbort?: boolean }
  | { type: 'tool-call'; name: string; arguments: JsonObject; text?: string; delayMs?: number }
  | { type: 'error'; message: string; delayMs?: number }

export interface DeterministicProviderObservation {
  calls: number
  prompts: string[]
  scriptedResponses: number
}

export interface DeterministicProvider {
  provider: Provider<'cnc-offline-local'>
  model: Model<'cnc-offline-local'>
  models: Model<'cnc-offline-local'>[]
  observation: DeterministicProviderObservation
}

function lastUserText(context: TranscriptContext): string {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index]
    if (message?.role !== 'user') continue
    return typeof message.content === 'string'
      ? message.content
      : message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
  }
  return ''
}

function makeMessage(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'],
  errorMessage?: string,
  modelId = DETERMINISTIC_MODEL_ID,
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'cnc-offline-local',
    provider: DETERMINISTIC_PROVIDER_ID,
    model: modelId,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: Date.now(),
  }
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!signal?.aborted)
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const finish = (result: boolean) => {
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const timer = setTimeout(() => finish(true), ms)
    const onAbort = () => {
      clearTimeout(timer)
      finish(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function streamLocalResponse(
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  observation: DeterministicProviderObservation,
  script: readonly DeterministicResponse[],
  requestedModelId: string,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const prompt = lastUserText(context)
  const scriptedResponse = script[observation.calls]
  const response = requestedModelId === DETERMINISTIC_CONFIGURATION_PROBE_MODEL_ID
    ? scriptedResponse?.type === 'text'
      ? { ...scriptedResponse, text: `Synthetic settings-only configuration probe; no reasoning inference: ${scriptedResponse.text}` }
      : scriptedResponse ?? {
          type: 'text' as const,
          text: `Synthetic settings-only configuration probe; no reasoning inference: ${prompt}`,
        }
    : scriptedResponse ?? {
        type: 'text' as const,
        text: `${DETERMINISTIC_RESPONSE_PREFIX} ${prompt}`,
      }
  observation.calls += 1
  observation.prompts.push(prompt)
  if (observation.calls <= script.length) observation.scriptedResponses += 1

  void (async () => {
    const continued = await delay(response.delayMs ?? 0, options?.signal)
    if (!continued) {
      const aborted = makeMessage([], 'aborted', 'Deterministic local provider request was aborted.', requestedModelId)
      stream.push({ type: 'error', reason: 'aborted', error: aborted })
      stream.end(aborted)
      return
    }

    if (response.type === 'error') {
      const error = makeMessage([], 'error', response.message, requestedModelId)
      stream.push({ type: 'error', reason: 'error', error })
      stream.end(error)
      return
    }

    if (response.type === 'tool-call') {
      const toolCall: ToolCall = {
        type: 'toolCall',
        id: `offline-tool-call-${observation.calls}`,
        name: response.name,
        arguments: response.arguments,
      }
      const partial = makeMessage([toolCall], 'pending', undefined, requestedModelId)
      stream.push({ type: 'start', partial })
      stream.push({ type: 'toolcall_start', contentIndex: 0, partial })
      stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall, partial })
      const finalMessage = makeMessage([toolCall], 'toolUse', undefined, requestedModelId)
      stream.push({ type: 'done', reason: 'toolUse', message: finalMessage })
      stream.end(finalMessage)
      return
    }

    const answer = response.text
    const partial = makeMessage([{ type: 'text', text: '' }], 'pending', undefined, requestedModelId)
    stream.push({ type: 'start', partial })
    partial.content = [{ type: 'text', text: '' }]
    stream.push({ type: 'text_start', contentIndex: 0, partial })
    if (response.chunkSize !== undefined) {
      let observed = ''
      for (let offset = 0; offset < answer.length; offset += response.chunkSize) {
        if (offset > 0 && !await delay(response.chunkDelayMs ?? 0, options?.signal)) {
          const aborted = makeMessage(response.preservePartialOnAbort ? [{ type: 'text', text: observed }] : [], 'aborted', 'Deterministic local provider request was aborted.', requestedModelId)
          stream.push({ type: 'error', reason: 'aborted', error: aborted })
          stream.end(aborted)
          return
        }
        const delta = answer.slice(offset, offset + response.chunkSize)
        observed += delta
        partial.content = [{ type: 'text', text: observed }]
        stream.push({ type: 'text_delta', contentIndex: 0, delta, partial })
      }
    } else {
      partial.content = [{ type: 'text', text: answer }]
      stream.push({ type: 'text_delta', contentIndex: 0, delta: answer, partial })
    }
    stream.push({ type: 'text_end', contentIndex: 0, content: answer, partial })

    const finalMessage = makeMessage([{ type: 'text', text: answer }], 'stop', undefined, requestedModelId)
    stream.push({ type: 'done', reason: 'stop', message: finalMessage })
    stream.end(finalMessage)
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const failed = makeMessage([], 'error', message, requestedModelId)
    stream.push({ type: 'error', reason: 'error', error: failed })
    stream.end(failed)
  })

  return stream
}

export function createDeterministicLocalProvider(script: readonly DeterministicResponse[] = []): DeterministicProvider {
  for (const response of script) {
    if (response.type === 'text') {
      if (response.chunkSize !== undefined && (!Number.isInteger(response.chunkSize) || response.chunkSize < 1)) {
        throw new Error('Scripted text chunkSize must be a positive whole number.')
      }
      if (response.chunkDelayMs !== undefined && (!Number.isInteger(response.chunkDelayMs) || response.chunkDelayMs < 0 || response.chunkDelayMs > 10_000)) {
        throw new Error('Scripted text chunkDelayMs must be whole milliseconds from 0 to 10000.')
      }
    }
    if (response.delayMs !== undefined && (!Number.isInteger(response.delayMs) || response.delayMs < 0 || response.delayMs > 10_000)) {
      throw new Error('Deterministic provider delays must be whole milliseconds from 0 to 10000.')
    }
  }

  const observation: DeterministicProviderObservation = { calls: 0, prompts: [], scriptedResponses: 0 }
  const makeModel = (id: string, name: string): Model<'cnc-offline-local'> => ({
    id,
    name,
    api: 'cnc-offline-local',
    provider: DETERMINISTIC_PROVIDER_ID,
    baseUrl: 'offline://local',
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: 16_384,
    maxTokens: 1_024,
  })
  const model = makeModel(DETERMINISTIC_MODEL_ID, 'CnC Offline Probe')
  const alternateModel = makeModel(DETERMINISTIC_ALTERNATE_MODEL_ID, 'CnC Offline Probe Alternate')
  const configurationProbeModel: Model<'cnc-offline-local'> = {
    ...makeModel(DETERMINISTIC_CONFIGURATION_PROBE_MODEL_ID, 'Synthetic Offline Configuration Probe (settings only)'),
    reasoning: true,
    thinkingLevelMap: {
      minimal: null,
      low: 'synthetic-settings-only',
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    },
  }
  const models = [model, alternateModel, configurationProbeModel]
  const provider: Provider<'cnc-offline-local'> = {
    id: DETERMINISTIC_PROVIDER_ID,
    name: 'CnC Offline Deterministic Provider',
    auth: {
      apiKey: {
        name: 'Offline deterministic provider',
        check: async () => ({ type: 'api_key' }),
        resolve: async () => ({ auth: { apiKey: 'offline-only' } }),
      },
    },
    getModels: () => models,
    stream: (requestModel, context, options): AssistantMessageEventStream =>
      streamLocalResponse(context, options, observation, script, requestModel.id),
    streamSimple: (requestModel, context, options): AssistantMessageEventStream =>
      streamLocalResponse(context, options, observation, script, requestModel.id),
  }

  return { provider, model, models, observation }
}
