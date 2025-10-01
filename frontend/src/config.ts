const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? ''

const apiBaseUrl = rawApiBase.endsWith('/')
  ? rawApiBase.slice(0, -1)
  : rawApiBase

function apiUrl(path: string) {
  if (!path.startsWith('/')) {
    return `${apiBaseUrl}/${path}`
  }
  return `${apiBaseUrl}${path}`
}

export { apiBaseUrl, apiUrl }
