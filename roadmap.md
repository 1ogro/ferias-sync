# Correção de Bem-estar

## Médias sem supressão no relatório de Bem-estar
- [x] Remover proteção de todas as médias do relatório, preservando escopo de acesso e contagem semanal única. Banco confirmou ausência de supressão, autorização interna e execução anônima negada; 80 notas de check-in (3,80) e 49 de check-out (3,71).
- [x] Atualizar apresentação e CSV; cálculos e recortes validados em PostgreSQL isolado antes de aplicar. Playwright com dados simulados confirmou médias, filtro de time com uma pessoa e CSV sem erros de execução; validação autenticada real permanece bloqueada conforme abaixo.

## Respostas repetidas nos pulses
- [x] Implementar ciclo semanal canônico e última resposta transacional; testes SQL e 10 testes Deno passaram, incluindo comentários, pares e eventos fora de ordem.
- [x] Integrar e implantar Slack, disparos e lembretes; concorrência validada com 16 resoluções, 16 respostas e 8 disputas de envio.
- [x] Consolidar histórico com auditoria após testes isolados: 144 respostas auditadas, 10 duplicatas consolidadas, zero grupos duplicados; Douglas tem uma resposta no ciclo.
- [x] Validar anonimato e interface simulada: nota/depoimento juntos, participação por ciclo e CSV; sem erros de execução. Validação autenticada real segue bloqueada conforme abaixo.

## Gráficos por time e anonimato
- [x] Substituir bloqueio global por blocos semanais determinísticos; testes isolados de pessoas distintas, tipos, residual entre times, filtros e períodos sobrepostos passaram.
- [x] Aplicar regra validada sem alterar respostas nem permissões; confirmado bloqueio anônimo e autorização interna. Dados reais: 5 semanas combinadas recuperáveis em Pacientes, 3 em Assistencial/Médico/Operadoras e 1 em Conversacional & UX Writing.
- [x] Explicar resultados protegidos no gráfico, tabela, cartões e CSV; Playwright com dados simulados validou séries por time, filtros, estados protegido/vazio/só geral e CSV, sem erros de execução.

- [x] Implementar e testar agregações por período, semana e time com anonimato (PostgreSQL isolado, dados sintéticos).
- [x] Corrigir o recebimento de respostas e testar falhas de mapeamento (8 testes Deno; função implantada).
- [x] Validar e aplicar correção auditada dos 12 vínculos e integridade no banco (12 auditorias, zero inconsistências).
- [x] Atualizar painel, filtros, tabela e CSV (Playwright com respostas simuladas; sem erros de execução).
- [x] Reconciliar dados: 89 notas check-in / 3,89; 49 check-out / 3,71, em 11 semanas com notas.
- [ ] Verificação autenticada ponta a ponta com dados reais: bloqueada por Supabase externo sem sessão de teste gerenciável. Rota pública validada; redireciona para /auth. Não solicitar credenciais pessoais.

Avisos preexistentes do banco sobre funções e proteção de senhas permanecem fora do escopo; novas funções negam execução anônima e validam autorização internamente.