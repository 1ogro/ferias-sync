-- Add column to track if vacation was requested in Portal RH
ALTER TABLE requests 
ADD COLUMN portal_rh_solicitado BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN requests.portal_rh_solicitado IS 
'Indica se o funcionário CLT já solicitou as férias no Portal RH externo';