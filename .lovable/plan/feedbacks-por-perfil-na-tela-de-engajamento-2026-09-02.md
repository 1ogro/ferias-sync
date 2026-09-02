# Feedbacks por perfil na tela de Engajamento

Nova aba "Feedbacks" em `/engagement`, disponível para todos os gestores (N1, gerente, diretor, admin), com visão consolidada por pessoa e registro de feedbacks de stakeholders externos com anexo de prints.

## O que o gestor vê

- Lista das pessoas que ele pode acompanhar:
  - Gestor N1: liderados diretos.
  - Gerente: pessoas do seu sub_time.
  - Diretor/Admin: todos os ativos.
- Ao escolher uma pessoa, um painel de perfil com linha do tempo unificada:
  - Kudos recebidos (mensagem, categoria, autor, data).
  - Respostas de peer review / pulses sobre a pessoa, respeitando o anonimato configurado na enquete (quando anônima, mostra "Par anônimo").
  - Feedbacks externos registrados manualmente, com prints anexados.
- Filtros simples: período (30d / 90d / ano / tudo) e tipo de feedback.

## Registro de feedback externo

Botão "Registrar feedback externo" abre um formulário com:
- Pessoa avaliada (dentro do escopo do gestor).
- Nome e origem do stakeholder (ex.: cliente, área parceira) e canal (Slack, e-mail, reunião, outro).
- Data do feedback, tom (positivo / construtivo / neutro) e texto.
- Upload de um ou mais prints (imagens/PDF), armazenados em bucket privado com URL assinada na hora de visualizar.
- Chave "Visível para o colaborador" — por padrão desligada; quando ligada, o próprio colaborador enxerga aquele registro no seu perfil.

Autor pode editar e excluir os próprios registros; diretor/admin podem excluir qualquer um.

## Detalhes técnicos

**Banco (migração)**
- Tabela `external_feedbacks`: `person_id`, `author_id`, `stakeholder_name`, `stakeholder_org`, `channel`, `feedback_date`, `tone`, `content`, `visible_to_subject` (bool, default false), timestamps + trigger de `updated_at`.
- Tabela `external_feedback_attachments`: `feedback_id`, `storage_path`, `file_name`, `mime_type`, `size_bytes`.
- GRANTs para `authenticated` e `service_role`; RLS habilitada.
- Função `can_view_person_feedback(_person_id text)` (security definer): true para admin/diretor, gerente cujo `sub_time` bate, gestor direto (`gestor_id`), ou o próprio quando o registro é visível.
- Policies: leitura via essa função (mais a regra `visible_to_subject` para o próprio); insert por gestores no escopo; update/delete pelo autor ou admin/diretor.
- Bucket privado `feedback-prints` com policies em `storage.objects` seguindo o mesmo escopo (path prefixado por `person_id`).

**RPC de leitura**
- `get_person_feedback_timeline(p_person_id text, p_since timestamptz)` (security definer): une kudos recebidos, `pulse_responses` com `subject_id` = pessoa (aplicando anonimato via `pulse_surveys.peer_anonymous`) e `external_feedbacks`, retornando tipo, data, autor exibível, texto e categoria/tom. Valida o escopo antes de retornar.
- `get_people_in_my_scope()` (security definer) para alimentar o seletor de pessoas.

**Frontend**
- `src/hooks/useFeedbacks.ts`: hooks de escopo, timeline, criação/edição/exclusão e upload de anexos.
- `src/components/engagement/FeedbackProfilePanel.tsx`: seletor de pessoa + timeline + filtros.
- `src/components/engagement/ExternalFeedbackDialog.tsx`: formulário com upload e preview dos prints.
- `src/pages/Engagement.tsx`: envolve o conteúdo atual em `Tabs` ("Visão geral" | "Feedbacks"), com a aba Feedbacks só para gestores.
