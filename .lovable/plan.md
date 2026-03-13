

## Plan: Add validation to SlackSetup to prevent bot token in Channel ID field

Add a validation rule in `SlackSetup.tsx` that detects if the user pastes a bot token (`xoxb-`) or any Slack token (`xox`) into the Channel ID field, showing a clear error message.

### Changes

**`src/components/integrations/SlackSetup.tsx`** — Update the `validate` function's `channelId` check:
- Add check: if `channelId` starts with `xoxb-` or `xoxp-` or `xoxa-`, show error "Este campo é para o ID do canal, não para o token do bot"
- Keep existing validations (required, must start with `C` or `#`)

Single file, ~3 lines added.

