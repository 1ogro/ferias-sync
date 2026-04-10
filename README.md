# Sistema de Controle de Férias & Ausências

Um sistema completo e robusto para gerenciamento de férias, licenças médicas, licenças maternidade e ausências de equipes, com fluxo de aprovação em 2 níveis, automação inteligente e integrações empresariais.

## ✨ Recursos Principais

- **Dashboard Intuitivo**: Visão geral de solicitações, estatísticas e próximos períodos
- **Fluxo de Aprovação em 2 Níveis**: Sistema hierárquico (Gestor → Diretor)
- **Detecção Inteligente de Conflitos**: Identificação automática de sobreposições e impactos na capacidade da equipe
- **Gestão de Saldos de Férias**: Cálculo automático com possibilidade de ajustes manuais e auditoria
- **Licenças Médicas Administrativas**: Registro e monitoramento de afastamentos
- **Jobs Automáticos**: Lembretes, atualizações de status e alertas programados
- **Notificações Multi-Canal**: Email (Resend) e Slack com botões interativos
- **Sincronização de Dados**: Integração bidirecional com Google Sheets
- **Regularização Histórica**: Cadastro de solicitações passadas com rastreamento de origem
- **Auditoria Completa**: Registro imutável de todas as ações do sistema
- **Relatórios**: Exportação de dados em CSV e dashboards executivos

## 🚀 Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui (sistema de design tokens)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, pg_cron)
- **Integrações**: Slack API, Google Sheets API, Resend (Email), Figma OAuth

## 📅 Tipos de Ausência Suportados

### Férias
- **Cálculo automático de saldo**: 30 dias por ano baseado na data de contrato
- **Modelos de contrato flexíveis**:
  - `CLT`: CLT padrão sem abono pecuniário
  - `CLT_ABONO_LIVRE`: Permite venda de 1 a 10 dias de férias
  - `CLT_ABONO_FIXO`: Permite venda de 0 ou 10 dias (valor fixo)
  - `PJ`: Pessoa Jurídica (não aplicável a férias CLT)
- **Validação de períodos**: Verificação de saldo disponível e conflitos
- **Aniversário de contrato**: Rastreamento automático de acúmulo anual

### Day Off
- **1 dia por ano**: Vinculado à data de aniversário do colaborador
- **Período de uso**: Pode ser solicitado após o aniversário até a véspera do próximo
- **Validação automática**: Sistema verifica se já foi utilizado no ano vigente
- **Requisito**: Data de nascimento cadastrada no perfil

### Licença Maternidade
- **Duração base**: 120 dias (CLT)
- **Extensão contratual opcional**: Até 60 dias adicionais (configurável por colaborador)
- **Cálculo automático**: Data prevista de parto determina período
- **Validação de início**: Permitido até 28 dias antes da data prevista do parto
- **Restrição**: Válida apenas para contratos CLT

### Licença Médica (Administrativa)
- **Registro por gestores/diretores**: Não solicitada por colaboradores
- **Sistema de alertas**: Notifica sobre impacto na capacidade da equipe
- **Criação automática de request**: Gera registro histórico vinculado
- **Status ativo/encerrada**: Controle do período de afastamento
- **Monitoramento de time**: Alertas quando múltiplas pessoas do mesmo time estão afastadas

## 👥 Gestão de Recursos Humanos (Diretores/Admins)

### Saldos de Férias
- **Visualização consolidada**: Todos os colaboradores com dados de contrato e saldo
- **Edição manual de saldos**: 
  - Sobrescreve cálculo automático
  - Requer justificativa obrigatória
  - Registra autor e data da alteração
- **Recálculo em massa**:
  - Recalcula automaticamente baseado em data de contrato e requests
  - Atualiza saldos manuais existentes
  - Justificativa obrigatória e auditoria completa
- **Filtros avançados**: Por tipo de contrato, nome, cargo, time
- **Exportação CSV**: Relatório completo de saldos
- **Estatísticas**:
  - Total de colaboradores
  - Colaboradores sem data de contrato
  - Férias acumuladas (>30 dias)
  - Saldos negativos
  - Distribuição por tipo de contrato

