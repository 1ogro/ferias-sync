

## Plan: Indicação visual do método do último convite enviado na tabela Admin

### O que muda
Na coluna Auth da tabela Admin, além da data do convite, mostrar um ícone/badge indicando o método usado (Email, Slack ou Ambos). A informação já está salva no `payload.invite_method` dos audit_logs com ação `ADMIN_SEND_INVITE`.

### Implementação

#### `src/pages/Admin.tsx`

1. **Estado**: Alterar `inviteDates` de `Map<string, string>` para `Map<string, { date: string; method: string }>` para guardar também o método.

2. **Fetch**: Na query de `audit_logs` com `ADMIN_SEND_INVITE`, adicionar `payload` ao select. Extrair `payload.invite_method` ao popular o map.

3. **UI**: Na célula Auth (linhas ~829-833), renderizar junto à data um pequeno indicador visual:
   - `📧 Email` / `💬 Slack` / `📧💬 Ambos`
   - Texto `text-xs text-muted-foreground` ao lado da data do convite

### Arquivos
| Arquivo | Ação |
|---------|------|
| `src/pages/Admin.tsx` | Modificar — buscar método do convite e exibir indicador visual |

