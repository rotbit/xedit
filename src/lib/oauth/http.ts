/** CORS / JSON response helpers for OAuth endpoints: in-browser MCP clients send preflights */

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsJson(data: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(),
    },
  });
}

/** Standard OAuth 2.0 error response (RFC 6749 §5.2) */
export function oauthError(error: string, description?: string, status = 400): Response {
  return corsJson({ error, error_description: description }, { status });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** Token endpoint: accepts both x-www-form-urlencoded (OAuth standard) and JSON request bodies */
export async function readCredentials(req: Request): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    if (j && typeof j === "object") {
      for (const [k, v] of Object.entries(j)) if (typeof v === "string") map.set(k, v);
    }
  } else {
    const text = await req.text().catch(() => "");
    for (const [k, v] of new URLSearchParams(text)) map.set(k, v);
  }
  return map;
}
