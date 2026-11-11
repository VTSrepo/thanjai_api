"""
Tanjo Foods – product importer
==============================
Reads the completed client template (Products sheet) and produces:
  1. database/03_seed_products.sql  – upsert into Tanjofoods (products, product_images, inventory)
  2. data/products.js               – catalogue file used by the storefront until the API is live
  3. an on-screen validation report  (errors stop the export unless --force)

Usage (from the Tanjofoods folder):
    python tools/import_products.py templates/Tanjo_Foods_Product_Template.xlsx
    python tools/import_products.py <file.xlsx> --sql-only | --js-only | --force

Requires: pip install openpyxl
"""
import sys, re, json, os
from datetime import datetime
from openpyxl import load_workbook

HEADER_ROW, FIRST_ROW = 1, 3
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KEYMAP = {  # header text (without " *") -> key
 "SKU": "sku", "Category": "category", "Product Name (English)": "name_en", "Product Name (French)": "name_fr",
 "Regional / Indian Name": "regional_name", "Short Description (English)": "short_desc_en",
 "Short Description (French)": "short_desc_fr", "Ingredients (English)": "ingredients_en",
 "Ingredients (French)": "ingredients_fr", "Allergens (Contains)": "allergens", "May Contain": "may_contain",
 "Dietary Tags": "dietary_tags", "Spice Level (0-3)": "spice_level", "Product Type": "prep_type",
 "Storage": "storage_type", "Shelf Life (days)": "shelf_life_days",
 "Heating / Serving Instructions": "heating_instructions", "Pack Size Value": "pack_size_value",
 "Pack Size Unit": "pack_size_unit", "Pack Size Label": "pack_size_label", "Units per Case": "units_per_case",
 "UPC Barcode": "upc_barcode", "Retail Price (CAD)": "price", "Compare-at Price (CAD)": "compare_at_price",
 "Wholesale Price (CAD)": "wholesale_price", "Taxable (Y/N)": "is_taxable", "Max Qty per Order": "max_order_qty",
 "Status": "status", "Featured (Y/N)": "is_featured", "Sort Order": "sort_order",
 "Image File Name(s)": "images", "Opening Stock Qty": "opening_stock", "Comments / Questions": "comments",
}
REQUIRED = ["category", "name_en", "name_fr", "short_desc_en", "prep_type", "storage_type",
            "pack_size_label", "price", "is_taxable", "status"]
ENUMS = {"category": {"SNACKS", "FROZEN", "RTE", "SAUCES", "BEV"},
         "prep_type": {"READY_TO_EAT", "READY_TO_COOK", "READY_TO_DRINK"},
         "storage_type": {"AMBIENT", "CHILLED", "FROZEN"},
         "pack_size_unit": {"g", "kg", "ml", "L", "pcs", "pack"},
         "status": {"ACTIVE", "COMING_SOON", "DRAFT", "HIDDEN", "OUT_OF_STOCK", "DISCONTINUED"}}
SKU_PREFIX = {"SNACKS": "TF-SN", "FROZEN": "TF-FZ", "RTE": "TF-RT", "SAUCES": "TF-SC", "BEV": "TF-BV"}
PREP_LABEL = {"READY_TO_EAT": "Ready to Eat", "READY_TO_COOK": "Ready to Cook", "READY_TO_DRINK": "Ready to Drink"}


