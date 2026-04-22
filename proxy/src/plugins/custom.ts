import { CapabilityPlugin, PluginCodegenResult, PluginSpec, EndowmentFactory } from './types.js'

export interface CustomSpec extends PluginSpec {
  type: 'custom'
  secrets: string[]
  networks: string[]
  signature: string
  code: string
}

function parseParams(sig: string): string[] {
  const m = sig.match(/\(([^)]*)\)/)
  if (!m) return []
  return m[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean)
}

function validate(spec: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!spec || typeof spec !== 'object') return { valid: false, errors: ['spec must be an object'] }
  if (typeof spec.name !== 'string' || !spec.name) errors.push('name required')
  if (typeof spec.doc_url !== 'string' || !spec.doc_url) errors.push('doc_url required')
  if (!Array.isArray(spec.secrets)) errors.push('secrets must be array of strings')
  if (!Array.isArray(spec.networks)) errors.push('networks must be array of strings')
  if (typeof spec.signature !== 'string' || !spec.signature) errors.push('signature required')
  if (typeof spec.code !== 'string' || !spec.code) errors.push('code required')
  return { valid: errors.length === 0, errors }
}

function codegen(spec: CustomSpec): Promise<PluginCodegenResult> {
  const params = parseParams(spec.signature)

  const endowment: EndowmentFactory = {
    build(secretValues, store, refreshSecret) {
      const wrappedCode = `return (async () => { ${spec.code} })()`
      const fn = new Function('fetch', 'secrets', 'store', 'refreshSecret', ...params, wrappedCode)
      return async (...args: any[]) => {
        return await fn(fetch, secretValues, store, refreshSecret || (() => {}), ...args)
      }
    }
  }

  return Promise.resolve({ code: spec.code, signature: spec.signature, endowment })
}

export const customPlugin: CapabilityPlugin = {
  type: 'custom',
  describe: () => ({
    type: 'custom',
    description: 'Custom capability — owner-authored JS code runs as the endowment with fetch, secrets, and a persistent KV store.',
    spec_schema: {
      type: '"custom"', name: 'string', doc_url: 'string',
      secrets: 'string[] (secret names needed)',
      networks: 'string[] (hostnames accessed)',
      signature: 'string (e.g. "(paper_id, email_hash, recipient)")',
      code: 'string (JS function body)',
    },
    example_spec: {
      type: 'custom', name: 'example', doc_url: 'https://example.com',
      secrets: ['API_KEY'], networks: ['api.example.com'],
      signature: '(query)',
      code: 'const r = await fetch("https://api.example.com/search?q=" + query, { headers: { Authorization: "Bearer " + secrets.API_KEY } }); return await r.json()',
    },
  }),
  validateSpec: validate,
  extractSecrets: (spec: CustomSpec) => spec.secrets || [],
  extractNetworks: (spec: CustomSpec) => spec.networks || [],
  summarize: (spec: CustomSpec) => `custom: ${spec.name} — ${spec.signature}`,
  codegen,
}
