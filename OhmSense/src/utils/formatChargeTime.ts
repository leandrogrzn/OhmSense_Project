const MINUTES_PER_HOUR = 60;

/**
 * Formats a charge duration expressed in minutes as a compact human readable
 * string, e.g. 84 -> "1 h 24 min", 45 -> "45 min", 120 -> "2 h".
 */
export function formatChargeTime(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return "";
  }

  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const remainder = totalMinutes % MINUTES_PER_HOUR;

  if (hours === 0) {
    return `${remainder} min`;
  }
  if (remainder === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${remainder} min`;
}
