-- Add data_nascimento field to people table
ALTER TABLE public.people 
ADD COLUMN data_nascimento DATE;

-- Add some sample birthdates for existing users
UPDATE public.people 
SET data_nascimento = '1990-03-15' 
WHERE email = 'ana.silva@empresa.com';

UPDATE public.people 
SET data_nascimento = '1985-07-22' 
WHERE email = 'carlos.santos@empresa.com';

UPDATE public.people 
SET data_nascimento = '1980-11-08' 
WHERE email = 'maria.oliveira@empresa.com';

UPDATE public.people 
SET data_nascimento = '1992-12-03' 
WHERE email = 'joao.pereira@empresa.com';

UPDATE public.people 
SET data_nascimento = '1988-05-14' 
WHERE email = 'fernanda.costa@empresa.com';