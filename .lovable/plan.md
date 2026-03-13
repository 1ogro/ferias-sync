

## Plan: Add Slack notifications for admin auth actions

### What changes
Modify `supabase/functions/admin-auth-management/index.ts` to send a Slack message to the approvals channel after each successful `reset_password` or `clear_identities` action.

### Implementation
- After the audit log insert for each action, send a Slack message using `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_APPROVALS` (both secrets already exist)
- Fetch the caller's name from the `people` table (already queried, just need to add `nome` to the select)
- Message format:
  - **Reset password**: "🔑 *Reset de Senha via Admin* — Admin **{caller}** enviou reset de senha para **{target}** ({email})"
  - **Clear auth**: "🛡️ *Autenticação Zerada via Admin* — Admin **{caller}** zerou a autenticação de **{target}** ({email})"
- Slack send is fire-and-forget (don't fail the main action if Slack fails)

### Files
| File | Action |
|------|--------|
| `supabase/functions/admin-auth-management/index.ts` | Modify — add Slack notification after each action |

Single file change, ~30 lines added.

