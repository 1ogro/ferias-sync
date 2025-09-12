import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Calendar, User, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getActiveMedicalLeaves, endMedicalLeave } from "@/lib/medicalLeaveUtils";
import { MedicalLeave } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MedicalLeaveListProps {
  onRefresh?: () => void;
}

export const MedicalLeaveList = ({ onRefresh }: MedicalLeaveListProps) => {
  const [medicalLeaves, setMedicalLeaves] = useState<MedicalLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadMedicalLeaves = async () => {
    setLoading(true);
    try {
      const leaves = await getActiveMedicalLeaves();
      setMedicalLeaves(leaves);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar licenças médicas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedicalLeaves();
  }, []);

  const handleEndLeave = async (leaveId: string) => {
    try {
      const result = await endMedicalLeave(leaveId);
      
      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Licença médica encerrada com sucesso.",
        });
        await loadMedicalLeaves();
        onRefresh?.();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao encerrar licença médica.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (leave: MedicalLeave) => {
    const isActive = leave.status === 'ATIVA';
    const isExpired = new Date(leave.end_date) < new Date();
    
    if (isActive && !isExpired) {
      return <Badge className="bg-status-in-review/10 text-status-in-review">Ativa</Badge>;
    }
    
    if (isActive && isExpired) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Expirada</Badge>;
    }
    
    return <Badge variant="outline">Encerrada</Badge>;
  };

  const getDaysRemaining = (endDate: Date) => {
    const today = new Date();
    const diffTime = new Date(endDate).getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Expirada";
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Amanhã";
    return `${diffDays} dias`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p>Carregando licenças médicas...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Licenças Médicas Ativas
        </CardTitle>
        <Button variant="outline" size="sm" onClick={loadMedicalLeaves}>
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {medicalLeaves.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4" />
            <p>Nenhuma licença médica ativa no momento</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Cargo/Time</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capacidade</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicalLeaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {leave.person?.nome || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{leave.person?.cargo}</div>
                        <div className="text-sm text-muted-foreground">
                          {leave.person?.subTime}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <div>
                          <div>{format(new Date(leave.start_date), "dd/MM/yyyy", { locale: ptBR })}</div>
                          <div className="text-sm text-muted-foreground">
                            até {format(new Date(leave.end_date), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {getDaysRemaining(leave.end_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(leave)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={leave.affects_team_capacity ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {leave.affects_team_capacity ? "Bloqueia" : "Normal"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {leave.status === 'ATIVA' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <XCircle className="h-4 w-4 mr-1" />
                              Encerrar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Encerrar Licença Médica</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja encerrar a licença médica de{" "}
                                <strong>{leave.person?.nome}</strong>?
                                <br />
                                Esta ação irá liberar o bloqueio para novas solicitações no time.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleEndLeave(leave.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Encerrar Licença
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};