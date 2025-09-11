# Sistema de Controle de Férias & Day Off

Um sistema completo para gerenciamento de férias e days off de equipes, com fluxo de aprovação em 2 níveis e integração com Slack.

## ✨ Recursos Principais

- **Dashboard Intuitivo**: Visão geral de solicitações, estatísticas e próximos períodos
- **Fluxo de Aprovação**: Sistema de 2 níveis (Gestor → Diretor)
- **Detecção de Conflitos**: Identificação automática de sobreposições de ausências
- **Notificações**: Integração com Slack para notificações em tempo real
- **Relatórios**: Exportação de dados em CSV
- **Sincronização**: Integração com Google Sheets para dados de colaboradores

## 🚀 Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Integrações**: Slack API, Google Sheets API

## 📱 Funcionalidades

### Para Colaboradores
- ✅ Criar solicitações de férias e day off
- ✅ Visualizar histórico e status de solicitações
- ✅ Receber notificações de aprovação/reprovação
- ✅ Ver calendário com períodos aprovados

### Para Gestores
- ✅ Aprovar/reprovar solicitações da equipe
- ✅ Dashboard de equipe com filtros
- ✅ Exportação de relatórios em CSV
- ✅ Notificações via Slack

### Para Diretores
- ✅ Aprovação final de solicitações
- ✅ Visão geral de toda a organização
- ✅ Relatórios executivos

## 🛠️ Setup e Desenvolvimento

### Pré-requisitos
- Node.js 18+
- Conta Supabase (para backend)
- Slack App (para notificações)

### Instalação

1. Clone o repositório:
```bash
git clone <repo-url>
cd controle-ferias
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o Supabase:
   - Acesse o projeto no Lovable
   - Clique no botão "Supabase" no canto superior direito
   - Conecte sua conta Supabase
   - Configure as tabelas necessárias (veja `database-schema.sql`)

4. Configure as integrações:
```bash
# Variáveis de ambiente (configurar no Supabase Dashboard)
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret
SHEETS_API_KEY=your-key
```

5. Execute o projeto:
```bash
npm run dev
```

## 📊 Estrutura do Banco de Dados

### Tabelas Principais
- `persons` - Colaboradores e hierarquia
- `requests` - Solicitações de férias/day off
- `approvals` - Histórico de aprovações
- `audit_logs` - Log de auditoria

## 🔄 Fluxos de Trabalho

### Fluxo de Solicitação
1. **Colaborador** cria solicitação → Status: `PENDENTE`
2. **Sistema** verifica conflitos e notifica gestor
3. **Gestor** aprova → Status: `APROVADO_1NIVEL`
4. **Diretor** aprova → Status: `APROVADO_FINAL`
5. **Sistema** marca como `REALIZADO` automaticamente

### Estados Possíveis
- `PENDENTE` - Aguardando análise do gestor
- `EM_ANALISE_GESTOR` - Em análise pelo gestor direto
- `APROVADO_1NIVEL` - Aprovado pelo gestor, aguardando diretor
- `EM_ANALISE_DIRETOR` - Em análise pela diretoria
- `APROVADO_FINAL` - Aprovado e confirmado
- `REPROVADO` - Rejeitado
- `CANCELADO` - Cancelado pelo solicitante/gestor
- `REALIZADO` - Período já ocorreu

## 🔧 Integrações

### Slack
- Notificações em tempo real
- Botões interativos para aprovação
- Lembretes automáticos

### Google Sheets
- Sincronização de dados de colaboradores
- Webhook para atualizações em tempo real
- Backup automático via polling

## 📈 Próximos Passos

Após conectar ao Supabase, você poderá implementar:

1. **Autenticação**: Sistema de login/logout
2. **Edge Functions**: APIs para Slack e Google Sheets
3. **Jobs Automáticos**: Lembretes e atualizações de status
4. **Relatórios Avançados**: Dashboard executivo
5. **Mobile**: App nativo ou PWA

## 📄 Licença

Este projeto é privado e destinado ao uso interno da empresa.

---

**Status**: 🚧 Em desenvolvimento - Versão demo funcional
**Última atualização**: Novembro 2024