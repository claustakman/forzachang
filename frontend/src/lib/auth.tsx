import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, Player } from './api';

interface AuthCtx {
  player: Player | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isTreasurer: boolean;
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

  return (
    <Ctx.Provider value={{
      player,
      login,
      logout,
      isAdmin: player?.role === 'admin',
      isTreasurer: player?.role === 'treasurer' || player?.role === 'admin',
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
