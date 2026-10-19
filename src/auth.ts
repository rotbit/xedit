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
// WeChat requires a business-verified Open Platform account, a high bar; besides ID/Secret there's an explicit switch
// so a configured deployment can temporarily disable WeChat login without clearing the keys
const wechatId = process.env.AUTH_WECHAT_ID;
const wechatSecret = process.env.AUTH_WECHAT_SECRET;
const wechatEnabled = ["1", "true"].includes(
  (process.env.AUTH_WECHAT_ENABLED ?? "").trim().toLowerCase()
);
export const wechatConfigured = Boolean(wechatEnabled && wechatId && wechatSecret);

const providers: Provider[] = [];
if (githubConfigured) providers.push(GitHub);
if (googleConfigured) providers.push(Google);
// The last two checks only narrow TS to string; they always have values when wechatConfigured is true
if (wechatConfigured && wechatId && wechatSecret) {
  providers.push(
    WeChat({
      clientId: wechatId,
      clientSecret: wechatSecret,
      // website: Open Platform website app, PC QR scan; official: WeChat Official Account web auth, WeChat's in-app browser only
      platformType:
        process.env.AUTH_WECHAT_PLATFORM?.trim().toLowerCase() === "official"
          ? "OfficialAccount"
          : "WebsiteApp",
      profile: (profile) => ({
        // Website apps usually have a unionid; fall back to openid when UnionID isn't enabled so the primary key is never undefined
        id: profile.unionid || profile.openid,
        name: profile.nickname,
        email: null,
        image: profile.headimgurl,
      }),
    })
  );
}
// Email + password: always available, no third-party config needed
providers.push(
  Credentials({
    credentials: {
      // i18n-ignore only used by NextAuth's built-in sign-in page (the product uses a custom login UI)
      email: { label: "邮箱", type: "email" },
      password: { label: "密码", type: "password" }, // i18n-ignore
    },
    authorize: async (creds) => {
      const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
      const password = typeof creds?.password === "string" ? creds.password : "";
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      // Don't distinguish "no such account" from "wrong password", to avoid revealing whether an email is registered
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
  // Credentials only work with JWT sessions; OAuth reuses the same strategy.
  // maxAge is one year: the default 30 days is too short for a writing tool that's "installed and left open for years"; on expiry it drops back to the landing page.
  // Still sliding renewal: every online session fetch re-signs the JWT, pushing expiry back out a year,
  // so only accounts truly unused for a year expire (the local account snapshot uses the same lifetime)
  session: { strategy: "jwt", maxAge: 365 * 24 * 60 * 60 },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      // Admin status is re-evaluated against the env allowlist each time, so allowlist changes don't wait for JWT expiry
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
    // Account just created: add a welcome doc, never again afterward (the client no longer decides based on "cloud is empty")
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.document
        .create({ data: { userId: user.id, title: WELCOME_TITLE, content: DEFAULT_MARKDOWN } })
        .catch((err) => console.error("[auth] 创建欢迎稿失败", err));
    },
    // Refresh last login time on every login (both OAuth and password trigger it); failure doesn't affect login
    async signIn({ user }) {
      if (!user.id) return;
      await prisma.user
        .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        .catch((err) => console.error("[auth] 更新 lastLoginAt 失败", err));
    },
  },
});
