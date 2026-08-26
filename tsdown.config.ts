import { clientBundle } from './shared/tsdown.client.ts'

// The pet 2.0 (beta) Hermes-brained pet — a standalone plugin. It builds a
// node half (host: registry + /api/pet-hermes/* routes + Hermes chat bridge)
// and a browser client half (sprite + chat panel) through the same shared
// clientBundle preset the original dsh-pet uses, so the emitted lib/client.js
// matches the DSH client module-loader contract.
export default clientBundle('dsh-pet-hermes', [
  'src/index.ts',
], {
  libExternal: [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-host-webserver',
  ],
})
