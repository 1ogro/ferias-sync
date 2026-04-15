

## Fix: "Invalid input syntax" on pending collaborator approval

### Root cause
In `ApprovePendingCollaboratorDialog.tsx`, lines 79-80 send empty strings `""` instead of `null` for date parameters when the original values are `null`:
- `formData.data_contrato` starts as `""` (from `pending.data_contrato || ""`)
- The comparison `"" !== null` is `true`, so `""` is sent to the RPC
- PostgreSQL rejects `""` as invalid date input

The same issue exists for `dia_pagamento` — `parseInt("")` returns `NaN`.

### Fix (single file)

**`src/components/ApprovePendingCollaboratorDialog.tsx`**

Update the RPC call (lines 69-83) to coerce empty strings to `null` for date and integer fields:

```typescript
p_data_contrato: formData.data_contrato && formData.data_contrato !== (pending.data_contrato || "") ? formData.data_contrato : null,
p_data_nascimento: formData.data_nascimento && formData.data_nascimento !== (pending.data_nascimento || "") ? formData.data_nascimento : null,
p_dia_pagamento: formData.dia_pagamento ? parseInt(formData.dia_pagamento) : null,
```

The key change: add a truthiness check (`formData.data_contrato &&`) so empty strings become `null`, and normalize the comparison so both sides use the same fallback.

### Files to change
| File | Change |
|------|--------|
| `src/components/ApprovePendingCollaboratorDialog.tsx` | Fix date/integer params to send `null` instead of `""` |

