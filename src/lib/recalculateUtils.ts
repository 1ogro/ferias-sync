import { supabase } from "@/integrations/supabase/client";
import { recalculateVacationBalance } from "./vacationUtils";

/**
 * Recalculate vacation balance for a person and update manual balance
 */
export async function recalculateAndSaveBalance(
  personId: string,
  year: number,
  justification: string,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await recalculateVacationBalance(personId, year, justification, updatedBy);
    return result;
  } catch (error) {
    console.error('Error in recalculateAndSaveBalance:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro interno' 
    };
  }
}