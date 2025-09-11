-- Create the requests table
CREATE TABLE public.requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('FERIAS', 'DAYOFF')),
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  tipo_ferias TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANALISE_GESTOR', 'APROVADO_1NIVEL', 'EM_ANALISE_DIRETOR', 'APROVADO_FINAL', 'REPROVADO', 'CANCELADO', 'REALIZADO')),
  justificativa TEXT,
  conflito_flag BOOLEAN DEFAULT false,
  conflito_refs TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (requester_id) REFERENCES public.people(id) ON DELETE CASCADE
);

-- Create the approvals table
CREATE TABLE public.approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('GESTOR_1', 'DIRETOR_2')),
  approver_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('APROVAR', 'REPROVAR', 'PEDIR_INFO', 'CANCELAR')),
  comentario TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES public.people(id) ON DELETE CASCADE
);

-- Create the audit_logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  payload JSONB,
  actor_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id) REFERENCES public.people(id) ON DELETE SET NULL
);

-- Create profiles table for authentication
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Update people table permissions
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- Create policies for people table
CREATE POLICY "Users can view all people" 
ON public.people 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage people" 
ON public.people 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.people per ON p.person_id = per.id 
    WHERE p.user_id = auth.uid() AND per.papel = 'ADMIN'
  )
);

-- Create policies for requests table
CREATE POLICY "Users can view their own requests" 
ON public.requests 
FOR SELECT 
USING (
  requester_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Managers can view their team requests" 
ON public.requests 
FOR SELECT 
USING (
  requester_id IN (
    SELECT p.id FROM public.people p
    JOIN public.profiles prof ON prof.person_id = p.gestor_id
    WHERE prof.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles prof 
    JOIN public.people per ON prof.person_id = per.id 
    WHERE prof.user_id = auth.uid() AND per.papel IN ('DIRETOR', 'ADMIN')
  )
);

CREATE POLICY "Users can create their own requests" 
ON public.requests 
FOR INSERT 
WITH CHECK (
  requester_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own pending requests" 
ON public.requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  ) AND status IN ('PENDENTE', 'EM_ANALISE_GESTOR')
);

-- Create policies for approvals table
CREATE POLICY "Users can view approvals for their requests" 
ON public.approvals 
FOR SELECT 
USING (
  request_id IN (
    SELECT id FROM public.requests WHERE requester_id IN (
      SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) OR
  approver_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Managers can create approvals" 
ON public.approvals 
FOR INSERT 
WITH CHECK (
  approver_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create policies for audit_logs table
CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.people per ON p.person_id = per.id 
    WHERE p.user_id = auth.uid() AND per.papel = 'ADMIN'
  )
);

CREATE POLICY "Users can view logs related to their actions" 
ON public.audit_logs 
FOR SELECT 
USING (
  actor_id IN (
    SELECT person_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create policies for profiles table
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid());

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_requests_updated_at
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- The profile will be created manually after user signs up
  -- We need to link them to a person record
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();