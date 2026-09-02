# Alterações de dados: gerente edita direto, colaborador e gestor N1 solicitam

## O que está acontecendo hoje (verificado no banco)

- Rachel Lima e Ariel Cardeal têm `gestor_id = pessoa_001`. A Katja (`pessoa_041`) é **GERENTE** do sub-time "Research & Service Design", mas **não é a gestora direta** deles.
- A função que salva contrato (`update_collaborator_onboarding_data`) só autoriza admin, diretor ou **gestor direto** — por isso a Katja recebe "Sem permissão para editar este colaborador".
- A tela de regularização histórica de férias exige `papel === 'DIRETOR'`, e a regra de criação de solicitações no banco só permite criar para si mesmo ou se for diretor.
- A tabela `people` só aceita alteração direta por admin; colaboradores só conseguem preencher dados no fluxo de primeiro cadastro (`complete_own_profile`), que exige perfil incompleto e não serve para correções posteriores.

## O que será feito

### 1. Gerente do sub-time edita direto todo o seu time
- Autorizar o gerente (papel GERENTE, mesmo sub-time, ativo) na função de atualização de dados do colaborador — contrato, modelo, dia de pagamento e nascimento.
- Liberar a página de **Regularização histórica de férias** e a criação dessas solicitações para o gerente, limitada aos liderados do seu sub-time (hoje é só diretor).

### 2. Colaborador
- **Data de nascimento**: passa a ser editável direto pelo próprio colaborador no "Editar Perfil" (já existe o campo; hoje ele falha para quem já completou o cadastro) — com registro em auditoria.
- **Dados contratuais** (data de contrato, modelo CLT/PJ, cargo, sub-time, local): o colaborador abre uma **solicitação de alteração** com justificativa, que só é aplicada após aprovação.

### 3. Gestor N1 solicita alterações para os liderados
- Gestor direto pode abrir solicitação de alteração de dados de qualquer liderado.
- Roteamento da aprovação: **gerente do sub-time** quando existir; caso contrário, **diretor**.
- Gerente e diretor/admin não precisam solicitar: editam direto.

### 4. Central de solicitações de alteração de dados
- Nova aba/seção na Caixa de Entrada listando as solicitações pendentes para o aprovador (gerente vê as do seu sub-time; diretor vê todas).
- Ações: aprovar (aplica a alteração e registra auditoria) ou recusar com motivo.
- O solicitante vê o status e pode cancelar enquanto estiver pendente.
- Notificação por e-mail/Slack ao aprovador na abertura e ao solicitante na decisão, seguindo o padrão já usado na troca de dia de pagamento.

### 5. Saldo de férias / regularização histórica
- Gerente passa a lançar regularização histórica direto para o seu time.
- Gestor N1 e colaborador podem solicitar a regularização pelo mesmo fluxo de aprovação acima (registro do período gozado + justificativa), aplicada só depois do aceite.

## Detalhes técnicos

- Nova tabela `data_change_requests` (person_id, requested_by, campo/valores propostos em `jsonb`, justificativa, status, aprovador, notas, timestamps) espelhando o modelo já existente em `payment_day_change_requests`, com GRANTs e RLS: solicitante vê as suas; aprovador vê as do seu escopo; escrita apenas via funções.
- Funções `security definer`: `request_data_change`, `review_data_change` (aplica em `people` ou cria a solicitação histórica de férias ao aprovar) e `cancel_data_change`, todas gravando em `audit_logs`.
- Ampliar `update_collaborator_onboarding_data` com a checagem `is_team_final_approver_of_person(p_person_id)` (função já existente para gerente do sub-time) e permitir limpar campos quando enviados explicitamente vazios.
- Nova função `update_own_birthdate` (ou ampliação de `update_profile_for_current_user`) para a data de nascimento do próprio usuário.
- Política de criação de `requests` estendida para o gerente do sub-time (regularização histórica); ajuste do gate `papel === 'DIRETOR'` em `HistoricalRequests`/`HistoricalRequestForm` para incluir gerente.
- Frontend: botão de solicitar alteração no perfil do colaborador e na tela de gestão de colaboradores/férias, mais a listagem de aprovações na Caixa de Entrada.
