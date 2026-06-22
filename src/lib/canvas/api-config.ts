export type ApiConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export const API_CONFIG_SESSION_KEY = "asui-ai-canvas:api-config"

export const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: "",
  apiKey: "",
  model: "gpt-image-1",
}

export function parseApiConfig(value: string | null): ApiConfig {
  if (!value) return DEFAULT_API_CONFIG

  try {
    const parsed = JSON.parse(value) as Partial<ApiConfig>

    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_API_CONFIG.baseUrl,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : DEFAULT_API_CONFIG.apiKey,
      model: typeof parsed.model === "string" ? parsed.model : DEFAULT_API_CONFIG.model,
    }
  } catch {
    return DEFAULT_API_CONFIG
  }
}

export function readApiConfigFromSession(): ApiConfig {
  if (typeof window === "undefined") return DEFAULT_API_CONFIG

  // Remove credentials saved by older builds. API keys should never survive a browser session.
  window.localStorage.removeItem(API_CONFIG_SESSION_KEY)
  return parseApiConfig(window.sessionStorage.getItem(API_CONFIG_SESSION_KEY))
}

export function saveApiConfigToSession(config: ApiConfig) {
  window.localStorage.removeItem(API_CONFIG_SESSION_KEY)
  window.sessionStorage.setItem(API_CONFIG_SESSION_KEY, JSON.stringify(config))
}

export function clearApiConfig() {
  window.localStorage.removeItem(API_CONFIG_SESSION_KEY)
  window.sessionStorage.removeItem(API_CONFIG_SESSION_KEY)
}

export function maskApiKey(apiKey: string) {
  if (!apiKey) return "未配置"
  if (apiKey.length <= 8) return "已配置"

  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
}
