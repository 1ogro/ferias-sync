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
