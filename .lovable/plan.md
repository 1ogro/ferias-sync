## Plano: duplicação de enquete

### 1. Hook (`src/hooks/usePulses.ts`)
Adicionar `useDuplicatePulseSurvey()`:
- Recebe `surveyId`.
- Lê o survey original + suas `pulse_questions`.
- Insere nova linha em `pulse_surveys` com:
  - Mesmos campos (title, description, anonymous, frequency, target_*, etc.)
  - `title` = `"<original> (cópia)"`
  - `created_by` = usuário atual
  - `active` = `false` (segurança: copia pausada para o usuário revisar antes de disparar)
  - `next_run_at` = agora + 30min
  - `last_run_at` = null
- Insere as perguntas copiadas (sem ids, preservando ordem/tipo/texto/required) referenciando o novo `survey_id`.
- Invalida `["pulse_surveys"]`.

### 2. UI (`src/components/pulses/PulsesTab.tsx`)
- Novo botão "Duplicar" (ícone `Copy`) em cada card, ao lado de Editar, visível só para `canCreate`.
- Ao clicar: chama a mutation e mostra toast "Enquete duplicada (criada como inativa)".

### 3. Validação
- TypeScript build.
- Duplicar uma enquete e verificar que aparece na lista como inativa com as mesmas perguntas.

### Detalhes técnicos
- Arquivos: `src/hooks/usePulses.ts`, `src/components/pulses/PulsesTab.tsx`.
- Sem migrations, sem edge function, sem mudanças de RLS (políticas atuais já permitem o criador inserir).
