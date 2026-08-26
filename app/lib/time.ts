/** Converte "HH:mm" in un Date di oggi con quell'orario, per i time picker nativi. */
export function timeStringToDate(time: string | undefined): Date {
  const base = new Date();
  if (!time) {
    base.setHours(8, 0, 0, 0);
    return base;
  }
  const [hour, minute] = time.split(":").map(Number);
  base.setHours(hour || 0, minute || 0, 0, 0);
  return base;
}

export function dateToTimeString(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
