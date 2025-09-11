-- Insert team members into people table
INSERT INTO public.people (id, nome, email, cargo, local, sub_time, papel, ativo, gestor_id) VALUES

-- Admin
('pessoa_001', 'Airton Jordani', 'airton.jordani@uxtd.com.br', 'Head de Produto', 'São Paulo', 'Liderança', 'ADMIN', true, NULL),

-- Diretor
('pessoa_002', 'André Mizarela', 'andre.mizarela@uxtd.com.br', 'Diretor de UX', 'São Paulo', 'Liderança', 'DIRETOR', true, 'pessoa_001'),

-- Gestores
('pessoa_003', 'Antenor Jr', 'antenor.jr@uxtd.com.br', 'Gerente de Design', 'São Paulo', 'Design', 'GESTOR', true, 'pessoa_002'),
('pessoa_004', 'Bruno Salomon', 'bruno.salomon@uxtd.com.br', 'Gerente de Pesquisa', 'Rio de Janeiro', 'Research', 'GESTOR', true, 'pessoa_002'),
('pessoa_005', 'Caio Sponton', 'caio.sponton@uxtd.com.br', 'Gerente de Produto', 'São Paulo', 'Produto', 'GESTOR', true, 'pessoa_002'),
('pessoa_006', 'Kdu Gama', 'kdu.gama@uxtd.com.br', 'Coordenador de UX', 'Belo Horizonte', 'UX', 'GESTOR', true, 'pessoa_002'),

-- Colaboradores
('pessoa_007', 'Denilda Santos', 'denilda.santos@uxtd.com.br', 'UX Designer Senior', 'São Paulo', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_008', 'Haroldo Portella', 'haroldo.portella@uxtd.com.br', 'UI Designer Senior', 'São Paulo', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_009', 'Helio Pereira Jr', 'helio.pereira@uxtd.com.br', 'Visual Designer', 'Rio de Janeiro', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_010', 'Isabela Campos', 'isabela.campos@uxtd.com.br', 'UX Researcher Senior', 'São Paulo', 'Research', 'COLABORADOR', true, 'pessoa_004'),
('pessoa_011', 'Larissa Pardal', 'larissa.pardal@uxtd.com.br', 'UX Researcher', 'Rio de Janeiro', 'Research', 'COLABORADOR', true, 'pessoa_004'),
('pessoa_012', 'Paula Albuquerque', 'paula.albuquerque@uxtd.com.br', 'Service Designer', 'São Paulo', 'Research', 'COLABORADOR', true, 'pessoa_004'),
('pessoa_013', 'Pedro Belsito', 'pedro.belsito@uxtd.com.br', 'Product Designer', 'São Paulo', 'Produto', 'COLABORADOR', true, 'pessoa_005'),
('pessoa_014', 'Pedro Dornellas', 'pedro.dornellas@uxtd.com.br', 'Product Owner', 'Belo Horizonte', 'Produto', 'COLABORADOR', true, 'pessoa_005'),
('pessoa_015', 'Rafael Garcia Motta', 'rafael.motta@uxtd.com.br', 'UX Writer', 'São Paulo', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_016', 'Raul Queiroz', 'raul.queiroz@uxtd.com.br', 'Interaction Designer', 'Belo Horizonte', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_017', 'Renata Martins', 'renata.martins@uxtd.com.br', 'UX Designer', 'São Paulo', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_018', 'Sueliton Ribeiro', 'sueliton.ribeiro@uxtd.com.br', 'Motion Designer', 'Rio de Janeiro', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_019', 'Vanessa Adão', 'vanessa.adao@uxtd.com.br', 'UX Designer Plena', 'São Paulo', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_020', 'Vinicius Cruz', 'vinicius.cruz@uxtd.com.br', 'UI Designer', 'Belo Horizonte', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_021', 'Ariel Cardeal', 'ariel.cardeal@uxtd.com.br', 'Design System Specialist', 'São Paulo', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_022', 'Jordache Burmeister', 'jordache.burmeister@uxtd.com.br', 'Product Designer Senior', 'Rio de Janeiro', 'Produto', 'COLABORADOR', true, 'pessoa_005'),
('pessoa_023', 'Steffani Nascimento', 'steffani.nascimento@uxtd.com.br', 'UX Researcher Plena', 'São Paulo', 'Research', 'COLABORADOR', true, 'pessoa_004'),
('pessoa_024', 'Seymour Azevedo', 'seymour.azevedo@uxtd.com.br', 'Content Designer', 'Belo Horizonte', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_025', 'Bruna Duarte', 'bruna.duarte@uxtd.com.br', 'UX Designer Junior', 'São Paulo', 'UX', 'COLABORADOR', true, 'pessoa_006'),
('pessoa_026', 'Ariane Araujo', 'ariane.araujo@uxtd.com.br', 'UI Designer Junior', 'Rio de Janeiro', 'Design', 'COLABORADOR', true, 'pessoa_003'),
('pessoa_027', 'Douglas D''Andrade', 'douglas.dandrade@uxtd.com.br', 'Behavioral Researcher', 'São Paulo', 'Research', 'COLABORADOR', true, 'pessoa_004'),
('pessoa_028', 'Juliana Maulim', 'juliana.maulim@uxtd.com.br', 'Product Designer Junior', 'Belo Horizonte', 'Produto', 'COLABORADOR', true, 'pessoa_005');

-- Update gestor_direto_email for everyone based on their gestor_id
UPDATE public.people SET gestor_direto_email = (
  SELECT email FROM public.people gestor WHERE gestor.id = people.gestor_id
) WHERE gestor_id IS NOT NULL;