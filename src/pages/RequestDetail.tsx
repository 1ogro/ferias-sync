import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { RequestTimeline } from "@/components/RequestTimeline";
import { Status, TIPO_LABELS, Request, TipoAusencia, Person, Papel, OrganizationalRole } from "@/lib/types";
import { ArrowLeft, Calendar, User, Clock, AlertTriangle, Edit, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const RequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserPerson, setCurrentUserPerson] = useState<Person | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<Array<{
    id: string;
    status: Status;
    actor: string;
    date: Date;
    comment?: string;
  }>>([]);
  
  // Fetch current user's person data
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('person_id, people!inner(*)')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (profile && profile.people) {
        setCurrentUserPerson(profile.people as any);
      }
    };
    
    fetchCurrentUser();
  }, []);
  
  // Fetch request data from Supabase
  useEffect(() => {
    const fetchRequest = async () => {
      if (!id) return;
      
      try {
        const { data: requestData, error } = await supabase
          .from('requests')
          .select(`
            *,
            requester:people!requests_requester_id_fkey(*)
          `)
          .eq('id', id)
          .maybeSingle();
        
        if (error) {
          console.error('Error fetching request:', error);
          return;
        }
        
        if (requestData) {
          const mappedRequest: Request = {
            id: requestData.id,
            requesterId: requestData.requester_id,
            requester: {
              id: requestData.requester.id,
              nome: requestData.requester.nome,
              email: requestData.requester.email,
              cargo: requestData.requester.cargo,
              local: requestData.requester.local,
              subTime: requestData.requester.sub_time,
              papel: requestData.requester.papel as Papel,
              organizational_role: null,
              is_admin: requestData.requester.is_admin,
              ativo: requestData.requester.ativo,
              gestorId: requestData.requester.gestor_id,
              data_nascimento: requestData.requester.data_nascimento,
              data_contrato: requestData.requester.data_contrato
            },
            tipo: requestData.tipo as TipoAusencia,
          inicio: requestData.inicio ? new Date(requestData.inicio) : null,
          fim: requestData.fim ? new Date(requestData.fim) : null,
            tipoFerias: requestData.tipo_ferias,
            status: requestData.status as Status,
            justificativa: requestData.justificativa,
            conflitoFlag: requestData.conflito_flag,
            conflitoRefs: requestData.conflito_refs,
            createdAt: new Date(requestData.created_at),
            updatedAt: new Date(requestData.updated_at)
          };
          setRequest(mappedRequest);
          
          // Fetch timeline events
          await fetchTimelineEvents(requestData.id, mappedRequest);
        }
      } catch (error) {
        console.error('Error fetching request:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequest();
  }, [id]);
  
  // Fetch timeline events from approvals table
  const fetchTimelineEvents = async (requestId: string, requestData: Request) => {
    try {
      const { data: approvals, error } = await supabase
        .from('approvals')
        .select(`
          *,
          approver:people!approvals_approver_id_fkey(nome)
        `)
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching approvals:', error);
        return;
      }
      
      // Build timeline events - show actual status
      const events = [];
      
      // For drafts, show draft status
      if (requestData.status === 'RASCUNHO') {
        events.push({
          id: "creation",
          status: Status.RASCUNHO,
          actor: requestData.requester.nome,
          date: requestData.createdAt,
          comment: "Rascunho salvo"
        });
      } else {
        // For non-drafts, show creation as PENDENTE
        events.push({
          id: "creation",
          status: Status.PENDENTE,
          actor: requestData.requester.nome,
          date: requestData.createdAt,
          comment: "Solicitação criada"
        });
      }
      
      // Add approval events
      if (approvals) {
        approvals.forEach((approval, index) => {
          let eventStatus: Status;
          if (approval.acao === 'APROVADO') {
            eventStatus = approval.level === 'AUTO_APROVACAO' ? Status.APROVADO_FINAL : 
                         approval.level === 'GESTOR' ? Status.APROVADO_1NIVEL : Status.APROVADO_FINAL;
          } else if (approval.acao === 'REPROVADO') {
            eventStatus = Status.REPROVADO;
          } else {
            eventStatus = Status.EM_ANALISE_GESTOR;
          }
          
          events.push({
            id: approval.id,
            status: eventStatus,
            actor: approval.approver?.nome || 'Sistema',
            date: new Date(approval.created_at),
            comment: approval.comentario || 
                    (approval.level === 'AUTO_APROVACAO' ? 'Auto-aprovação (Diretor)' : 
                     approval.acao === 'APROVADO' ? 'Solicitação aprovada' : 
                     approval.acao === 'REPROVADO' ? 'Solicitação reprovada' : 'Em análise')
          });
        });
      }
      
      setTimelineEvents(events);
    } catch (error) {
      console.error('Error fetching timeline:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Carregando...</h2>
          </div>
        </main>
      </div>
    );
  }
  
  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Solicitação não encontrada</h2>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </main>
      </div>
    );
  }


  const formatDate = (date: Date | null) => {
    if (!date) return "Data não definida";
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit", 
      month: "long",
      year: "numeric"
    });
  };

  const getDuration = () => {
    if (!request.inicio || !request.fim) return "Não definido";
    const diffTime = Math.abs(request.fim.getTime() - request.inicio.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  };

  // Verificar permissões de edição e exclusão
  const isOwnRequest = currentUserPerson?.id === request.requesterId;
  const isManager = currentUserPerson?.id === request.requester.gestorId;
  const isDirectorOrAdmin = currentUserPerson?.papel === Papel.DIRETOR || currentUserPerson?.is_admin;
  
  // Permissões de edição
  const canEdit = isOwnRequest 
    ? request.status === Status.RASCUNHO // Próprio usuário só edita rascunhos
    : (isManager || isDirectorOrAdmin) && request.status !== Status.RASCUNHO; // Gestor/diretor edita tudo exceto rascunhos
  
  // Permissões de exclusão
  const canDelete = isOwnRequest
    ? request.status === Status.RASCUNHO // Próprio usuário só exclui rascunhos
    : (isManager || isDirectorOrAdmin) && request.status !== Status.RASCUNHO; // Gestor/diretor exclui tudo exceto rascunhos
  
  const canCancel = canDelete;

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar esta solicitação?")) return;

    try {
      const { error } = await supabase
        .from('requests')
        .update({ status: 'CANCELADO' })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Solicitação cancelada",
        description: "A solicitação foi cancelada com sucesso.",
      });

      // Reload the page to reflect changes
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    // Se for administrador, pedir justificativa obrigatória
    let justification = "";
    if (!isOwnRequest && (isManager || isDirectorOrAdmin)) {
      justification = prompt(
        "Por favor, informe a justificativa para excluir esta solicitação.\n" +
        "Esta ação será registrada no histórico de auditoria:"
      ) || "";
      
      if (!justification.trim()) {
        toast({
          title: "Ação cancelada",
          description: "É necessário informar uma justificativa para exclusão administrativa.",
          variant: "destructive",
        });
        return;
      }
    }

    const confirmMessage = isOwnRequest && request.status === Status.RASCUNHO
      ? "Tem certeza que deseja excluir este rascunho? Esta ação não pode ser desfeita."
      : `⚠️ EXCLUSÃO ADMINISTRATIVA\n\n` +
        `Solicitação: ${TIPO_LABELS[request.tipo]}\n` +
        `Status: ${request.status}\n` +
        `Colaborador: ${request.requester.nome}\n` +
        `Período: ${formatDate(request.inicio)} - ${formatDate(request.fim)}\n\n` +
        `Esta ação NÃO pode ser desfeita!\n` +
        `Tem certeza que deseja excluir?`;
    
    if (!confirm(confirmMessage)) return;

    try {
      // Se for exclusão administrativa, registrar no audit_log ANTES de excluir
      if (!isOwnRequest && (isManager || isDirectorOrAdmin)) {
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert({
            entidade: 'requests',
            entidade_id: id,
            acao: 'ADMIN_DELETE',
            actor_id: currentUserPerson?.id,
            payload: {
              request_data: {
                requester_id: request.requesterId,
                requester_name: request.requester.nome,
                tipo: request.tipo,
                inicio: request.inicio?.toISOString(),
                fim: request.fim?.toISOString(),
                status: request.status,
                justificativa_original: request.justificativa
              },
              admin_justification: justification,
              admin_role: currentUserPerson?.papel
            }
          });

        if (auditError) {
          console.error('Audit log error:', auditError);
          throw new Error('Falha ao registrar ação no histórico de auditoria');
        }
      }

      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: isOwnRequest ? "Rascunho excluído" : "Solicitação excluída (Admin)",
        description: isOwnRequest 
          ? "O rascunho foi excluído com sucesso." 
          : "A solicitação foi excluída e o histórico foi registrado.",
      });

      navigate('/inbox');
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request Details */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      {TIPO_LABELS[request.tipo]} - {request.requester.nome}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={request.status} />
                      {request.conflitoFlag && (
                        <Badge variant="outline" className="bg-status-rejected/10 text-status-rejected">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Conflito
                        </Badge>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/requests/${request.id}/edit`)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        {isOwnRequest ? 'Editar' : 'Editar (Admin)'}
                      </Button>
                      {canDelete && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-status-rejected border-status-rejected hover:bg-status-rejected/10"
                          onClick={handleDelete}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {isOwnRequest && request.status === Status.RASCUNHO ? 'Excluir Rascunho' : 'Excluir (Admin)'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Período Solicitado</h4>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="font-medium">{formatDate(request.inicio)}</p>
                      {request.inicio && request.fim && request.inicio.getTime() !== request.fim.getTime() && (
                        <>
                          <p className="text-sm text-muted-foreground">até</p>
                          <p className="font-medium">{formatDate(request.fim)}</p>
                        </>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">
                        Duração: {getDuration()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Informações</h4>
                    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{request.requester.nome}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{request.requester.cargo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          Criado em {request.createdAt.toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {request.justificativa && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Justificativa</h4>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm">{request.justificativa}</p>
                    </div>
                  </div>
                )}

                {request.conflitoFlag && request.conflitoRefs && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-status-rejected">Conflito Detectado</h4>
                    <div className="p-3 bg-status-rejected/10 border border-status-rejected/20 rounded-lg">
                      <p className="text-sm text-status-rejected">
                        Esta solicitação sobrepõe com outras ausências aprovadas ou pendentes.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions for Approvers */}
            {[Status.EM_ANALISE_GESTOR, Status.EM_ANALISE_DIRETOR].includes(request.status) && (
              <Card>
                <CardHeader>
                  <CardTitle>Ações de Aprovação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Comentário (opcional)</label>
                    <Textarea
                      placeholder="Adicione um comentário sobre sua decisão..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-status-approved hover:bg-status-approved/90 text-white">
                      Aprovar
                    </Button>
                    <Button variant="outline" className="border-status-rejected text-status-rejected">
                      Reprovar
                    </Button>
                    <Button variant="outline">
                      Pedir Informações
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <RequestTimeline events={timelineEvents} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default RequestDetail;