/** GitHub's public email is not proof of ownership. Always select a primary, verified address from /user/emails. */
export async function githubProfile(accessToken: string | undefined) {
  if (!accessToken) throw new Error("GitHub identity verification failed");
  const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "xedit", Accept: "application/vnd.github+json" };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(10000), cache: "no-store" }),
    fetch("https://api.github.com/user/emails", { headers, signal: AbortSignal.timeout(10000), cache: "no-store" }),
  ]);
  if (!profileResponse.ok || !emailsResponse.ok) throw new Error("GitHub identity verification failed");
  const profile = await profileResponse.json();
  const emails = await emailsResponse.json() as { email: string; primary: boolean; verified: boolean }[];
  const email = emails.find((item) => item.primary && item.verified)?.email ?? null;
  return { ...profile, email, email_verified: email !== null };
}
