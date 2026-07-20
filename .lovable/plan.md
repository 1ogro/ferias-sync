## Objetivo

Garantir que toda resposta de pulse fique associada ao survey correto conforme o dia da semana em que foi enviada (fuso `America/Sao_Paulo`), aplicando a mesma regra usada nas médias:

- **Seg, Ter, Qua, Qui** → survey **Check-in semanal de bem-estar**
- **Sex, Sáb, Dom** → survey **Check-out semanal**

Hoje as respostas ficam presas ao `run_id` do link clicado no Slack, então respostas de hoje (segunda) aparecem sob "Check-out semanal" quando o colaborador clica numa mensagem antiga, e vice-versa.

## Escopo

1. **Backfill retroativo** de respostas já existentes.
2. **Guard em tempo de escrita** para novas respostas.
3. **Nada muda** na tela de médias em `/engagement` (RPC já classifica por data).

## Passo 1 — Migração de dados

Para cada resposta em `pulse_responses` cujo `run.survey_id` seja um dos dois surveys semanais (Check-in / Check-out):

1. Calcular `expected_kind` a partir de `EXTRACT(dow FROM submitted_at AT TIME ZONE 'America/Sao_Paulo')`.
2. Descobrir `expected_survey_id` (Check-in ou Check-out).
3. Se o run atual já pertence ao `expected_survey_id`, não faz nada.
4. Caso contrário:
   - Localizar/criar um "run guarda-chuva" do survey esperado para acomodar respostas realocadas (ex.: um run por semana ISO com título `Reclassificado <semana>`), ou reutilizar o run mais recente do survey esperado dentro da mesma semana ISO da resposta.
   - Atualizar `pulse_responses.run_id` para esse run.
   - Recontar `pulse_runs.responses_count` dos runs de origem e destino.
   - Não mexer em `pulse_run_recipients` (o envio original permanece registrado).
5. Log em `audit_logs` com `PULSE_RESPONSE_RECLASSIFIED` contendo `response_id`, `from_run`, `to_run`, `dow`.

A migração aceita o mesmo mapeamento para `pulse_questions`: se uma questão de scale/text pertence só ao survey de origem, cria-se uma questão espelho no survey destino com o mesmo `prompt`/`question_type`/`order_index` (ou faz-se lookup por `prompt` já existente) e a resposta passa a apontar para o `question_id` correto. Só rodamos o backfill depois de conferir, via query, o mapeamento 1:1 entre perguntas dos dois surveys — se houver questão sem correspondente, o script cria antes de mover.

## Passo 2 — Guard em `slack-interactions`

No handler `pulse_answer` e `pulse_text` (`supabase/functions/slack-interactions/index.ts`, blocos ~1230 e ~1275):

1. Após resolver `runId`, carregar `survey_id` e `title` do run.
2. Se o survey for Check-in ou Check-out, calcular `expected_kind` pela data/hora atual.
3. Se não bater, buscar (ou criar) um run ativo do survey correto para a semana atual e a questão equivalente (mesma `prompt`), e usar esse `run_id`/`question_id` no `upsert`.
4. Continua premiando pontos e chamando `pulse-response-notify` normalmente.

Isso torna o clique em qualquer mensagem antiga do Slack idempotente do ponto de vista analítico.

## Passo 3 — Verificação

- Rodar query de conferência: nenhuma resposta com `dow ∈ {1,2,3,4}` sob "Check-out semanal", nenhuma com `dow ∈ {5,6,0}` sob "Check-in".
- Conferir na UI `/vacation-management?tab=pulses` que as respostas de hoje aparecem em Check-in e as de sexta (17/07) em Check-out.
- Conferir que os totais em `/engagement` (médias 7/30 dias) permanecem iguais (a RPC já era correta).

## Notas técnicas

- Identificação dos surveys por `title` exato ("Check-in semanal de bem-estar", "Check-out semanal"). Se quiser mais robustez, adicionamos uma coluna `kind` (`checkin`/`checkout`) em `pulse_surveys` — proponho fazer isso na mesma migração para evitar dependência de string.
- Recontagem de `responses_count` via `UPDATE ... = (SELECT count(*) ...)` para os runs afetados.
- Migração roda em transação única; se algo falhar, nada é aplicado.
