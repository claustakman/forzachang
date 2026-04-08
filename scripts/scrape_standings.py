#!/usr/bin/env python3
"""
Scraper til historiske stillinger OG kampresultater fra forzachang.dk/stilling.php
Genererer SQL til season_standings og season_matches tabellerne.

Kør:
    python3 scripts/scrape_standings.py > database/seed_standings.sql
    wrangler d1 execute forzachang-db --remote --file=database/seed_standings.sql

Kræver:
    pip install requests beautifulsoup4
"""

import sys
import re
import uuid
import time
from datetime import datetime
from typing import Optional
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.forzachang.dk/stilling.php"
CFC_NAMES = {"cfc", "forza chang", "copenhagen forza chang", "cph. forza chang"}

SENIOR_YEARS   = list(range(2007, 2019))   # 2007-2018
OLDBOYS_YEARS  = list(range(2019, 2026))   # 2019-2025

NOW = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(year: int, vis: str) -> BeautifulSoup:
    url = f"{BASE_URL}?vis={vis}&aar={year}"
    for attempt in range(3):
        r = requests.get(url, timeout=15)
        if r.status_code == 429:
            wait = 3 + attempt * 2
            print(f" (rate limit, venter {wait}s...)", file=sys.stderr, end="")
            time.sleep(wait)
            continue
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        time.sleep(1)  # høflig pause mellem requests
        return BeautifulSoup(r.text, "html.parser")
    r.raise_for_status()  # kast fejl ved tredje forsøg


def is_cfc(name: str) -> bool:
    return name.strip().lower() in CFC_NAMES


# ── Stillinger ─────────────────────────────────────────────────────────────────

def scrape_standing(year: int, team_type: str) -> Optional[dict]:
    """
    Returnerer én dict med CFC's stilling for det givne år, eller None.

    Tabelformat (whitespace-adskilt pr. celle):
      Placering | Hold | Kampe | Vundne | Uafgjorte | Tabte | Score (X-Y) | Point
    """
    try:
        soup = fetch(year, "stilling")
    except Exception as e:
        print(f"  FEJL {year} stilling: {e}", file=sys.stderr)
        return None

    table = soup.find("table")
    if not table:
        print(f"  {year}: ingen tabel fundet", file=sys.stderr)
        return None

    rows = table.find_all("tr")
    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
        if not cells:
            continue

        # Find holdranden — anden celle er holdnavn hvis første er et tal
        # men layout kan variere; prøv begge første celler
        name_idx = None
        for idx in range(min(2, len(cells))):
            if is_cfc(cells[idx]):
                name_idx = idx
                break
        if name_idx is None:
            continue

        # Placering er cellen FØR holdnavnet (hvis den er et tal)
        position = None
        if name_idx > 0 and cells[name_idx - 1].isdigit():
            position = int(cells[name_idx - 1])

        # Resten af tallene efter holdnavnet (filtrér tomme celler fra)
        rest = [c for c in cells[name_idx + 1:] if c != ""]

        def pi(s):
            try: return int(s)
            except: return None

        played = pi(rest[0]) if len(rest) > 0 else None
        won    = pi(rest[1]) if len(rest) > 1 else None
        drawn  = pi(rest[2]) if len(rest) > 2 else None
        lost   = pi(rest[3]) if len(rest) > 3 else None

        # Score: kan være "X-Y" (én celle), eller tre celler: gf, "-", ga
        goals_for = goals_against = points = None
        if len(rest) > 4:
            score_str = rest[4]
            m = re.match(r"(\d+)[-–](\d+)", score_str)
            if m:
                # Ét felt: "42-49"
                goals_for     = int(m.group(1))
                goals_against = int(m.group(2))
                points = pi(rest[5]) if len(rest) > 5 else None
            elif pi(score_str) is not None and len(rest) > 5 and rest[5] in ("-", "–"):
                # Tre-celle-format: rest[4]=gf, rest[5]="-", rest[6]=ga, rest[7]=points
                goals_for     = pi(score_str)
                goals_against = pi(rest[6]) if len(rest) > 6 else None
                points        = pi(rest[7]) if len(rest) > 7 else None
            elif pi(score_str) is not None:
                # Fallback: gf, ga, points direkte
                goals_for     = pi(score_str)
                goals_against = pi(rest[5]) if len(rest) > 5 else None
                points        = pi(rest[6]) if len(rest) > 6 else None

        return {
            "id": str(uuid.uuid4()),
            "team_type": team_type,
            "season": year,
            "position": position,
            "league": None,   # udfyldes manuelt
            "played": played,
            "won": won,
            "drawn": drawn,
            "lost": lost,
            "goals_for": goals_for,
            "goals_against": goals_against,
            "points": points,
        }

    print(f"  {year}: CFC ikke fundet i stilling", file=sys.stderr)
    return None


# ── Kampresultater ─────────────────────────────────────────────────────────────

