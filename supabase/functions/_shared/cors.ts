// Shared CORS helper with an env-driven allowlist (FRONTEND_ORIGINS).
// FRONTEND_ORIGINS = comma-separated list of allowed origins.
// If unset, falls back to '*' (dev) — set it in production.

export function corsHeaders(req: Request): Record<string, string> {
  const allowList = (Deno.env.get('FRONTEND_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.headers.get('Origin') ?? '';
  let allowOrigin = '*';
  if (allowList.length > 0) {
    allowOrigin = allowList.includes(origin) ? origin : allowList[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-internal-function-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
