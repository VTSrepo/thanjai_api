/*
 * Tanjo Foods – product catalogue (front-end data file)
 * ------------------------------------------------------
 * Generated from the client product template (tools/import_products.py).
 * PRICES, PACK SIZES AND INGREDIENTS ARE SAMPLE VALUES until the client
 * returns the completed template. Taxable flags (GST/QST) must be
 * confirmed by the client's accountant (basic groceries are zero-rated). Once the API is live, app.js loads
 * products from /api/products instead and this file is only a fallback.
 */
window.TANJO_CATEGORIES = [
  { code: "SNACKS", name: "Snacks & Chips", nameFr: "Collations et croustilles", blurb: "A variety of savoury snacks and chips to enjoy anytime.", blurbFr: "Une variété de collations salées et de croustilles à savourer à tout moment." },
  { code: "FROZEN", name: "Frozen Food", nameFr: "Produits surgelés", blurb: "Samosas, rolls and South Indian favourites – ready to cook from frozen.", blurbFr: "Samoussas, rouleaux et classiques du sud de l’Inde, prêts à cuire." },
  { code: "SAUCES", name: "Sauces", nameFr: "Sauces", blurb: "A flavourful sauce to bring the taste of butter chicken to your table.", blurbFr: "Une sauce savoureuse pour apporter le goût du poulet au beurre à votre table." },
  { code: "BEV", name: "Beverages", nameFr: "Boissons", blurb: "Refreshing drinks for every moment.", blurbFr: "Des boissons rafraîchissantes pour chaque moment." }
];