### Licenças Médicas
- **Cadastro de licenças**: Formulário para registro de afastamentos
- **Monitoramento de ausências ativas**: Lista de licenças em andamento
- **Alertas de capacidade da equipe**:
  - Detecta quando múltiplas pessoas do mesmo time estão afastadas
  - Notificação automática para diretores
  - Status de alerta (ATIVO/RESOLVIDO)

### Regularização Histórica
- **Cadastro de solicitações passadas**:
  - Registro de requests processados por outros canais
  - Preservação da data de criação original
  - Campo de canal de origem (Slack, Email, Presencial, etc.)
  - Observações administrativas
- **Impacto em saldos**: Regularizações afetam cálculo de saldos de férias
- **Auditoria**: Todas as regularizações são registradas com autor e justificativa

## 👤 Cadastro de Colaboradores com Aprovação Hierárquica

Sistema completo para onboarding de novos colaboradores com processo de aprovação em dois níveis, garantindo validação e auditoria antes da ativação no sistema.

### Fluxo de Cadastro

#### 1. Criação por Gestores
- **Acesso**: Gestores podem criar cadastros de novos colaboradores através da página Admin
- **Formulário completo**:
  - Dados pessoais: Nome, Email, Data de nascimento
  - Dados contratuais: Data de contrato, Modelo de contrato (CLT, CLT_ABONO_LIVRE, CLT_ABONO_FIXO, PJ)
  - Dados organizacionais: Cargo, Local, Sub-time, Papel (Colaborador/Gestor)
  - Vinculação hierárquica: Gestor direto do novo colaborador
- **Validações automáticas**:
  - Email único no sistema
  - Campos obrigatórios preenchidos
  - Gestor direto válido e ativo
- **Status inicial**: `PENDENTE`
- **Registro de auditoria**: Criador e timestamp preservados

#### 2. Aprovação por Diretores
- **Visualização centralizada**: Lista de todos os cadastros pendentes com:
  - Informações completas do colaborador
  - Nome do gestor que criou o cadastro
  - Data de criação
  - Status atual
- **Ações disponíveis**:
  - ✅ **Aprovar**: Cria o colaborador no sistema e envia convite de acesso
  - ❌ **Rejeitar**: Rejeita com motivo obrigatório
  - 📝 **Adicionar notas**: Campo para observações do diretor
- **Validação pré-aprovação**:
  - Verifica se email já existe no sistema
  - Valida se gestor direto ainda está ativo
  - Confirma integridade dos dados
- **Processo de aprovação**:
  - Cria registro na tabela `people`
  - Convida usuário para criar conta via Supabase Auth
  - Atualiza status para `APROVADO`
  - Registra reviewer e timestamp
- **Processo de rejeição**:
  - Atualiza status para `REJEITADO`
  - Requer motivo da rejeição
  - Registra reviewer e timestamp
  - Mantém histórico para auditoria

### Componentes do Sistema

#### Interface de Gestores (`Admin.tsx`)
- **Botão "Novo Colaborador"**: Abre formulário de cadastro
- **Badge de contador**: Exibe número de cadastros pendentes de aprovação (para diretores)
- **Formulário `NewCollaboratorForm`**: 
  - Campos organizados e validados
  - Seleção de gestor direto da lista de gestores ativos
  - Feedback visual de sucesso/erro

#### Interface de Diretores
- **Botão "Aprovar Cadastros"**: Acesso à lista de pendências
- **Lista `PendingCollaboratorsList`**: 
  - Grid responsivo com cards de colaboradores
  - Filtros e busca (futuro)
  - Contador de pendências
- **Cards `PendingCollaboratorCard`**: 
  - Visualização clara de todas as informações
  - Status badge (Pendente/Aprovado/Rejeitado)
  - Botões de ação contextuais
- **Diálogo `ApprovePendingCollaboratorDialog`**: 
  - Revisão detalhada antes da decisão
  - Campo de notas do diretor
  - Confirmação em duas etapas

### Benefícios do Sistema

1. **Controle e Governança**:
   - Aprovação obrigatória de diretores antes de criar novos acessos
   - Rastreabilidade completa do processo de onboarding
   - Validação de dados em múltiplas camadas

