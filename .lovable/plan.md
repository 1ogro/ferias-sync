## Pulses de Performance via Slack — MVP

Fluxo novo em **Gestão do Time** para criar pulses (autoavaliação) que o bot dispara via Slack DM, captura respostas (botões 1-5 e/ou texto) e consolida em painel exportável. Feedback entre pares fica fora deste MVP.

---

### 1. Banco de dados (nova migration)

Quatro tabelas em `public`, com `GRANT` e RLS:

- **`pulse_surveys`** — definição da enquete
  - `id uuid pk`, `created_by text (people.id)`, `title text`, `description text`, `anonymous boolean`, `frequency text` (`once|daily|weekly|biweekly|monthly`), `next_run_at timestamptz`, `last_run_at timestamptz`, `active boolean`, `target_scope text` (`team|custom`), `target_team_id text null`, `target_person_ids text[] null`, `created_at`, `updated_at`
- **`pulse_questions`** — perguntas ordenadas
  - `id uuid pk`, `survey_id uuid fk`, `order int`, `question_text text`, `question_type text` (`scale_1_5|open_text`), `required boolean`
- **`pulse_runs`** — cada disparo agendado
  - `id uuid pk`, `survey_id uuid fk`, `dispatched_at timestamptz`, `status text` (`pending|sent|partial|failed`), `recipients_count int`, `responses_count int`
- **`pulse_responses`** — respostas
  - `id uuid pk`, `run_id uuid fk`, `question_id uuid fk`, `respondent_id text (people.id)` (preenchido sempre — pseudoanônimo; UI/export nunca mostra quando `anonymous=true`), `scale_value int null`, `text_value text null`, `slack_message_ts text`, `submitted_at timestamptz`
  - Unique `(run_id, question_id, respondent_id)` para evitar duplicidade

**RLS** (via `has_role` + `papel`):
- `pulse_surveys` / `pulse_questions` / `pulse_runs`: SELECT/INSERT/UPDATE para admin, diretor; gestores só para enquetes que eles criaram (escopo do próprio time).
- `pulse_responses`:
  - INSERT só via service_role (edge function).
  - SELECT: admin/diretor sempre; criador da enquete; quando `anonymous=true`, view dedicada `pulse_responses_safe` que omite `respondent_id`.
- Gestor seleciona alvo só dentro do próprio `sub_time`/subordinados (validado no RPC de criação).

### 2. Edge Functions

- **`pulse-dispatch`** (verify_jwt=false, chamada por pg_cron)
  - Lê `pulse_surveys` com `active=true AND next_run_at <= now()`.
  - Para cada destinatário (resolve Slack user via email → `users.lookupByEmail`, com fallback por nome igual ao padrão existente em `slack-notification`).
  - Cria `pulse_runs` row, envia DM com Block Kit: 1 mensagem por survey contendo todas as perguntas (botões `1..5` para escala, `action_id=pulse_answer:<run_id>:<question_id>:<value>`; perguntas de texto abrem modal via botão "Responder").
  - Atualiza `next_run_at` conforme `frequency`; respeita `notification_preferences.request_updates_slack` (reaproveita preferência existente).
  - Audit log em `audit_logs`.

- **`slack-interactions`** (já existe — estender)
  - Roteia `action_id` que começa com `pulse_answer:` → grava em `pulse_responses` (upsert por unique), responde com `response_action: update` mostrando "✅ Resposta registrada".
  - Para perguntas abertas: abre `views.open` com modal `pulse_text:<run_id>:<question_id>`; trata `view_submission` gravando `text_value`.

- **`pulse-export`** (verify_jwt=true)
  - Params: `survey_id`, `format=csv|xlsx`, `range`.
  - Gera CSV/XLSX no servidor (XLSX via `npm:xlsx`); retorna arquivo. Quando `anonymous=true`, coluna respondente vira hash sequencial (`R1, R2…`).
  - Export para Google Sheets: opcional, reutiliza credenciais já existentes (`GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`) — cria nova aba `pulse_<survey>_<run>`.

### 3. Agendamento

Migration habilita `pg_cron` + `pg_net` e cria job a cada 15 min chamando `pulse-dispatch`. SQL inserido via `supabase--insert` (contém URL/anon key).

### 4. Frontend (em `src/pages/VacationManagement.tsx` → nova rota `/team-pulses` ou nova aba)

Decisão: **nova aba "Pulses" dentro de Gestão do Time** (`VacationManagement.tsx`) para ficar próximo dos demais painéis, conforme pedido ("painel separado dentro de Gestão do Time").

Componentes novos em `src/components/pulses/`:
- `PulseList.tsx` — lista de enquetes (status, próxima execução, taxa de resposta), botão "+ Nova enquete".
- `PulseFormDialog.tsx` — cria/edita: título, anonimato, frequência, alvo (time/pessoas), perguntas dinâmicas (escala/aberta, obrigatória).
- `PulseResultsPanel.tsx` — por survey: KPIs (taxa resposta, média por pergunta de escala), tabela de respostas, gráfico simples (recharts já no projeto), botões **Exportar CSV / Excel / Google Sheets**.
- Hook `usePulses.ts` com React Query.

Permissões na UI: gestor só vê e cria pulses do próprio time; admin/diretor veem tudo.

### 5. Segurança / anonimato

- `respondent_id` sempre persistido (pseudoanônimo) — necessário para taxa de resposta e dedupe.
- Toda leitura no frontend usa view `pulse_responses_safe` que omite `respondent_id` quando `anonymous=true`.
- Export respeita o mesmo flag.
- RLS bloqueia SELECT direto da tabela base por não-admins.

### 6. Fora do escopo deste MVP

- Feedback entre pares (avaliação 1-1 de colegas).
- Envio em canais públicos/privados — MVP é só **DM** (autoavaliação), conforme escopo selecionado.
- Exportação automática recorrente por e-mail (export é on-demand).
- NPS e métricas de adoção em dashboard — coletáveis depois via os dados gravados.

### 7. Critérios de aceitação

- Admin/Diretor/Gestor cria pulse com perguntas mistas, anonimato e frequência.
- No horário agendado, membros recebem DM do bot com botões 1-5 e/ou prompt de texto.
- Clicar no botão grava a resposta e confirma visualmente; reenviar não duplica.
- Painel em Gestão do Time mostra taxa de resposta e respostas (anônimas quando aplicável).
- Export CSV/XLSX/Google Sheets gera arquivo com colunas: data, pergunta, valor, respondente (ou `R#` se anônimo).
- Gestor só consegue criar/ver pulses do próprio time.
