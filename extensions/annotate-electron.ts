import { Type } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { installAnnotationAdapter } from '../scripts/electron-annotations/adapter.mjs'
import { loadDevelopmentAdapter } from '../scripts/electron-development-ui/load-adapter.mjs'

export default async function (pi: ExtensionAPI) {
  const { installDevelopmentAdapter } = await loadDevelopmentAdapter()
  const development = installDevelopmentAdapter(pi, {
    schema: Type.Object({
      action: Type.Union(['status', 'snapshot', 'screenshot', 'click', 'fill', 'scroll', 'key', 'console', 'exceptions', 'network'].map(value => Type.Literal(value))),
      ref: Type.Optional(Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._-]+$' })),
      revision: Type.Optional(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
      text: Type.Optional(Type.String({ maxLength: 4096 })),
      button: Type.Optional(Type.Union(['left', 'middle', 'right'].map(value => Type.Literal(value)))),
      count: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 })),
      direction: Type.Optional(Type.Union(['up', 'down', 'left', 'right'].map(value => Type.Literal(value)))),
      amount: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
      key: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9+._-]+$' })),
      clear: Type.Optional(Type.Boolean()),
    }, { additionalProperties: false }),
  })
  installAnnotationAdapter(pi, {
    development,
    schema: Type.Object({
      action: Type.Union(['open', 'start', 'cancel', 'status', 'close', 'disconnect'].map(value => Type.Literal(value))),
      mode: Type.Optional(Type.Union([Type.Literal('crop'), Type.Literal('none')])),
    }, { additionalProperties: false }),
  })
}
