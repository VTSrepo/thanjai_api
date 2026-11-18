"""Builds templates/Tanjo_Foods_Product_Template.xlsx (client product data template)."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter
import sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else "templates/Tanjo_Foods_Product_Template.xlsx"

# (header, key, width, required, hint)
COLS = [
 ("SKU", "sku", 12, True, "Unique code. Format TF-XX-000 (we can assign)"),
 ("Category", "category", 13, True, "Pick from list"),
 ("Product Name (English)", "name_en", 24, True, "As shown on the website"),
 ("Product Name (French)", "name_fr", 26, True, "Required for Quebec"),
 ("Regional / Indian Name", "regional_name", 18, False, "e.g. Thattai, Kara Sev"),
 ("Short Description (English)", "short_desc_en", 44, True, "1–2 sentences, max 300 characters"),
 ("Short Description (French)", "short_desc_fr", 40, False, "French version"),
 ("Ingredients (English)", "ingredients_en", 36, False, "As printed on the pack"),
 ("Ingredients (French)", "ingredients_fr", 30, False, "As printed on the pack"),
 ("Allergens (Contains)", "allergens", 20, False, "e.g. Milk, Sesame, Peanuts"),
 ("May Contain", "may_contain", 18, False, "Cross-contamination warning"),
 ("Dietary Tags", "dietary_tags", 22, False, "Comma list: Vegetarian, Vegan, Gluten-free, Spicy, Halal"),
 ("Spice Level (0-3)", "spice_level", 10, False, "0 none · 1 mild · 2 medium · 3 hot"),
 ("Product Type", "prep_type", 17, True, "Pick from list"),
 ("Storage", "storage_type", 11, True, "Pick from list"),
 ("Shelf Life (days)", "shelf_life_days", 10, False, "From production date"),
 ("Heating / Serving Instructions", "heating_instructions", 30, False, "For ready-to-cook items"),
 ("Pack Size Value", "pack_size_value", 10, True, "Number only, e.g. 150"),
 ("Pack Size Unit", "pack_size_unit", 9, True, "Pick from list"),
 ("Pack Size Label", "pack_size_label", 14, True, "As customers see it, e.g. 150 g, Pack of 6"),
 ("Units per Case", "units_per_case", 9, False, "For wholesale orders"),
 ("UPC Barcode", "upc_barcode", 15, False, "12/13 digits"),
 ("Retail Price (CAD)", "price", 11, True, "Selling price incl. no tax, e.g. 4.99"),
 ("Compare-at Price (CAD)", "compare_at_price", 11, False, "Optional 'was' price for promotions"),
 ("Wholesale Price (CAD)", "wholesale_price", 11, False, "Optional"),
 ("Taxable (Y/N)", "is_taxable", 9, True, "N = zero-rated basic grocery – confirm with accountant"),
 ("Max Qty per Order", "max_order_qty", 9, False, "Default 20"),
 ("Status", "status", 13, True, "Pick from list"),
 ("Featured (Y/N)", "is_featured", 9, False, "Shows a 'Popular' badge"),
 ("Sort Order", "sort_order", 8, False, "Lower shows first"),
 ("Image File Name(s)", "images", 30, True, "Name photos with the SKU, e.g. TF-SN-001_1.jpg; separate several with ;"),
 ("Opening Stock Qty", "opening_stock", 10, False, "Units available at launch"),
 ("Comments / Questions", "comments", 34, False, "Anything we should know"),
]

CATS = ["SNACKS", "FROZEN", "SAUCES", "BEV"]
PREP = ["READY_TO_EAT", "READY_TO_COOK", "READY_TO_DRINK"]
STORAGE = ["AMBIENT", "CHILLED", "FROZEN"]
UNITS = ["g", "kg", "ml", "L", "pcs", "pack"]
STATUS = ["ACTIVE", "COMING_SOON", "DRAFT", "HIDDEN"]
YN = ["Y", "N"]

# Known products from the Drive folder (names from packaging). Fields marked CONFIRM are samples.
SNACK = dict(category="SNACKS", prep_type="READY_TO_EAT", storage_type="AMBIENT", pack_size_value=150,
             pack_size_unit="g", pack_size_label="150 g", price=4.99, is_taxable="Y", status="ACTIVE",
             dietary_tags="Vegetarian, Gluten-free", max_order_qty=20)
ROWS = [
 dict(SNACK, sku="TF-SN-001", short_desc_fr='Des craquelins fins et croustillants à la farine de riz, légèrement épicés. Recette authentique du sud de l’Inde, sans gluten.', name_en="Dreamy Chips", name_fr="Croustilles de Rêve", regional_name="Thattai",
      short_desc_en="Crisp, thin rice-flour crackers with a gentle spice. Gluten-free, authentic South Indian recipe.",
      is_featured="Y", sort_order=10, images="dreamy-chips-thattai.jpg"),
 dict(SNACK, sku="TF-SN-002", short_desc_fr='Des bâtonnets de murukku au beurre qui fondent dans la bouche : légers, croquants et irrésistibles.', name_en="Baton Bites", name_fr="Bouchées Croquantes", regional_name="Butter Murukku",
      short_desc_en="Melt-in-the-mouth butter murukku sticks – light, crunchy and addictive.",
      is_featured="N", sort_order=20, images="baton-bites-butter-murukku.jpg"),
 dict(SNACK, sku="TF-SN-003", short_desc_fr='Murukku classique en spirale au cumin et au sésame : un incontournable de l’heure du thé.', name_en="Curly Crisps", name_fr="Boucles Craquantes", regional_name="Thenkuzhal Murukku",
      short_desc_en="Classic spiral murukku with cumin and sesame – the tea-time favourite.",
      is_featured="N", sort_order=30, images="curly-crisps-thenkuzhal.jpg"),
 dict(SNACK, sku="TF-SN-004", short_desc_fr="Un mélange de collations indiennes aux saveurs audacieuses, composé de sev, d'arachides, de lentilles et de feuilles de curry.", name_en="Fiesta Mix", name_fr="Mélange de Collations Indiennes", regional_name="Madras Mix",
      short_desc_en="A bold Indian snack mix of sev, peanuts, lentils and curry leaves.",
      pack_size_value=200, pack_size_label="200 g", price=5.49, is_featured="Y", sort_order=40, images="fiesta-mix-madras-mix.jpg"),
 dict(SNACK, sku="TF-SN-005", short_desc_fr='Des bâtonnets croustillants à la farine de gramme, relevés au poivre, avec une touche typiquement sud-indienne.', name_en="Spice Sticks", name_fr="Bâtonnets aux Épices", regional_name="Kara Sev",
      short_desc_en="Peppery, crunchy gram-flour sticks with a proper South Indian kick.",
      dietary_tags="Vegetarian, Gluten-free, Spicy", spice_level=2, is_featured="N", sort_order=50, images="spice-sticks-kara-sev.jpg"),
 dict(SNACK, sku="TF-SN-006", short_desc_fr='Des perles dorées et croquantes à la farine de riz, à la noix de coco et au sésame.', name_en="Savory Pops", name_fr="Perles Savoureuses", regional_name="Seedai",
      short_desc_en="Golden, crunchy rice-flour pearls with coconut and sesame.",
      is_featured="N", sort_order=60, images="savory-pops-seedai.jpg"),
 dict(sku="TF-RT-001", short_desc_fr='Pâtisserie croustillante garnie de pommes de terre épicées et de petits pois. Réchauffer et servir.', category="FROZEN", name_en="Vegetable Samosas", name_fr="Samoussas aux Légumes",
      short_desc_en="Crisp pastry filled with spiced potato and peas. Heat and serve.",
      dietary_tags="Vegetarian", prep_type="READY_TO_COOK", storage_type="FROZEN", pack_size_value=6, pack_size_unit="pcs",
      pack_size_label="Pack of 6", price=7.99, is_taxable="N", status="ACTIVE", is_featured="Y", sort_order=10, max_order_qty=20,
      images="samosa-placeholder.svg", comments="Product photo needed"),
 dict(sku="TF-SC-001", short_desc_fr='Une recette riche, onctueuse et savoureuse : il suffit d’y ajouter du poulet (ou du paneer, ou la protéine de votre choix) pour préparer un poulet au beurre à la maison.', category="SAUCES", name_en="Butter Chicken Sauce", name_fr="Sauce au Poulet au Beurre",
      short_desc_en="Rich, creamy and flavourful – just add chicken (or paneer or your choice of protein) for butter chicken at home.",
      dietary_tags="Vegetarian", prep_type="READY_TO_COOK", storage_type="AMBIENT", pack_size_value=350, pack_size_unit="ml",
      pack_size_label="350 ml jar", price=8.99, is_taxable="N", status="ACTIVE", is_featured="Y", sort_order=10, max_order_qty=20,
      images="butter-chicken-sauce.jpg"),
 dict(sku="TF-BV-001", short_desc_fr='Boisson au yogourt indienne authentique, préparée avec de la vraie mangue. Sans arômes artificiels.', category="BEV", name_en="Mango Lassi", name_fr="Lassi à la Mangue",
      short_desc_en="Authentic Indian yogurt drink made with real mango. No artificial flavours.",
      dietary_tags="Vegetarian", prep_type="READY_TO_DRINK", storage_type="AMBIENT", pack_size_value=355, pack_size_unit="ml",
      pack_size_label="355 ml can", price=2.99, is_taxable="Y", status="COMING_SOON", is_featured="Y", sort_order=10, max_order_qty=48,
      images="mango-lassi.jpg", comments="Coming soon – launch date?"),
 dict(sku="TF-FZ-001", category="FROZEN", name_en='Onion Samosa', name_fr='Oignon Samosa', short_desc_en='Golden brown, crispy pastry filled with onions and seasoned with Indian spices.', short_desc_fr='Une pâte dorée et croustillante, garnie d’oignons et assaisonnée d’épices indiennes.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=20, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-002", category="FROZEN", name_en='Spinach Cheese Samosa', name_fr='Epinards Fromage Samosa', short_desc_en='Golden brown, crispy pastry filled with a delicious savoury blend of spinach and cheese.', short_desc_fr='Une pâte dorée et croustillante, garnie d’un délicieux mélange salé d’épinards et de fromage.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=30, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-003", category="FROZEN", name_en='Chicken Roll', name_fr='Poulet Rouleau', short_desc_en='Pastry wrapped around tender chicken mince and potatoes, seasoned with Indian spices.', short_desc_fr='Pâte feuilletée fourrée d’un mélange de poulet haché tendre et de patates, assaisonnée d’épices indiennes.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=40, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-004", category="FROZEN", name_en='Lamb Roll', name_fr='Agneau Rouleau', short_desc_en='Pastry wrapped around tender lamb mince and potatoes, seasoned with Indian spices.', short_desc_fr='Pâte feuilletée fourrée d’agneau haché tendre et de patates, assaisonnée d’épices indiennes.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=50, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-005", category="FROZEN", name_en='Vegetable Roll', name_fr='Legume Rouleau', short_desc_en='A savoury blend of mixed vegetables and potatoes wrapped in crispy, golden pastry.', short_desc_fr='Un savoureux mélange de légumes variés et de patates, enveloppé dans une pâte croustillante et dorée.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=60, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-006", category="FROZEN", name_en='Chicken Keema Samosa', name_fr='Poulet Keema Samosa', short_desc_en='Crispy, golden pastry filled with flavourful minced chicken, seasoned with aromatic Indian spices.', short_desc_fr='Une pâte croustillante et dorée, garnie d’un savoureux mélange de poulet haché, assaisonné d’épices indiennes aromatiques.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=70, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-007", category="FROZEN", name_en='Lamb Keema Samosa', name_fr='Agneau Keema Samosa', short_desc_en='Golden, crispy pastry filled with tender minced lamb, perfectly seasoned with Indian spices.', short_desc_fr='Une pâte dorée et croustillante, garnie d’agneau haché tendre, parfaitement assaisonnée d’épices indiennes.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=80, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-008", category="FROZEN", name_en='Egg Samosa', name_fr='Oeuf Samosa', short_desc_en='Golden brown, crispy pastry filled with perfectly seasoned egg and Indian spices.', short_desc_fr='Une pâte dorée et croustillante, garnie d’œufs parfaitement assaisonnés et d’épices indiennes.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=90, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-009", category="FROZEN", name_en='Paneer Samosa', name_fr='Paneur Samosa', short_desc_en='Golden brown, crispy pastry filled with flavourful paneer and a blend of aromatic Indian spices.', short_desc_fr='Une pâte dorée et croustillante, garnie de paneer savoureux et d’un mélange d’épices indiennes aromatiques.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=100, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-010", category="FROZEN", name_en='Tofu Samosa', name_fr='Tofu Samosa', short_desc_en='Golden brown, crispy pastry filled with savoury tofu and seasoned with a blend of Indian spices', short_desc_fr='Une pâte dorée et croustillante, garnie de tofu salé et assaisonnée d’un mélange d’épices indiennes',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=110, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-011", category="FROZEN", name_en='Lentil Donuts', name_fr='Beignets De Lentilles', short_desc_en='Delicious savoury fried snacks shaped like donuts, made with lentils and rice flour.', short_desc_fr='De délicieuses bouchées salées frites en forme de beignes, préparées à base de lentilles et de farine de riz.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=120, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
 dict(sku="TF-FZ-012", category="FROZEN", name_en='Idly', name_fr='Idly', short_desc_en='Soft and fluffy steamed rice cakes made from a fermented blend of rice and lentils, offering a traditional South Indian delicacy.', short_desc_fr='Des galettes de riz cuites à la vapeur, moelleuses et légères, préparées à partir d’un mélange fermenté de riz et de lentilles, qui constituent une spécialité traditionnelle du sud de l’Inde.',
      prep_type="READY_TO_COOK", storage_type="FROZEN", is_taxable="N", status="DRAFT", sort_order=130, max_order_qty=20,
      comments="New 2026-11-11 – price, pack size and photo to come"),
]
# Values we inferred / made up – highlighted yellow for the client to confirm
CONFIRM = {"pack_size_value", "pack_size_unit", "pack_size_label", "price", "is_taxable", "status", "prep_type",
           "dietary_tags", "spice_level", "storage_type", "max_order_qty", "sku"}

ARIAL = "Arial"
GREEN = PatternFill("solid", fgColor="123D2B")
RED = PatternFill("solid", fgColor="C4161C")
HINT = PatternFill("solid", fgColor="F3EEE6")
YELLOW = PatternFill("solid", fgColor="FFF2B3")
INPUT = PatternFill("solid", fgColor="FFFFFF")
thin = Side(style="thin", color="D9D2C5")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ---------------- Instructions ----------------
ins = wb.active; ins.title = "Instructions"
ins.sheet_view.showGridLines = False
ins.column_dimensions["A"].width = 3; ins.column_dimensions["B"].width = 28; ins.column_dimensions["C"].width = 95
ins["B2"] = "Tanjo Foods – Product Information Template"; ins["B2"].font = Font(name=ARIAL, size=18, bold=True, color="123D2B")
ins["B3"] = "Please complete one row per product on the 'Products' sheet and return this file with your product photos."
ins["B3"].font = Font(name=ARIAL, size=11, color="555555")
steps = [
 ("1. Products sheet", "One row per product (or per pack size). Columns with a red header are required."),
 ("2. Yellow cells", "We pre-filled the products from your Drive folder. Yellow cells are OUR GUESSES (price, pack size, tax, descriptions) – please correct them."),
 ("3. White cells", "Empty white cells are for you to fill in (ingredients, allergens, French text, barcodes, stock)."),
 ("4. Drop-downs", "Category, Product Type, Storage, Unit, Taxable, Status and Featured have drop-down lists – please pick from the list."),
 ("5. Prices", "Enter retail prices in Canadian dollars, before tax, e.g. 4.99. GST/QST is added at checkout."),
 ("6. Taxable", "Y = GST + QST charged (chips, snacks, soft drinks). N = zero-rated basic grocery (e.g. sauces, frozen samosas). Please confirm with your accountant."),
 ("7. French", "Quebec requires French on commercial websites – please give a French name for every product and French descriptions where possible."),
 ("8. Photos", "Send high-resolution photos (min. 1000 px, white or clean background, JPG/PNG). Name each file with the SKU, e.g. TF-SN-001_1.jpg, TF-SN-001_2.jpg, and list them in 'Image File Name(s)'."),
 ("9. New products", "Add rows at the bottom. Use the next SKU in the series (TF-SN-007, TF-RT-002 …) or leave SKU blank and we will assign one."),
 ("10. Status", "ACTIVE = sellable now · COMING_SOON = shown with 'Coming soon' badge · DRAFT/HIDDEN = not shown on the site. A product needs a price before it can be ACTIVE."),
 ("11. Return", "Save the file (keep the sheet names and column headers unchanged) and send it back with the photos."),
]
r = 5
for a, b in steps:
    ins.cell(r, 2, a).font = Font(name=ARIAL, bold=True, size=11, color="123D2B")
    c = ins.cell(r, 3, b); c.font = Font(name=ARIAL, size=11); c.alignment = Alignment(wrap_text=True, vertical="top")
    ins.cell(r, 2).alignment = Alignment(vertical="top")
    ins.row_dimensions[r].height = 32
    r += 1
r += 1
ins.cell(r, 2, "Legend").font = Font(name=ARIAL, bold=True, size=12); r += 1
for fill, txt, fc in [(RED, "Required column header", "FFFFFF"), (GREEN, "Optional column header", "FFFFFF"),
                      (YELLOW, "Pre-filled sample value – please confirm or correct", "000000"),
                      (INPUT, "Blank – please fill in", "000000")]:
    ins.cell(r, 2).fill = fill; ins.cell(r, 2).border = BORDER
    ins.cell(r, 3, txt).font = Font(name=ARIAL, size=11); r += 1
r += 1
ins.cell(r, 2, "Category codes").font = Font(name=ARIAL, bold=True, size=12); r += 1
for code, name in [("SNACKS", "Snacks & Chips"), ("FROZEN", "Frozen Food – samosas, rolls, ready to cook"), ("SAUCES", "Sauces"), ("BEV", "Beverages")]:
    ins.cell(r, 2, code).font = Font(name=ARIAL, bold=True); ins.cell(r, 3, name).font = Font(name=ARIAL); r += 1
ins.cell(r + 1, 2, "Questions? Contact Vibhava Technology Services.").font = Font(name=ARIAL, italic=True, color="777777")

# ---------------- Products ----------------
ws = wb.create_sheet("Products")
for i, (h, key, w, req, hint) in enumerate(COLS, start=1):
    c = ws.cell(1, i, h + (" *" if req else ""))
    c.font = Font(name=ARIAL, bold=True, color="FFFFFF", size=10)
    c.fill = RED if req else GREEN
    c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    c.border = BORDER
    hc = ws.cell(2, i, hint)
    hc.font = Font(name=ARIAL, italic=True, size=8, color="6B625B"); hc.fill = HINT
    hc.alignment = Alignment(wrap_text=True, vertical="top"); hc.border = BORDER
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 42; ws.row_dimensions[2].height = 48
ws.freeze_panes = "D3"

FIRST, LAST = 3, 202  # 200 product rows available
for ri in range(FIRST, LAST + 1):
    for ci in range(1, len(COLS) + 1):
        c = ws.cell(ri, ci); c.border = BORDER; c.font = Font(name=ARIAL, size=10)
        c.alignment = Alignment(vertical="top", wrap_text=COLS[ci - 1][1] in ("short_desc_en", "short_desc_fr", "ingredients_en", "ingredients_fr", "heating_instructions", "comments"))
for n, row in enumerate(ROWS):
    ri = FIRST + n
    for ci, (h, key, w, req, hint) in enumerate(COLS, start=1):
        v = row.get(key)
        if v is None: continue
        c = ws.cell(ri, ci, v)
        if key in CONFIRM: c.fill = YELLOW
    ws.row_dimensions[ri].height = 30
for ci, (h, key, *_r) in enumerate(COLS, start=1):
    L = get_column_letter(ci)
    if key in ("price", "compare_at_price", "wholesale_price"):
        for ri in range(FIRST, LAST + 1): ws[f"{L}{ri}"].number_format = '"$"#,##0.00'
ws.auto_filter.ref = f"A2:{get_column_letter(len(COLS))}{LAST}"

# ---------------- Lists (drop-down sources) ----------------
ls = wb.create_sheet("Lists")
for ci, (title, vals) in enumerate([("Category", CATS), ("Product Type", PREP), ("Storage", STORAGE), ("Unit", UNITS), ("Status", STATUS), ("Y/N", YN)], start=1):
    ls.cell(1, ci, title).font = Font(name=ARIAL, bold=True)
    for ri, v in enumerate(vals, start=2): ls.cell(ri, ci, v).font = Font(name=ARIAL)
    ls.column_dimensions[get_column_letter(ci)].width = 18
ls.sheet_state = "hidden"

def col_of(key): return get_column_letter([c[1] for c in COLS].index(key) + 1)
def add_list(key, src):
    dv = DataValidation(type="list", formula1=src, allow_blank=True, showErrorMessage=True,
                        errorTitle="Invalid value", error="Please pick a value from the drop-down list.")
    ws.add_data_validation(dv); dv.add(f"{col_of(key)}{FIRST}:{col_of(key)}{LAST}")
add_list("category", f"Lists!$A$2:$A${len(CATS)+1}")
add_list("prep_type", f"Lists!$B$2:$B${len(PREP)+1}")
add_list("storage_type", f"Lists!$C$2:$C${len(STORAGE)+1}")
add_list("pack_size_unit", f"Lists!$D$2:$D${len(UNITS)+1}")
add_list("status", f"Lists!$E$2:$E${len(STATUS)+1}")
add_list("is_taxable", f"Lists!$F$2:$F$3")
add_list("is_featured", f"Lists!$F$2:$F$3")
for key, lo, hi in [("price", 0, 10000), ("compare_at_price", 0, 10000), ("wholesale_price", 0, 10000)]:
    dv = DataValidation(type="decimal", operator="between", formula1=str(lo), formula2=str(hi), allow_blank=True,
                        showErrorMessage=True, error="Enter a price in dollars, e.g. 4.99")
    ws.add_data_validation(dv); dv.add(f"{col_of(key)}{FIRST}:{col_of(key)}{LAST}")
dv = DataValidation(type="whole", operator="between", formula1="0", formula2="3", allow_blank=True, showErrorMessage=True, error="0 to 3")
ws.add_data_validation(dv); dv.add(f"{col_of('spice_level')}{FIRST}:{col_of('spice_level')}{LAST}")
ws[f"{col_of('price')}1"].comment = Comment("Sample prices were set by Vibhava for the design preview only. Please replace with your actual retail prices.", "Vibhava")

wb.active = 1
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
wb.save(OUT)
print("saved", OUT)