def slugify(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def q(v):
    """SQL literal."""
    if v is None or v == "": return "NULL"
    if isinstance(v, bool): return "1" if v else "0"
    if isinstance(v, (int, float)): return repr(round(v, 2)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def read_rows(path):
    wb = load_workbook(path, data_only=True)
    ws = wb["Products"]
    headers = {}
    for c in ws[HEADER_ROW]:
        if c.value: headers[c.column] = KEYMAP.get(str(c.value).replace(" *", "").strip())
    rows = []
    for r in range(FIRST_ROW, ws.max_row + 1):
        rec = {k: ws.cell(r, col).value for col, k in headers.items() if k}
        rec = {k: (v.strip() if isinstance(v, str) else v) for k, v in rec.items()}
        if not any(v not in (None, "") for v in rec.values()): continue
        rec["_row"] = r
        rows.append(rec)
    return rows


def validate(rows):
    errors, seen, counters = [], set(), {}
    for p in rows:
        e = []
        draft = str(p.get("status") or "").upper() in ("DRAFT", "HIDDEN")
        for k in REQUIRED:
            if draft and k in ("price", "pack_size_label"): continue      # drafts may wait for price / pack size
            if p.get(k) in (None, ""): e.append(f"{k} is required")
        for k, allowed in ENUMS.items():
            v = p.get(k)
            if v not in (None, "") and str(v) not in allowed: e.append(f"{k} '{v}' not in {sorted(allowed)}")
        for k in ("price", "compare_at_price", "wholesale_price", "pack_size_value"):
            v = p.get(k)
            if v not in (None, ""):
                try: p[k] = float(str(v).replace("$", "").replace(",", ""))
                except ValueError: e.append(f"{k} '{v}' is not a number")
        if isinstance(p.get("price"), float) and p["price"] <= 0 and not draft: e.append("price must be > 0")
        if p.get("price") in (None, ""): p["price"] = 0.0
        for k in ("spice_level", "shelf_life_days", "units_per_case", "max_order_qty", "sort_order", "opening_stock"):
            v = p.get(k)
            if v not in (None, ""):
                try: p[k] = int(float(v))
                except ValueError: e.append(f"{k} '{v}' is not a whole number")
        for k in ("is_taxable", "is_featured"):
            v = str(p.get(k) or "N").upper()[:1]
            p[k] = v == "Y"
        sku = p.get("sku")
        if sku:
            if sku in seen: e.append(f"duplicate SKU {sku}")
            seen.add(sku)
        if e: errors.append((p["_row"], p.get("sku") or p.get("name_en"), e))
    # assign SKUs where blank
    for p in rows:
        if not p.get("sku") and p.get("category") in SKU_PREFIX:
            pre = SKU_PREFIX[p["category"]]
            n = counters.get(pre) or max([int(s.split("-")[-1]) for s in seen if s.startswith(pre)] or [0])
            n += 1; counters[pre] = n
            p["sku"] = f"{pre}-{n:03d}"; seen.add(p["sku"])
            print(f"  row {p['_row']}: assigned SKU {p['sku']}")
    return errors


def to_sql(rows, src):
    out = [f"-- Generated by tools/import_products.py from {os.path.basename(src)} on {datetime.now():%Y-%m-%d %H:%M}",
           "-- Upserts by SKU: existing products are updated, new ones inserted. Safe to re-run.",
           "USE Tanjofoods;", "START TRANSACTION;", ""]
    cols = ["sku", "category_id", "name_en", "name_fr", "regional_name", "slug", "short_desc_en", "short_desc_fr",
            "ingredients_en", "ingredients_fr", "allergens", "may_contain", "dietary_tags", "spice_level", "prep_type",
            "storage_type", "shelf_life_days", "heating_instructions", "pack_size_value", "pack_size_unit",
            "pack_size_label", "units_per_case", "upc_barcode", "price", "compare_at_price", "wholesale_price",
            "is_taxable", "max_order_qty", "status", "is_featured", "sort_order"]
    for p in rows:
        vals = []
        for c in cols:
            if c == "category_id": vals.append(f"(SELECT category_id FROM categories WHERE code = {q(p['category'])})")
            elif c == "slug": vals.append(q(slugify(p["name_en"] + "-" + p["sku"])))
            elif c == "max_order_qty": vals.append(q(p.get(c) or 20))
            elif c == "sort_order": vals.append(q(p.get(c) or 0))
            else: vals.append(q(p.get(c)))
        upd = ", ".join(f"{c} = VALUES({c})" for c in cols if c != "sku")
        out.append(f"-- {p['sku']} · {p['name_en']}")
        out.append(f"INSERT INTO products ({', '.join(cols)})\nVALUES ({', '.join(vals)})\nON DUPLICATE KEY UPDATE {upd};")
        pid = f"(SELECT product_id FROM products WHERE sku = {q(p['sku'])})"
        out.append(f"DELETE FROM product_images WHERE product_id = {pid};")
        for i, f in enumerate([x.strip() for x in str(p.get("images") or "").split(";") if x.strip()]):
            path = f if "/" in f else "assets/img/" + f
            out.append(f"INSERT INTO product_images (product_id, file_name, alt_text, is_primary, sort_order) "
                       f"SELECT product_id, {q(path)}, {q(p['name_en'])}, {1 if i == 0 else 0}, {i} FROM products WHERE sku = {q(p['sku'])};")
        stock = p.get("opening_stock")
        out.append(f"INSERT IGNORE INTO inventory (product_id, qty_on_hand, track_inventory) "
                   f"SELECT product_id, {q(stock or 0)}, {1 if stock not in (None, '') else 0} FROM products WHERE sku = {q(p['sku'])};")
        out.append("")
    out.append("COMMIT;")
    return "\n".join(out)


def to_js(rows):
    items = []
    for p in sorted(rows, key=lambda r: (r.get("category"), r.get("sort_order") or 0)):
        if p.get("status") in ("DRAFT", "HIDDEN", "DISCONTINUED"): continue
        imgs = [x.strip() for x in str(p.get("images") or "").split(";") if x.strip()]
        items.append({
            "sku": p["sku"], "category": p["category"], "name": p["name_en"], "nameFr": p.get("name_fr") or "",
            "regional": p.get("regional_name") or "", "desc": p.get("short_desc_en") or "", "descFr": p.get("short_desc_fr") or "",
            "size": p.get("pack_size_label") or "", "price": round(float(p["price"]), 2),
            "image": (imgs[0] if "/" in imgs[0] else "assets/img/" + imgs[0]) if imgs else "",
            "tags": [t.strip() for t in str(p.get("dietary_tags") or "").split(",") if t.strip()],
            "prep": PREP_LABEL.get(p.get("prep_type"), ""), "taxable": bool(p["is_taxable"]),
            "status": "coming_soon" if p["status"] == "COMING_SOON" else ("active" if p["status"] == "ACTIVE" else "hidden"),
            "featured": bool(p["is_featured"]), "maxQty": p.get("max_order_qty") or 20,
        })
    return items


def write_js(items, src):
    path = os.path.join(ROOT, "data", "products.js")
    text = open(path, encoding="utf-8").read()
    body = "window.TANJO_PRODUCTS = " + json.dumps(items, ensure_ascii=False, indent=2) + ";"
    text, n = re.subn(r"window\.TANJO_PRODUCTS = \[.*?\n\];", lambda m: body, text, flags=re.S)
    if not n: raise SystemExit("Could not find TANJO_PRODUCTS block in data/products.js")
    open(path, "w", encoding="utf-8").write(text)
    return path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args: print(__doc__); sys.exit(1)
    src = args[0]
    rows = read_rows(src)
    print(f"Read {len(rows)} product rows from {src}")
    errors = validate(rows)
    for r, ident, e in errors: print(f"  ✗ row {r} ({ident}): " + "; ".join(e))
    if errors and "--force" not in flags:
        print(f"\n{len(errors)} row(s) have errors – fix the template and re-run (or use --force to skip them)."); sys.exit(2)
    bad = {r for r, *_ in errors}
    rows = [p for p in rows if p["_row"] not in bad]
    if "--js-only" not in flags:
        sql_path = os.path.join(ROOT, "database", "03_seed_products.sql")
        open(sql_path, "w", encoding="utf-8").write(to_sql(rows, src)); print("  ✓ wrote", sql_path)
    if "--sql-only" not in flags:
        print("  ✓ wrote", write_js(to_js(rows), src))
    print(f"Done: {len(rows)} products exported.")


if __name__ == "__main__":
    main()
