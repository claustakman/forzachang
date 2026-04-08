#!/usr/bin/env python3
"""
Scraper til historiske sæsonstillinger fra forzachang.dk/stilling.php
Genererer SQL til season_standings-tabellen.

Kør:
    python3 scripts/scrape_standings.py > database/seed_standings.sql
    wrangler d1 execute forzachang-db --remote --file=database/seed_standings.sql

Kræver:
    pip install requests beautifulsoup4
"""

import sys
import re
import uuid
from datetime import datetime
import requests
from bs4 import BeautifulSoup

URL = "https://www.forzachang.dk/stilling.php"


def fetch_page(url: str) -> BeautifulSoup:
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    r.encoding = r.apparent_encoding
    return BeautifulSoup(r.text, "html.parser")


def parse_int(s: str) -> int | None:
    s = s.strip()
    try:
        return int(s)
    except ValueError:
        return None


def find_cfc_row(table) -> dict | None:
    """
    Finder rækken der indeholder 'forza' eller 'chang' (case-insensitive)
    i en HTML-tabel og returnerer den som dict.
    Kolonnerækkefølge: Placering, Hold, Kampe, Vundne, Uafgjort, Tabte,
                       Mål for, Mål imod, Pointtal
    """
    rows = table.find_all("tr")
    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
        if len(cells) < 4:
            continue
        # Slå på hold-navn (anden kolonne efter placering)
        team_name = cells[1] if len(cells) > 1 else ""
        if not re.search(r"forza|chang|cfc", team_name, re.IGNORECASE):
            continue

        # Prøv at parse tallene — kolonner kan variere lidt
        # Prøv standard layout: [pos, hold, kampe, v, u, t, mål+, mål-, point]
        try:
            position    = parse_int(cells[0])
            played      = parse_int(cells[2])
            won         = parse_int(cells[3])
            drawn       = parse_int(cells[4])
            lost        = parse_int(cells[5])
            goals_for   = parse_int(cells[6])
            goals_against = parse_int(cells[7])
            points      = parse_int(cells[8])
        except IndexError:
            position = played = won = drawn = lost = goals_for = goals_against = points = None

        return {
            "team_name": team_name,
            "position": position,
            "played": played,
            "won": won,
            "drawn": drawn,
            "lost": lost,
            "goals_for": goals_for,
            "goals_against": goals_against,
            "points": points,
        }
    return None


def detect_season_and_type(heading_text: str) -> tuple[int | None, str | None]:
    """
    Forsøger at udtrække årstal og holdtype fra en overskrift som
    'Stilling 2024', 'Oldboys 2019-2020', 'Senior 2007' osv.
    """
    text = heading_text.strip()

    # Holdtype
    team_type = None
    if re.search(r"oldboys|old boys|veteran", text, re.IGNORECASE):
        team_type = "oldboys"
    elif re.search(r"senior", text, re.IGNORECASE):
        team_type = "senior"

    # Årstal — tag det FØRSTE firecifrede tal (startåret for sæsonen)
    years = re.findall(r"\b(20\d{2}|19\d{2})\b", text)
    season = int(years[0]) if years else None

    return season, team_type


def scrape(url: str) -> list[dict]:
    soup = fetch_page(url)
    results = []

    # Find alle sektioner: typisk en <h2>/<h3> eller <strong> efterfulgt af <table>
    # Prøv alle tabeller og find overskriften der er nærmest ovenfor
    tables = soup.find_all("table")

    for table in tables:
        # Find nærmeste overskrift-element ovenfor tabellen
        heading_el = None
        for sibling in table.find_all_previous(["h1","h2","h3","h4","strong","b","p"]):
            text = sibling.get_text(strip=True)
            if re.search(r"\b(20\d{2}|19\d{2})\b", text):
                heading_el = sibling
                break

        if not heading_el:
            continue

        season, team_type = detect_season_and_type(heading_el.get_text())

        if not season:
            continue

        # Fallback holdtype: hvis overskriften ikke siger det, gæt på oldboys
        if not team_type:
            team_type = "oldboys"

        row = find_cfc_row(table)
        if not row:
            continue

        results.append({
            "id": str(uuid.uuid4()),
            "team_type": team_type,
            "season": season,
            **row,
        })

    return results


def to_sql(rows: list[dict]) -> str:
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "-- Genereret af scripts/scrape_standings.py",
        f"-- Kilde: {URL}",
        f"-- Dato: {now}",
        "",
    ]

    if not rows:
        lines.append("-- ADVARSEL: Ingen rækker fundet — tjek HTML-strukturen på siden")
        return "\n".join(lines)

    def v(x):
        if x is None:
            return "NULL"
        if isinstance(x, str):
            return "'" + x.replace("'", "''") + "'"
        return str(x)

    for r in rows:
        league = "NULL"  # forzachang.dk viser ikke rækkenavn — udfyld manuelt
        lines.append(
            f"INSERT OR IGNORE INTO season_standings "
            f"(id, team_type, season, position, league, played, won, drawn, lost, "
            f"goals_for, goals_against, points, imported_at) VALUES ("
            f"{v(r['id'])}, {v(r['team_type'])}, {r['season']}, "
            f"{v(r['position'])}, {league}, "
            f"{v(r['played'])}, {v(r['won'])}, {v(r['drawn'])}, {v(r['lost'])}, "
            f"{v(r['goals_for'])}, {v(r['goals_against'])}, {v(r['points'])}, "
            f"'{now}');"
        )

    lines += [
        "",
        "-- Udfyld league-kolonnen manuelt (fx '5. division', 'Oldboys række A' osv.)",
        "-- UPDATE season_standings SET league = '5. division' WHERE team_type = 'oldboys' AND season = 2024;",
    ]
    return "\n".join(lines)


def main():
    print(f"-- Henter {URL} ...", file=sys.stderr)
    try:
        rows = scrape(URL)
    except Exception as e:
        print(f"FEJL: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"-- Fandt {len(rows)} sæsoner med CFC-data", file=sys.stderr)
    for r in rows:
        print(f"   {r['team_type']} {r['season']}: pos={r['position']}, {r['played']}k {r['won']}v {r['points']}p", file=sys.stderr)

    print(to_sql(rows))


if __name__ == "__main__":
    main()
