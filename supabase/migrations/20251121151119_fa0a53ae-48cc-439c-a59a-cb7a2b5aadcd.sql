-- Habilitar extensão pg_net se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Atualizar função para enviar email de boas-vindas usando pg_net
CREATE OR REPLACE FUNCTION public.auto_link_figma_user()
RETURNS TRIGGER AS $$
DECLARE
  matching_person_id TEXT;
  created_profile_id UUID;
  person_name TEXT;
  person_email TEXT;
  service_role_key TEXT;
BEGIN
  -- Apenas processar se for provider 'figma'
  IF NEW.raw_app_meta_data->>'provider' = 'figma' THEN
    
    -- Buscar pessoa com email correspondente e ativa
    SELECT id, nome, email INTO matching_person_id, person_name, person_email
    FROM people
    WHERE email = NEW.email
    AND ativo = true
    LIMIT 1;
    
    -- Se encontrou match, criar profile automaticamente
    IF matching_person_id IS NOT NULL THEN
      INSERT INTO profiles (user_id, person_id)
      VALUES (NEW.id, matching_person_id)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING id INTO created_profile_id;
      
      -- Se perfil foi criado com sucesso
      IF created_profile_id IS NOT NULL THEN
        -- Adicionar log de auditoria
        INSERT INTO audit_logs (
          actor_id,
          acao,
          entidade,
          entidade_id,
          payload
        ) VALUES (
          matching_person_id,
          'AUTO_LINK_FIGMA',
          'profiles',
          created_profile_id::text,
          jsonb_build_object(
            'user_id', NEW.id,
            'person_id', matching_person_id,
            'email', NEW.email,
            'provider', 'figma'
          )
        );
        
        -- Buscar service role key do vault (necessário para pg_net)
        SELECT decrypted_secret INTO service_role_key
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
        LIMIT 1;
        
        -- Enviar email de boas-vindas de forma assíncrona via pg_net
        PERFORM net.http_post(
          url := 'https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-figma-welcome-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
          ),
          body := jsonb_build_object(
            'email', person_email,
            'nome', person_name,
            'pessoa_id', matching_person_id
          )
        );
        
        RAISE LOG 'Auto-linked Figma user % to person % and queued welcome email', NEW.email, matching_person_id;
      END IF;
    ELSE
      RAISE LOG 'No matching person found for Figma user %', NEW.email;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;