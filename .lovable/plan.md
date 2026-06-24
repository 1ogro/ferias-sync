## Objetivo
Hoje o painel de Pulses está vazio porque nada vem pré-configurado. Vou popular 3 enquetes recorrentes padrão (criadas inativas, para você revisar antes de ligar) **e** adicionar uma seção "Templates" no painel para recriar/duplicar qualquer um dos modelos com 1 clique.

## 1. Seed inicial (via SQL de dados, inativo)

Insere 3 linhas em `pulse_surveys` com `active = false`, `created_by = 'pessoa_016'` (você), escopo = toda a empresa:

| Título | kind | frequency | Perguntas / Config |
|---|---|---|---|
| Check-in semanal de bem-estar | self | weekly | 1 pergunta escala 1–5: "Como você está se sentindo nesta semana?" + 1 texto opcional |
| Avaliação entre pares — mensal | peer | monthly | 1 escala 1–5 "Como foi colaborar com essa pessoa?" + 1 texto "Um feedback construtivo" (anônimo) |
| Kudos da semana | kudos | weekly | Sem perguntas. `kudos_categories` = todas, `kudos_channel` = null, `prompt_text` = "🎉 Reconheça um colega que fez a diferença esta semana!" |

Como combinado: todos entram com `active = false` — aparecem no painel mas não disparam até você revisar e ativar.

## 2. Galeria de templates no painel de Pulses

Em `src/components/pulses/PulsesTab.tsx`, adicionar um bloco "Modelos prontos" acima da lista de pulses, com 3 cards (Autoavaliação, Pares, Kudos). Cada card tem botão "Usar este modelo" que:

- Abre o `PulseFormDialog` já preenchido com os defaults do template correspondente
- Usuário ajusta título/escopo/cadência e salva como novo pulse

Implementação: criar `src/components/pulses/pulseTemplates.ts` exportando 3 objetos `CreateSurveyInput` (os mesmos defaults do seed). `PulsesTab` passa o template selecionado como `initialValues` para o dialog.

## 3. Pequeno ajuste no PulseFormDialog

Aceitar prop opcional `initialValues?: Partial<CreateSurveyInput>` para hidratar o formulário ao abrir a partir de um template (hoje só aceita `survey` para edição).

## Detalhes técnicos
- Seed via `supabase--insert` (não migration — são dados, não schema).
- Nenhuma mudança de schema. `pulse_questions` recebe as 3 perguntas dos pulses self/peer; kudos não tem perguntas.
- Não há agendamento ativado: como `active=false`, o `pulse-dispatch` ignora todos os 3 até você ligar pela UI.
- Templates ficam disponíveis para sempre — se você apagar um dos 3 seed, pode recriar pelo botão.

## Validação
1. Recarregar `/pulses` → ver os 3 cards inativos + a seção "Modelos prontos".
2. Clicar "Usar este modelo" em Kudos → dialog abre pré-preenchido com prompt e categorias.
3. Editar e salvar → novo pulse criado normalmente.
4. Ativar o pulse semanal de Kudos → confirmar que o `pulse-dispatch` o pega no próximo cron.
