import { createContext, useContext, useState, ReactNode } from 'react';
import { api, Player } from './api';

interface AuthCtx {
  player: Player | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updatePlayer: (data: Partial<Player>) => void;
  isAdmin: boolean;
  isTrainer: boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(() => {
    try {
      const p = localStorage.getItem('fc_player');
      return p ? JSON.parse(p) : null;
    } catch { return null; }
  });

  async function login(username: string, password: string) {
    const res = await api.login(username, password);
    localStorage.setItem('fc_token', res.token);
    localStorage.setItem('fc_player', JSON.stringify(res.player));
    setPlayer(res.player);
  }

  function logout() {
    localStorage.removeItem('fc_token');
    localStorage.removeItem('fc_player');
    setPlayer(null);
  }

  function updatePlayer(data: Partial<Player>) {
    const updated = { ...player!, ...data };
    localStorage.setItem('fc_player', JSON.stringify(updated));
    setPlayer(updated);
  }

  return (
    <Ctx.Provider value={{
      player,
      login,
      logout,
      updatePlayer,
      isAdmin: player?.role === 'admin',
      isTrainer: player?.role === 'trainer' || player?.role === 'admin',
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
