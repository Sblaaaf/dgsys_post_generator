#!/usr/bin/env python3
"""
Génère assets/data/icons.js à partir des métadonnées FontAwesome Free.

Pourquoi un fichier local plutôt qu'un appel à fontawesome.com : leur site ne
peut pas être intégré en iframe et leur API de recherche demande un jeton.
Les métadonnées, elles, sont livrées avec le paquet npm sous licence libre.
On les compacte ici en tableaux plutôt qu'en objets — à 2000 icônes, les noms
de propriétés répétés pèsent plus lourd que les données elles-mêmes.

Usage :
    npm pack @fortawesome/fontawesome-free@6.5.2 && tar xzf *.tgz
    python3 tools/build-icons.py package/metadata
"""
import json
import sys
import pathlib

import yaml

FREE_STYLES = {"solid": "s", "regular": "r", "brands": "b"}
MAX_TERMS = 24


def build(meta_dir: pathlib.Path) -> dict:
    icons = yaml.safe_load((meta_dir / "icons.yml").read_text(encoding="utf-8"))

    cats_raw = yaml.safe_load((meta_dir / "categories.yml").read_text(encoding="utf-8"))
    # categories.yml indexe catégorie -> icônes ; on inverse en icône -> catégories
    by_icon: dict[str, list[str]] = {}
    labels: dict[str, str] = {}
    for key, cat in cats_raw.items():
        labels[key] = cat.get("label", key)
        for name in cat.get("icons", []):
            by_icon.setdefault(name, []).append(key)

    rows = []
    for name, data in sorted(icons.items()):
        styles = [FREE_STYLES[s] for s in data.get("styles", []) if s in FREE_STYLES]
        if not styles:
            continue  # icône Pro : inutilisable avec la version gratuite

        terms = data.get("search", {}).get("terms") or []
        label = data.get("label", name)
        # Le nom est déjà indexé séparément : on ne garde que ce qu'il n'exprime pas
        # Les synonymes sont triés par pertinence décroissante en amont ?
        # Non : l'ordre du YAML est alphabétique. Tronquer bas coupait des
        # termes utiles ("tick" pour check). On garde large, le gain de poids
        # ne valait pas la perte de rappel.
        extra = [str(t).lower() for t in terms if str(t).lower() not in name]
        rows.append([
            name,
            "".join(styles),
            " ".join(sorted(set([label.lower()] + extra))[:MAX_TERMS]),
            ",".join(by_icon.get(name, [])),
        ])

    return {"version": "6.5.2", "categories": labels, "icons": rows}


def main() -> int:
    meta_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "package/metadata")
    if not (meta_dir / "icons.yml").exists():
        print(f"icons.yml introuvable dans {meta_dir}", file=sys.stderr)
        return 1

    payload = build(meta_dir)
    out = pathlib.Path(__file__).resolve().parent.parent / "assets" / "data" / "icons.js"
    out.write_text(
        "/* Généré par tools/build-icons.py — ne pas modifier à la main.\n"
        "   Métadonnées FontAwesome Free 6.5.2 (CC BY 4.0).\n"
        "   Format compact : [nom, styles, termes de recherche, catégories]\n"
        "   styles : s = solid, r = regular, b = brands */\n"
        "window.DGIconData = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(payload['icons'])} icônes · {len(payload['categories'])} catégories · "
          f"{out.stat().st_size / 1024:.0f} Ko → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
