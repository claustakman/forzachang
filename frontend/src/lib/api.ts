// API client — talks to the Cloudflare Worker

const BASE = import.meta.env.PROD
  ? 'https://forzachang-api.claus-takman.workers.dev/api'
  : '/api';

function getToken(): string | null {
  return localStorage.getItem('fc_token');
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error((err as any).error || 'Server error');
  }

  return res.json();
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': file.type };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error((err as any).error || 'Server error');
  }

  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    req<{ token: string; player: Player }>('POST', '/auth/login', { username, password }),

  // Players
  getPlayers: (includeInactive?: boolean) =>
    req<Player[]>('GET', `/players${includeInactive ? '?include_inactive=1' : ''}`),
  createPlayer: (data: Partial<Player> & { password: string }) =>
    req<{ ok: boolean }>('POST', '/players', data),
  updatePlayer: (id: string, data: Partial<Player> & { password?: string }) =>
    req<{ ok: boolean }>('PUT', `/players/${id}`, data),
  uploadAvatar: (id: string, file: File) =>
    uploadFile<{ ok: boolean; avatar_url: string }>(`/players/${id}/avatar`, file),
  getPlayerLogins: (id: string) =>
    req<LoginEntry[]>('GET', `/players/${id}/logins`),
  deletePlayer: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/players/${id}`),
  deletePlayerPermanently: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/players/${id}?permanent=1`),
  sendInvite: (playerId: string) =>
    req<{ ok: boolean }>('POST', '/auth/invite', { player_id: playerId }),
  requestPasswordReset: (email: string) =>
    req<{ ok: boolean }>('POST', '/auth/reset-request', { email }),
  resetPassword: (token: string, password: string) =>
    req<{ ok: boolean }>('POST', '/auth/reset', { token, password }),
  changePassword: (id: string, current: string, next: string) =>
    req<{ ok: boolean }>('POST', '/auth/change-password', { id, current, next }),

  // Matches
  getMatches: (season?: string) =>
    req<Match[]>('GET', `/matches${season ? `?season=${season}` : ''}`),
  getMatchSignups: (matchId: string) =>
    req<Signup[]>('GET', `/matches/${matchId}/signups`),
  createMatch: (data: Partial<Match>) =>
    req<{ id: string }>('POST', '/matches', data),
  deleteMatch: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/matches/${id}`),

  // Signups
  setSignup: (match_id: string, status: 'yes' | 'no') =>
    req<{ ok: boolean }>('POST', '/signups', { match_id, status }),

  // Stats
  getStats: (season?: string) =>
    req<StatRow[]>('GET', `/stats${season ? `?season=${season}` : ''}`),
  getPlayerStats: (playerId: string) =>
    req<SeasonStats[]>('GET', `/stats?player_id=${playerId}`),
  saveStats: (data: { match_id: string; player_id: string; goals: number; yellow_cards: number; red_cards: number; played: number }) =>
    req<{ ok: boolean }>('POST', '/stats', data),

  // Events
  getEvents: (params?: { tab?: string; type?: string; season?: string; q?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<Event[]>('GET', `/events${qs ? '?' + qs : ''}`);
  },
  getEvent: (id: string) => req<EventDetail>('GET', `/events/${id}`),
  createEvent: (data: Partial<Event> & { organizer_ids?: string[] }) =>
    req<{ ok: boolean; id: string }>('POST', '/events', data),
  updateEvent: (id: string, data: Partial<Event> & { organizer_ids?: string[] }) =>
    req<{ ok: boolean }>('PUT', `/events/${id}`, data),
  deleteEvent: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/events/${id}`),
  setEventSignup: (id: string, status: 'tilmeldt' | 'afmeldt', message?: string, player_id?: string) =>
    req<{ ok: boolean }>('POST', `/events/${id}/signup`, { status, message, player_id }),
  deleteEventSignup: (id: string, player_id?: string) =>
    req<{ ok: boolean }>('DELETE', `/events/${id}/signup${player_id ? `?player_id=${player_id}` : ''}`),
  addEventGuest: (id: string, name: string) =>
    req<{ ok: boolean }>('POST', `/events/${id}/guests`, { name }),
  deleteEventGuest: (eventId: string, guestId: string) =>
    req<{ ok: boolean }>('DELETE', `/events/${eventId}/guests/${guestId}`),
  sendReminders: (eventId: string, playerIds: string[]) =>
    req<{ ok: boolean; sent: number }>('POST', `/events/${eventId}/remind`, { player_ids: playerIds }),

  // Kampstatistik
  getEventStats: (eventId: string) =>
    req<EventStatsResponse>('GET', `/events/${eventId}/stats`),
  saveEventStats: (eventId: string, rows: MatchStatRow[]) =>
    req<{ ok: boolean }>('POST', '/stats', { event_id: eventId, rows }),

  // Legacy stats import
  saveLegacyStats: (rows: { player_id: string; season: number; matches: number; goals: number; mom: number; yellow_cards: number; red_cards: number; fines_amount: number }[]) =>
    req<{ ok: boolean }>('POST', '/stats/legacy', rows),

  // Settings
  getSettings: () => req<Record<string, string>>('GET', '/settings'),
  updateSettings: (data: Record<string, string>) => req<{ ok: boolean }>('PUT', '/settings', data),
  syncWebcal: () => req<{ ok: boolean }>('POST', '/settings/sync'),

  // Fines
  getFines: () => req<FinesResponse>('GET', '/fines'),
  addFine: (data: { player_id: string; fine_type_id: string; reason?: string }) =>
    req<{ ok: boolean }>('POST', '/fines', data),
  payFine: (id: string) =>
    req<{ ok: boolean }>('PUT', `/fines/${id}/pay`, {}),
  deleteFine: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/fines/${id}`),
};

// Types
export interface Player {
  id: string;
  name: string;
  alias?: string;
  email?: string;
  phone?: string;
  role: 'player' | 'admin' | 'trainer';
  active: number;
  birth_date?: string;
  shirt_number?: number;
  license_number?: string;
  avatar_url?: string;
  last_seen?: string;
}

/** Returnerer alias hvis sat, ellers fornavn */
export function displayName(p: { name: string; alias?: string }): string {
  return p.alias?.trim() || p.name.split(' ')[0];
}

export interface Match {
  id: string;
  date: string;
  time: string;
  opponent: string;
  venue: 'home' | 'away';
  address?: string;
  season: string;
  notes?: string;
  signup_count?: number;
}

export interface Signup {
  id: string;
  match_id: string;
  player_id: string;
  player_name: string;
  status: 'yes' | 'no';
}

export interface StatRow {
  id: string;
  name: string;
  matches: number;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

export interface SeasonStats {
  season: string;
  matches: number;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

export interface FineType {
  id: string;
  name: string;
  amount: number;
}

export interface Fine {
  id: string;
  player_id: string;
  player_name: string;
  fine_type_id: string;
  fine_type_name: string;
  amount: number;
  reason?: string;
  issued_by_name: string;
  paid: number;
  created_at: string;
}

export interface Event {
  id: string;
  type: 'kamp' | 'event';
  title: string;
  description?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  meeting_time?: string;
  signup_deadline?: string;
  status: 'aktiv' | 'aflyst';
  webcal_uid?: string;
  season: number;
  result?: string;
  created_by?: string;
  signup_count?: number;
  my_status?: 'tilmeldt' | 'afmeldt' | null;
}

export interface EventSignup {
  player_id: string;
  name: string;
  avatar_url?: string;
  status: 'tilmeldt' | 'afmeldt';
  message?: string;
}

export interface EventOrganizer {
  player_id: string;
  name: string;
}

export interface EventGuest {
  id: string;
  name: string;
  added_by: string;
}

export interface EventDetail extends Event {
  signups: EventSignup[];
  organizers: EventOrganizer[];
  guests: EventGuest[];
}

export interface LoginEntry {
  id: string;
  ip: string | null;
  created_at: string;
}

export interface FinesResponse {
  fines: Fine[];
  types: FineType[];
  totals: { player_id: string; name: string; total: number; paid: number }[];
}

export interface MatchStatRow {
  player_id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
  mom: number;
  played: number;
  late_signup: number;
  absence: number;
}

export interface EventStatsSignup {
  id: string;
  name: string;
  avatar_url?: string;
  status: 'tilmeldt' | 'afmeldt';
  signed_at?: string;
}

export interface EventStatsResponse {
  event: Event;
  signups: EventStatsSignup[];
  stats: (MatchStatRow & { id: string; event_id: string })[];
  auto_stats: MatchStatRow[];
}

export interface PlayerSeasonStats {
  season: number;
  matches: number;
  goals: number;
  mom: number;
  yellow_cards: number;
  red_cards: number;
  fines_amount?: number;
}

// Udvidet StatRow med mom, active, avatar og fuldt navn
export interface StatsRow {
  id: string;
  name: string;         // alias ?? fornavn (til visning)
  full_name: string;    // fuldt navn (til spillerprofil-header)
  alias?: string;
  avatar_url?: string;
  active: number;
  matches: number;
  goals: number;
  mom: number;
  yellow_cards: number;
  red_cards: number;
}
