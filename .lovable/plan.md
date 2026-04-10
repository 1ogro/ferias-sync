

## Plano: Corrigir exibição da data de nascimento no perfil

### Problema
Na linha 56 de `ProfileModal.tsx`, `new Date(person.data_nascimento)` interpreta a string `YYYY-MM-DD` como UTC meia-noite, causando deslocamento de um dia em fusos horários negativos (como o Brasil).

### Solução
Substituir `new Date(person.data_nascimento)` por `parseDateSafely(person.data_nascimento)`, que já existe em `dateUtils.ts` e faz o parsing em horário local.

### Mudança
**`src/components/ProfileModal.tsx`** — linha 56:
- De: `const birthDate = person.data_nascimento ? new Date(person.data_nascimento) : undefined;`
- Para: `const birthDate = person.data_nascimento ? parseDateSafely(person.data_nascimento) : undefined;`

A função `parseDateSafely` já está importada no arquivo (linha 20).

