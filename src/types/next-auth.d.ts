import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** 是否为 ADMIN_EMAILS 白名单里的超级管理员 */
      isAdmin?: boolean;
    };
  }
}
