## Diagnóstico

As respostas do "Check-in semanal de bem-estar" estão sendo gravadas com sucesso na tabela `pulse_responses` (confirmei a linha da pessoa_016 com `scale_value = 5` e os logs de `slack-interactions` sem erro).

O painel mostra "0 respostas" porque a leitura passa pela view `pulse_responses_safe` (criada com `security_invoker=true`), que herda a RLS da tabela `pulse_responses`. A policy `pulse_responses_select` exige:

```
s.anonymous = false AND (is_admin_or_director() OR s.created_by = current_person_id())
```

O check-in é uma survey anônima (`anonymous = true`), então a condição `s.anonymous = false` **bloqueia** a leitura — mesmo para o admin/criador. Isso é inconsistente com o objetivo da view, que justamente já mascara `respondent_id` e expõe `anonymous_label` para preservar o anonimato.

Resultado: toda survey marcada como anônima fica com painel zerado, embora as respostas existam no banco.

## Correção

Migração única ajustando a RLS de `pulse_responses` para permitir leitura também quando a survey é anônima — o anonimato continua garantido porque o app lê pela view `pulse_responses_safe`, que oculta `respondent_id`.

```sql
DROP POLICY IF EXISTS pulse_responses_select ON public.pulse_responses;

CREATE POLICY pulse_responses_select
ON public.pulse_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pulse_runs r
    JOIN public.pulse_surveys s ON s.id = r.survey_id
    WHERE r.id = pulse_responses.run_id
      AND (public.is_admin_or_director() OR s.created_by = public.current_person_id())
  )
);
```

Nenhuma mudança de código no frontend/edge function — a view `pulse_responses_safe` já cuida da máscara de identidade.

## Validação

Depois de aplicar a migração:
1. Abrir o painel do "Check-in semanal de bem-estar" → deve mostrar 1 respondente, média 5/5 na pergunta de escala.
2. Confirmar que `respondent_id` continua `null` e que aparece um `anonymous_label` (ex.: "R1") na linha de respostas recentes, mantendo o anonimato.
3. Testar com uma survey não-anônima já existente para garantir que continua funcionando.
