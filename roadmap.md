# Correção de Bem-estar

- [x] Implementar e testar agregações por período, semana e time com anonimato (PostgreSQL isolado, dados sintéticos).
- [x] Corrigir o recebimento de respostas e testar falhas de mapeamento (8 testes Deno; função implantada).
- [x] Validar e aplicar correção auditada dos 12 vínculos e integridade no banco (12 auditorias, zero inconsistências).
- [x] Atualizar painel, filtros, tabela e CSV (Playwright com respostas simuladas; sem erros de execução).
- [x] Reconciliar dados: 89 notas check-in / 3,89; 49 check-out / 3,71, em 11 semanas com notas.
- [ ] Verificação autenticada ponta a ponta com dados reais: bloqueada por Supabase externo sem sessão de teste gerenciável. Rota pública validada; redireciona para /auth. Não solicitar credenciais pessoais.

Avisos preexistentes do banco sobre funções e proteção de senhas permanecem fora do escopo; novas funções negam execução anônima e validam autorização internamente.