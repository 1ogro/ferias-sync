import { Request, Person, Status, TipoAusencia } from "./types";
import { supabase } from "@/integrations/supabase/client";

export interface VacationBalance {
  id?: string;
  person_id: string;
  year: number;
  accrued_days: number;
  used_days: number;
  balance_days: number;
  contract_anniversary: Date;
}

export interface VacationConflict {
  conflicted_requests: Request[];
  conflict_type: 'sub_time' | 'management';
  message: string;
}

/**
 * Calculate vacation balance based on contract anniversary
 */
export function calculateVacationBalance(
  contractDate: Date | string,
  requests: Request[],
  targetYear: number = new Date().getFullYear()
): VacationBalance {
  const contract = typeof contractDate === 'string' ? new Date(contractDate) : contractDate;
  const today = new Date();
  
  // Calculate how many years the person has worked until the target year
  const contractAnniversary = new Date(targetYear, contract.getMonth(), contract.getDate());
  
  // If contract anniversary hasn't passed this year, consider previous year's balance
  let yearsWorked = targetYear - contract.getFullYear();
  if (today < contractAnniversary && targetYear === today.getFullYear()) {
    yearsWorked = Math.max(0, yearsWorked - 1);
  }
  
  // 30 days per year worked
  const accruedDays = Math.max(0, yearsWorked * 30);
  
  // Calculate used days from all REALIZADO vacation requests (including retroactive)
  const usedDays = requests
    .filter(request => 
      request.tipo === TipoAusencia.FERIAS &&
      request.status === Status.REALIZADO
    )
    .reduce((total, request) => {
      const days = Math.ceil((request.fim.getTime() - request.inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return total + days;
    }, 0);
  
  const balanceDays = Math.max(0, accruedDays - usedDays);
  
  return {
    person_id: '', // Will be set by caller
    year: targetYear,
    accrued_days: accruedDays,
    used_days: usedDays,
    balance_days: balanceDays,
    contract_anniversary: contractAnniversary
  };
}

/**
 * Check for vacation conflicts based on sub_time and management roles
 */
export async function checkVacationConflicts(
  startDate: Date,
  endDate: Date,
  requesterId: string,
  requesterSubTime?: string,
  requesterRole?: string
): Promise<VacationConflict[]> {
  const conflicts: VacationConflict[] = [];
  
  try {
    // Check for sub_time conflicts (same sub_time members)
    if (requesterSubTime) {
      const { data: subTimeConflicts } = await supabase
        .from('requests')
        .select(`
          *,
          requester:people!requests_requester_id_fkey(*)
        `)
        .eq('tipo', 'FERIAS')
        .in('status', ['APROVADO_FINAL', 'REALIZADO', 'EM_ANDAMENTO'])
        .neq('requester_id', requesterId)
        .gte('fim', startDate.toISOString().split('T')[0])
        .lte('inicio', endDate.toISOString().split('T')[0]);
      
      if (subTimeConflicts) {
        const sameSubTimeConflicts = subTimeConflicts.filter(
          req => req.requester?.sub_time === requesterSubTime
        );
        
        if (sameSubTimeConflicts.length > 0) {
          conflicts.push({
            conflicted_requests: sameSubTimeConflicts.map(mapRequestFromDB),
            conflict_type: 'sub_time',
            message: `Conflito detectado: ${sameSubTimeConflicts.length} pessoa(s) do mesmo sub-time já possui(em) férias aprovadas neste período.`
          });
        }
      }
    }
    
    // Check for management conflicts (GESTOR or DIRETOR roles)
    if (requesterRole && ['GESTOR', 'DIRETOR'].includes(requesterRole)) {
      const { data: managementConflicts } = await supabase
        .from('requests')
        .select(`
          *,
          requester:people!requests_requester_id_fkey(*)
        `)
        .eq('tipo', 'FERIAS')
        .in('status', ['APROVADO_FINAL', 'REALIZADO', 'EM_ANDAMENTO'])
        .neq('requester_id', requesterId)
        .gte('fim', startDate.toISOString().split('T')[0])
        .lte('inicio', endDate.toISOString().split('T')[0]);
      
      if (managementConflicts) {
        const managementRoleConflicts = managementConflicts.filter(
          req => req.requester?.papel && ['GESTOR', 'DIRETOR'].includes(req.requester.papel)
        );
        
        if (managementRoleConflicts.length > 0) {
          conflicts.push({
            conflicted_requests: managementRoleConflicts.map(mapRequestFromDB),
            conflict_type: 'management',
            message: `Conflito detectado: ${managementRoleConflicts.length} pessoa(s) com papel de gestão já possui(em) férias aprovadas neste período.`
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking vacation conflicts:', error);
  }
  
  return conflicts;
}

/**
 * Map database request to Request type
 */
function mapRequestFromDB(dbRequest: any): Request {
  return {
    id: dbRequest.id,
    requesterId: dbRequest.requester_id,
    requester: dbRequest.requester,
    tipo: dbRequest.tipo as TipoAusencia,
    inicio: new Date(dbRequest.inicio),
    fim: new Date(dbRequest.fim),
    tipoFerias: dbRequest.tipo_ferias,
    status: dbRequest.status as Status,
    justificativa: dbRequest.justificativa,
    conflitoFlag: dbRequest.conflito_flag,
    conflitoRefs: dbRequest.conflito_refs,
    createdAt: new Date(dbRequest.created_at),
    updatedAt: new Date(dbRequest.updated_at)
  };
}

/**
 * Get vacation balance for a person and year
 */
export async function getVacationBalance(
  personId: string,
  year: number = new Date().getFullYear()
): Promise<VacationBalance | null> {
  try {
    // Always calculate live from person data and requests to include retroactive requests
    const { data: personData } = await supabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .single();
    
    if (!personData?.data_contrato) {
      return null;
    }
    
    const { data: requestsData } = await supabase
      .from('requests')
      .select('*')
      .eq('requester_id', personId);
    
    const requests = requestsData?.map(mapRequestFromDB) || [];
    const balance = calculateVacationBalance(personData.data_contrato, requests, year);
    balance.person_id = personId;
    
    return balance;
  } catch (error) {
    console.error('Error getting vacation balance:', error);
    return null;
  }
}

/**
 * Validate if a vacation request can be made
 */
export async function validateVacationRequest(
  personId: string,
  startDate: Date,
  endDate: Date,
  requestedDays: number
): Promise<{
  valid: boolean;
  balance?: VacationBalance;
  conflicts?: VacationConflict[];
  message: string;
}> {
  try {
    // Get current balance
    const balance = await getVacationBalance(personId);
    if (!balance) {
      return {
        valid: false,
        message: "Não foi possível calcular o saldo de férias. Verifique se a data de contrato está cadastrada."
      };
    }
    
    // Check if has enough balance
    if (requestedDays > balance.balance_days) {
      return {
        valid: false,
        balance,
        message: `Saldo insuficiente. Disponível: ${balance.balance_days} dias, solicitado: ${requestedDays} dias.`
      };
    }
    
    // Get person data for conflict checking
    const { data: personData } = await supabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .single();
    
    if (!personData) {
      return {
        valid: false,
        message: "Dados da pessoa não encontrados."
      };
    }
    
    // Check conflicts
    const conflicts = await checkVacationConflicts(
      startDate,
      endDate,
      personId,
      personData.sub_time,
      personData.papel
    );
    
    if (conflicts.length > 0) {
      return {
        valid: false,
        balance,
        conflicts,
        message: "Conflitos detectados com outras solicitações."
      };
    }
    
    return {
      valid: true,
      balance,
      message: "Solicitação válida."
    };
  } catch (error) {
    console.error('Error validating vacation request:', error);
    return {
      valid: false,
      message: "Erro ao validar solicitação de férias."
    };
  }
}