def scrape_matches(year: int, team_type: str) -> list[dict]:
    """
    Returnerer liste af kampresultater for CFC i det givne år.

    Tabelformat (typisk 5 kolonner):
      Dato | Kl. | Hjemmehold | Udehold | Score
    Dato: DD-MM-YY
    Score: X-Y  (evt. efterfulgt af "(LP)" for walkover-tab)
    """
    try:
        soup = fetch(year, "program")
    except Exception as e:
        print(f"  FEJL {year} program: {e}", file=sys.stderr)
        return []

    table = soup.find("table")
    if not table:
        return []

    results = []
    for row in table.find_all("tr"):
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]

        # Header-rækker og tomme rækker
        if len(cells) < 4:
            continue
        if cells[0].lower() in {"dato", ""}:
            continue

        # Dato i første celle: DD-MM-YY eller DD-MM-YYYY
        date_str = cells[0]
        m = re.match(r"(\d{1,2})-(\d{2})-(\d{2,4})", date_str)
        if not m:
            continue
        day, mon, yr = m.group(1), m.group(2), m.group(3)
        if len(yr) == 2:
            yr = "20" + yr
        match_date = f"{yr}-{mon}-{day.zfill(2)}"

        # Hold: enten [dato, kl, hjem, ude, score] eller [dato, hjem, ude, score]
        if len(cells) >= 5:
            home, away, score_raw = cells[2], cells[3], cells[4]
        else:
            home, away, score_raw = cells[1], cells[2], cells[3]

        home = home.strip()
        away = away.strip()

        # Kun kampe hvor CFC spiller
        if not (is_cfc(home) or is_cfc(away)):
            continue

        # Parse score — "X-Y" evt. med "(LP)" eller "(W.O.)"
        goals_for = goals_against = result = None
        score_clean = re.sub(r"\(.*?\)", "", score_raw).strip()
        sm = re.match(r"(\d+)[-–](\d+)", score_clean)
        if sm:
            gf_raw, ga_raw = int(sm.group(1)), int(sm.group(2))
            # Justér ift. om CFC er hjemme eller ude
            if is_cfc(home):
                goals_for, goals_against = gf_raw, ga_raw
            else:
                goals_for, goals_against = ga_raw, gf_raw

            if goals_for > goals_against:
                result = "sejr"
            elif goals_for == goals_against:
                result = "uafgjort"
            else:
                result = "nederlag"

        # Modstander og home_away
        if is_cfc(home):
            opponent = away
            home_away = "hjemme"
        else:
            opponent = home
            home_away = "ude"

        results.append({
            "id": str(uuid.uuid4()),
            "team_type": team_type,
            "season": year,
            "match_date": match_date,
            "opponent": opponent,
            "home_away": home_away,
            "goals_for": goals_for,
            "goals_against": goals_against,
            "result": result,
        })

    return results


# ── SQL-generering ─────────────────────────────────────────────────────────────

def v(x):
    if x is None:
        return "NULL"
    if isinstance(x, str):
        return "'" + x.replace("'", "''") + "'"
    return str(x)


def standings_to_sql(rows: list[dict]) -> list[str]:
    lines = []
    for r in rows:
        lines.append(
            f"INSERT OR IGNORE INTO season_standings "
            f"(id, team_type, season, position, league, played, won, drawn, lost, "
            f"goals_for, goals_against, points, imported_at) VALUES ("
            f"{v(r['id'])}, {v(r['team_type'])}, {r['season']}, "
            f"{v(r['position'])}, {v(r['league'])}, "
            f"{v(r['played'])}, {v(r['won'])}, {v(r['drawn'])}, {v(r['lost'])}, "
            f"{v(r['goals_for'])}, {v(r['goals_against'])}, {v(r['points'])}, "
            f"'{NOW}');"
        )
    return lines


def matches_to_sql(rows: list[dict]) -> list[str]:
    lines = []
    for r in rows:
        lines.append(
            f"INSERT OR IGNORE INTO season_matches "
            f"(id, team_type, season, match_date, opponent, home_away, "
            f"goals_for, goals_against, result) VALUES ("
            f"{v(r['id'])}, {v(r['team_type'])}, {r['season']}, "
            f"{v(r['match_date'])}, {v(r['opponent'])}, {v(r['home_away'])}, "
            f"{v(r['goals_for'])}, {v(r['goals_against'])}, {v(r['result'])});"
        )
    return lines


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    all_standings = []
    all_matches = []

    seasons = [
        ("senior",  SENIOR_YEARS),
        ("oldboys", OLDBOYS_YEARS),
    ]

    for team_type, years in seasons:
        print(f"\n── {team_type.upper()} ──", file=sys.stderr)
        for year in years:
            print(f"  {year} stilling...", file=sys.stderr, end=" ")
            s = scrape_standing(year, team_type)
            if s:
                all_standings.append(s)
                print(f"pos={s['position']} {s['played']}k {s['points']}p", file=sys.stderr)
            else:
                print("ingen data", file=sys.stderr)

            print(f"  {year} program... ", file=sys.stderr, end="")
            ms = scrape_matches(year, team_type)
            all_matches.extend(ms)
            print(f"{len(ms)} kampe", file=sys.stderr)

    # Output SQL
    lines = [
        f"-- Genereret af scripts/scrape_standings.py",
        f"-- Kilde: {BASE_URL}",
        f"-- Dato: {NOW}",
        f"-- Stillinger: {len(all_standings)}, Kampe: {len(all_matches)}",
        "",
        "-- ── STILLINGER ──────────────────────────────────────────────────────",
        "-- NB: league-kolonnen er NULL — udfyld manuelt bagefter:",
        "-- UPDATE season_standings SET league = '5. division' WHERE team_type = 'oldboys' AND season = 2024;",
        "",
    ]
    lines += standings_to_sql(all_standings)
    lines += [
        "",
        "-- ── KAMPRESULTATER ──────────────────────────────────────────────────",
        "",
    ]
    lines += matches_to_sql(all_matches)

    print("\n".join(lines))

    print(f"\nFærdig: {len(all_standings)} stillinger, {len(all_matches)} kampe", file=sys.stderr)


if __name__ == "__main__":
    main()
