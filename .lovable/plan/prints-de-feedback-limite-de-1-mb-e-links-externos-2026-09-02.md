# Prints de feedback: limite de 1 MB e links externos

## O que muda

1. **Limite de upload de 1 MB por arquivo** (hoje 10 MB), tanto na validação da tela quanto no próprio bucket de armazenamento, com mensagem de erro clara.
2. **Links de repositório** (SharePoint, Google Drive, Dropbox, Notion, etc.) passam a ser aceitos como alternativa ao print: no formulário de feedback externo é possível adicionar uma ou mais URLs, com rótulo opcional.
3. Na linha do tempo, cada anexo aparece como print (arquivo) ou como link clicável que abre em nova aba.

## Detalhes técnicos

**Banco**
- Migration em `external_feedback_attachments`: tornar `storage_path` e `mime_type` opcionais, adicionar `external_url text` e `kind text` (`file` | `link`) com default `file`, mais uma checagem de que registro `link` tem URL e registro `file` tem caminho de arquivo.
- Atualizar a função `get_person_feedback_timeline` para devolver `kind` e `external_url` nos anexos.
- Ajustar o bucket `feedback-prints` para limite de 1 MB.

**Frontend**
- `src/hooks/useFeedbacks.ts`: `FeedbackAttachment` ganha `kind` e `external_url`; `CreateExternalFeedbackInput` ganha `links: { url: string; label?: string }[]`, inseridos junto com os uploads.
- `src/components/engagement/ExternalFeedbackDialog.tsx`: `MAX_FILE_BYTES = 1 MB`, textos de ajuda atualizados, novo campo de URL com botão "Adicionar link", validação de URL http/https e lista removível de links.
- `src/components/engagement/FeedbackProfilePanel.tsx`: renderizar anexos do tipo link como âncora externa (ícone de link) e manter o download assinado apenas para arquivos.
