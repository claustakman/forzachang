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
  const headers: Record<string, string> = { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) };
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

  // Kommentarer (fase 7)
  getComments: (eventId: string) =>
    req<EventComment[]>('GET', `/events/${eventId}/comments`),
  createComment: (eventId: string, body: string) =>
    req<EventComment>('POST', `/events/${eventId}/comments`, { body }),
  updateComment: (eventId: string, commentId: string, body: string) =>
    req<{ ok: boolean }>('PUT', `/events/${eventId}/comments/${commentId}`, { body }),
  deleteComment: (eventId: string, commentId: string) =>
    req<{ ok: boolean }>('DELETE', `/events/${eventId}/comments/${commentId}`),
  markCommentsRead: (eventId: string) =>
    req<{ ok: boolean }>('POST', `/events/${eventId}/comments/read`, {}),

  // Kampstatistik
  getEventStats: (eventId: string) =>
    req<EventStatsResponse>('GET', `/events/${eventId}/stats`),
  saveEventStats: (eventId: string, rows: MatchStatRow[], skippedAutoFines?: Record<string, string[]>) =>
    req<{ ok: boolean }>('POST', '/stats', { event_id: eventId, rows, skipped_auto_fines: skippedAutoFines ?? {} }),

  // Legacy stats import
  saveLegacyStats: (rows: { player_id: string; season: number; matches: number; goals: number; mom: number; yellow_cards: number; red_cards: number; fines_amount: number }[]) =>
    req<{ ok: boolean }>('POST', '/stats/legacy', rows),

  // Settings
  getSettings: () => req<Record<string, string>>('GET', '/settings'),
  updateSettings: (data: Record<string, string>) => req<{ ok: boolean }>('PUT', '/settings', data),
  syncWebcal: () => req<{ ok: boolean }>('POST', '/settings/sync'),
  bulkUpdateDeadlines: (days: number) =>
    req<{ updated: number }>('POST', '/settings/bulk-deadlines', { days }),

  // Fines (fase 6)
  getFineTypes: () => req<FineType[]>('GET', '/fine-types'),
  createFineType: (data: Partial<FineType>) => req<FineType>('POST', '/fine-types', data),
  updateFineType: (id: string, data: Partial<FineType>) => req<FineType>('PUT', `/fine-types/${id}`, data),
  deleteFineType: (id: string) => req<{ ok: boolean }>('DELETE', `/fine-types/${id}`),

  getFines: (playerId?: string) =>
    req<Fine[]>('GET', `/fines${playerId ? `?player_id=${playerId}` : ''}`),
  createFine: (data: { player_id: string; fine_type_id: string; event_id?: string; note?: string }) =>
    req<Fine>('POST', '/fines', data),
  deleteFine: (id: string) => req<{ ok: boolean }>('DELETE', `/fines/${id}`),

  getFineSummary: () => req<PlayerFinesSummary[]>('GET', '/fines/summary'),

  getFinePayments: (playerId?: string) =>
    req<FinePayment[]>('GET', `/fine-payments${playerId ? `?player_id=${playerId}` : ''}`),
  createFinePayment: (data: { player_id: string; amount: number; note?: string }) =>
    req<FinePayment>('POST', '/fine-payments', data),
  deleteFinePayment: (id: string) => req<{ ok: boolean }>('DELETE', `/fine-payments/${id}`),

  // Legacy fines (bagudkompatibel)
  addFine: (data: { player_id: string; fine_type_id: string; reason?: string }) =>
    req<{ ok: boolean }>('POST', '/fines', data),
  payFine: (id: string) =>
    req<{ ok: boolean }>('PUT', `/fines/${id}/pay`, {}),

  // Hædersbevisninger (fase 8)
  getHonors: (playerId?: string) =>
    req<PlayerHonor[]>('GET', `/honors${playerId ? `?player_id=${playerId}` : ''}`),
  getHonorsSummary: () =>
    req<HonorsSummary>('GET', '/honors/summary'),
  createHonor: (data: { player_id: string; honor_type_id: string; season: number }) =>
    req<{ ok: boolean }>('POST', '/honors', data),
  deleteHonor: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/honors/${id}`),

  // Holdrekorder (fase 10)
  getRecords: () =>
    req<{ oldboys: TeamRecord[]; senior: TeamRecord[] }>('GET', '/records'),
  updateRecord: (id: string, data: { value?: string; context?: string; label?: string }) =>
    req<{ ok: boolean }>('PUT', `/records/${id}`, data),

  // Holdhistorik / Tabeller (fase 10)
  getStandings: (params?: { team_type?: string; season?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<SeasonStanding[]>('GET', `/standings${qs ? '?' + qs : ''}`);
  },
  createStanding: (data: Partial<SeasonStanding>) =>
    req<{ ok: boolean }>('POST', '/standings', data),
  updateStanding: (id: string, data: Partial<SeasonStanding>) =>
    req<{ ok: boolean }>('PUT', `/standings/${id}`, data),
  getStandingMatches: (params?: { team_type?: string; season?: string; opponent?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<SeasonMatch[]>('GET', `/standings/matches${qs ? '?' + qs : ''}`);
  },

  // Opslagstavle (fase 11)
  getBoardPosts: (page = 1, q?: string, archived = false) =>
    req<{ pinned: BoardPost[]; posts: BoardPost[]; total: number; page: number; hasMore: boolean }>('GET', `/board/posts?page=${page}&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}${archived ? '&archived=1' : ''}`),
  archiveBoardPost: (id: string) =>
    req<{ ok: boolean; archived: number }>('POST', `/board/posts/${id}/archive`, {}),
  createBoardPost: (body: string, title?: string) =>
    req<BoardPost>('POST', '/board/posts', { body, title }),
  updateBoardPost: (id: string, body: string, title?: string) =>
    req<{ ok: boolean }>('PUT', `/board/posts/${id}`, { body, title }),
  deleteBoardPost: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/board/posts/${id}`),
  pinBoardPost: (id: string) =>
    req<{ ok: boolean; pinned: number }>('POST', `/board/posts/${id}/pin`, {}),
  getBoardComments: (postId: string) =>
    req<BoardComment[]>('GET', `/board/posts/${postId}/comments`),
  createBoardComment: (postId: string, body: string) =>
    req<BoardComment>('POST', `/board/posts/${postId}/comments`, { body }),
  updateBoardComment: (postId: string, commentId: string, body: string) =>
    req<{ ok: boolean }>('PUT', `/board/posts/${postId}/comments/${commentId}`, { body }),
  deleteBoardComment: (postId: string, commentId: string) =>
    req<{ ok: boolean }>('DELETE', `/board/posts/${postId}/comments/${commentId}`),
  uploadBoardAttachment: (postId: string, file: File) =>
    uploadFile<BoardAttachment>(`/board/posts/${postId}/attachments`, file),
  deleteBoardAttachment: (attachmentId: string) =>
    req<{ ok: boolean }>('DELETE', `/board/attachments/${attachmentId}`),
  markBoardRead: () =>
    req<{ ok: boolean }>('POST', '/board/read', {}),

  // Kampens Spiller afstemning (fase 12)
  getActiveVoteSession: () =>
    req<{ session: VoteSession | null }>('GET', '/votes'),
  createVoteSession: (eventId: string, candidateIds: string[], voterIds: string[], duration: number) =>
    req<{ session_id: string }>('POST', '/votes/sessions', { event_id: eventId, candidate_ids: candidateIds, voter_ids: voterIds, duration_seconds: duration }),
  deleteVoteSession: (sessionId: string) =>
    req<{ ok: boolean }>('DELETE', `/votes/sessions/${sessionId}`),
  castVote: (sessionId: string, candidateId: string) =>
    req<{ ok: boolean }>('POST', `/votes/sessions/${sessionId}/vote`, { candidate_id: candidateId }),
  getVoteResults: (sessionId: string) =>
    req<VoteResults>('GET', `/votes/sessions/${sessionId}/results`),
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
  notify_email?: number;
  notify_push?: number;
}

