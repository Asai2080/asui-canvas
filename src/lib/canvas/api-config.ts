export type ApiConfig = {
  textBaseUrl: string
  textApiKey: string
  textModel: string
  baseUrl: string
  apiKey: string
  model: string
  videoBaseUrl: string
  videoApiKey: string
  videoModel: string
}

export const API_CONFIG_SESSION_KEY = "asui-ai-canvas:api-config"
export const API_CONFIG_CHANGED_EVENT = "asui-ai-canvas:api-config-changed"

export const DEFAULT_API_CONFIG: ApiConfig = {
  textBaseUrl: "",
  textApiKey: "",
  textModel: "gpt-4.1-mini",
  baseUrl: "",
  apiKey: "",
  model: "gpt-image-1",
  videoBaseUrl: "",
  videoApiKey: "",
  videoModel: "kling-v2.1",
}

export function normalizeImageModelName(value: string) {
  const model = value.trim()
  const starts = Array.from(model.matchAll(/gpt-/gi))
  const repaired =
    starts.length < 2 ? model : model.slice(starts[starts.length - 1].index)

  if (/^(?:openai\/)?gpt-5\.4-image-2(?:-1)?$/i.test(repaired)) {
    return "openai/gpt-5.4-image-2"
  }

  return repaired
}

export function parseApiConfig(value: string | null): ApiConfig {
  if (!value) return DEFAULT_API_CONFIG

  try {
    const parsed = JSON.parse(value) as Partial<ApiConfig>

    return {
      textBaseUrl: typeof parsed.textBaseUrl === "string" ? parsed.textBaseUrl : DEFAULT_API_CONFIG.textBaseUrl,
      textApiKey: typeof parsed.textApiKey === "string" ? parsed.textApiKey : DEFAULT_API_CONFIG.textApiKey,
      textModel: typeof parsed.textModel === "string" ? parsed.textModel : DEFAULT_API_CONFIG.textModel,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_API_CONFIG.baseUrl,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : DEFAULT_API_CONFIG.apiKey,
      model: typeof parsed.model === "string" ? normalizeImageModelName(parsed.model) : DEFAULT_API_CONFIG.model,
      videoBaseUrl: typeof parsed.videoBaseUrl === "string" ? parsed.videoBaseUrl : DEFAULT_API_CONFIG.videoBaseUrl,
      videoApiKey: typeof parsed.videoApiKey === "string" ? parsed.videoApiKey : DEFAULT_API_CONFIG.videoApiKey,
      videoModel: typeof parsed.videoModel === "string" ? parsed.videoModel : DEFAULT_API_CONFIG.videoModel,
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
  const normalizedConfig = {
    ...config,
    model: normalizeImageModelName(config.model),
  }
  window.localStorage.removeItem(API_CONFIG_SESSION_KEY)
  window.sessionStorage.setItem(API_CONFIG_SESSION_KEY, JSON.stringify(normalizedConfig))
  window.dispatchEvent(new Event(API_CONFIG_CHANGED_EVENT))
}

export function clearApiConfig() {
  window.localStorage.removeItem(API_CONFIG_SESSION_KEY)
  window.sessionStorage.removeItem(API_CONFIG_SESSION_KEY)
  window.dispatchEvent(new Event(API_CONFIG_CHANGED_EVENT))
}

export function maskApiKey(apiKey: string) {
  if (!apiKey) return "未配置"
  if (apiKey.length <= 8) return "已配置"

  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
}
