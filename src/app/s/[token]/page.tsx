/**
 * 分享页 /s/[token]：只读渲染某篇文档，URL 里的 token 就是 DocShare 的 id。
 * 会连作者的主题和自定义 CSS 一起取出来，让读者看到的排版与作者在编辑器里预览的一致。
 * 分享被关闭、过期或文档已删都统一落到 Gone，不区分原因，避免从页面反推文档是否存在。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { commentJson, findEnabledShare } from "@/lib/share";
import { resolveTheme, sanitizeCustomThemes } from "@/lib/themes";
import { SharedArticle } from "@/features/share/SharedArticle";

type Params = { params: Promise<{ token: string }> };

/** 标题用文档标题；robots 一律 noindex，分享链接不该被搜索引擎收录。 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const share = await findEnabledShare(token);
  const doc = share
    ? await prisma.document.findFirst({
        where: { id: share.documentId, deletedAt: null },
        select: { title: true },
      })
    : null;
  return {
    title: doc ? `${doc.title} · 分享` : "分享不存在",
    robots: { index: false, follow: false },
  };
}

/** 关闭/过期/删除后的兜底页 */
function Gone() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--paper)] px-6 text-center">
      <p className="text-[17px] font-medium text-[var(--ink)]">分享不存在或已失效</p>
      <p className="text-[13px] leading-relaxed text-[var(--ink-faint)]">
        这个分享链接已被作者关闭，或文章已删除。
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
      >
        去 xedit 首页
      </Link>
    </div>
  );
}

/** 分享页主体。下面五个查询互不依赖，并发发出省一轮串行往返。 */
export default async function SharePage({ params }: Params) {
  const { token } = await params;
  const share = await findEnabledShare(token);
  if (!share) return <Gone />;

  const [doc, settings, owner, comments, session] = await Promise.all([
    prisma.document.findFirst({
      where: { id: share.documentId, deletedAt: null },
      select: { title: true, content: true, updatedAt: true },
    }),
    prisma.userSettings.findUnique({ where: { userId: share.userId } }),
    prisma.user.findUnique({ where: { id: share.userId }, select: { name: true } }),
    prisma.shareComment.findMany({
      where: { shareId: share.id },
      orderBy: { createdAt: "asc" },
    }),
    auth(),
  ]);
  if (!doc) return <Gone />;

  const viewerIsOwner = session?.user?.id === share.userId;
  const customThemes = sanitizeCustomThemes(
    (() => {
      try {
        // customThemes 是自由格式的 JSON 字符串，历史数据可能是坏的；解析失败按「没有自定义主题」处理，
        // 不能让一条脏设置把整个分享页打挂
        return JSON.parse(settings?.customThemes ?? "[]");
      } catch {
        return [];
      }
    })()
  );
  const theme = resolveTheme(settings?.themeId ?? "classic", customThemes);

  return (
    <SharedArticle
      // share.id 就是 URL 里的 token（findEnabledShare 按 id 查），客户端发批注要拿它做地址
      token={share.id}
      title={doc.title}
      authorName={owner?.name?.trim() || "xedit 作者"}
      updatedAt={doc.updatedAt.toISOString()}
      content={doc.content}
      themeName={theme.name}
      themeCss={theme.css}
      codeThemeId={settings?.codeThemeId ?? "github"}
      customCss={settings?.customCss ?? ""}
      macCode={settings?.macCode ?? true}
      allowComment={share.allowComment}
      viewerIsOwner={viewerIsOwner}
      // keyHash 传空串：服务端渲染时拿不到访客的 guest key，匿名批注在首屏一律不标成「我的」；
      // 作者本人靠 viewerIsOwner 识别
      initialComments={comments.map((c) =>
        commentJson(c, { keyHash: "", isOwner: viewerIsOwner })
      )}
    />
  );
}
