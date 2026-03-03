import { CapabilityPlugin } from './types.js'
import { apiGatewayPlugin } from './api-gateway.js'
import { cookieSessionPlugin } from './cookie-session.js'
import { tiktokHistoryPlugin } from './tiktok-history.js'
import { scopedFetchPlugin } from './scoped-fetch.js'
import { customPlugin } from './custom.js'

const plugins = new Map<string, CapabilityPlugin>()
plugins.set('api-gateway', apiGatewayPlugin)
plugins.set('cookie-session', cookieSessionPlugin)
plugins.set('tiktok-history', tiktokHistoryPlugin)
plugins.set('scoped-fetch', scopedFetchPlugin)
plugins.set('custom', customPlugin)

export function getPlugin(type: string): CapabilityPlugin | undefined { return plugins.get(type) }
export function registerPlugin(p: CapabilityPlugin) { plugins.set(p.type, p) }
export function allPlugins() { return [...plugins.values()] }
