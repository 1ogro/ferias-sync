

## Plano: Tornar cadastros pendentes visíveis no Dashboard e Inbox

### Problema
Cadastros de novos colaboradores submetidos por gestores (`pending_people` com status PENDENTE) só aparecem dentro de um dialog na página Admin, acessível pelo botão "Aprovar Cadastros". O diretor não tem visibilidade desses cadastros no Dashboard principal nem na Inbox, tornando fácil perdê-los.

### Alterações

#### 1. Dashboard (`src/components/Dashboard.tsx`)
- Adicionar fetch de `pending_people` com status PENDENTE (apenas para diretores/admin)
- Exibir card "Cadastros Pendentes" ao lado dos cards existentes, com contagem e badge
- Incluir botão "Ver cadastros" que redireciona para `/admin` ou abre dialog inline

#### 2. Inbox (`src/pages/Inbox.tsx`)
- Adicionar seção/aba "Cadastros Pendentes" para diretores
- Buscar `pending_people` com status PENDENTE
- Renderizar cards usando `PendingCollaboratorCard` existente com ações de aprovar/rejeitar
- Integrar com `ApprovePendingCollaboratorDialog` já existente

#### 3. Header (`src/components/Header.tsx`)
- Adicionar badge de notificação no link da Inbox quando houver cadastros pendentes, para que o diretor veja imediatamente que há itens a revisar

### Arquivos a alterar
| Arquivo | Ação |
|---------|------|
| `src/components/Dashboard.tsx` | Adicionar card de cadastros pendentes para diretores |
| `src/pages/Inbox.tsx` | Adicionar seção de cadastros pendentes com ações |
| `src/components/Header.tsx` | Badge de notificação incluindo cadastros pendentes |

### Notas
- Reutiliza componentes existentes (`PendingCollaboratorCard`, `ApprovePendingCollaboratorDialog`)
- Mantém a funcionalidade existente na página Admin intacta
- Visibilidade restrita a diretores e admins (mesmo controle atual)

