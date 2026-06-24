## Objetivo
Expandir as opções de público-alvo dos Pulses para cobrir três cenários:

1. **Empresa inteira** — dispara para todos os usuários ativos do sistema.
2. **Time(s) específico(s)** — seleção de um ou mais times (hoje só permite um).
3. **Pessoas específicas** — seleção individual (já existe).

## Mudanças

### Banco (`pulse_surveys`)
- Atualizar o enum/valor permitido em `target_scope` para aceitar: `all`, `teams`, `custom`.
  - Migrar registros existentes com `target_scope = 'team'` → `'teams'` e mover `target_team_id` para um novo array `target_team_ids text[]`.
- Adicionar coluna `target_team_ids text[]` (array de times) e manter `target_team_id` por compatibilidade (ou descartar após migração).
- Atualizar o `check constraint` de `target_scope`.

### Edge function `pulse-dispatch`
- Quando `target_scope = 'all'`: buscar todos de `people` onde `ativo = true`.
- Quando `target_scope = 'teams'`: buscar todos de `people` onde `sub_time = ANY(target_team_ids)` e `ativo = true`.
- Quando `target_scope = 'custom'`: usar `target_person_ids` (sem mudança).

### Frontend
- **`usePulses.ts`**: tipo `target_scope: "all" | "teams" | "custom"`, adicionar `target_team_ids?: string[] | null` em `CreateSurveyInput` / `UpdateSurveyInput` / `PulseSurvey`, propagar nos hooks de criar/atualizar/duplicar.
- **`PulseFormDialog.tsx`**: trocar o seletor de escopo por 3 opções (rádio):
  - "Empresa inteira" — sem seletor adicional.
  - "Time(s) específico(s)" — multi-select de times.
  - "Pessoas específicas" — multi-select de pessoas (já existe).
- **`PulsesTab.tsx`**: ajustar exibição do escopo na lista (mostrar "Empresa inteira", contagem de times ou pessoas).
- **`pulseTemplates.ts`**: ajustar os 3 modelos padrão para usar `target_scope: "all"` (faz mais sentido como ponto de partida).

## Detalhes técnicos
- Multi-select de times pode reaproveitar componente existente ou usar `Command`/`Popover` com checkboxes (padrão shadcn já usado no projeto).
- Renderização compacta na lista: "Empresa inteira" / "3 times" / "5 pessoas".
- Não há alteração no fluxo de respostas/Slack — só na resolução de destinatários no dispatch.

## Fora de escopo
- Mudanças no fluxo de kudos além da seleção de público.
- Disparo de kudos (mantém só configuração, conforme decidido antes).