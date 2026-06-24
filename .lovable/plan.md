- Plano: Engajamento do Time

Entrega completa em uma fase (todas as escolhas: shout-outs, gamificação semipública, tom, lembretes inteligentes, peer review configurável, relatórios mensais).

### Resumo do que será construído

```text
┌───────────────────────────────────────────────────────────────┐
│  Painel /engagement                                           │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐          │
│  │ Meus pontos │ │ Ranking time │ │ Feed de Kudos  │          │
│  └─────────────┘ └──────────────┘ └────────────────┘          │
│  ┌────────────────────────────────────────────────┐           │
│  │ Dar kudos (form + #canal opcional)             │           │
│  └────────────────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────────┘
         ▲                                          ▲
         │ pontos somam de:                         │ relatório
         │  - pulse respondido (+5)                 │ mensal DM
         │  - kudo recebido     (+10)               │ p/ gestor
         │  - kudo dado         (+2)                │ e diretor
         │  - streak semanal    (+15)               │
```

### 1. Schema (1 migration)

Tabelas novas em `public`:

- `kudos` — `from_person_id`, `to_person_id`, `message`, `category` (`teamwork|innovation|delivery|leadership|customer`), `slack_channel_posted` (text|null), `created_at`. RLS: qualquer autenticado lê; só pode inserir com `from_person_id = current_person_id()`.
- `engagement_points` — `person_id`, `points`, `reason` (`pulse_response|kudo_received|kudo_given|streak|peer_review`), `source_id` (text), `created_at`. RLS: leitura pelos próprios + gestor + diretor/admin (via `has_role`/papel). Insert apenas via funções `SECURITY DEFINER`.
- `peer_review_pairs` — `survey_id`, `run_id`, `reviewer_id`, `subject_id`, `created_at`, `completed_at`. RLS: reviewer vê os próprios; gestor/diretor vê do time.

Colunas novas:

- `pulse_surveys.tone` enum `formal|neutral|casual` (default `neutral`).
- `pulse_surveys.kind` enum `self|peer` (default `self`) — quando `peer`, o dispatch faz pareamento.
- `pulse_surveys.peer_anonymous` bool (default `true`) — usado quando `kind=peer`.
- `notification_preferences.quiet_hours_start` / `quiet_hours_end` (`time`, defaults `12:00`/`14:00`) e `preferred_window_start`/`preferred_window_end` (`time`, defaults `10:00`/`11:00`) — usados pelo dispatch inteligente.

Função SQL `public.award_points(p_person_id, p_points, p_reason, p_source_id)` — `SECURITY DEFINER`, insere em `engagement_points`. Função `public.get_engagement_leaderboard(p_scope text, p_period text)` que retorna ranking por time/global do mês.

Grants padrão para `authenticated` e `service_role` em todas as tabelas novas.

### 2. Edge functions

**a) `pulse-dispatch` (atualizar)**

- Antes de enviar, valida a janela de horário do destinatário (`notification_preferences.preferred_window_*` + timezone do colaborador, default America/Sao_Paulo). Se fora da janela, **agenda** via update em `next_run_at` para o próximo horário válido (em vez de enviar fora de hora). Quando `kind=peer`, gera pares (algoritmo round-robin pelo time, evita auto-pareamento e repete par anterior se possível) e salva em `peer_review_pairs`; cada DM cita o `subject`.
- Aplica o `tone` do survey via templates simples (mapa de strings por tom para título, intro e closing).

**b) `slack-interactions` (atualizar)**

- Ao gravar `pulse_responses`, chama `award_points(person_id, 5, 'pulse_response', run_id)`.
- Quando o pulse é `peer`, marca `peer_review_pairs.completed_at` e dá `+8` ao reviewer.

**c) `kudos-send` (nova)**

- Body: `{ to_person_id, message, category, post_to_channel?: string }`.
- Valida sessão (cliente já mantém auth), resolve `from_person_id`, insere em `kudos`, chama `award_points(to, 10, 'kudo_received', kudo_id)` e `award_points(from, 2, 'kudo_given', kudo_id)`.
- Se `post_to_channel`, posta `chat.postMessage` formatado (`🎉 *@from* deu kudos pra *@to* (categoria): "<mensagem>"`).

**d) `engagement-monthly-report` (nova, agendada via pg_cron dia 1 às 9h)**

- Para cada gestor: agrega o mês (pulses respondidos do time, top kudos, ranking interno, taxa de resposta). Envia DM no Slack via `chat.postMessage`. Para cada diretor: agrega tudo igual mas global. Salva snapshot em `audit_logs` (`acao='MONTHLY_ENGAGEMENT'`).

**e) `engagement-smart-reminders` (nova, agendada a cada 30min)**

- Re-tenta pulses cujo dispatch foi adiado e cuja janela agora encaixa.

### 3. Frontend

- Nova rota `/engagement` + entrada no Header.
- Componentes:
  - `MyPointsCard` — total mês + histórico recente.
  - `TeamLeaderboard` — top 10 do time (semipública: cada um vê o próprio time; gestor/diretor vê tudo).
  - `KudosFeed` — lista paginada com categoria/cor/data, realtime via Supabase subscription.
  - `GiveKudosDialog` — escolher pessoa, categoria, mensagem (200 chars), opcional "também postar em #canal".
  - `EngagementSettingsCard` (em Settings) — quiet hours + janela preferida.
- Atualizar `PulseFormDialog`:
  - Select de `tone` (formal/neutro/descontraído).
  - Switch "Peer review" — quando ligado, exibe `peer_anonymous` e o alvo é interpretado como pool de revisores e revisados (mesmo conjunto).

### 4. Validação

- TypeScript build + smoke manual: dar um kudo (frontend → edge function → DB → feed atualiza via realtime → pontos aparecem em `MyPointsCard`).
- Disparar um pulse `peer` e ver pares criados; responder no Slack e ver `completed_at` + pontos.
- Forçar dispatch fora de janela e confirmar reagendamento.
- Rodar `engagement-monthly-report` manualmente via `curl_edge_functions` com `?dry_run=true`.

### Detalhes técnicos

- Pontos não geram dinheiro, são adimensionais. Configuração dos valores via constantes na edge function (simples de ajustar).
- Visibilidade semipública é enforçada por RLS em `engagement_points` e pela query do leaderboard (filtra por `sub_time` do solicitante, exceto se admin/diretor).
- Tom: três templates fixos por tipo de mensagem (intro do pulse, lembrete, agradecimento), mantidos numa constante no edge function — fácil de iterar depois.
- Lembretes "não intrusivos" = respeitar `quiet_hours_*` (não envia) e priorizar `preferred_window_*` (adia para essa janela quando possível).
- Peer review configurável = a flag `peer_anonymous` da survey controla se o gestor sabe quem o avaliou; default `true`. Gestores devem poder visualizar todas as avaliações do seu time. Diretores e admins devem poder visualizar todas as avaliações de todos os times e pares.
- Sem mudança no Slack App além das escopos que já temos (`chat:write`, `im:write`, `users:read.email`).
- Migration: única; cron jobs via `supabase--insert` separado (porque conté project_ref e anon key).