2. **Distribuição de Responsabilidades**:
   - Gestores podem iniciar o cadastro de sua equipe
   - Diretores mantêm controle final sobre headcount
   - Separação clara de permissões

3. **Auditoria Completa**:
   - Histórico de quem criou, quando e por quê
   - Registro de aprovações e rejeições
   - Motivos de rejeição preservados

4. **Experiência do Usuário**:
   - Processo guiado passo a passo
   - Feedback claro em cada etapa
   - Notificações de status (futuro)

5. **Segurança**:
   - Emails únicos no sistema
   - Validação de hierarquia organizacional
   - Prevenção de cadastros duplicados
   - Row Level Security (RLS) na camada de banco

## 📱 Funcionalidades por Perfil

### Colaboradores
- ✅ Criar solicitações de férias, day off, licença maternidade
- ✅ Salvar rascunhos de solicitações
- ✅ Editar rascunhos e solicitações pendentes
- ✅ Visualizar histórico completo de solicitações
- ✅ Acompanhar status em tempo real
- ✅ Receber notificações via email sobre aprovações/rejeições
- ✅ Ver saldo de férias disponível
- ✅ Visualizar calendário com períodos aprovados
- ✅ Excluir rascunhos e solicitações não aprovadas
- ✅ Ver timeline de aprovações de cada solicitação
- ✅ Editar perfil (nome, email, data de nascimento)
- ✅ Configurar data de contrato (primeira vez)

### Gestores
- ✅ Aprovar/reprovar solicitações da equipe direta
- ✅ Solicitar informações adicionais
- ✅ Ver dashboard da equipe com filtros
- ✅ Receber notificações via email e Slack
- ✅ Exportar relatórios da equipe em CSV
- ✅ Editar/excluir solicitações da equipe (com justificativa obrigatória)
- ✅ Ver alertas de conflitos de ausências no time
- ✅ Acessar inbox com solicitações pendentes
- ✅ Criar cadastros de novos colaboradores
- ✅ Visualizar status dos cadastros criados

### Diretores/Admins
- ✅ Aprovação final de todas as solicitações
- ✅ Visão geral de toda a organização
- ✅ Gestão completa de saldos de férias:
  - Visualização de todos os colaboradores
  - Edição manual de saldos
  - Recálculo em massa
  - Restauração de cálculo automático
- ✅ Cadastro e gestão de licenças médicas
- ✅ Dashboard executivo com métricas:
  - Ausências ativas por tipo
  - Capacidade de times
  - Férias aprovadas por período
  - Estatísticas de RH
- ✅ Regularização histórica de solicitações
- ✅ Sincronização com Google Sheets:
  - Importação de colaboradores
  - Exportação de requests e saldos
- ✅ Administração de usuários (CRUD completo)
- ✅ Aprovação de cadastros de novos colaboradores:
  - Visualização de todos os cadastros pendentes
  - Aprovar ou rejeitar com motivo
  - Adicionar notas administrativas
- ✅ Gestão de configurações do sistema
- ✅ Acesso a logs de auditoria
- ✅ Auto-aprovação de solicitações próprias
- ✅ Exclusão administrativa com justificativa

## 🤖 Automação e Jobs Automáticos

### Atualização Automática de Status
- **Job diário (00:01 UTC)**: Atualiza status de `APROVADO_FINAL` → `REALIZADO` para requests com data de fim passada
- **Execução via pg_cron**: Totalmente automatizado no banco de dados

### Lembretes Automáticos
- **Lembrete diário (09:00 UTC, Seg-Sex)**: 
  - Envia email para gestores com solicitações pendentes há mais de 3 dias
  - Lista completa de requests aguardando análise
  - Link direto para inbox
  
- **Lembrete semanal (10:00 UTC, Segunda-feira)**:
  - Envia email para diretores com resumo semanal
  - Todas as solicitações aguardando aprovação final
  - Estatísticas consolidadas

### Alertas Mensais de Férias
- **Job mensal (08:00 UTC, dia 1)**:
  - Identifica colaboradores com saldo negativo
  - Detecta férias acumuladas (>30 dias)
  - Envia alertas para gestores por time
  - Recomendações de ação

