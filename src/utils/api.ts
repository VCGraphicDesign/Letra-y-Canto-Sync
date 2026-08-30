/**
 * Resolves the absolute or relative API URL based on VITE_API_URL configuration.
 * - In local dev (same-origin), if VITE_API_URL is unset, it uses the standard relative '/api/*' path.
 * - In remote deployments (Vercel, Capacitor Android APK, etc.), VITE_API_URL points to the live backend server.
 */
export function getApiUrl(endpoint: string): string {
  const rawBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) || '';
  const trimmedBase = rawBaseUrl.trim();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (!trimmedBase) {
    return cleanEndpoint;
  }

  // Remove any trailing slashes from the base URL
  const normalizedBase = trimmedBase.replace(/\/+$/, '');
  return `${normalizedBase}${cleanEndpoint}`;
}

export interface ParsedApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  rawText: string;
}

/**
 * Robustly parses an API response, distinguishing between valid JSON, HTML error fallbacks (e.g. 404/SPA index.html),
 * and network/gateway issues.
 */
export async function parseApiResponse<T = any>(
  response: Response,
  endpointLabel: string
): Promise<ParsedApiResult<T>> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  // Detect HTML responses (such as SPA index.html or 404 error pages)
  const isHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.toLowerCase().includes('<body');

  if (isHtml) {
    const errorMsg =
      response.status === 404
        ? `No se encontró la ruta en el servidor (${endpointLabel} - 404). Verifique que VITE_API_URL esté apuntando al backend Express en ejecución.`
        : `El servidor devolvió una página HTML en lugar de JSON (${endpointLabel} - Código ${response.status}). Verifique la configuración de VITE_API_URL.`;
    throw new Error(errorMsg);
  }

  let data: T;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      `El servidor respondió con formato no reconocido (${endpointLabel} - Código ${response.status}): ${trimmed.slice(0, 120)}`
    );
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawText,
  };
}
