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

  return {
    available: hasUsedThisYear ? 0 : 1,
    canRequest: !hasUsedThisYear,
    message: hasUsedThisYear 
      ? `Day-off já utilizado este ano. Próximo reset: 01/01/${currentYear + 1}`
      : "1 Day-off disponível para o seu aniversário"
  };
}

export function getDayOffResetDate(): Date {
  const nextYear = new Date().getFullYear() + 1;
  return new Date(nextYear, 0, 1); // 01/01 of next year
}
