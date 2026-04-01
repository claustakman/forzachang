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
ACTIVE_IDS   = [54, 2, 55, 42, 3, 14, 37, 45, 50, 56, 53, 57, 44, 51]
INACTIVE_IDS = [4, 13, 7, 6, 15, 9, 12, 5, 20, 21, 11, 19, 25, 8, 40, 16, 17, 10]
ALL_IDS = ACTIVE_IDS + INACTIVE_IDS

# Mapping fra gamle ID → ny player-id i databasen
# Bygget ud fra navn-match
ID_MAP = {
    # Navn fra forzachang.dk → ny player-id (verificeret manuelt)
    54: "thomas.bryrup",        # Thomas Bryrup
    2:  "casper.sorrig",        # Casper Sørrig
    55: "morten.caroe",         # Morten Carøe
    42: "jeppe.dyrberg",        # Jeppe Dyrberg
    3:  "christian.naesby",     # Christian Næsby
    14: "morten.ladegaard",     # Morten Ladegaard
    37: "mikael.strandbygaard", # Mikael Strandbygaard
    45: "henrik.stein",         # Henrik Stein
    50: "mathias.elisberg",     # Mathias Elisberg
    56: "andreas.johannsen",    # Andreas Johannsen
    53: "henrik.kjaersgaard",   # Henrik Kjærsgaard
    57: "joel.diaz-varela",     # Joel Diaz-Varela
    44: "rasmus.nissen",        # Rasmus Nissen
    51: "claus.takman",         # Claus Takman (Claus Christensen i DB)
    # Tidligere spillere
    4:  "thomas.andersson",     # Thomas Andersson
    13: "daniel.bachmann",      # Daniel Bachmann
    7:  "morten.buus",          # Morten Buus
    6:  "kenneth.christensen",  # Kenneth Christensen
    15: "anders.guldborg",      # Anders Guldborg
    9:  "peter.hesselholt",     # Peter Hesselholt
    12: "jacob.jorgensen",      # Jacob Jørgensen
    5:  "morten.larsen",        # Morten Larsen
    20: "mads.lybaech",         # Mads Lybæch
    21: "morten.lydal",         # Morten Lydal
    11: "kristian.nohr",        # Kristian Nøhr
    19: "soren.nohr",           # Søren Nøhr
    25: "bo.praesius",          # Bo Præsius
    8:  "ivar.rosendal",        # Ivar Rosendal
    40: "morten.sorensen",      # Morten Sørensen
    16: "peter.tornsberg",      # Peter Tornsberg
    17: "christian.vendelbo",   # Christian Vendelbo
    10: "jens.zebis",           # Jens Erik Zebis
}


def fetch_player(player_id: int) -> dict | None:
    url = f"{BASE_URL}/spiller.php?id={player_id}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"-- FEJL ved hentning af spiller {player_id}: {e}", file=sys.stderr)
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = soup.find_all("table")

    # Navn fra Table 2 (Fornavn: / Efternavn:)
    first, last = "", ""
    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if len(cells) >= 2:
                if cells[0] == "Fornavn:":
                    first = cells[1]
                elif cells[0] == "Efternavn:":
                    last = cells[1]
    name = f"{first} {last}".strip() or f"Spiller_{player_id}"

    # Statistik fra Table 3 (headers: Sæson, Kampe, Mål, MoM, Gule, Røde, Bøder)
    seasons = []
    for table in tables:
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if "Sæson" not in headers:
            continue

        # Kolonneindeks
        def ci(name):
            try: return headers.index(name)
            except ValueError: return -1

        idx_season = ci("Sæson")
        idx_matches = ci("Kampe")
        idx_goals   = ci("Mål")
        idx_mom     = ci("MoM")
        idx_yellow  = ci("Gule")
        idx_red     = ci("Røde")
        idx_fines   = ci("Bøder")

        for row in table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            # Fjern tomme mellemceller (opstår fra colspan i HTML)
            cells = [c for c in cells if c != ""]
            if not cells or cells[0] == "I alt":
                continue
            # Tjek det er et årstal
            if not re.match(r"^\d{4}$", cells[0]):
                continue

            def safe(idx):
                try: return int(cells[idx]) if idx >= 0 and idx < len(cells) else 0
                except (ValueError, IndexError): return 0

            season = int(cells[0])
            matches = safe(idx_matches)
            if matches == 0:
                continue

            seasons.append({
                "season":       season,
                "matches":      matches,
                "goals":        safe(idx_goals),
                "mom":          safe(idx_mom),
                "yellow_cards": safe(idx_yellow),
                "red_cards":    safe(idx_red),
                "fines_amount": safe(idx_fines),
            })

    print(f"  {name}: {len(seasons)} sæsoner", file=sys.stderr)
    return {"old_id": player_id, "name": name, "seasons": seasons}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    print("-- Automatisk genereret af scripts/scrape_stats.py")
    print("-- Kør: wrangler d1 execute forzachang-db --remote --file=database/seed_stats.sql")
    print()
    print("-- ── Seed: player_stats_legacy ──────────────────────────────────────────────")
    print()

    for old_id in ALL_IDS:
        print(f"-- Henter spiller {old_id}...", file=sys.stderr)
        player = fetch_player(old_id)
        if not player or not player["seasons"]:
            print(f"-- Ingen data for old_id={old_id}")
            continue

        new_id = ID_MAP.get(old_id)
        if not new_id:
            print(f"-- ADVARSEL: Ingen mapping for old_id={old_id} ({player['name']})")
            continue

        print(f"-- {player['name']} ({new_id})")
        for s in player["seasons"]:
            print(
                f"INSERT OR IGNORE INTO player_stats_legacy "
                f"(id, player_id, season, matches, goals, mom, yellow_cards, red_cards, fines_amount) VALUES ("
                f"{q(str(uuid.uuid4()))}, {q(new_id)}, {s['season']}, "
                f"{s['matches']}, {s['goals']}, {s['mom']}, "
                f"{s['yellow_cards']}, {s['red_cards']}, {s['fines_amount']});"
            )
        print()

        time.sleep(0.3)

    print("-- ── Færdig ─────────────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()
