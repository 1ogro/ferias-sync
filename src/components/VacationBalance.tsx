import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getVacationBalance, VacationBalance as VacationBalanceType } from '@/lib/vacationUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface VacationBalanceProps {
  className?: string;
}

export function VacationBalance({ className }: VacationBalanceProps) {
  const { person } = useAuth();
  const [balance, setBalance] = useState<VacationBalanceType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!person?.id) return;
      
      setLoading(true);
      try {
        const balanceData = await getVacationBalance(person.id);
        setBalance(balanceData);
      } catch (error) {
        console.error('Error fetching vacation balance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [person?.id]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" />
            Saldo de Férias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!balance) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" />
            Saldo de Férias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <User className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {!person?.data_contrato 
                ? 'Data de contrato não informada. Entre em contato com o RH.'
                : 'Não foi possível calcular o saldo de férias.'
              }
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getBalanceColor = (days: number) => {
    if (days >= 20) return 'bg-success text-success-foreground';
    if (days >= 10) return 'bg-warning text-warning-foreground';
    return 'bg-destructive text-destructive-foreground';
  };

  const contractAnniversary = new Date(balance.contract_anniversary);
  const nextAnniversary = new Date(contractAnniversary);
  nextAnniversary.setFullYear(new Date().getFullYear() + 1);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">Saldo de Férias</CardTitle>
        <Calendar className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{balance.balance_days}</div>
            <div className="text-xs text-muted-foreground">Disponível</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{balance.accrued_days}</div>
            <div className="text-xs text-muted-foreground">Acumulado</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{balance.used_days}</div>
            <div className="text-xs text-muted-foreground">Usado</div>
          </div>
        </div>
        
        <div className="border-t pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Tipo:</span>
            <Badge 
              variant={balance.is_manual ? "default" : "outline"}
              className={balance.is_manual ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}
            >
              {balance.is_manual ? 'Manual' : 'Automático'}
            </Badge>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge 
              className={getBalanceColor(balance.balance_days)}
            >
              {balance.balance_days > 15 ? 'Excelente' : balance.balance_days > 5 ? 'Bom' : 'Atenção'}
            </Badge>
          </div>
          {balance.contract_anniversary && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-muted-foreground">Próximo acúmulo:</span>
              <span className="font-medium text-sm">
                {format(new Date(balance.contract_anniversary), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}