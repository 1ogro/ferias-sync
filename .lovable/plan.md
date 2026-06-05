## Objetivo

Gerar um one-pager **em PDF** para onboarding de uma nova gestora de time no sistema **Férias UXTD**. O documento combinará:

- Um **resumo visual rápido** no topo (cabeçalho, blocos com ícones, paleta consistente com o app).
- Um **guia passo a passo** logo abaixo, cobrindo: login, aprovações, e visualização dos dados dos colaboradores do seu time.

O arquivo será salvo em `/mnt/documents/onepager-gestora-ferias-uxtd.pdf` e entregue via `<presentation-artifact>`.

## Conteúdo do one-pager

### 1. Cabeçalho
- Título: **Férias UXTD — Guia rápido da Gestora**
- Subtítulo: "Controle de férias, day offs e ausências do seu time"
- Data de geração + selo "Perfil: Gestora de Time"

### 2. Visão geral do sistema (resumo visual — 3 blocos com ícones)
- **O que é**: plataforma interna para solicitação, aprovação e acompanhamento de férias, day offs e licenças médicas/maternidade da equipe.
- **Seu papel como gestora**: aprovar/recusar pedidos do seu time, acompanhar saldos, ausências ativas e capacidade da equipe.
- **Canais de notificação**: e-mail e Slack (configuráveis em *Configurações → Notificações*).

### 3. Como fazer login (passo a passo)
1. Acessar `https://ferias-sync.lovable.app`.
2. Na tela inicial, escolher uma das opções:
   - **Entrar com Figma** (recomendado — SSO com o e-mail do Figma; perfil é vinculado automaticamente).
   - **Entrar com e-mail e senha** — se for o primeiro acesso, ir na aba **Cadastrar**, selecionar seu nome na lista, definir e-mail e senha.
3. Caso esqueça a senha, usar **"Esqueceu a senha?"** na tela de login → link de redefinição chega por e-mail.
4. Se o sistema pedir para confirmar identidade após o login (tela *Setup Profile*), selecionar seu nome na lista — o e-mail do Figma será herdado automaticamente.

### 4. Como realizar aprovações (passo a passo)
1. No menu principal, abrir **Inbox** (ícone de caixa de entrada no header).
2. Visualizar a lista de **solicitações pendentes** do time (férias, day offs, licenças).
3. Clicar no card da solicitação para abrir o detalhe (período, dias, saldo do colaborador, observações).
4. Ações disponíveis:
   - **Aprovar** → confirma; o colaborador é notificado por e-mail e Slack.
   - **Recusar** → exige um motivo no campo de justificativa; também notifica o colaborador.
5. Em caso de novos colaboradores pendentes de aprovação, eles aparecem em **Pendentes de Aprovação** (Dashboard) — clicar em *Aprovar* abre o diálogo de confirmação.
6. Todas as ações ficam registradas no histórico/auditoria da solicitação.

### 5. Como visualizar os dados dos colaboradores (passo a passo)
1. **Dashboard** (página inicial `/`):
   - **Ausências ativas** do time hoje (banner superior).
   - **Capacidade da equipe** por período.
   - **Próximos eventos**: férias aprovadas, aniversários e aniversários de contrato.
2. **Gestão de Férias** (`/vacation-management`):
   - Lista consolidada dos seus colaboradores diretos com **saldo de férias**, **dias usados**, **próxima janela** e **status**.
   - Filtros por status (Pendente, Aprovada, Recusada, Concluída) e por colaborador.
   - Clicar no nome do colaborador → drawer com **resumo completo**: contrato, papel, data de admissão, saldos por período aquisitivo, histórico de solicitações e licenças médicas.
3. **Calendário** (acessível pelo header): visão mensal com todas as ausências confirmadas do time.

### 6. Boas práticas e dicas (rodapé)
- Revisar a Inbox diariamente para não atrasar aprovações.
- Conferir o saldo do colaborador antes de aprovar (mostrado no detalhe da solicitação).
- Ajustar suas preferências de notificação em **Configurações → Notificações** (e-mail/Slack).
- Em caso de dúvida, abrir chamado com **RH** ou contatar um Diretor (papel com permissões mais amplas).

### 7. Rodapé
- Link do sistema: `https://ferias-sync.lovable.app`
- Suporte: equipe de RH

## Detalhes técnicos (geração do PDF)

- **Ferramenta**: `reportlab` (Python) com `SimpleDocTemplate` + `Platypus` para combinar header visual (Table com fundo colorido + ícones unicode/SVG simples), seções com `Paragraph`, listas numeradas, e blocos coloridos.
- **Paleta**: alinhada ao app (tons primários sóbrios — azul/roxo discreto, com cinza neutro). Tipografia padrão (Helvetica), títulos em peso bold.
- **Layout**: A4 retrato, margens 1.5cm, uma única página (ajustando tamanhos de fonte/espaçamentos). Caso ultrapasse, dividir em 2 páginas mantendo o resumo visual na primeira.
- **Saída**: `/mnt/documents/onepager-gestora-ferias-uxtd.pdf`.
- **QA obrigatório**: converter para imagem com `pdftoppm -jpeg -r 150` e inspecionar com a ferramenta de leitura de imagem — checar overflow, contraste, alinhamento e quebras de página. Iterar até estar limpo.
- **Entrega**: tag `<presentation-artifact path="onepager-gestora-ferias-uxtd.pdf" mime_type="application/pdf">`.

## Fora de escopo

- Nenhuma alteração no código da aplicação.
- Sem prints reais de tela do sistema (o PDF usará blocos visuais e ícones, não screenshots — gerar screenshots fiéis exigiria login real no app).
- Sem versão DOCX ou HTML (apenas PDF, conforme escolhido).
