## Plano: edição de enquete

### 1. Hook (`src/hooks/usePulses.ts`)
- Adicionar `useUpdatePulseSurvey()`: recebe `id` + campos editáveis (title, description, anonymous, frequency, next_run_at, target_scope, target_team_id, target_person_ids) e faz `update` na tabela `pulse_surveys`.
- Adicionar `useUpsertPulseQuestions()`: dado `surveyId` e o array de perguntas, faz **delete + insert** das perguntas em uma transação simples (delete todas as `pulse_questions` daquele survey, depois insere o novo array). Isso evita ter que reconciliar IDs individuais e é seguro porque `pulse_responses` referencia `question_id` — **ATENÇÃO**: se já houver respostas, deletar perguntas quebra a FK. Solução: **bloquear edição de perguntas se já existir qualquer `pulse_run` com `responses_count > 0`**; nesse caso permitir editar apenas metadados (título, descrição, alvo, frequência, próximo disparo, anonimato).

### 2. Dialog (`src/components/pulses/PulseFormDialog.tsx`)
- Aceitar prop opcional `survey?: PulseSurvey` (e suas `questions`). Quando presente:
  - Título do dialog vira "Editar enquete"
  - Pré-popula todos os campos no `useEffect` quando `open && survey`
  - Chama `useUpdatePulseSurvey` em vez de `useCreatePulseSurvey`
  - Se já houver respostas, desabilita a seção de perguntas com aviso "Perguntas não podem ser alteradas após a primeira resposta".
- Usar a query `pulse_runs` (já existe `usePulseRuns`) para detectar se há respostas: `runs.some(r => r.responses_count > 0)`.

### 3. UI (`src/components/pulses/PulsesTab.tsx`)
- Estado `editing: PulseSurvey | null`.
- Botão "Editar" (ícone Pencil) em cada card, ao lado de Pause/Excluir, visível apenas para `canCreate`.
- Ao clicar: `setEditing(survey); setOpen(true)`.
- Passar `survey={editing}` ao `PulseFormDialog`; limpar `editing` no `onOpenChange(false)`.

### 4. Validação
- TypeScript build
- Testar manualmente: editar título de enquete existente, salvar, ver mudança refletida; tentar editar perguntas em enquete com respostas e ver bloqueio.

### Detalhes técnicos
- Arquivos: `src/hooks/usePulses.ts`, `src/components/pulses/PulseFormDialog.tsx`, `src/components/pulses/PulsesTab.tsx`.
- Sem migrations: RLS de `pulse_surveys` já permite UPDATE pelo criador (verificar; se necessário ajustar, faço migration).
- Sem mudanças em edge functions.
