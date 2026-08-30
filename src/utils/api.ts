export const DEFAULT_BACKEND_URL = 'https://letra-y-canto-sync.onrender.com';

/**
 * Resolves the absolute API URL based on VITE_API_URL or the Render backend.
 * - Uses import.meta.env.VITE_API_URL if provided.
 * - Falls back to 'https://letra-y-canto-sync.onrender.com'.
 * - Normalizes trailing slashes to avoid duplicated slashes in request URLs.
 */
export function getApiUrl(endpoint: string): string {
  const rawBaseUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
    DEFAULT_BACKEND_URL;
  const trimmedBase = rawBaseUrl.trim();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (!trimmedBase) {
    throw new Error(
      'Falta la variable de entorno VITE_API_URL. Configure la URL del backend de Render para continuar.'
    );
  }

  // Remove trailing slashes from base URL
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
