import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { acceptedAudiences, publicOrigin } from "@/lib/oauth/config";
import { verifyAccessToken } from "@/lib/oauth/token";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  searchDocuments,
  updateDocument,
} from "@/lib/documents";
import {
  deleteImage,
  getImage,
  listImages,
  uploadImageFromBase64,
  uploadImageFromUrl,
} from "@/lib/assets";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 从已验证的 token 里取 userId；工具全部据此隔离 */
function requireUserId(extra: { authInfo?: AuthInfo }): string {
  const uid = extra.authInfo?.extra?.userId;
  if (typeof uid !== "string" || !uid) throw new Error("未授权");
  return uid;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_documents",
      {
        description: "列出当前用户的文档（按更新时间倒序）。可按分类过滤，或只看回收站。",
        inputSchema: {
          category: z.string().optional().describe("只看某个分类"),
          trash: z.boolean().optional().describe("为 true 时只列回收站中的文档"),
          limit: z.number().int().min(1).max(200).optional().describe("最多返回条数，默认 50"),
        },
      },
      async (args, extra) => {
        const docs = await listDocuments(requireUserId(extra), {
          category: args.category,
          trash: args.trash,
          limit: args.limit,
        });
        return ok(docs);
      }
    );

    server.registerTool(
      "search_documents",
      {
        description: "在标题与正文中全文搜索文档（不含回收站），返回命中片段。",
        inputSchema: {
          query: z.string().min(1).describe("搜索关键词"),
          limit: z.number().int().min(1).max(100).optional().describe("最多返回条数，默认 20"),
        },
      },
      async (args, extra) => {
        const docs = await searchDocuments(requireUserId(extra), args.query, args.limit ?? 20);
        return ok(docs);
      }
    );

    server.registerTool(
      "get_document",
      {
        description: "按 id 获取文档全文（Markdown）。",
        inputSchema: { id: z.string().min(1).describe("文档 id") },
      },
      async (args, extra) => {
        const doc = await getDocument(requireUserId(extra), args.id);
        return doc ? ok(doc) : fail("文档不存在");
      }
    );

    server.registerTool(
      "create_document",
      {
        description: "新建文档，正文为 Markdown。返回新文档 id。",
        inputSchema: {
          title: z.string().optional().describe("标题，缺省为「未命名文章」"),
          content: z.string().optional().describe("Markdown 正文"),
          category: z.string().optional().describe("分类，缺省为「未分类」"),
        },
      },
      async (args, extra) => {
        const doc = await createDocument(requireUserId(extra), args);
        return ok(doc);
      }
    );

    server.registerTool(
      "update_document",
      {
        description: "更新文档标题/正文/分类（仅传要改的字段）。正文变化会自动留版。",
        inputSchema: {
          id: z.string().min(1).describe("文档 id"),
          title: z.string().optional(),
          content: z.string().optional().describe("Markdown 正文（整篇覆盖）"),
          category: z.string().optional(),
        },
      },
      async (args, extra) => {
        const updated = await updateDocument(requireUserId(extra), args.id, args);
        return updated ? ok({ ok: true, id: args.id }) : fail("文档不存在");
      }
    );

    server.registerTool(
      "delete_document",
      {
        description: "删除文档。默认软删除（移入回收站，可恢复）；hard=true 为永久删除。",
        inputSchema: {
          id: z.string().min(1).describe("文档 id"),
          hard: z.boolean().optional().describe("为 true 时永久删除，不可恢复"),
        },
      },
      async (args, extra) => {
        const deleted = await deleteDocument(requireUserId(extra), args.id, args.hard ?? false);
        return deleted ? ok({ ok: true, id: args.id, hard: Boolean(args.hard) }) : fail("文档不存在");
      }
    );

    // ---- 图片（图床 / 阿里云 OSS）----

    server.registerTool(
      "list_images",
      {
        description: "列出当前用户图床里的图片（返回可访问 URL、类型、尺寸）。",
        inputSchema: {
          limit: z.number().int().min(1).max(200).optional().describe("最多返回条数，默认 50"),
        },
      },
      async (args, extra) => {
        const images = await listImages(requireUserId(extra), args.limit);
        return ok(images);
      }
    );

    server.registerTool(
      "get_image",
      {
        description:
          "按 id 获取图片，返回可访问 URL。include_data=true 时同时把图片本身返回，供模型查看内容。",
        inputSchema: {
          id: z.string().min(1).describe("图片 id"),
          include_data: z.boolean().optional().describe("为 true 时附带图片本体（base64）供查看"),
        },
      },
      async (args, extra) => {
        const img = await getImage(requireUserId(extra), args.id);
        if (!img) return fail("图片不存在");
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [
          {
            type: "text",
            text: JSON.stringify(
              { id: img.id, url: img.url, mime: img.mime, size: img.size },
              null,
              2
            ),
          },
        ];
        if (args.include_data) {
          try {
            const res = await fetch(img.url, { signal: AbortSignal.timeout(15000) });
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              content.push({
                type: "image",
                data: buf.toString("base64"),
                mimeType: img.mime || "image/png",
              });
            }
          } catch {
            /* 取图失败时仅返回 URL 文本 */
          }
        }
        return { content };
      }
    );

    server.registerTool(
      "delete_image",
      {
        description: "从图床删除图片（同时删除 OSS 对象），不可恢复。",
        inputSchema: { id: z.string().min(1).describe("图片 id") },
      },
      async (args, extra) => {
        const deleted = await deleteImage(requireUserId(extra), args.id);
        return deleted ? ok({ ok: true, id: args.id }) : fail("图片不存在");
      }
    );

    server.registerTool(
      "upload_image",
      {
        description:
          "上传图片到图床，返回可访问 URL。二选一：url=从该网址抓取图片转存（推荐）；或 data=图片 base64（可带 data URL 前缀），data 方式建议附 mime。限 10MB，支持 png/jpg/gif/webp/svg。",
        inputSchema: {
          url: z.string().optional().describe("图片直链，服务端抓取后转存到图床"),
          data: z.string().optional().describe("图片的 base64，可带 data:image/*;base64, 前缀"),
          mime: z.string().optional().describe("data 方式的 MIME，如 image/png"),
        },
      },
      async (args, extra) => {
        const userId = requireUserId(extra);
        try {
          if (args.url) return ok(await uploadImageFromUrl(userId, args.url));
          if (args.data) return ok(await uploadImageFromBase64(userId, args.data, args.mime));
          return fail("需提供 url 或 data 之一");
        } catch (e) {
          return fail(e instanceof Error ? e.message : "上传失败");
        }
      }
    );
  },
  { serverInfo: { name: "xedit", version: "1.0.0" } },
  { basePath: "/api", disableSse: true, maxDuration: 60 }
);

/** Bearer token 验证：验签 + audience 绑定，取出 userId 挂到 authInfo.extra */
async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const origin = publicOrigin(req);
  const verified = await verifyAccessToken(bearerToken, acceptedAudiences(origin));
  if (!verified) return undefined;
  return {
    token: bearerToken,
    clientId: verified.clientId,
    scopes: verified.scopes,
    expiresAt: verified.expiresAt,
    extra: { userId: verified.userId },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
