Limpar todos os dados de engajamento existentes (kudos e pontuações) para reiniciar o sistema a partir de agora.

## O que será apagado

- **Tabela `kudos`**: todos os registros (kudos enviados, pendentes, vinculados ou não a pessoas)
- **Tabela `engagement_points`**: todos os pontos acumulados (de kudos, pulses, streaks, peer reviews, etc.)

## O que NÃO será afetado

- Pessoas (`people`), perfis, papéis, gestores
- Pulses (`pulse_surveys`, `pulse_questions`, `pulse_responses`, `pulse_runs`)
- Preferências de notificação
- Logs de auditoria
- Qualquer outra tabela

## Execução

`DELETE FROM public.kudos;` e `DELETE FROM public.engagement_points;` via ferramenta de dados (sem alterar schema, RLS ou estrutura).

## Observação

Operação **irreversível**. Após confirmar, o feed de kudos e o ranking do mês ficarão zerados, e novos kudos/pontos passarão a contar a partir desse momento.
