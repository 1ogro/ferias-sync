import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";
import { 
  User, 
  Briefcase, 
  Users, 
  Calendar, 
  CalendarCheck, 
  CalendarClock, 
  TrendingUp,
  FileText,
  Edit,
  CalendarDays,
  RotateCcw
} from "lucide-react";

interface VacationData {
  id?: string;
  person_id: string;
  year: number;
  accrued_days: number;
  used_days: number;
  balance_days: number;
  contract_anniversary?: Date;
  is_manual?: boolean;
  manual_justification?: string;
  person: {
    id: string;
    nome: string;
    cargo?: string;
    sub_time?: string;
    data_contrato?: string;
    modelo_contrato?: string;
  };
}

interface VacationDetailsDrawerProps {
  item: VacationData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditContract: (item: VacationData) => void;
  onEditBalance: (item: VacationData) => void;
  onRestoreAutomatic: (personId: string) => void;
}

export function VacationDetailsDrawer({
  item,
  open,
  onOpenChange,
  onEditContract,
  onEditBalance,
  onRestoreAutomatic,
}: VacationDetailsDrawerProps) {
  if (!item) return null;

  const getBalanceStatus = (balance: number, hasContract: boolean) => {
    if (!hasContract) return { color: "destructive", text: "Contrato não definido" };
    if (balance < 10) return { color: "destructive", text: "Saldo baixo" };
    if (balance > 20) return { color: "default", text: "Atenção ao acúmulo" };
    return { color: "default", text: "Saldo adequado" };
  };

  const status = getBalanceStatus(item.balance_days, !!item.person.data_contrato);
  const isPJWithAccumulated = item.person.modelo_contrato === 'PJ' && item.balance_days > 30;

  const getAbonoInfo = (contractType?: string) => {
    switch (contractType) {
      case 'PJ': return 'Não aplicável';
      case 'CLT_ABONO_LIVRE': return '1-10 dias';
      case 'CLT_ABONO_FIXO': return '0 ou 10 dias';
      default: return 'Padrão CLT';
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {item.person.nome}
          </DrawerTitle>
          <DrawerDescription>
            Detalhes do saldo de férias para {item.year}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-6 overflow-y-auto pb-4">
          {/* Status Alert */}
          {isPJWithAccumulated && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                ⚠️ Colaborador PJ com férias acumuladas (mais de 30 dias)
              </p>
            </div>
          )}

          {/* Informações Pessoais */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Informações Profissionais
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Cargo</p>
                <p className="text-sm font-medium">{item.person.cargo || "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="text-sm font-medium">{item.person.sub_time || "N/A"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Informações de Contrato */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Contrato
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Modelo de Contrato</p>
                <Badge variant="secondary" className="mt-1">
                  {MODELO_CONTRATO_LABELS[item.person.modelo_contrato as ModeloContrato] || MODELO_CONTRATO_LABELS[ModeloContrato.CLT]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo de Abono</p>
                <p className="text-sm font-medium">{getAbonoInfo(item.person.modelo_contrato)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data de Contrato</p>
                {item.person.data_contrato ? (
                  <p className="text-sm font-medium">{format(new Date(item.person.data_contrato), "dd/MM/yyyy")}</p>
                ) : (
                  <Badge variant="destructive" className="mt-1">Não definida</Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Saldo de Férias */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Saldo de Férias ({item.year})
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <CalendarCheck className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
                <p className="text-xs text-muted-foreground">Adquiridos</p>
                <p className="text-xl font-bold">{item.accrued_days}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <CalendarClock className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <p className="text-xs text-muted-foreground">Usados</p>
                <p className="text-xl font-bold">{item.used_days}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="text-xl font-bold">{item.balance_days}</p>
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Badge variant={status.color as any}>{status.text}</Badge>
            </div>
          </div>

          <Separator />

          {/* Tipo de Cálculo */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground">Tipo de Cálculo</h3>
            {item.is_manual ? (
              <div className="space-y-2">
                <Badge variant="secondary">Manual</Badge>
                {item.manual_justification && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Justificativa</p>
                    <p className="text-sm">{item.manual_justification}</p>
                  </div>
                )}
              </div>
            ) : (
              <Badge variant="outline">Automático</Badge>
            )}
          </div>
        </div>

        <DrawerFooter className="pt-4 border-t">
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="outline" onClick={() => {
              onEditContract(item);
              onOpenChange(false);
            }}>
              <Edit className="mr-2 h-4 w-4" />
              Editar Contrato
            </Button>
            <Button variant="outline" onClick={() => {
              onEditBalance(item);
              onOpenChange(false);
            }}>
              <CalendarDays className="mr-2 h-4 w-4" />
              Editar Saldo
            </Button>
          </div>
          {item.is_manual && (
            <Button 
              variant="secondary" 
              onClick={() => {
                onRestoreAutomatic(item.person_id);
                onOpenChange(false);
              }}
              className="w-full"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar Cálculo Automático
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="ghost" className="w-full">Fechar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