### Edge Function: send-scheduled-reminders
- **Tipos suportados**:
  - `DAILY_PENDING`: Lembretes diários para gestores
  - `WEEKLY_DIRECTOR`: Resumo semanal para diretores
  - `MONTHLY_VACATION_ALERTS`: Alertas mensais de saldos
- **Agrupamento inteligente**: Agrupa requests por gestor/diretor
- **Templates personalizados**: HTML responsivo com links de ação
- **Log de auditoria**: Todas as notificações são registradas

## 🔔 Notificações e Integrações

### Email (Resend) ✅ Implementado
- **Notificações de novas solicitações**:
  - Enviadas ao gestor direto
  - Inclui detalhes completos do request
  - Link para aprovação
  
- **Alertas de aprovação/rejeição**:
  - Notifica colaborador sobre decisões
  - Inclui nome do aprovador e comentários
  - Próximos passos claros
  
- **Pedidos de informações adicionais**:
  - Notifica colaborador quando gestor solicita mais informações
  - Inclui comentário do gestor
  - Link para edição do request

- **Templates HTML**: Design responsivo e profissional

### Autenticação ✅ Implementado
- **Email/Senha**: Via Supabase Auth
- **OAuth com Figma**: Autenticação social
- **Setup de perfil pós-login**: Vinculação com registro de pessoa
- **Edição de dados pessoais**: Nome, email, data de nascimento
- **Configuração de contrato**: Data e modelo (primeira vez)
- **Row Level Security (RLS)**: Políticas de acesso granular
- **Proteção de rotas**: Componente `ProtectedRoute` para áreas restritas

### Slack ✅ Implementado
- **Notificações em tempo real**:
  - Novas solicitações enviadas ao canal/DM do aprovador
  - Aprovações/rejeições notificam o colaborador
  - Solicitações de informações adicionais
  
- **Botões interativos (Block Kit)**:
  - ✅ Aprovar
  - ❌ Rejeitar
  - 📋 Solicitar Info
  - Interação direta na mensagem sem sair do Slack
  
- **Edge Functions**:
  - `slack-notification`: Envia notificações com blocos interativos
  - `slack-interactions`: Processa callbacks de botões
  - Validação de assinatura (SLACK_SIGNING_SECRET)
  - Atualização de mensagens após ação
  
- **Configuração necessária**:
  1. Criar Slack App em https://api.slack.com/apps
  2. Habilitar scopes: `chat:write`, `chat:write.public`, `users:read`, `users:read.email`, `im:write`
  3. Configurar Interactive Components URL: `https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/slack-interactions`
  4. Obter `SLACK_BOT_TOKEN` e `SLACK_SIGNING_SECRET`
   5. Configurar secrets no Supabase

- **Recuperação de senha via Slack DM**:
  - Administradores podem enviar link de reset de senha via Slack DM
  - Opções: Email, Slack ou Ambos
  - Scope necessário: `im:write` (para abrir canal DM)
  - Lookup de usuário por nome via `users:read` e `users:read.email`

### Google Sheets ✅ Implementado
- **Sincronização bidirecional**:
  - **Importação**: Lê aba "Colaboradores" e atualiza banco de dados
  - **Exportação**: Escreve em abas "Requests_Export" e "Saldos_Ferias"
  
- **Edge Functions**:
  - `sheets-import`: Importa colaboradores (INSERT/UPDATE)
  - `sheets-export`: Exporta requests e saldos de férias
  - Autenticação via Google Service Account
  
- **Estrutura da Planilha**:
  - **Aba "Colaboradores"** (Importação):
    - Colunas: ID | Nome | Email | Cargo | Sub-Time | Papel | Data Nascimento | Data Contrato | Modelo Contrato | Ativo
    - UPSERT baseado no ID
    
  - **Aba "Requests_Export"** (Exportação):
    - Colunas: Request ID | Colaborador | Tipo | Início | Fim | Status | Criado em
    - Limites: últimos 1000 requests
    
  - **Aba "Saldos_Ferias"** (Exportação):
    - Colunas: Colaborador | Ano | Dias Acumulados | Dias Usados | Saldo | Aniversário Contrato
    - Cálculo em tempo real via `recalculate_vacation_balance()`
  
