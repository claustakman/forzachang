#!/usr/bin/env python3
"""
scrape_stats.py — Scraper historisk statistik fra forzachang.dk

Generer seed SQL til player_stats_legacy tabellen.

Brug:
    python3 scripts/scrape_stats.py > database/seed_stats.sql
    wrangler d1 execute forzachang-db --remote --file=database/seed_stats.sql

Kræver: pip install requests beautifulsoup4
"""

import sys
import re
import uuid
import time
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://forzachang.dk"

# Alle spiller-IDs fra den gamle app
# Aktive (spiller stadig / nyligt aktive)
ACTIVE_IDS   = [54, 2, 55, 42, 3, 14, 37, 45, 50, 56, 53, 57, 44, 51]
# Tidligere spillere
INACTIVE_IDS = [4, 13, 7, 6, 15, 9, 12, 5, 20, 21, 11, 19, 25, 8, 40, 16, 17, 10]

ALL_IDS = ACTIVE_IDS + INACTIVE_IDS


def fetch_player(player_id: int) -> dict | None:
    """Hent statistik for én spiller fra den gamle app."""
    url = f"{BASE_URL}/spiller.php?id={player_id}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"-- FEJL ved hentning af spiller {player_id}: {e}", file=sys.stderr)
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Hent spillernavn
    name_el = soup.find("h1") or soup.find("h2")
    name = name_el.get_text(strip=True) if name_el else f"Spiller {player_id}"

    # Find statistiktabel — leder efter tabel med sæson-kolonner
    seasons = []
    tables = soup.find_all("table")
    for table in tables:
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        # Tjek om tabellen indeholder sæson/år og statistik-kolonner
        if not any(h in headers for h in ["sæson", "år", "season"]):
            continue

        for row in table.find_all("tr")[1:]:  # skip header-row
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if len(cells) < 3:
                continue

            # Første celle er typisk sæson/år
            season_raw = cells[0]
            season_match = re.search(r"(20\d{2}|19\d{2})", season_raw)
            if not season_match:
                continue
            season = int(season_match.group(1))

            def safe_int(val: str) -> int:
                try:
                    return int(re.sub(r"[^\d]", "", val) or "0")
                except ValueError:
                    return 0

            # Prøv at matche kolonner på header-position
            col = {h: i for i, h in enumerate(headers)}
            matches      = safe_int(cells[col.get("kampe", col.get("matches", 1))] if len(cells) > 1 else "0")
            goals        = safe_int(cells[col.get("mål", col.get("goals", 2))]     if len(cells) > 2 else "0")
            mom          = safe_int(cells[col.get("mom", 3)]                        if len(cells) > 3 else "0")
            yellow_cards = safe_int(cells[col.get("gule", col.get("yellow", 4))]   if len(cells) > 4 else "0")
            red_cards    = safe_int(cells[col.get("røde", col.get("red", 5))]      if len(cells) > 5 else "0")
            fines_amount = safe_int(cells[col.get("bøde", col.get("fines", 6))]   if len(cells) > 6 else "0")

            if matches > 0:
                seasons.append({
                    "season":       season,
                    "matches":      matches,
                    "goals":        goals,
                    "mom":          mom,
                    "yellow_cards": yellow_cards,
                    "red_cards":    red_cards,
                    "fines_amount": fines_amount,
                })

    return {"old_id": player_id, "name": name, "seasons": seasons}


def to_sql_string(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main():
    print("-- Automatisk genereret af scripts/scrape_stats.py")
    print("-- Kør: wrangler d1 execute forzachang-db --remote --file=database/seed_stats.sql")
    print("--")
    print("-- OBS: player_id skal matche den faktiske UUID i players-tabellen.")
    print("-- Erstat OLD_ID_X med de rigtige UUIDs fra din database.")
    print("-- Hent dem med: wrangler d1 execute forzachang-db --remote --command \"SELECT id, name FROM players;\"")
    print()

    all_players = []

    for old_id in ALL_IDS:
        print(f"-- Henter spiller {old_id}...", file=sys.stderr)
        player = fetch_player(old_id)
        if not player:
            continue
        all_players.append(player)
        time.sleep(0.3)  # Vær høflig mod serveren

    # Generer SQL
    print("-- ── Seed: player_stats_legacy ──────────────────────────────────────────────")
    print()

    for player in all_players:
        if not player["seasons"]:
            print(f"-- Ingen statistik fundet for: {player['name']} (old_id={player['old_id']})")
            continue

        print(f"-- {player['name']} (old_id={player['old_id']})")
        print(f"-- Erstat OLD_ID_{player['old_id']} med den rigtige UUID fra players-tabellen")
        print()

        for s in player["seasons"]:
            row_id = str(uuid.uuid4())
            print(
                f"INSERT OR IGNORE INTO player_stats_legacy "
                f"(id, player_id, season, matches, goals, mom, yellow_cards, red_cards, fines_amount) VALUES ("
                f"{to_sql_string(row_id)}, "
                f"'OLD_ID_{player['old_id']}', "  # <-- erstat med rigtig UUID
                f"{s['season']}, "
                f"{s['matches']}, "
                f"{s['goals']}, "
                f"{s['mom']}, "
                f"{s['yellow_cards']}, "
                f"{s['red_cards']}, "
                f"{s['fines_amount']}"
                f");"
            )
        print()

    print("-- ── Klar! Husk at erstatte OLD_ID_X med rigtige UUIDs. ─────────────────────")


if __name__ == "__main__":
    main()
