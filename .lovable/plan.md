

## Plan: Adicionar confirmação antes de enviar convite

### O que muda
Adicionar um `AlertDialog` de confirmação para o botão "Enviar Convite", seguindo o mesmo padrão do dialog de "Zerar Autenticação" (`clearAuthTarget`).

### Implementação em `src/pages/Admin.tsx`

1. **Novo estado**: `const [inviteTarget, setInviteTarget] = useState<Person | null>(null);`

2. **Botão Mail**: Trocar `onClick={() => handleAdminAuthAction(..., 'send_invite')}` por `onClick={() => setInviteTarget(targetPerson)}`

3. **Novo AlertDialog** (junto ao dialog de clearAuth, ~linha 1192):
   - Título: "Enviar Convite de Conta"
   - Descrição: "Tem certeza que deseja enviar um convite de criação de conta para **{nome}** ({email})? Um email será enviado com instruções para criar a senha."
   - Botão confirmar chama `handleAdminAuthAction(inviteTarget.id, 'send_invite')` e limpa o state
   - Botão cancelar fecha o dialog

### Arquivos
| Arquivo | Ação |
|---------|------|
| `src/pages/Admin.tsx` | Modificar — adicionar state + dialog de confirmação |

