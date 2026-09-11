import type { Metadata, Viewport } from "next";
import "./globals.css";
import { auth } from "@/auth";
import { Providers } from "@/components/Providers";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  // 有了 metadataBase，各页的相对 canonical / OG 图路径才会补成绝对地址
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}｜Markdown 一键排版微信公众号`,
    template: `%s｜${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * 首帧前的三件事，必须在浏览器绘制前跑完，否则会闪：
 * 1) 标记 macOS 桌面壳（Electron 隐藏了系统标题栏，顶栏要给红绿灯留位）——
 *    preload 也会在 DOMContentLoaded 打这个标记，这里更早一步，避免顶栏跳一下；
 * 2) 恢复夜间模式偏好（避免闪白）；
 * 3) 判断本机是否已有工作区（data-ws），老用户这一帧用 CSS 盖住落地页。
 * 2、3 单开一个 try：localStorage 不可用时（隐私模式）不能连带吞掉 1。
 * 内联而非外链 /theme-init.js：省掉一次渲染阻塞的网络往返。
 * （public/theme-init.js 仍保留，兜底 SW 离线壳里缓存的旧版 HTML。）
 * 编译期静态字符串，无任何运行时输入拼接，可安全注入。
 */
const THEME_INIT_SCRIPT = `try{if(window.xeditDesktop&&window.xeditDesktop.platform==="darwin")document.documentElement.classList.add("desktop-mac")}catch(e){}try{if(localStorage.getItem("xedit-dark")==="1")document.documentElement.dataset.theme="dark";var d=localStorage.getItem("xedit-local-docs");if(localStorage.getItem("xedit-was-authed")==="1"||(d&&d!=="[]"))document.documentElement.dataset.ws="1"}catch(e){}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 服务端解好会话随 HTML 下发：SessionProvider 免掉客户端首帧的 /api/auth/session
  // 往返，login 态相关的数据请求（文档镜像、设置等）不再被它卡 ~1s
  const session = await auth();
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