- **Componente UI**: `SheetsSync.tsx`
  - Nova aba em `/vacation-management`
  - Botões manuais para importação/exportação
  - Exibição de logs de sincronização
  - Tratamento de erros com detalhes
  
- **Webhook opcional**: Google Apps Script para sincronização automática ao editar planilha
  
- **Configuração necessária**:
  1. Criar projeto no Google Cloud Console
  2. Habilitar Google Sheets API
  3. Criar Service Account e baixar JSON key
  4. Compartilhar planilha com email da Service Account
  5. Configurar secrets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`

## 🔒 Auditoria e Segurança

### Sistema de Auditoria
- **Tabela `audit_logs`**: Log imutável de todas as ações
- **Campos rastreados**:
  - Entidade e ID da entidade afetada
  - Ação realizada (CREATE, UPDATE, DELETE, APPROVAL, etc.)
  - Ator (person_id do usuário)
  - Payload (JSON com dados antigos e novos)
  - Timestamp automático
- **Eventos auditados**:
  - Criação, edição e exclusão de requests
  - Aprovações e rejeições
  - Alterações em dados de pessoas
  - Edições manuais de saldos de férias
  - Recálculos em massa
  - Importações do Google Sheets
  - Exclusões administrativas

### Permissões (RLS - Row Level Security)
- **Colaboradores**: 
  - Acesso apenas aos próprios dados e requests
  - Edição de rascunhos próprios
  - Visualização de saldo de férias pessoal
  
- **Gestores**: 
  - Visualização de dados da equipe direta
  - Aprovação/rejeição de requests da equipe
  - Edição/exclusão de requests da equipe (com justificativa)
  
- **Diretores/Admins**: 
  - Acesso total ao sistema
  - Gestão de todos os requests
  - Administração de colaboradores
  - Visualização de logs de auditoria
  - Gestão de saldos de férias
  
- **Políticas SQL**: Implementadas diretamente no Supabase
- **Segurança em Edge Functions**: Validação de JWT e permissões
- **Secrets Management**: Chaves de API armazenadas no Supabase Secrets

### Exclusões Controladas
- **Exclusão própria**: 
  - Colaboradores podem excluir apenas rascunhos
  - Sem necessidade de justificativa
  
- **Exclusão administrativa**:
  - Gestores/diretores podem excluir requests da equipe
  - **Justificativa obrigatória** em campo de texto
  - Diálogo de confirmação com detalhes do request
  - Registro completo em `audit_logs`
  - Inclui informações do request, justificativa e autor da exclusão
  
- **Componente `DeletionDialog`**:
  - Título específico para exclusões administrativas
  - Campo de justificativa condicional
  - Mensagem de aviso clara
  - Confirmação em duas etapas

## 🗺️ Páginas e Rotas

### Públicas
- `/auth` - Login e cadastro (email/senha e OAuth Figma)

### Colaborador (Autenticado)
- `/` - Dashboard pessoal com resumo de solicitações e saldo
- `/new-request` - Criar nova solicitação de ausência
- `/requests/:id` - Detalhes da solicitação com timeline
- `/requests/:id/edit` - Editar solicitação (rascunhos e pendentes)
- `/settings` - Configurações de perfil e tema

### Gestor/Diretor (Hierárquico)
- `/inbox` - Caixa de aprovações com filtros
- `/vacation-management` - Gestão de RH (6 abas):
  1. **Saldos de Férias**: Visualização, edição manual, recálculo em massa
  2. **Licenças Médicas**: Cadastro e lista de licenças ativas
  3. **Ausências Ativas**: Dashboard de ausências por tipo
  4. **Dashboard Executivo**: Métricas e capacidade de times
  5. **Regularização**: Cadastro de solicitações históricas
  6. **Google Sheets**: Sincronização de dados

### Admin (Restrito)
- `/admin` - Administração de usuários com CRUD completo

## 🔄 Fluxos de Trabalho

### Fluxo de Solicitação Normal
1. **Colaborador** cria solicitação
   - Sistema valida saldo e conflitos
   - Status inicial: `PENDENTE` ou `EM_ANALISE_GESTOR`
   
2. **Sistema** envia notificações
   - Email ao gestor direto
   - Mensagem no Slack com botões interativos
   
3. **Gestor** analisa e decide
   - Aprovar → Status: `AGUARDANDO_DIRETOR` ou `EM_ANALISE_DIRETOR`
   - Rejeitar → Status: `REJEITADO`
   - Pedir Info → Status: `INFORMACOES_ADICIONAIS`
   - Registro em `approvals`
   
4. **Diretor** aprova (se necessário)
   - Aprovar → Status: `APROVADO_FINAL`
   - Rejeitar → Status: `REJEITADO`
   
5. **Sistema** marca como realizado
   - Job automático (diário)
   - Quando `fim < hoje` → Status: `REALIZADO`

### Fluxo de Solicitação com Auto-Aprovação
1. **Diretor** cria solicitação
2. **Sistema** aprova automaticamente
   - Status: `APROVADO_FINAL` (imediato)
   - Cria registro em `approvals` com level: `AUTO_APROVACAO`
   - Sem necessidade de aprovação hierárquica

### Fluxo de Licença Médica
1. **Gestor/Diretor** cadastra licença médica
2. **Sistema** cria alerta de capacidade (se aplicável)
   - Verifica outras licenças ativas no mesmo time
   - Cria registro em `team_capacity_alerts`
   - Notifica diretor se múltiplas ausências
3. **Sistema** cria request automático
   - Tipo: `LICENCA_MEDICA`
   - Status: `REALIZADO` ou `APROVADO_FINAL`
   - Vinculado à licença médica

### Fluxo de Regularização Histórica
1. **Admin/Diretor** acessa aba de Regularização
2. **Preenche formulário** com dados históricos
   - Canal original (Slack, Email, Presencial, etc.)
   - Data de criação original
   - Observações administrativas
3. **Sistema** cria request histórico
   - Flag `is_historical = true`
   - `original_created_at` preservada
   - Status apropriado (geralmente `REALIZADO`)
4. **Impacto em saldos**: Request afeta cálculo de férias

## 📝 Estados de Solicitação

| Status | Descrição | Quem vê | Ações disponíveis |
|--------|-----------|---------|-------------------|
| `RASCUNHO` | Salvo mas não enviado | Colaborador | Editar, Excluir, Enviar |
| `PENDENTE` | Criada mas aguardando análise | Todos | Aguardar |
| `EM_ANALISE_GESTOR` | Aguardando aprovação do gestor | Gestor, Diretor | Aprovar, Rejeitar, Pedir Info |
| `AGUARDANDO_GESTOR` | Alias para EM_ANALISE_GESTOR | Gestor, Diretor | Aprovar, Rejeitar, Pedir Info |
| `APROVADO_1NIVEL` | Aprovado pelo gestor (legado) | Todos | Aguardar diretor |
| `EM_ANALISE_DIRETOR` | Aguardando aprovação do diretor | Diretor | Aprovar, Rejeitar |
| `AGUARDANDO_DIRETOR` | Alias para EM_ANALISE_DIRETOR | Diretor | Aprovar, Rejeitar |
| `APROVADO_FINAL` | Aprovado e confirmado | Todos | Aguardar realização |
| `REJEITADO` | Rejeitado por gestor/diretor | Todos | Ver motivo |
| `REPROVADO` | Alias para REJEITADO | Todos | Ver motivo |
| `CANCELADO` | Cancelado pelo solicitante/gestor | Todos | Arquivado |
| `REALIZADO` | Período já ocorreu | Todos | Arquivado |
| `INFORMACOES_ADICIONAIS` | Gestor solicitou mais informações | Colaborador | Editar, Enviar |

## 🛠️ Setup e Desenvolvimento

### Pré-requisitos
- Node.js 18+
- Conta Supabase (para backend)
- Conta Slack (para notificações - opcional)
- Conta Google Cloud (para Sheets - opcional)

### Instalação

1. **Clone o repositório**:
```bash
git clone <repo-url>
cd controle-ferias
```

2. **Instale as dependências**:
```bash
npm install
```

3. **Configure o Supabase**:
   - Acesse o projeto no Lovable
   - Clique no botão "Supabase" no canto superior direito
   - Conecte sua conta Supabase
   - As tabelas e funções serão criadas automaticamente via migrations

4. **Configure os Secrets no Supabase** (Dashboard → Settings → Edge Functions):
   
   **Email (Obrigatório)**:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   ```
   
   **Slack (Opcional)**:
   ```
   SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxx
   SLACK_SIGNING_SECRET=xxxxxxxxxxxxx
   SLACK_CHANNEL_APPROVALS=C0XXXXXXXXX
   ```
   
   **Google Sheets (Opcional)**:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   GOOGLE_SHEET_ID=1BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxE
   ```

5. **Execute o projeto**:
```bash
npm run dev
```

### Configuração de Integrações (Opcional)

#### Slack
1. Acesse https://api.slack.com/apps e crie um app
2. Habilite scopes em "OAuth & Permissions":
   - `chat:write`
   - `chat:write.public`
   - `users:read`
   - `users:read.email`
3. Configure "Interactive Components":
   - Request URL: `https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/slack-interactions`
4. Instale o app no workspace
5. Copie o Bot Token e Signing Secret para os Secrets do Supabase

#### Google Sheets
1. Acesse https://console.cloud.google.com/
2. Crie ou selecione um projeto
3. Habilite a "Google Sheets API"
4. Crie uma Service Account em "IAM & Admin"
5. Gere uma chave JSON para a Service Account
6. Compartilhe sua planilha com o email da Service Account (permissão de editor)
7. Copie os dados do JSON para os Secrets do Supabase
8. Copie o ID da planilha (URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`)

