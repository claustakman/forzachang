"""
Scraper til hædersbevisninger fra forzachang.dk
Henter pokaler + årstal fra title-attributter på billederne

Kør: python3 scrape_honors.py
Output: database/seed_honors.sql

Kræver: pip install requests beautifulsoup4
"""

import requests
from bs4 import BeautifulSoup
import uuid
import re

SPILLERE = [
    # Aktive
    (54, "Thomas Bryrup"),
    (2,  "Casper Sørrig"),
    (55, "Morten Carøe"),
    (42, "Jeppe Dyrberg"),
    (3,  "Christian Næsby"),
    (14, "Morten Ladegaard"),
    (37, "Mikael Strandbygaard"),
    (45, "Henrik Stein"),
    (50, "Mathias Elisberg"),
    (56, "Andreas Johannsen"),
    (53, "Henrik Kjærsgaard"),
    (57, "Joel Diaz-Varela"),
    (44, "Rasmus Nissen"),
    (51, "Claus Takman"),
    # Passive (Hall of Fame)
    (4,  "Thomas Andersson"),
    (13, "Daniel Bachmann"),
    (7,  "Morten Buus"),
    (6,  "Kenneth Christensen"),
    (15, "Anders Guldborg"),
    (9,  "Peter Hesselholt"),
    (12, "Jacob Jørgensen"),
    (5,  "Morten Larsen"),
    (20, "Mads Lybæch"),
    (21, "Morten Lydal"),
    (11, "Kristian Nøhr"),
    (19, "Søren Nøhr"),
    (25, "Bo Præsius"),
    (8,  "Ivar Rosendal"),
    (40, "Morten Sørensen"),
    (16, "Peter Tornsberg"),
    (17, "Christian Vendelbo"),
    (10, "Jens Erik Zebis"),
]

# Mapping fra filnavn til honor_type key
# Automatiske — ingen årstal
AUTO_MAP = {
    "100kampe":  "kampe_100",
    "5saesoner": "saesoner_5",
    "10mom":     "mom_10",
}

# Manuelle — har årstal i title-attribut
MANUAL_MAP = {
    "fighter": "fighter",
    "spiller": "spiller",
    "kammerat": "kammerat",
}

def hent_pokaler(spiller_id):
    url = f"https://www.forzachang.dk/spiller.php?id={spiller_id}"
    r = requests.get(url, timeout=15)
    soup = BeautifulSoup(r.content, "html.parser")

    resultater = []

    imgs = soup.find_all("img")
    for img in imgs:
        src = img.get("src", "")
        if "pokaler/" not in src:
            continue

        # Hent filnavn uden extension og uden _shadow
        filename = src.split("/")[-1].replace(".png", "").replace(".jpg", "")
        if filename.endswith("_shadow"):
            continue  # Ikke opnået

        # Prøv title/alt-attribut først, ellers parse onMouseover="ddrivetip('...')"
        title = img.get("title", "") or img.get("alt", "")
        if not title:
            mouseover = img.get("onmouseover", "") or img.get("onMouseover", "")
            m = re.search(r"ddrivetip\(['\"](.+?)['\"]\)", mouseover)
            if m:
                title = m.group(1)

        # Automatiske pokaler
        if filename in AUTO_MAP:
            resultater.append({
                "honor_key": AUTO_MAP[filename],
                "season": None,
                "title_raw": title,
            })

        # Manuelle pokaler — parse årstal fra title
        elif filename in MANUAL_MAP:
            # Title forventes at indeholde årstal, fx "Årets fighter 2013, 2016, 2021"
            years = re.findall(r'\b(20\d{2}|19\d{2})\b', title)
            if years:
                for year in years:
                    resultater.append({
                        "honor_key": MANUAL_MAP[filename],
                        "season": int(year),
                        "title_raw": title,
                    })
            else:
                # Ingen årstal fundet i title — gem uden årstal, til manuel udfyldning
                resultater.append({
                    "honor_key": MANUAL_MAP[filename],
                    "season": None,
                    "title_raw": f"MANGLER_ÅRSTAL: {title}",
                })

    return resultater


def main():
    lines = []
    lines.append("-- CFC Hædersbevisninger (historiske)")
    lines.append("-- Scraped fra forzachang.dk")
    lines.append("-- Kør med: wrangler d1 execute forzachang-db --remote --file=database/seed_honors.sql")
    lines.append("-- OBS: Kør EFTER seed_players.sql")
    lines.append("")

    for spiller_id, navn in SPILLERE:
        print(f"Henter {navn} (id={spiller_id})...")
        try:
            pokaler = hent_pokaler(spiller_id)
        except Exception as e:
            print(f"  FEJL: {e}")
            continue

        if not pokaler:
            print(f"  Ingen pokaler")
            continue

        navn_escaped = navn.replace("'", "''")
        lines.append(f"-- {navn}")

        for p in pokaler:
            row_id = str(uuid.uuid4())
            season_val = str(p["season"]) if p["season"] else "NULL"
            title_info = p["title_raw"]

            if "MANGLER_ÅRSTAL" in title_info:
                lines.append(f"-- OBS: {navn} — {p['honor_key']} mangler årstal i title-attribut")

            lines.append(
                f"INSERT INTO player_honors (id, player_id, honor_type_id, season, awarded_by, created_at) "
                f"SELECT '{row_id}', p.id, ht.id, {season_val}, NULL, datetime('now') "
                f"FROM players p, honor_types ht "
                f"WHERE p.name = '{navn_escaped}' AND ht.key = '{p['honor_key']}' "
                f"ON CONFLICT(player_id, honor_type_id, season) DO NOTHING;"
            )
            print(f"  {p['honor_key']} {p['season'] or ''} — {title_info}")

        lines.append("")

    with open("database/seed_honors.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("\nFærdig! Gemt til database/seed_honors.sql")
    print("OBS: Tjek efter linjer med MANGLER_ÅRSTAL — dem skal du udfylde manuelt")


if __name__ == "__main__":
    main()
