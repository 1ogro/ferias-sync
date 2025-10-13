import { supabase } from "@/integrations/supabase/client";
import { MaternityLeaveValidation } from "./types";

export const validateMaternityLeave = async (
  personId: string,
  startDate: Date
): Promise<MaternityLeaveValidation> => {
  try {
    const { data, error } = await supabase.rpc('validate_maternity_leave', {
      p_person_id: personId,
      p_start_date: startDate.toISOString().split('T')[0]
    });

    if (error) {
      console.error('Error validating maternity leave:', error);
      return {
        valid: false,
        message: 'Erro ao validar licença maternidade'
      };
    }

    return data as unknown as MaternityLeaveValidation;
  } catch (error) {
    console.error('Exception validating maternity leave:', error);
    return {
      valid: false,
      message: 'Erro ao validar licença maternidade'
    };
  }
};

export const calculateMaternityEndDate = (
  startDate: Date,
  totalDays: number
): Date => {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + totalDays - 1);
  return endDate;
};

// Validate if start date is not more than 28 days before delivery
export const validateStartDateRange = (
  startDate: Date,
  expectedDeliveryDate: Date
): { valid: boolean; message?: string } => {
  const daysBefore = Math.ceil(
    (expectedDeliveryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysBefore > 28) {
    return {
      valid: false,
      message: `Licença maternidade só pode iniciar até 28 dias antes do parto previsto. Você está tentando iniciar ${daysBefore} dias antes.`
    };
  }

  if (daysBefore < 0) {
    return {
      valid: false,
      message: 'A data de início não pode ser posterior à data prevista do parto.'
    };
  }

  return { valid: true };
};

// Calculate expected delivery date based on start date (assuming max 28 days before)
export const calculateExpectedDeliveryDate = (startDate: Date): Date => {
  const deliveryDate = new Date(startDate);
  deliveryDate.setDate(deliveryDate.getDate() + 28);
  return deliveryDate;
};