#### Resend
1. Acesse https://resend.com e crie uma conta
2. Valide seu domínio em "Domains" (necessário para produção)
3. Crie uma API Key em "API Keys"
4. Adicione a chave ao Secret `RESEND_API_KEY` no Supabase

## 📈 Métricas e Dashboards

### Dashboard Pessoal
- Saldo de férias disponível
- Próximas ausências aprovadas
- Solicitações pendentes
- Day off disponível

### Dashboard de Gestor
- Solicitações da equipe pendentes
- Calendário da equipe
- Saldo de férias da equipe
- Alertas de conflitos

### Dashboard Executivo
- **Ausências Ativas**:
  - Total por tipo (férias, day off, licenças)
  - Gráfico de distribuição
  - Lista detalhada com colaborador e período
  
- **Capacidade de Times**:
  - Alertas ativos por time
  - Quantidade de pessoas afastadas
  - Período de impacto
  - Status de resolução
  
- **Férias Aprovadas**:
  - Visualização por período (mês/trimestre/ano)
  - Gráfico de linha temporal
  - Filtros por time, cargo
  
- **Estatísticas de RH**:
  - Total de colaboradores
  - Colaboradores sem data de contrato
  - Férias acumuladas (>30 dias)
  - Saldo médio de férias
  - Distribuição por tipo de contrato

