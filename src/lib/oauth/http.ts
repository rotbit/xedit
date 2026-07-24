/** OAuth 端点的 CORS / JSON 响应助手：浏览器内的 MCP 客户端会发预检 */

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

/** OAuth 2.0 标准错误响应（RFC 6749 §5.2） */
export function oauthError(error: string, description?: string, status = 400): Response {
  return corsJson({ error, error_description: description }, { status });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** token 端点：兼容 x-www-form-urlencoded（OAuth 标准）与 JSON 两种请求体 */
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
