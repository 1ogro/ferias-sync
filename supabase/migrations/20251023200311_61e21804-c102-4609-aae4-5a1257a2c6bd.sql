-- Remover constraint antiga que limita tipos de requests
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_tipo_check;

-- Criar nova constraint que permite todos os tipos de ausência
ALTER TABLE requests ADD CONSTRAINT requests_tipo_check 
CHECK (tipo = ANY (ARRAY[
  'FERIAS'::text, 
  'DAYOFF'::text, 
  'DAY_OFF'::text,
  'LICENCA_MEDICA'::text, 
  'LICENCA_MATERNIDADE'::text
]));

-- FASE 1: Criar alertas de capacidade para licenças médicas ativas sem alerta
INSERT INTO team_capacity_alerts (
  team_id,
  medical_leave_id,
  medical_leave_person_id,
  period_start,
  period_end,
  affected_people_count,
  alert_status
)
SELECT 
  p.sub_time,
  ml.id,
  ml.person_id,
  ml.start_date,
  ml.end_date,
  (
    SELECT COUNT(*)
    FROM medical_leaves ml2
    JOIN people p2 ON ml2.person_id = p2.id
    WHERE ml2.status = 'ATIVA'
      AND ml2.affects_team_capacity = true
      AND p2.sub_time = p.sub_time
      AND ml2.start_date <= ml.end_date
      AND ml2.end_date >= ml.start_date
  ),
  'ACTIVE'
FROM medical_leaves ml
JOIN people p ON ml.person_id = p.id
LEFT JOIN team_capacity_alerts tca ON tca.medical_leave_id = ml.id
WHERE ml.status = 'ATIVA'
  AND ml.affects_team_capacity = true
  AND ml.end_date >= CURRENT_DATE
  AND p.sub_time IS NOT NULL
  AND tca.id IS NULL;

-- FASE 2: Criar requests para licenças médicas ativas sem request
INSERT INTO requests (
  requester_id,
  tipo,
  inicio,
  fim,
  status,
  justificativa,
  is_historical,
  created_at,
  original_created_at
)
SELECT 
  ml.person_id,
  'LICENCA_MEDICA',
  ml.start_date,
  ml.end_date,
  'REALIZADO',
  COALESCE(ml.justification, 'Licença médica'),
  false,
  ml.created_at,
  ml.created_at
FROM medical_leaves ml
LEFT JOIN requests r ON 
  r.requester_id = ml.person_id 
  AND r.tipo = 'LICENCA_MEDICA'
  AND r.inicio = ml.start_date
  AND r.fim = ml.end_date
WHERE ml.status = 'ATIVA'
  AND ml.end_date >= CURRENT_DATE
  AND r.id IS NULL;

-- FASE 3: Criar função e trigger para associações automáticas
CREATE OR REPLACE FUNCTION create_medical_leave_associations()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id TEXT;
  v_affected_count INT;
BEGIN
  SELECT sub_time INTO v_team_id
  FROM people
  WHERE id = NEW.person_id;

  IF v_team_id IS NULL OR NEW.affects_team_capacity = false THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_affected_count
  FROM medical_leaves ml
  JOIN people p ON ml.person_id = p.id
  WHERE ml.status = 'ATIVA'
    AND ml.affects_team_capacity = true
    AND p.sub_time = v_team_id
    AND ml.start_date <= NEW.end_date
    AND ml.end_date >= NEW.start_date;

  INSERT INTO team_capacity_alerts (
    team_id,
    medical_leave_id,
    medical_leave_person_id,
    period_start,
    period_end,
    affected_people_count,
    alert_status
  ) VALUES (
    v_team_id,
    NEW.id,
    NEW.person_id,
    NEW.start_date,
    NEW.end_date,
    v_affected_count,
    'ACTIVE'
  );

  INSERT INTO requests (
    requester_id,
    tipo,
    inicio,
    fim,
    status,
    justificativa,
    is_historical,
    created_at,
    original_created_at
  ) VALUES (
    NEW.person_id,
    'LICENCA_MEDICA',
    NEW.start_date,
    NEW.end_date,
    CASE 
      WHEN NEW.status = 'ATIVA' THEN 'REALIZADO'
      ELSE 'APROVADO_FINAL'
    END,
    COALESCE(NEW.justification, 'Licença médica'),
    false,
    NEW.created_at,
    NEW.created_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_medical_leave_associations ON medical_leaves;
CREATE TRIGGER trigger_medical_leave_associations
AFTER INSERT ON medical_leaves
FOR EACH ROW
EXECUTE FUNCTION create_medical_leave_associations();

-- FASE 4: Criar função e trigger para atualização quando licença é encerrada
CREATE OR REPLACE FUNCTION update_medical_leave_associations()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'ENCERRADA' AND NEW.status = 'ENCERRADA' THEN
    UPDATE team_capacity_alerts
    SET alert_status = 'RESOLVED'
    WHERE medical_leave_id = NEW.id
      AND alert_status = 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_medical_leave_update ON medical_leaves;
CREATE TRIGGER trigger_medical_leave_update
AFTER UPDATE ON medical_leaves
FOR EACH ROW
EXECUTE FUNCTION update_medical_leave_associations();