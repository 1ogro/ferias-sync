# Corrigir links quebrados nos lembretes de cadastro incompleto

## Problema confirmado

O DM enviado ao gestor (`send-registration-reminders`) monta o botão apontando para
`{APP}/team/{person.id}`. Essa rota **não existe** no `App.tsx` — cai no `*` (NotFound), por isso o 404.

O DM enviado à própria pessoa aponta para `{APP}/settings?tab=profile`. A rota existe, mas o
`Settings` usa `defaultValue="appearance"` e não lê `?tab=`, e não há aba "profile" — o link
abre a página errada.

## Correção

1. **CTA do gestor** → `{APP}/vacation-management?tab=summary&person={id}`
   (aba "Resumo do Colaborador", que já lista os liderados).
   - `CollaboratorSummaryTable` passa a aceitar um termo de busca inicial vindo da URL
     (nome/id do liderado), pré-preenchendo o campo de busca e destacando a linha.
2. **CTA da própria pessoa** → `{APP}/complete-profile`, que é o fluxo real de completar
   cadastro (campos faltantes). Mantém-se o texto listando os itens pendentes.
3. Atualizar `lib_test.ts` para as novas URLs.

## Detalhes técnicos

- `supabase/functions/send-registration-reminders/lib.ts`:
  - `buildIncompleteProfileManagerMessage`: URL `?tab=summary&person=<id>`.
  - `buildIncompleteProfileSelfMessage`: URL `/complete-profile`.
- `src/pages/VacationManagement.tsx`: ler `person` de `searchParams` e repassar ao
  `CollaboratorSummaryTable` como `initialSearch`.
- `src/components/CollaboratorSummaryTable.tsx`: nova prop opcional `initialSearch`/`highlightId`
  para inicializar `searchTerm` e destacar a linha correspondente.
- `supabase/functions/send-registration-reminders/lib_test.ts`: ajustar asserts de URL.

Nenhuma mudança de banco de dados.
