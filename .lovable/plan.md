## Plano

1. **Corrigir o dado da Denilda**
   - Hoje o cadastro dela está como `1996-07-24`; como o aniversário correto é dia 25, atualizar `people.data_nascimento` para `1996-07-25`.
   - Registrar a correção em `audit_logs` para rastreabilidade.

2. **Blindar o job diário contra erro de fuso/data**
   - Ajustar `send-daily-anniversaries` para comparar mês/dia de aniversário via SQL no fuso `America/Sao_Paulo`, em vez de depender de parsing manual no runtime.
   - Manter a idempotência por data local (`entidade_id = YYYY-MM-DD`).

3. **Blindar o digest mensal**
   - Aplicar a mesma lógica segura em `send-birthday-digest`, garantindo que a lista do mês e o status “já passou/ainda este mês” sejam calculados pela data local correta.

4. **Validar antes de concluir**
   - Fazer dry-run para `2026-07-24`: Denilda não deve aparecer como aniversariante do dia.
   - Fazer dry-run para `2026-07-25`: Denilda deve aparecer.
   - Conferir logs/retorno das Edge Functions após deploy.