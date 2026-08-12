# Correção definitiva de novos cadastros e acesso por Slack

## Diagnóstico confirmado

- A conta Auth de **Katja de Aquino Gazzola** existe e foi confirmada em 12/08/2026, mas nunca realizou login.
- O registro dela em `people` está ativo, tem e-mail corporativo, e-mail pessoal e Slack vinculados, porém **não existe o vínculo correspondente em `profiles`**.
- O fallback de cadastro atual cria a conta com confirmação por e-mail e tenta inserir `profiles` no navegador antes de existir uma sessão autenticada. A política de acesso pode recusar essa gravação, mas o erro é apenas registrado no console e o cadastro continua sendo apresentado como bem-sucedido.
- Há atualmente uma conta órfã desse tipo entre os colaboradores ativos: a da Katja.
- Os lembretes de completude enviados ao Slack usam `/complete-profile` sem autenticação. Outros fluxos também misturam URLs comuns, links de convite e magic links.

## Implementação

### 1. Recuperar o acesso da Katja

- Vincular de forma controlada a conta Auth já confirmada da Katja ao registro `pessoa_041` em `profiles`.
- Gerar e enviar por DM um magic link de uso único que autentique a Katja e a direcione para `/complete-profile`.
- Registrar somente o resultado e os identificadores da operação na auditoria, nunca o token ou a URL autenticada.

### 2. Tornar o cadastro atômico

- Remover o cadastro padrão no navegador como fallback para colaboradores conhecidos.
- Concentrar criação da conta, confirmação permitida, vínculo com `people/profiles` e rollback em uma operação server-side.
- Aceitar apenas e-mail corporativo ou pessoal já pertencente ao colaborador selecionado; divergências deixam de criar contas órfãs e passam a orientar correção cadastral pelo administrador.
- Tratar conta Auth preexistente e sem `profiles`: validar a correspondência de e-mail e reparar o vínculo em vez de retornar apenas “e-mail já cadastrado”.
- Fazer o frontend exibir o erro real da operação e só declarar sucesso quando conta e perfil estiverem vinculados.

### 3. Padronizar magic links nas DMs de acesso

- Criar um helper compartilhado para gerar links de login com `hashed_token`, montar uma URL no domínio do app e enviar somente por DM ao Slack vinculado.
- Adicionar uma rota pública de callback que valida `token_hash` com `verifyOtp`, cria a sessão e respeita o destino seguro (`/complete-profile`, `/setup-profile` ou a página inicial).
- Substituir por magic link os CTAs de Slack relacionados a:
  - confirmação de novo cadastro;
  - cadastro aprovado;
  - lembrete de completude do próprio perfil;
  - reenvio administrativo de acesso.
- Manter links administrativos e links enviados a gestores como navegação comum, pois eles autenticam o gestor, não o colaborador destinatário.
- Não registrar tokens, URLs completas nem parâmetros de autenticação em logs ou `audit_logs`.

### 4. Consolidar e prevenir órfãos

- Criar uma verificação server-side reutilizável que detecte conta Auth correspondente ao e-mail corporativo ou pessoal sem vínculo em `profiles`.
- Reparar somente correspondências inequívocas (um usuário Auth para uma pessoa ativa e ainda não vinculada); conflitos devem ser recusados e auditados para revisão administrativa.
- Registrar eventos de criação, reparo, envio e consumo do magic link com estados claros, sem dados secretos.

## Validação

- Cobrir com testes: cadastro por e-mail corporativo, cadastro por e-mail pessoal, conta preexistente órfã, e-mail divergente, pessoa já vinculada, retry e falha no envio ao Slack.
- Testar o magic link recebido por DM sem sessão prévia, incluindo consumo único, expiração e redirecionamento para completude.
- Confirmar em ambiente de teste que nenhum cadastro bem-sucedido fica sem `profiles` antes de aplicar a correção em produção.
- Verificar a Katja em fluxo real: magic link cria sessão, carrega a pessoa correta e abre a completude do perfil sem tela de login ou loop de redirecionamento.
