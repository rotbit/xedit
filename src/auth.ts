import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import WeChat from "next-auth/providers/wechat";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { DEFAULT_MARKDOWN, WELCOME_TITLE } from "@/lib/welcomeDoc";
import { prisma } from "@/lib/prisma";
import { isVerifiedAdmin } from "@/lib/admin";
import { githubProfile } from "@/lib/oauth/githubProfile";
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
if (githubConfigured) providers.push(GitHub({
  userinfo: { request: ({ tokens }: { tokens: { access_token?: string } }) => githubProfile(tokens.access_token) },
}));
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  // maxAge is one year: the default 30 days is too short for a writing tool that's "installed and left open for years"; on expiry it drops back to the landing page.
  // Still sliding renewal: every online session fetch re-signs the JWT, pushing expiry back out a year,
  // so only accounts truly unused for a year expire (the local account snapshot uses the same lifetime)
  session: { strategy: "jwt", maxAge: 365 * 24 * 60 * 60 },
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && user?.id) {
        token.uid = user.id;
        token.loginProvider = account.provider;
        // Bind the proof to the account email, not just a provider-supplied boolean.
        const email = user.email?.trim().toLowerCase();
        const verified = profile?.email_verified === true && email === profile.email?.trim().toLowerCase();
        token.verifiedEmail = verified ? email : null;
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: verified ? new Date() : null },
        });
      }
      // Old sessions lack a provider proof, including password sessions: require one fresh OAuth login after rollout.
      if (!token.uid || !["github", "google", "wechat"].includes(String(token.loginProvider))) return null;
      const current = await prisma.user.findUnique({
        where: { id: String(token.uid) },
        select: { email: true, emailVerified: true, bannedAt: true },
      });
      if (!current) return null;
      token.email = current.email;
      token.ev = Boolean(current.emailVerified && token.verifiedEmail === current.email?.trim().toLowerCase());
      token.adm = token.ev && !current.bannedAt && isVerifiedAdmin(current);
      return token;
    },
    session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.isAdmin = token.adm === true;
        session.user.emailIsVerified = token.ev === true;
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
    // Refresh last login time on every third-party login; failure doesn't affect login
    async signIn({ user }) {
      if (!user.id) return;
      await prisma.user
        .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        .catch((err) => console.error("[auth] 更新 lastLoginAt 失败", err));
    },
  },
});
