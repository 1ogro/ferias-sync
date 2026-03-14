

## Plan: User Notification Channel Preferences (Email + Slack)

### Overview
Allow each user to choose which notification channels (email, Slack, or both) they want for each notification type. Currently notifications are sent without user preference — this adds per-user control stored in the database.

### Changes

#### 1. New DB Table: `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL UNIQUE,
  birthday_email boolean DEFAULT true,
  birthday_slack boolean DEFAULT false,
  request_updates_email boolean DEFAULT true,
  request_updates_slack boolean DEFAULT true,
  system_alerts_email boolean DEFAULT true,
  system_alerts_slack boolean DEFAULT false,
  admin_actions_email boolean DEFAULT true,
  admin_actions_slack boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
- RLS: users can read/update their own row; admins can view all
- Auto-create row on first access via upsert

#### 2. Update `src/hooks/useSettings.tsx`
- Remove notification settings from localStorage-based Settings (keep appearance/display/advanced there)
- Add a new hook `useNotificationPreferences` that reads/writes from `notification_preferences` table via Supabase

#### 3. Update `src/pages/Settings.tsx` — Notifications Tab
- Replace current simple toggles with a grid showing each notification type × channel (Email / Slack)
- Each combination gets its own toggle
- Layout: rows = notification types, columns = Email + Slack channels
- Data comes from DB via the new hook instead of localStorage

#### 4. Update `supabase/functions/send-notification-email/index.ts`
- Before sending email, check `notification_preferences` for the target person
- Skip email if the relevant `*_email` preference is `false`

#### 5. Update `supabase/functions/slack-notification/index.ts`
- Before sending Slack message, check `notification_preferences` for the target person
- Skip Slack if the relevant `*_slack` preference is `false`

### Files
| File | Action |
|------|--------|
| `supabase/migrations/...` | Create — new table + RLS |
| `src/hooks/useNotificationPreferences.tsx` | Create — DB-backed preferences hook |
| `src/hooks/useSettings.tsx` | Modify — remove notification fields |
| `src/pages/Settings.tsx` | Modify — new notification channel grid UI |
| `supabase/functions/send-notification-email/index.ts` | Modify — check preferences |
| `supabase/functions/slack-notification/index.ts` | Modify — check preferences |

