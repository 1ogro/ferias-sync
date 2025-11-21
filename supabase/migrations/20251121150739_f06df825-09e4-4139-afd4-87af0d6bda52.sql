-- Função para auto-vincular usuários do Figma por email
CREATE OR REPLACE FUNCTION public.auto_link_figma_user()
RETURNS TRIGGER AS $$
DECLARE
  matching_person_id TEXT;
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
      ON CONFLICT (user_id) DO NOTHING;
      
      RAISE LOG 'Auto-linked Figma user % to person %', NEW.email, matching_person_id;
    ELSE
      RAISE LOG 'No matching person found for Figma user %', NEW.email;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para executar após INSERT em auth.users
DROP TRIGGER IF EXISTS auto_link_figma_user_trigger ON auth.users;
CREATE TRIGGER auto_link_figma_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_figma_user();