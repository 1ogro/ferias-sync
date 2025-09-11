import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formats a date to DD/MM/YYYY string
 */
export function formatDateToBRString(date: Date | undefined): string {
  if (!date) return "";
  return format(date, "dd/MM/yyyy");
}

/**
 * Parses a DD/MM/YYYY string to Date
 */
export function parseBRStringToDate(dateString: string): Date | undefined {
  if (!dateString || dateString.length !== 10) return undefined;
  
  const parsed = parse(dateString, "dd/MM/yyyy", new Date());
  return isValid(parsed) ? parsed : undefined;
}

/**
 * Applies DD/MM/YYYY mask while typing
 */
export function applyDateMask(value: string): string {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Apply mask based on length
  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
}

/**
 * Validates if a date string is valid DD/MM/YYYY
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString || dateString.length !== 10) return false;
  
  const date = parseBRStringToDate(dateString);
  return date !== undefined && 
         date >= new Date("1930-01-01") && 
         date <= new Date();
}

/**
 * Checks if today is someone's birthday
 */
export function isBirthdayToday(birthDate: string | Date): boolean {
  const today = new Date();
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  
  return today.getMonth() === birth.getMonth() && 
         today.getDate() === birth.getDate();
}

/**
 * Gets month names in Portuguese
 */
export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];