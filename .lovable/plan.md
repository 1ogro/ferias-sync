

## Plan: Mostrar data do último convite na coluna Auth

### O que muda
Na coluna "Auth" da tabela Admin, além do badge "✓ Sim" / "✗ Não", mostrar a data do último convite enviado (se houver) buscando do `audit_logs` com ação `ADMIN_SEND_INVITE`.

### Implementação

#### `src/pages/Admin.tsx`
1. **Novo estado**: `inviteDates` — `Map<string, string>` mapeando `person_id` → data formatada do último convite
2. **No `fetchPeople`**: Adicionar query ao `audit_logs` filtrando `acao = 'ADMIN_SEND_INVITE'`, ordenando por `created_at` desc. Agrupar por `entidade_id` (person_id) pegando a data mais recente de cada um
3. **Na célula Auth** (linhas ~803-808): Abaixo do badge existente, renderizar em texto pequeno (`text-xs text-muted-foreground`) a data do último convite, ex: "Convite: 14/03/2026"

### Arquivos
| Arquivo | Ação |
|---------|------|
| `src/pages/Admin.tsx` | Modificar — buscar datas de convite e exibir na coluna Auth |

