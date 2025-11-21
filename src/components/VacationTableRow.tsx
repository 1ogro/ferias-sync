import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit, CalendarDays, RotateCcw, AlertTriangle, CheckCircle, MoreVertical, Eye } from "lucide-react";
import { format } from "date-fns";
import { ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";

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

interface VacationTableRowProps {
  item: VacationData;
  onEditContract: (item: VacationData) => void;
  onEditBalance: (item: VacationData) => void;
  onRestoreAutomatic: (personId: string) => void;
  onViewDetails: (item: VacationData) => void;
}

export function VacationTableRow({
  item,
  onEditContract,
  onEditBalance,
  onRestoreAutomatic,
  onViewDetails,
}: VacationTableRowProps) {
  const isMobile = useIsMobile();
  const isPJWithAccumulatedVacations = item.person.modelo_contrato === 'PJ' && item.balance_days > 30;

  const getBalanceColor = (balance: number, hasContract: boolean) => {
    if (!hasContract) return "bg-destructive/10 text-destructive border-destructive/20";
    if (balance < 10) return "bg-destructive/10 text-destructive border-destructive/20";
    if (balance > 20) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  };

  const getBalanceIcon = (balance: number, hasContract: boolean) => {
    if (!hasContract) return <AlertTriangle className="h-3.5 w-3.5" />;
    if (balance < 10) return <AlertTriangle className="h-3.5 w-3.5" />;
    return <CheckCircle className="h-3.5 w-3.5" />;
  };

  const getContractBadgeVariant = (contractType?: string) => {
    switch (contractType) {
      case 'PJ': return 'secondary';
      case 'CLT_ABONO_LIVRE': return 'default';
      case 'CLT_ABONO_FIXO': return 'outline';
      default: return 'default';
    }
  };

  const getAbonoInfo = (contractType?: string) => {
    switch (contractType) {
      case 'PJ': return 'Não aplicável';
      case 'CLT_ABONO_LIVRE': return '1-10 dias';
      case 'CLT_ABONO_FIXO': return '0 ou 10 dias';
      default: return 'Padrão CLT';
    }
  };

  return (
    <TableRow 
      className={isPJWithAccumulatedVacations ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-500" : ""}
    >
      <TableCell className="font-medium">
        <div className="flex items-center space-x-2">
          <span className="truncate max-w-[180px]">{item.person.nome}</span>
          {isPJWithAccumulatedVacations && (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 text-xs whitespace-nowrap">
              Férias Acumuladas
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={getContractBadgeVariant(item.person.modelo_contrato)} className="cursor-help">
              {MODELO_CONTRATO_LABELS[item.person.modelo_contrato as ModeloContrato] || MODELO_CONTRATO_LABELS[ModeloContrato.CLT]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Modelo de contrato do colaborador</p>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <span className="text-sm">{item.person.sub_time || "N/A"}</span>
      </TableCell>
      <TableCell className="text-center">
        <Badge className={getBalanceColor(item.balance_days, !!item.person.data_contrato)} variant="outline">
          {getBalanceIcon(item.balance_days, !!item.person.data_contrato)}
          <span className="ml-1.5 font-semibold">{item.balance_days}</span>
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{item.accrued_days}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{item.used_days}</span>
      </TableCell>
      <TableCell className="text-center">
        {item.is_manual ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-xs cursor-help">
                Manual
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs max-w-xs">
                {item.manual_justification || "Saldo ajustado manualmente"}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant="outline" className="text-xs">
            Auto
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {item.person.data_contrato ? (
          <span className="text-sm">{format(new Date(item.person.data_contrato), "dd/MM/yyyy")}</span>
        ) : (
          <span className="text-destructive text-sm font-medium">Não definida</span>
        )}
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm text-muted-foreground cursor-help">
              {getAbonoInfo(item.person.modelo_contrato)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Opções de abono pecuniário disponíveis</p>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="sticky right-0 bg-background shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.05)]">
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Abrir menu de ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onViewDetails(item)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver Detalhes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditContract(item)}>
                <Edit className="mr-2 h-4 w-4" />
                Editar Contrato
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditBalance(item)}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Editar Saldo
              </DropdownMenuItem>
              {item.is_manual && (
                <DropdownMenuItem onClick={() => onRestoreAutomatic(item.person_id)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Automático
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <TooltipProvider>
            <div className="flex gap-1 justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditContract(item)}
                    className="h-9 w-9"
                  >
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Editar contrato</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar Contrato</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditBalance(item)}
                    className="h-9 w-9"
                  >
                    <CalendarDays className="h-4 w-4" />
                    <span className="sr-only">Editar saldo manual</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar Saldo Manual</p>
                </TooltipContent>
              </Tooltip>

              {item.is_manual && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRestoreAutomatic(item.person_id)}
                      className="h-9 w-9"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="sr-only">Restaurar cálculo automático</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Restaurar Cálculo Automático</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}
      </TableCell>
    </TableRow>
  );
}
