/**
 * Share page /s/[token]: read-only render of a document; the token in the URL is the DocShare id.
 * Also loads the author's theme and custom CSS so readers see the same layout the author previews in the editor.
 * Closed, expired or deleted shares all land on Gone regardless of reason, so the page can't be used to infer whether a doc exists.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { commentJson, findEnabledShare } from "@/lib/share";
import { resolveTheme, sanitizeCustomThemes } from "@/lib/themes";
import { SharedArticle } from "@/features/share/SharedArticle";

type Params = { params: Promise<{ token: string }> };

/** Title uses the document title; robots is always noindex, share links shouldn't be indexed by search engines. */
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

/** Fallback page after close/expiry/deletion */
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

/** Share page body. The five queries below are independent, so issue them concurrently to save serial round trips. */
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
        // customThemes is a free-form JSON string and legacy data may be corrupt; a parse failure means "no custom themes",
        // one bad setting mustn't take down the whole share page
        return JSON.parse(settings?.customThemes ?? "[]");
      } catch {
        return [];
      }
    })()
  );
  const theme = resolveTheme(settings?.themeId ?? "classic", customThemes);

  return (
    <SharedArticle
      // share.id is the token in the URL (findEnabledShare looks up by id); the client needs it as the address for posting annotations
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
      // keyHash is an empty string: SSR can't see the visitor's guest key, so anonymous annotations are never marked 「我的」 (mine) on first paint;
      // the author is identified via viewerIsOwner
      initialComments={comments.map((c) =>
        commentJson(c, { keyHash: "", isOwner: viewerIsOwner })
      )}
    />
  );
}