window.TANJO_PRODUCTS = [
  {
    "sku": "TF-BV-001",
    "category": "BEV",
    "name": "Mango Lassi",
    "nameFr": "Lassi à la Mangue",
    "regional": "",
    "desc": "Authentic Indian yogurt drink made with real mango. No artificial flavours.",
    "descFr": "Boisson au yogourt indienne authentique, préparée avec de la vraie mangue. Sans arômes artificiels.",
    "size": "355 ml can",
    "price": 2.99,
    "image": "assets/img/mango-lassi.jpg",
    "tags": [
      "Vegetarian"
    ],
    "prep": "Ready to Drink",
    "taxable": true,
    "status": "coming_soon",
    "featured": true,
    "maxQty": 48
  },
  {
    "sku": "TF-RT-001",
    "category": "FROZEN",
    "name": "Vegetable Samosas",
    "nameFr": "Samoussas aux Légumes",
    "regional": "",
    "desc": "Crisp pastry filled with spiced potato and peas. Heat and serve.",
    "descFr": "Pâtisserie croustillante garnie de pommes de terre épicées et de petits pois. Réchauffer et servir.",
    "size": "Pack of 6",
    "price": 7.99,
    "image": "assets/img/samosa-placeholder.svg",
    "tags": [
      "Vegetarian"
    ],
    "prep": "Ready to Cook",
    "taxable": false,
    "status": "active",
    "featured": true,
    "maxQty": 20
  },
  {
    "sku": "TF-SC-001",
    "category": "SAUCES",
    "name": "Butter Chicken Sauce",
    "nameFr": "Sauce au Poulet au Beurre",
    "regional": "",
    "desc": "Rich, creamy and flavourful – just add chicken (or paneer or your choice of protein) for butter chicken at home.",
    "descFr": "Une recette riche, onctueuse et savoureuse : il suffit d’y ajouter du poulet (ou du paneer, ou la protéine de votre choix) pour préparer un poulet au beurre à la maison.",
    "size": "350 ml jar",
    "price": 8.99,
    "image": "assets/img/butter-chicken-sauce.jpg",
    "tags": [
      "Vegetarian"
    ],
    "prep": "Ready to Cook",
    "taxable": false,
    "status": "active",
    "featured": true,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-001",
    "category": "SNACKS",
    "name": "Dreamy Chips",
    "nameFr": "Croustilles de Rêve",
    "regional": "Thattai",
    "desc": "Crisp, thin rice-flour crackers with a gentle spice. Gluten-free, authentic South Indian recipe.",
    "descFr": "Des craquelins fins et croustillants à la farine de riz, légèrement épicés. Recette authentique du sud de l’Inde, sans gluten.",
    "size": "150 g",
    "price": 4.99,
    "image": "assets/img/dreamy-chips-thattai.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": true,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-002",
    "category": "SNACKS",
    "name": "Baton Bites",
    "nameFr": "Bouchées Croquantes",
    "regional": "Butter Murukku",
    "desc": "Melt-in-the-mouth butter murukku sticks – light, crunchy and addictive.",
    "descFr": "Des bâtonnets de murukku au beurre qui fondent dans la bouche : légers, croquants et irrésistibles.",
    "size": "150 g",
    "price": 4.99,
    "image": "assets/img/baton-bites-butter-murukku.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": false,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-003",
    "category": "SNACKS",
    "name": "Curly Crisps",
    "nameFr": "Boucles Craquantes",
    "regional": "Thenkuzhal Murukku",
    "desc": "Classic spiral murukku with cumin and sesame – the tea-time favourite.",
    "descFr": "Murukku classique en spirale au cumin et au sésame : un incontournable de l’heure du thé.",
    "size": "150 g",
    "price": 4.99,
    "image": "assets/img/curly-crisps-thenkuzhal.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": false,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-004",
    "category": "SNACKS",
    "name": "Fiesta Mix",
    "nameFr": "Mélange de Collations Indiennes",
    "regional": "Madras Mix",
    "desc": "A bold Indian snack mix of sev, peanuts, lentils and curry leaves.",
    "descFr": "Un mélange de collations indiennes aux saveurs audacieuses, composé de sev, d'arachides, de lentilles et de feuilles de curry.",
    "size": "200 g",
    "price": 5.49,
    "image": "assets/img/fiesta-mix-madras-mix.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": true,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-005",
    "category": "SNACKS",
    "name": "Spice Sticks",
    "nameFr": "Bâtonnets aux Épices",
    "regional": "Kara Sev",
    "desc": "Peppery, crunchy gram-flour sticks with a proper South Indian kick.",
    "descFr": "Des bâtonnets croustillants à la farine de gramme, relevés au poivre, avec une touche typiquement sud-indienne.",
    "size": "150 g",
    "price": 4.99,
    "image": "assets/img/spice-sticks-kara-sev.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free",
      "Spicy"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": false,
    "maxQty": 20
  },
  {
    "sku": "TF-SN-006",
    "category": "SNACKS",
    "name": "Savory Pops",
    "nameFr": "Perles Savoureuses",
    "regional": "Seedai",
    "desc": "Golden, crunchy rice-flour pearls with coconut and sesame.",
    "descFr": "Des perles dorées et croquantes à la farine de riz, à la noix de coco et au sésame.",
    "size": "150 g",
    "price": 4.99,
    "image": "assets/img/savory-pops-seedai.jpg",
    "tags": [
      "Vegetarian",
      "Gluten-free"
    ],
    "prep": "Ready to Eat",
    "taxable": true,
    "status": "active",
    "featured": false,
    "maxQty": 20
  }
];

/* Store settings – mirrors the `settings`, `tax_rates` and `delivery_zones` tables */
window.TANJO_SETTINGS = {
  currency: "CAD",
  apiBase: "",                 // e.g. "https://tanjofoods.com/api" – leave empty for demo mode
  minOrder: 25.00,
  deliveryFee: 6.99,
  freeDeliveryOver: 75.00,
  taxes: [ { code: "GST", name: "GST (5%)", rate: 0.05 }, { code: "QST", name: "QST (9.975%)", rate: 0.09975 } ],
  pickupAddress: "8451 Chem. Dalton, Mont-Royal, QC H4T 1V5",
  email: "",                   // to be confirmed – hidden while empty
  phone: "",                   // to be confirmed – hidden while empty
  sampleData: true
};
