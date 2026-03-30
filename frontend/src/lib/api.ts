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
  deletePlayer: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/players/${id}`),
  deletePlayerPermanently: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/players/${id}?permanent=1`),

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
  email?: string;
  role: 'player' | 'admin' | 'trainer';
  active: number;
  birth_date?: string;
  shirt_number?: number;
  license_number?: string;
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

export interface FinesResponse {
  fines: Fine[];
  types: FineType[];
  totals: { player_id: string; name: string; total: number; paid: number }[];
}
