import { z } from "zod";

export const EMPLOYEE_ID_PATTERN = /^\d+$/;

export const EMPLOYEE_ID_ERROR = "Employee ID must contain numbers only.";

export const employeeIdSchema = z
  .string()
  .trim()
  .min(1, "Employee ID is required.")
  .regex(EMPLOYEE_ID_PATTERN, EMPLOYEE_ID_ERROR);

export function sanitizeEmployeeIdInput(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeCriteriaReviewEmployeeId(employeeId: string): string {
  return sanitizeEmployeeIdInput(employeeId.trim());
}
