import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Request, TipoAusencia, Status, Person } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Day-off utility functions
export function hasUsedDayOffThisYear(requests: Request[], currentYear: number = new Date().getFullYear()): boolean {
  return requests.some(request => 
    request.tipo === TipoAusencia.DAYOFF &&
    [Status.APROVADO_FINAL, Status.REALIZADO].includes(request.status) &&
    request.inicio.getFullYear() === currentYear
  );
}

export function calculateAvailableDayOffs(person: Person | null, requests: Request[]): {
  available: number;
  canRequest: boolean;
  message: string;
} {
  if (!person?.data_nascimento) {
    return {
      available: 0,
      canRequest: false,
      message: "É necessário cadastrar sua data de nascimento no perfil, para poder solicitar um Day-off"
    };
  }

  const currentYear = new Date().getFullYear();
  const hasUsedThisYear = hasUsedDayOffThisYear(requests, currentYear);

  if (hasUsedThisYear) {
    return {
      available: 0,
      canRequest: false,
      message: `Day-off já utilizado este ano. Próximo reset: 01/01/${currentYear + 1}`
    };
  }

  // Check if currently within eligibility period (from first day of birthday month to day before next birthday)
  const birth = new Date(person.data_nascimento);
  const eligibilityStartThisYear = new Date(currentYear, birth.getMonth(), 1);
  const today = new Date();
  
  if (today < eligibilityStartThisYear) {
    const eligibilityStr = eligibilityStartThisYear.toLocaleDateString('pt-BR');
    return {
      available: 1,
      canRequest: false,
      message: `Day-off disponível a partir de ${eligibilityStr} (início do mês de aniversário)`
    };
  }

  return {
    available: 1,
    canRequest: true,
    message: "1 Day-off disponível até a véspera do seu próximo aniversário"
  };
}

export function getDayOffResetDate(): Date {
  const nextYear = new Date().getFullYear() + 1;
  return new Date(nextYear, 0, 1); // 01/01 of next year
}

// Permission validation functions
export function canEditUser(currentUser: Person | null, targetUser: Person): boolean {
  if (!currentUser) return false;
  
  // Only directors can edit other directors
  if (targetUser.papel === "DIRETOR") {
    return currentUser.papel === "DIRETOR";
  }
  
  // Admins can edit non-directors
  return currentUser.is_admin;
}

export function canPromoteToDirector(currentUser: Person | null): boolean {
  if (!currentUser) return false;
  return currentUser.papel === "DIRETOR";
}

export function canEditAdminPermission(currentUser: Person | null, targetUser: Person): boolean {
  if (!currentUser) return false;
  
  // Only directors can change admin permissions of directors
  if (targetUser.papel === "DIRETOR") {
    return currentUser.papel === "DIRETOR";
  }
  
  // Admins can change admin permissions of non-directors
  return currentUser.is_admin;
}
