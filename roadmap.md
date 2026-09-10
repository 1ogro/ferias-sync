# Correção de Bem-estar

## Respostas repetidas nos pulses
- [ ] Implementar ciclo semanal canônico e gravação transacional da última resposta, com testes isolados.
- [ ] Integrar Slack e disparos, preservando comentários, pontos, notificações e avaliações de pares.
- [ ] Consolidar histórico com auditoria após validar a prévia; conferir contadores e resultados.

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