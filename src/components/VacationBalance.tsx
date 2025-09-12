import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getVacationBalance, VacationBalance as VacationBalanceType } from '@/lib/vacationUtils';

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
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="w-4 h-4" />
          Saldo de Férias {balance.year}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Saldo disponível:</span>
          <Badge className={getBalanceColor(balance.balance_days)}>
            {balance.balance_days} dias
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground">Direito acumulado</p>
            <p className="font-medium">{balance.accrued_days} dias</p>
          </div>
          <div>
            <p className="text-muted-foreground">Já utilizados</p>
            <p className="font-medium">{balance.used_days} dias</p>
          </div>
        </div>

        <div className="pt-2 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>
              Próximo acúmulo: {nextAnniversary.toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}