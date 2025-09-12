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
  is_manual?: boolean;
  manual_justification?: string;
  updated_by?: string;
  manual_updated_at?: Date;
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
 * Get vacation balance for a person and year (hybrid: manual override or calculated)
 */
export async function getVacationBalance(
  personId: string,
  year: number = new Date().getFullYear()
): Promise<VacationBalance | null> {
  try {
    // First check if there's a manual balance record
    const { data: manualBalance } = await supabase
      .from('vacation_balances')
      .select('*, manual_justification, updated_by')
      .eq('person_id', personId)
      .eq('year', year)
      .maybeSingle();

    if (manualBalance) {
      // Return manual balance with flag
      return {
        id: manualBalance.id,
        person_id: manualBalance.person_id,
        year: manualBalance.year,
        accrued_days: manualBalance.accrued_days,
        used_days: manualBalance.used_days,
        balance_days: manualBalance.balance_days,
        contract_anniversary: new Date(manualBalance.contract_anniversary),
        is_manual: true,
        manual_justification: manualBalance.manual_justification,
        updated_by: manualBalance.updated_by,
        manual_updated_at: manualBalance.updated_at ? new Date(manualBalance.updated_at) : undefined
      };
    }

    // Fallback to automatic calculation
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
    balance.is_manual = false;
    
    return balance;
  } catch (error) {
    console.error('Error getting vacation balance:', error);
    return null;
  }
}

/**
 * Save manual vacation balance
 */
export async function saveManualVacationBalance(
  personId: string,
  year: number,
  accruedDays: number,
  usedDays: number,
  justification: string,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const balanceDays = Math.max(0, accruedDays - usedDays);

    // Get contract anniversary for this person
    const { data: personData } = await supabase
      .from('people')
      .select('data_contrato')
      .eq('id', personId)
      .single();

    if (!personData?.data_contrato) {
      return { success: false, error: 'Data de contrato não encontrada' };
    }

    const contractAnniversary = new Date(year, new Date(personData.data_contrato).getMonth(), new Date(personData.data_contrato).getDate());

    // Insert or update manual balance
    const { error } = await supabase
      .from('vacation_balances')
      .upsert({
        person_id: personId,
        year,
        accrued_days: accruedDays,
        used_days: usedDays,
        balance_days: balanceDays,
        contract_anniversary: contractAnniversary.toISOString().split('T')[0],
        manual_justification: justification,
        updated_by: updatedBy
      });

    if (error) {
      console.error('Error saving manual balance:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in saveManualVacationBalance:', error);
    return { success: false, error: 'Erro interno' };
  }
}

/**
 * Delete manual vacation balance (restore to automatic)
 */
export async function deleteManualVacationBalance(
  personId: string,
  year: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('vacation_balances')
      .delete()
      .eq('person_id', personId)
      .eq('year', year);

    if (error) {
      console.error('Error deleting manual balance:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteManualVacationBalance:', error);
    return { success: false, error: 'Erro interno' };
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

/**
 * Get vacation balances for all active people (for directors/admins)
 */
export async function getAllVacationBalances(
  year: number = new Date().getFullYear()
): Promise<Array<VacationBalance & { person: { id: string; nome: string; email: string; cargo?: string; sub_time?: string; data_contrato?: string } }>> {
  try {
    // Get all active people
    const { data: peopleData } = await supabase
      .from('people')
      .select('id, nome, email, cargo, sub_time, data_contrato')
      .eq('ativo', true)
      .order('nome');

    if (!peopleData) return [];

    const results = [];

    for (const person of peopleData) {
      // Use the hybrid function to get balance (manual or calculated)
      const balance = await getVacationBalance(person.id, year);
      
      if (balance) {
        results.push({
          ...balance,
          person: person
        });
      } else {
        // Include people without contract date but with zero balance
        results.push({
          person_id: person.id,
          year,
          accrued_days: 0,
          used_days: 0,
          balance_days: 0,
          contract_anniversary: new Date(),
          is_manual: false,
          person: person
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error getting all vacation balances:', error);
    return [];
  }
}