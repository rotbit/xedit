import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import WeChat from "next-auth/providers/wechat";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { DEFAULT_MARKDOWN, WELCOME_TITLE } from "@/lib/welcomeDoc";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { isAdminEmail } from "@/lib/admin";
import type { Provider } from "next-auth/providers";

export const githubConfigured = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
);
export const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);
// 微信要企业主体的开放平台账号，门槛高；除了 ID/Secret 还要一个显式开关，
// 好让已配好的部署能临时关掉微信登录而不必清空密钥
const wechatId = process.env.AUTH_WECHAT_ID;
const wechatSecret = process.env.AUTH_WECHAT_SECRET;
const wechatEnabled = ["1", "true"].includes(
  (process.env.AUTH_WECHAT_ENABLED ?? "").trim().toLowerCase()
);
export const wechatConfigured = Boolean(wechatEnabled && wechatId && wechatSecret);

const providers: Provider[] = [];
if (githubConfigured) providers.push(GitHub);
if (googleConfigured) providers.push(Google);
// 后两个判断只为让 TS 收窄成 string——wechatConfigured 为真时它们必然有值
if (wechatConfigured && wechatId && wechatSecret) {
  providers.push(
    WeChat({
      clientId: wechatId,
      clientSecret: wechatSecret,
      // website：开放平台网站应用，PC 扫码；official：公众号网页授权，仅微信内置浏览器
      platformType:
        process.env.AUTH_WECHAT_PLATFORM?.trim().toLowerCase() === "official"
          ? "OfficialAccount"
          : "WebsiteApp",
      profile: (profile) => ({
        // 网站应用一般都有 unionid；未开放 UnionID 时退回 openid，保证不会拿到 undefined 当主键
        id: profile.unionid || profile.openid,
        name: profile.nickname,
        email: null,
        image: profile.headimgurl,
      }),
    })
  );
}
// 邮箱 + 密码：始终可用，无需第三方配置
providers.push(
  Credentials({
    credentials: {
      email: { label: "邮箱", type: "email" },
      password: { label: "密码", type: "password" },
    },
    authorize: async (creds) => {
      const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
      const password = typeof creds?.password === "string" ? creds.password : "";
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      // 不区分“无此账号”与“密码错误”，避免暴露邮箱是否已注册
      if (!user?.passwordHash) return null;
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  // Credentials 只在 JWT 会话下可用；OAuth 亦复用同一策略
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      // 管理员按 env 白名单每次重判，改名单不用等 JWT 过期
      token.adm = isAdminEmail(typeof token.email === "string" ? token.email : null);
      return token;
    },
    session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.isAdmin = token.adm === true;
      }
      return session;
    },
  },
  events: {
    // 账号刚建好：塞一篇欢迎稿，之后再也不补（客户端不再按「云端为空」判断）
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.document
        .create({ data: { userId: user.id, title: WELCOME_TITLE, content: DEFAULT_MARKDOWN } })
        .catch((err) => console.error("[auth] 创建欢迎稿失败", err));
    },
    // 每次登录（OAuth 与密码都会触发）刷新最近登录时间；失败不影响登录流程
    async signIn({ user }) {
      if (!user.id) return;
      await prisma.user
        .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        .catch((err) => console.error("[auth] 更新 lastLoginAt 失败", err));
    },
  },
});
