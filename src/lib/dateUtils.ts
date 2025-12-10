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
  const birth = typeof birthDate === 'string' ? parseDateSafely(birthDate) : birthDate;
  
  return today.getMonth() === birth.getMonth() && 
         today.getDate() === birth.getDate();
}

/**
 * Safely parses a date string in YYYY-MM-DD format to local timezone
 * This prevents timezone conversion issues that cause date shifts
 */
export function parseDateSafely(dateString: string): Date {
  if (!dateString) throw new Error('Date string is required');
  
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

/**
 * Formats a Date to YYYY-MM-DD string without timezone conversion issues
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if the current date is within the day-off eligibility period
 * (from birthday of current year until the day before birthday of next year)
 */
export function isWithinDayOffPeriod(birthDate: string | Date): boolean {
  const today = new Date();
  const birth = typeof birthDate === 'string' ? parseDateSafely(birthDate) : birthDate;
  
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;
  
  // First day of birthday month this year
  const eligibilityStartThisYear = new Date(currentYear, birth.getMonth(), 1);
  // Birthday next year
  const birthdayNextYear = new Date(nextYear, birth.getMonth(), birth.getDate());
  // Day before birthday next year
  const dayBeforeBirthdayNextYear = new Date(birthdayNextYear);
  dayBeforeBirthdayNextYear.setDate(dayBeforeBirthdayNextYear.getDate() - 1);
  
  // Check if today is within the eligibility period
  return today >= eligibilityStartThisYear && today <= dayBeforeBirthdayNextYear;
}

/**
 * Gets the day-off eligibility period for a given birth date
 */
export function getDayOffEligibilityPeriod(birthDate: string | Date): {
  start: Date;
  end: Date;
  isCurrentlyEligible: boolean;
} {
  const birth = typeof birthDate === 'string' ? parseDateSafely(birthDate) : birthDate;
  const today = new Date();
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;
  
  // First day of birthday month this year
  const eligibilityStartThisYear = new Date(currentYear, birth.getMonth(), 1);
  // Birthday next year
  const birthdayNextYear = new Date(nextYear, birth.getMonth(), birth.getDate());
  // Day before birthday next year
  const dayBeforeBirthdayNextYear = new Date(birthdayNextYear);
  dayBeforeBirthdayNextYear.setDate(dayBeforeBirthdayNextYear.getDate() - 1);
  
  return {
    start: eligibilityStartThisYear,
    end: dayBeforeBirthdayNextYear,
    isCurrentlyEligible: today >= eligibilityStartThisYear && today <= dayBeforeBirthdayNextYear
  };
}

/**
 * Gets month names in Portuguese
 */
export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];