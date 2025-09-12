import { useParams } from "react-router-dom";
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

const RequestDetail = () => {
  const { id } = useParams();
  const [comment, setComment] = useState("");
  const [request, setRequest] = useState<Request | null>(null);
  const [loading, setLoading] = useState(true);
  
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
            inicio: new Date(requestData.inicio),
            fim: new Date(requestData.fim),
            tipoFerias: requestData.tipo_ferias,
            status: requestData.status as Status,
            justificativa: requestData.justificativa,
            conflitoFlag: requestData.conflito_flag,
            conflitoRefs: requestData.conflito_refs,
            createdAt: new Date(requestData.created_at),
            updatedAt: new Date(requestData.updated_at)
          };
          setRequest(mappedRequest);
        }
      } catch (error) {
        console.error('Error fetching request:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequest();
  }, [id]);
  
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
            <Button onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Mock timeline events
  const timelineEvents = [
    {
      id: "1",
      status: Status.PENDENTE,
      actor: request.requester.nome,
      date: request.createdAt,
      comment: "Solicitação criada"
    },
    {
      id: "2", 
      status: Status.EM_ANALISE_GESTOR,
      actor: "Carlos Santos",
      date: new Date(request.createdAt.getTime() + 24 * 60 * 60 * 1000),
      comment: "Em análise pelo gestor direto"
    }
  ];

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit", 
      month: "long",
      year: "numeric"
    });
  };

  const getDuration = () => {
    const diffTime = Math.abs(request.fim.getTime() - request.inicio.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  };

  const canEdit = [Status.PENDENTE, Status.EM_ANALISE_GESTOR].includes(request.status);
  const canCancel = ![Status.REALIZADO, Status.CANCELADO, Status.REPROVADO].includes(request.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => window.history.back()}>
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
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      {canCancel && (
                        <Button variant="outline" size="sm" className="text-status-rejected border-status-rejected">
                          <Trash2 className="w-4 h-4 mr-1" />
                          Cancelar
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
                      {request.inicio.getTime() !== request.fim.getTime() && (
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