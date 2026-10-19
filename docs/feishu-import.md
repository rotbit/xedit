# Feishu Wiki import guide

xEdit can import an entire Feishu Wiki as documents: the wiki tree maps to categories, images are re-hosted to your image hosting, and re-syncs only process pages that changed. Authorization uses Feishu's official user-identity OAuth — **you import only what you yourself can see, and you don't need to add any app as a wiki member**.

App credentials are **per account**: each user creates their own Feishu custom app and enters its App ID / App Secret in the settings dialog. Nothing needs to be configured server-side by the site admin.

- [First-time setup: create your own Feishu app](#first-time-setup-create-your-own-feishu-app)
- [Everyday use](#everyday-use)
- [Sync rules](#sync-rules)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## First-time setup: create your own Feishu app

You only do this once. Open it from the **account menu → Import from Feishu Wiki…** at the bottom left of the workspace. The **How It Works** section at the bottom of the dialog has the same steps (including a one-click copy of the callback URL):

1. On [open.feishu.cn](https://open.feishu.cn), create a **custom app** and enable **Web App** under Features;
2. Under Permissions, request these 4 **user-identity** scopes: `wiki:wiki:readonly`, `docx:document:readonly`, `drive:drive:readonly`, `offline_access`;
3. Under **Security Settings → Redirect URLs**, add the callback URL for the site you use (you can copy it from the dialog):

   ```
   https://xedit.me/api/feishu/callback
   ```

   If you self-host, use your own domain.
4. Create a version and publish the app, then wait for your organization admin to approve it (the scopes only take effect after that);
5. Copy the **App ID / App Secret** from the Credentials & Basic Info page into the dialog's **App credentials** section and save.

## Everyday use

1. Click **Connect Feishu**, sign in on the official Feishu page that opens and click Authorize; the popup closes automatically;
2. Back in the dialog, pick the wiki to import from the dropdown;
3. Click **Start Sync** and wait for the progress to finish.

Whenever the content in Feishu changes, just come back and click **Start Sync** again — unchanged pages are skipped entirely, so it's fast.

## Sync rules

| Behavior | Details |
| --- | --- |
| Category mapping | Wiki tree → document categories `飞书知识库/<space name>/…` (the root category name is fixed) |
| Images | Downloaded and re-hosted to your media library (via the site's image hosting), so documents no longer depend on Feishu image URLs |
| Incremental | Based on Feishu's edit time; unchanged pages are skipped entirely. Re-syncs are idempotent and never create duplicates |
| Versions | Updating a changed page automatically keeps a version snapshot, which you can roll back to from the document's history |
| Trash | Imported documents moved to the trash are no longer updated by sync (your deletion is respected); after permanent deletion, the next sync imports them again |
| Unsupported nodes | Only new-style docs (docx) are converted; sheets, Base, mind notes, boards and the like are replaced with a one-line placeholder, and shortcut nodes are skipped |
| Disconnect | Only clears the authorization tokens; app credentials, imported documents and sync mappings are kept, and reconnecting takes one click |
| Switching apps | Saving a new App ID automatically invalidates the old app's authorization, so you need to reconnect |
| Reauthorization | Per Feishu's security policy, you need to reconnect once every 365 days |

A single sync handles at most 1000 nodes; large wikis are processed in batches, and the dialog shows live progress and a list of failures.

## Security

- App credentials and authorization are per account: the App Secret and access/refresh tokens are always encrypted with AES-256-GCM before storage (key from `AI_ENCRYPTION_KEY`, derived from `AUTH_SECRET` if unset); plaintext never hits the database, and the UI only shows the last four characters of the secret;
- The refresh token is rotated on every use. You can **Disconnect** in the dialog at any time, or revoke access in Feishu's personal settings under authorization management;
- Sync requests read-only scopes only (read the wiki structure, read documents, download document images), so xEdit cannot change your Feishu content;
- All writes go through the same service layer as the editor, so read-only bans and storage quotas apply as usual.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| **Connect Feishu** is disabled | App credentials haven't been saved yet, or have unsaved changes. Save them under **App credentials** first |
| The authorization page shows error 20027 / a permission error | The app hasn't requested the scope, or the version hasn't been published. Check Permissions and the version status |
| The callback page shows a redirect_uri error after authorizing | The redirect URL under Security Settings doesn't match the site's domain (watch for http/https and ports) |
| The wiki dropdown is empty | This Feishu account has no access to any wiki space; "My Library" doesn't count |
| "Feishu authorization has expired. Please reconnect" | The refresh token expired (unused for over 365 days, or revoked). Click **Connect Feishu** again |
| Some pages fail to sync | The failure list shows the reason (e.g. hitting Feishu's rate limit); failed pages are skipped this round, so click **Start Sync** again later to retry |
| An image shows a "图片转存失败" (image re-hosting failed) placeholder | The site has no image hosting (OSS) configured, or the image exceeds the 10 MB limit. Configure image hosting and re-sync the page (make any small edit in Feishu so it counts as changed) |
