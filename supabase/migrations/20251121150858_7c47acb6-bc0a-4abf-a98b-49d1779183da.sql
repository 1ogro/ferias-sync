-- Atualizar função para adicionar logs de auditoria
CREATE OR REPLACE FUNCTION public.auto_link_figma_user()
RETURNS TRIGGER AS $$
DECLARE
  matching_person_id TEXT;
  created_profile_id UUID;
BEGIN
  -- Apenas processar se for provider 'figma'
  IF NEW.raw_app_meta_data->>'provider' = 'figma' THEN
    
    -- Buscar pessoa com email correspondente e ativa
    SELECT id INTO matching_person_id
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
      
      -- Adicionar log de auditoria se perfil foi criado
      IF created_profile_id IS NOT NULL THEN
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
      END IF;
      
      RAISE LOG 'Auto-linked Figma user % to person %', NEW.email, matching_person_id;
    ELSE
      RAISE LOG 'No matching person found for Figma user %', NEW.email;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;