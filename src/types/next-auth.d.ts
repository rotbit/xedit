import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** Whether the user is a super admin on the ADMIN_EMAILS allowlist */
      isAdmin?: boolean;
      /** Email ownership confirmed by the third-party provider, never by self-registration. */
      emailIsVerified?: boolean;
    };
  }
}
