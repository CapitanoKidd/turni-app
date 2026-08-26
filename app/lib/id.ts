/** Id locale, sufficiente per identificare i record salvati sul dispositivo. */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