### Relatórios CSV
- Saldos de férias de todos os colaboradores
- Histórico de solicitações por período
- Aprovações por aprovador
- Licenças médicas ativas

## 🚀 Próximas Melhorias Potenciais

1. **Mobile**: 
   - App nativo iOS/Android
   - Progressive Web App (PWA)
   - Notificações push

2. **Analytics**:
   - Dashboard de métricas de uso
   - Tempo médio de aprovação
   - Taxa de aprovação por gestor
   - Tendências de ausências

3. **Integrações Adicionais**:
   - Microsoft Teams
   - Discord
   - WhatsApp Business
   - Integração com HRIS

4. **Funcionalidades Avançadas**:
   - Planejamento de férias em grupo
   - Sugestão automática de datas
   - ML para prever conflitos
   - Gráficos de calor de ausências
   - Exportação para iCal/Google Calendar

5. **Automação**:
   - Lembretes de vencimento de férias
   - Sugestão de uso de day off
   - Alerta de saldo negativo
   - Notificação de aniversariantes

## 📄 Licença

Este projeto é privado, pessoal e destinado ao uso interno do time.
Para mais informações, entre em contato com raul@1ogro.com.

---

**Status**: ✅ Produção - Sistema completo e funcional  
**Última atualização**: Abril 2026  
**Versão**: 2.1  
**Supabase Project ID**: uhphxyhffpbnmsrlggbe
