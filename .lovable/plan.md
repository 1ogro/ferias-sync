## Entrega

Um arquivo `.pptx` com **2 slides 16:9**, salvo em `/mnt/documents/onboarding-ferias-uxtd.pptx`, pronto pra anexar ao material de onboarding.

Identidade visual: paleta sóbria (azul-petróleo + neutros claros), tipografia sans-serif, ícone/calendário no canto — alinhado ao "Férias UXTD".

## Slide 1 — Novo Colaborador

**Título:** Bem-vindo ao Férias UXTD

**Para que serve:** plataforma única para solicitar e acompanhar suas ausências (férias, day-off, licenças médica e maternidade), com validação automática de saldo, conflitos de time e regras do seu contrato (CLT/PJ).

**Primeiros passos (3 blocos):**
1. **Complete seu perfil** — ao receber o convite (Slack + email), acesse o app e preencha data de nascimento, cargo, time e dados de contrato. Só depois disso o sistema libera as funcionalidades.
2. **Solicite uma ausência** — em "Nova solicitação" escolha o tipo, datas e justificativa. O fluxo segue automaticamente para gestor → diretor quando aplicável.
3. **Acompanhe tudo** — saldo de férias, day-off (libera no 1º dia do mês de aniversário), histórico e status em tempo real no dashboard.

**Lembretes rápidos:**
- Day-off: anual, dentro do mês do aniversário.
- Férias CLT: também precisam ser registradas no Portal RH.
- Notificações por Slack e email — ajuste em Configurações.

**Rodapé:** Dúvidas? Fale com seu gestor ou use `/biscoito` no Slack.

## Slide 2 — Novo Gestor

**Título:** Guia rápido para Gestores

**Seu papel na plataforma:** aprovar ausências do seu time, garantir cobertura mínima e acompanhar saldo e antecedência das solicitações.

**Responsabilidades (3 blocos):**
1. **Aprovar solicitações** — Inbox mostra pendências do time. Aprove, peça informações adicionais ou recuse com justificativa. Diretor é acionado automaticamente quando a regra exige 2º nível.
2. **Gerir capacidade do time** — Dashboard de capacidade alerta sobre sobreposição de ausências e licenças médicas que impactam o time. Use antes de aprovar.
3. **Cadastrar novos colaboradores** — em "Colaboradores pendentes" envie o cadastro ou aprove pedidos via `/biscoito`. Após aprovação, o sistema notifica o novo colaborador (Slack DM + email) e o leva ao wizard de perfil.

**Boas práticas:**
- Responda solicitações em até 48h.
- Use observações para registrar acordos com o time.
- Em caso de licença médica que afete >30% do time, o diretor é notificado automaticamente.

**Rodapé:** Acesso administrativo (recalcular saldos, exceções) disponível em Configurações > Admin.

## Após aprovação

Gero o `.pptx` com `python-pptx`, converto cada slide pra imagem e faço QA visual (overflow, contraste, alinhamento) antes de entregar via `<presentation-artifact>`.