/** Returnerer alias hvis sat, ellers fuldt navn */
export function displayName(p: { name: string; alias?: string }): string {
  return p.alias?.trim() || p.name;
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
  auto_assign?: string;
  active: number;
  sort_order: number;
}

export interface Fine {
  id: string;
  player_id: string;
  player_name: string;
  player_full_name?: string;
  player_alias?: string;
  player_avatar_url?: string;
  fine_type_id: string;
  fine_type_name: string;
  event_id?: string;
  event_title?: string;
  amount: number;
  note?: string;
  assigned_by: string;
  created_at: string;
}

export interface FinePayment {
  id: string;
  player_id: string;
  player_name: string;
  player_avatar_url?: string;
  amount: number;
  note?: string;
  registered_by: string;
  created_at: string;
}

export interface PlayerFinesSummary {
  player_id: string;
  name: string;
  full_name: string;
  alias?: string;
  avatar_url?: string;
  active: number;
  total_fines: number;
  total_payments: number;
  balance: number;
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
  unread_comments?: number;
}

export interface EventComment {
  id: string;
  event_id: string;
  player_id: string;
  body: string;
  edited_at?: string;
  deleted: number;
  created_at: string;
  author_name: string;
  author_avatar_url?: string;
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

// Legacy — bruges ikke mere af Fines.tsx men beholdes for bakudkompatibilitet
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
  no_signup: number;
}

