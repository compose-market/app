/**
 * API Configuration
 * 
 * Provides the base URL for API calls.
 * In development, uses Vite proxy (/api).
 * In production, uses the Lambda Function URL.
 */

// API base URL - Lambda Function URL in production, proxy in development
export const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL.replace(/\/$/, "") // Remove trailing slash
  : "";

/**
 * Build full API URL from path
 * @param path - API path starting with /api/
 */
export function apiUrl(path: string): string {
  if (API_BASE_URL) {
    // Production: Lambda Function URL
    return `${API_BASE_URL}${path}`;
  }
  // Development: use Vite proxy
  return path;
}

/**
 * Fetch helper with API base URL
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(apiUrl(path), init);
}

