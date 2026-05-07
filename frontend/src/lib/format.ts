// Fælles datoformateringshjælpere — bruges på tværs af alle sider

const DA = 'da-DK';

/** "3. jun 2024" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DA, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "tir 3. jun kl. 18:00" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(DA, { weekday: 'short', day: 'numeric', month: 'short' })
    + ' kl. ' + d.toLocaleTimeString(DA, { hour: '2-digit', minute: '2-digit' });
}

/** "3. jun kl. 18:00" (dag + måned + klokkeslæt — bruges til tilmeldingsfrist) */
export function fmtDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(DA, { day: 'numeric', month: 'short' })
    + ' kl. ' + d.toLocaleTimeString(DA, { hour: '2-digit', minute: '2-digit' });
}

/** "18:00" */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(DA, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Relativ dato — "lige nu", "5 min siden", "3 t siden", derefter kort dato.
 * Vises uden årstal hvis det er indeværende år.
 * "3. jun" (i år) eller "3. jun 2022" (andet år)
 */
export function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'lige nu';
  if (diffMin < 60) return `${diffMin} min siden`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} t siden`;
  return d.toLocaleDateString(DA, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/** "3. jun 2024 kl. 18:00" (bruges til admin login-log) */
export function fmtDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString(DA, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "TIR" — kort ugedag med store bogstaver */
export function fmtWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString(DA, { weekday: 'short' }).toUpperCase();
}

/** Dag-tal som streng, fx "3" */
export function fmtDay(iso: string): string {
  return new Date(iso).getDate().toString();
}

/** "JUN" — kort måned med store bogstaver */
export function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(DA, { month: 'short' }).toUpperCase();
}
