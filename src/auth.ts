import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
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

const providers: Provider[] = [];
if (githubConfigured) providers.push(GitHub);
if (googleConfigured) providers.push(Google);
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
});
