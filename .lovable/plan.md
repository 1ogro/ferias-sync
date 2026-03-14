

## Plan: Remover restrição de DIRETOR — todos os convites suportam todos os métodos

### Resumo
Atualmente, convites para usuários com papel DIRETOR são forçados para "email". A mudança é simples: remover essa restrição em ambos os lugares.

### Arquivos a modificar

#### 1. `supabase/functions/admin-auth-management/index.ts` (~linha 302-304)
- Remover a checagem `isTargetDirector` e usar diretamente `invite_method || "both"`:
```typescript
const effectiveMethod: string = invite_method || "both";
```

#### 2. `src/pages/Admin.tsx`
- **Linha ~1271**: Remover override de valor para DIRETOR — usar `inviteMethod` diretamente
- **Linha ~1273**: Remover `disabled` condicional
- **Linha ~1292-1297**: Simplificar textos descritivos removendo checagens de DIRETOR
- **Linha ~1307**: Remover override de método — usar `inviteMethod` diretamente

