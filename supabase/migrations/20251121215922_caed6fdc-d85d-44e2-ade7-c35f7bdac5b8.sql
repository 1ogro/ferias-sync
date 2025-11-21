-- Adicionar campos para OAuth do Figma na tabela integration_settings
ALTER TABLE integration_settings
ADD COLUMN figma_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN figma_client_id TEXT,
ADD COLUMN figma_client_secret_set BOOLEAN DEFAULT FALSE,
ADD COLUMN figma_redirect_uri TEXT,
ADD COLUMN figma_status TEXT DEFAULT 'not_configured',
ADD COLUMN figma_error_message TEXT,
ADD COLUMN figma_test_date TIMESTAMPTZ;

-- Comentários para documentação
COMMENT ON COLUMN integration_settings.figma_enabled IS 'Se a integração OAuth do Figma está habilitada';
COMMENT ON COLUMN integration_settings.figma_client_id IS 'Client ID do OAuth app do Figma (público)';
COMMENT ON COLUMN integration_settings.figma_client_secret_set IS 'Indica se o Client Secret foi configurado (não armazena o valor)';
COMMENT ON COLUMN integration_settings.figma_redirect_uri IS 'URI de redirect configurado no Figma OAuth';
COMMENT ON COLUMN integration_settings.figma_status IS 'Status da integração: not_configured, configured, active, error';