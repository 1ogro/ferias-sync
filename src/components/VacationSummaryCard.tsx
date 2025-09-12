import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  Calendar, 
  Users, 
  AlertTriangle, 
  TrendingUp,
  ArrowRight
} from "lucide-react";

interface VacationSummaryProps {
  className?: string;
}

export const VacationSummaryCard = ({ className }: VacationSummaryProps) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    withoutContract: 0,
    accumulatedVacations: 0,
    averageBalance: 0,
    loading: true
  });

  useEffect(() => {
    fetchSummaryData();
  }, []);

  const fetchSummaryData = async () => {
    try {
      console.log('Fetching vacation summary data...');
      const { data, error } = await supabase.rpc('get_vacation_summary');
      
      if (error) {
        console.error('RPC Error fetching vacation summary:', error);
        setStats(prev => ({ ...prev, loading: false }));
        return;
      }

      console.log('Vacation summary response:', data);
      const summary = data?.[0];
      if (summary) {
        console.log('Setting vacation summary stats:', summary);
        setStats({
          total: summary.total_people || 0,
          withoutContract: summary.without_contract || 0,
          accumulatedVacations: summary.accumulated_vacations || 0,
          averageBalance: Math.round(Number(summary.average_balance) || 0),
          loading: false
        });
      } else {
        console.log('No vacation summary data returned');
        setStats({
          total: 0,
          withoutContract: 0,
          accumulatedVacations: 0,
          averageBalance: 0,
          loading: false
        });
      }
    } catch (error) {
      console.error('Unexpected error fetching vacation summary:', error);
      setStats({
        total: 0,
        withoutContract: 0,
        accumulatedVacations: 0,
        averageBalance: 0,
        loading: false
      });
    }
  };

  if (stats.loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Carregando...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">Gestão de Férias</CardTitle>
        <Calendar className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{stats.averageBalance}</p>
              <p className="text-xs text-muted-foreground">Média dias</p>
            </div>
          </div>
        </div>

        {(stats.withoutContract > 0 || stats.accumulatedVacations > 0) && (
          <div className="space-y-2">
            {stats.withoutContract > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {stats.withoutContract} sem data de contrato
              </Badge>
            )}
            {stats.accumulatedVacations > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                <TrendingUp className="h-3 w-3 mr-1" />
                {stats.accumulatedVacations} com férias acumuladas
              </Badge>
            )}
          </div>
        )}

        <Button 
          variant="outline" 
          className="w-full justify-between" 
          onClick={() => navigate('/vacation-management')}
        >
          Ver Detalhes
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};