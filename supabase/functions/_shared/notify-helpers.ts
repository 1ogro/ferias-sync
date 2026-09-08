// Shared helpers for sending notifications via Slack DM and Email,
// respecting notification_preferences.system_alerts_{slack,email}.

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

export interface NotifyRecipient {
  person_id: string;
  email: string;
  nome: string;
}

export type PrefChannel = "slack" | "email";

const DEFAULT_APP_URL = "https://ferias-sync.lovable.app";

function safeNextPath(nextPath: string): string {
  return nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
}

/**
 * Generates an app-domain, one-time login URL. The raw action_link is never
 * returned or logged, which prevents Slack link previews from consuming it.
 */
export async function generateAppMagicLink(
  admin: any,
  email: string,
  nextPath = "/",
): Promise<string> {
  const appUrl = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("APP_BASE_URL") || DEFAULT_APP_URL)
    .replace(/\/$/, "")
    .replace(/\/reset-password$/, "");
  const callbackUrl = `${appUrl}/auth/magic`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: callbackUrl },
  });
  if (error) throw error;

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error("magic_link_token_missing");

  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: "magiclink",
    next: safeNextPath(nextPath),
  });
  return `${callbackUrl}?${params.toString()}`;
}

export async function getPrefs(admin: any, personId: string) {
  const { data } = await admin
    .from("notification_preferences")
    .select("system_alerts_slack, system_alerts_email")
    .eq("person_id", personId)
    .maybeSingle();
  // Default to enabled if no row exists
  return {
    slack: data?.system_alerts_slack ?? true,
    email: data?.system_alerts_email ?? true,
  };
}

export async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN || !email) return null;
  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const data = await res.json();
    if (data.ok && data.user?.id) return data.user.id;
    console.warn(`[lookupSlackUserByEmail] ${email}: ${data.error}`);
  } catch (e: any) {
    console.error("[lookupSlackUserByEmail] threw", e?.message);
  }
  return null;
}

export async function sendSlackDM(slackUserId: string, text: string) {
  if (!SLACK_BOT_TOKEN) return;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: slackUserId, text }),
    });
    const data = await res.json();
    if (!data.ok) console.warn("[sendSlackDM]", data);
  } catch (e: any) {
    console.error("[sendSlackDM] threw", e?.message);
  }
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sistema de Férias <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.warn("[sendEmail]", res.status, await res.text());
  } catch (e: any) {
    console.error("[sendEmail] threw", e?.message);
  }
}

export async function notifyRecipient(
  admin: any,
  recipient: NotifyRecipient,
  payload: { slackText: string; emailSubject: string; emailHtml: string }
) {
  const prefs = await getPrefs(admin, recipient.person_id);
  if (prefs.slack && recipient.email) {
    const slackId = await lookupSlackUserByEmail(recipient.email);
    if (slackId) await sendSlackDM(slackId, payload.slackText);
  }
  if (prefs.email && recipient.email) {
    await sendEmail(recipient.email, payload.emailSubject, payload.emailHtml);
  }
}

/**
 * Resolves a person's Slack user id with fallbacks:
 * stored slack_user_id -> corporate email -> personal email -> name match on users.list.
 * Persists the discovered id back to people.slack_user_id.
 */
export async function resolveSlackId(
  admin: any,
  person: { id: string; nome?: string | null; email?: string | null; email_pessoal?: string | null; slack_user_id?: string | null },
): Promise<{ id: string | null; via: string | null; tried: string[]; err: string | null }> {
  if (person.slack_user_id) return { id: person.slack_user_id, via: "stored", tried: [], err: null };
  if (!SLACK_BOT_TOKEN) return { id: null, via: null, tried: [], err: "missing_slack_token" };

  const emails = [person.email, person.email_pessoal]
    .map((e) => (e || "").trim().toLowerCase())
    .filter((e, i, a) => e && a.indexOf(e) === i);
  const tried: string[] = [];
  let err: string | null = null;

  const persist = async (id: string, via: string) => {
    await admin.from("people").update({ slack_user_id: id }).eq("id", person.id);
    return { id, via, tried, err: null };
  };

  for (const email of emails) {
    tried.push(email);
    try {
      const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      const d = await res.json();
      if (d.ok && d.user?.id) return await persist(d.user.id, "email");
      err = d.error || "users_not_found";
    } catch (e: any) {
      err = String(e?.message || e);
    }
  }

  // Name fallback: scan the workspace member list.
  const target = (person.nome || "").trim().toLowerCase();
  if (target) {
    tried.push(`name:${target}`);
    try {
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
        const d = await res.json();
        if (!d.ok) { err = d.error || err; break; }
        for (const m of d.members || []) {
          if (m.deleted || m.is_bot) continue;
          const candidates = [m.profile?.real_name, m.profile?.display_name, m.real_name, m.name]
            .map((x: any) => (x || "").trim().toLowerCase())
            .filter(Boolean);
          const emailMatch = (m.profile?.email || "").trim().toLowerCase();
          if (candidates.includes(target) || (emailMatch && emails.includes(emailMatch))) {
            return await persist(m.id, "name");
          }
        }
        cursor = d.response_metadata?.next_cursor || "";
        if (!cursor) break;
      }
      if (!err) err = "name_not_found";
    } catch (e: any) {
      err = String(e?.message || e);
    }
  }

  return { id: null, via: null, tried, err: err || "users_not_found" };
}
