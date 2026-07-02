## Objetivo

Enviar lembretes automáticos via Slack para respondentes que ainda não responderam um pulse quando o prazo se aproxima ou se esgota, respeitando o tipo do pulse (autoavaliação e peer). Kudos ficam de fora (não têm resposta obrigatória).

## Mudanças

### 1. Configuração de prazo no pulse (migration)

Adicionar em `pulse_surveys`:

- `response_deadline_hours integer` — janela (em horas) desde o disparo até o prazo final. `null` desativa lembretes.
- `reminder_enabled boolean not null default true`.
- `reminder_offsets_hours integer[] not null default '{24, 2}'` — horas *antes* do prazo em que cada lembrete é enviado. Envelope simples: um array pequeno (2 lembretes por padrão: 24h antes e 2h antes).

Adicionar em `pulse_runs`:

- `deadline_at timestamptz` — populado no dispatch a partir de `now() + response_deadline_hours`.
- `reminders_sent_at timestamptz[] not null default '{}'` — timestamps dos lembretes já enviados (evita reenviar o mesmo offset).

### 2. Persistir destinatários por run (migration)

Nova tabela `pulse_run_recipients` para saber quem recebeu (e o DM/canal Slack) sem depender de audit_logs:

```
id, run_id (fk cascade), person_id, slack_user_id, slack_channel, sent_at, responded_at
```

Índices por `(run_id, responded_at)` e `(run_id, person_id)` unique. RLS: apenas `service_role` grava; leitura para `authenticated` seguindo a mesma política de `pulse_runs` (via `EXISTS survey`).

Grants padrão: `SELECT` para `authenticated`, `ALL` para `service_role`.

### 3. Atualizar `pulse-dispatch`

- Ao criar o `pulse_run`, gravar `deadline_at` (se `response_deadline_hours` estiver setado).
- Para cada envio bem-sucedido, inserir uma linha em `pulse_run_recipients` com `slack_user_id`, `slack_channel` e `sent_at`.
- Pular kudos (não gera lembrete).

### 4. Nova edge function `pulse-reminders`

Executada a cada 15 minutos via `pg_cron`. Fluxo:

1. Buscar `pulse_runs` com `deadline_at is not null` e `status != 'failed'` cuja `deadline_at > now() - 24h` (janela útil de lembrete).
2. Para cada run, buscar o survey e calcular quais offsets em `reminder_offsets_hours` estão dentro da janela `[now, now+15min]` (relativo a `deadline_at - offset_hours`) e ainda não foram enviados (não constam em `reminders_sent_at`).
3. Buscar destinatários pendentes: `pulse_run_recipients` onde `responded_at is null` e (para peer) ainda constam em `peer_review_pairs` com `completed_at is null`. Cruzar com `pulse_responses` (via `respondent_id`) para marcar respondidos.
4. Enviar DM Slack no mesmo canal (`slack_channel`) com botão "Responder agora" (mesma ação usada no dispatch original) e um `context` avisando "Faltam Xh para o prazo".
5. Ao final, atualizar `reminders_sent_at` com o timestamp do offset processado. Registrar audit_log com contagem enviada.

Também trata **lembrete de vencimento** quando `now >= deadline_at` e o offset `0` estiver em `reminder_offsets_hours`.

Respeita:
- `notification_preferences.request_updates_slack` (opt-out silencioso).
- `quiet_hours` / `preferred_window` do próprio destinatário: se estiver em janela silenciosa, marca offset como "adiado" (não envia, mas grava para não repetir na próxima varredura logo em seguida).

### 5. Marcar respostas

Extender o handler de submissão do pulse (webhook Slack `slack-interactions` ou onde a resposta é persistida) para, ao inserir em `pulse_responses`, atualizar `pulse_run_recipients.responded_at` do respondente correspondente. Isto garante que o lembrete só vá para quem realmente não respondeu.

### 6. UI — `PulseFormDialog` + `usePulses`

Adicionar controles quando `kind !== "kudos"`:

- `Input type="number"` "Prazo para resposta (horas)" (0 = sem prazo/lembrete).
- `Switch` "Enviar lembretes automáticos" (default on quando prazo > 0).
- `Input` livre "Lembretes antes do prazo (horas, separadas por vírgula)" com default `24, 2` — parseado para inteiros positivos, limite de 5 offsets.

Persistir/hidratar nos hooks `useCreatePulseSurvey` / `useUpdatePulseSurvey` / `useDuplicatePulseSurvey` e tipar em `PulseSurvey` / `CreateSurveyInput` / `UpdateSurveyInput`.

### 7. Agendamento (pg_cron via insert tool)

Registrar cron chamando `pulse-reminders` a cada 15 minutos (usa o `VITE_SUPABASE_URL` real do projeto + anon key). Aviso ao usuário: `pg_cron` e `pg_net` já estão habilitados no projeto? Se não, incluir `create extension` na etapa.

## Fora de escopo

- Alterações no fluxo de kudos.
- Reagendamento manual de lembretes pelo usuário final.
- Notificação por email como fallback (Slack apenas nesta iteração).
- Dashboard de "quem não respondeu" — os dados ficam disponíveis em `pulse_run_recipients` para uso futuro.

## Verificação

- Criar peer pulse com `response_deadline_hours=1` e `reminder_offsets_hours={0}`, disparar manualmente, aguardar o cron rodar e conferir DM Slack de lembrete + linha em `reminders_sent_at`.
- Confirmar que responder um pulse remove o destinatário da fila de lembretes.
