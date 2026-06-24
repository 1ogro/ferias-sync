
## Objetivo

Unificar a configuração das enquetes de engajamento (autoavaliação, avaliação entre pares e kudos) dentro do painel **Pulses**, permitindo criar, editar, duplicar, pausar e disparar qualquer um dos três tipos pela mesma interface já existente.

Hoje a autoavaliação e peer review já são editáveis (campo `kind` em `pulse_surveys`), mas **kudos** vivem fora — não há agendamento configurável nem prompts editáveis pelo painel. Esta entrega cobre essa lacuna.

## Mudanças

### 1. Schema (`pulse_surveys`)
- Estender o enum `pulse_kind` adicionando o valor `'kudos'` (além de `self` e `peer`).
- Adicionar colunas opcionais usadas só quando `kind = 'kudos'`:
  - `kudos_categories kudos_category[]` — categorias permitidas no prompt (default = todas).
  - `kudos_channel text` — canal Slack opcional para postagem pública do kudo.
  - `prompt_text text` — texto do prompt enviado no Slack (ex.: "Quem brilhou essa semana?"). Default por tom.
- Quando `kind = 'kudos'`, perguntas (`pulse_questions`) são ignoradas — o "formulário" é o modal de kudos no Slack.

### 2. Painel de Pulses (`PulseFormDialog`)
- Selector "Tipo" passa a ter 3 opções: **Autoavaliação**, **Avaliação entre pares**, **Kudos**.
- Quando `kind = 'kudos'`:
  - Esconder o editor de perguntas e o switch "anônimo".
  - Mostrar bloco "Configuração de Kudos":
    - Categorias permitidas (multi-select com chips: Teamwork, Innovation, Delivery, Leadership, Customer).
    - Canal Slack para broadcast (input opcional `#canal`).
    - Texto do prompt (textarea, com placeholder por tom).
- Mantém tom, frequência, próximo disparo e alvo (já existentes).

### 3. Card da enquete (`PulsesTab`)
- Badge extra com o tipo: `self` / `peer` / `kudos`.
- Botão "Disparar" funciona para os três tipos.

### 4. Dispatch (`pulse-dispatch` edge function)
- Quando `kind = 'kudos'`, em vez de enviar perguntas:
  - Enviar DM para cada alvo com o `prompt_text` + botão **"Dar kudos"** (Slack `actions` block).
  - O `value` do botão carrega `survey_id` para o handler de interações.
- Continua respeitando quiet hours e janela preferida.

### 5. Interações Slack (`slack-interactions`)
- Tratar `action_id = 'give_kudos_open'`: abrir Slack modal (`views.open`) com:
  - Select de destinatário (people da org).
  - Select de categoria (limitado a `kudos_categories` da survey).
  - Textarea da mensagem.
- No `view_submission`, chamar a mesma lógica de `kudos-send` (registro + pontos + broadcast no `kudos_channel` da survey, se preenchido).
- Pontos: mantém 10 ao receptor / 2 ao emissor já implementados.

### 6. Hook (`usePulses.ts`)
- Atualizar tipos `PulseSurvey`, `CreateSurveyInput`, `UpdateSurveyInput` com os novos campos (`kudos_categories`, `kudos_channel`, `prompt_text`).
- Em create/update: pular insert/replace de `pulse_questions` quando `kind = 'kudos'`.
- `useDuplicatePulseSurvey`: copiar os novos campos.

### 7. Feed de Kudos (`Engagement.tsx`)
- Sem mudanças funcionais — continua lendo a tabela `kudos`. Os kudos vindos por survey carregam o mesmo schema, então aparecem naturalmente no feed.

## Fora do escopo
- Nenhuma alteração na página `/engagement` (leaderboard, prefs, feed) além de continuar consumindo a tabela `kudos`.
- Sem alteração no relatório mensal — ele já agrega tudo de `kudos` e `engagement_points`.

## Validação
1. Criar uma survey `kind=kudos` semanal, time X, categorias `[teamwork, delivery]`, canal `#kudos`.
2. Clicar "Disparar" → cada membro recebe DM com botão "Dar kudos".
3. Submeter o modal → row em `kudos`, pontos creditados, mensagem postada em `#kudos`.
4. Editar a survey, mudar prompt e categorias → próximo disparo reflete.