export interface EventStatsSignup {
  id: string;
  name: string;
  avatar_url?: string;
  status: 'tilmeldt' | 'afmeldt' | 'ikke meldt';
  signed_at?: string;
}

export interface EventStatsResponse {
  event: Event;
  signups: EventStatsSignup[];
  stats: (MatchStatRow & { id: string; event_id: string })[];
  auto_stats: MatchStatRow[];
  fine_types: FineType[];
  existing_fines: { player_id: string; fine_type_id: string }[];
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

export interface HonorType {
  id: string;
  key: string;
  name: string;
  type: 'auto' | 'manual';
  threshold_type?: string;
  threshold_value?: number;
  sort_order: number;
}

export interface PlayerHonor {
  id: string;
  player_id: string;
  honor_type_id: string;
  honor_key: string;
  honor_name: string;
  honor_type: 'auto' | 'manual';
  season?: number;
  sort_order: number;
  awarded_by?: string;
  created_at: string;
  // Kun i summary/list endpoints
  player_name?: string;
  avatar_url?: string;
  player_active?: number;
}

export interface HonorsSummary {
  types: HonorType[];
  honors: PlayerHonor[];
}

// Udvidet StatRow med mom, active, avatar og fuldt navn
export interface StatsRow {
  id: string;
  name: string;         // alias ?? fuldt navn (til visning)
  full_name: string;    // fuldt navn (til spillerprofil-header)
  alias?: string;
  avatar_url?: string;
  active: number;
  matches: number;
  goals: number;
  mom: number;
  yellow_cards: number;
  red_cards: number;
  fines_amount: number;
}

// Holdrekorder (fase 10)
export interface TeamRecord {
  id: string;
  team_type: 'oldboys' | 'senior';
  record_key: string;
  label: string;
  value: string;
  context?: string;
  auto_update: number;
  sort_order: number;
  updated_at: string;
}

// Holdhistorik (fase 10)
export interface SeasonStanding {
  id: string;
  team_type: string;
  season: number;
  position?: number;
  league?: string;
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  goals_for?: number;
  goals_against?: number;
  points?: number;
  imported_at: string;
}

export interface SeasonMatch {
  id: string;
  team_type: string;
  season: number;
  match_date: string;
  opponent: string;
  home_away?: string;
  goals_for?: number;
  goals_against?: number;
  result?: string;
}

// Opslagstavle (fase 11)
export interface BoardAttachment {
  id: string;
  type: 'image' | 'document';
  filename: string;
  url: string;
  size_bytes: number;
}

export interface BoardPost {
  id: string;
  player_id: string;
  title?: string;
  body: string;
  archived?: number;
  pinned: number;
  pinned_by?: string;
  edited_at?: string;
  deleted: number;
  created_at: string;
  author_name: string;
  author_avatar_url?: string;
  comment_count: number;
  attachment_count: number;
  attachments?: BoardAttachment[];
}

export interface BoardComment {
  id: string;
  post_id: string;
  player_id: string;
  body: string;
  edited_at?: string;
  deleted: number;
  created_at: string;
  author_name: string;
  author_avatar_url?: string;
}

// Kampens Spiller afstemning (fase 12)
export interface VotePlayer {
  id: string;
  name: string;
  avatar_url?: string;
  shirt_number?: number;
}

export interface VoteSession {
  id: string;
  event_id: string;
  event_title?: string;
  start_time?: string;
  started_by: string;
  started_by_name?: string;
  started_at: string;
  ends_at: string;
  status: 'active' | 'closed';
  candidates: VotePlayer[];
  voters: VotePlayer[];
  vote_count?: number;
  my_vote?: string | null;
}

export interface VoteResult extends VotePlayer {
  votes: number;
}

export interface VoteResults {
  session: VoteSession;
  results: VoteResult[];
  total_votes: number;
  my_vote: string | null;
}
