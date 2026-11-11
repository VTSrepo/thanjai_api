/*
 * Tanjo Foods – French / English texts
 * ------------------------------------
 * PAGE: French for every element marked data-i18n="key" in index.html (the English is the text in the page itself).
 *       Texts marked (doc) come from the client's "website content" document; the others are translations to review.
 * UI:   texts used by the shop (cart, checkout ...) in both languages.
 */
window.TANJO_I18N = {
  page: {
    ribbon_demo: "Aperçu – les prix, formats et détails des produits sont des valeurs d’exemple à confirmer.",
    nav_home: "Accueil", nav_about: "À propos", nav_products: "Produits", nav_order: "Commander en ligne", nav_contact: "Nous joindre",
    hero_title: "De la nourriture pour <em>chaque</em> moment.",                                                               // (doc)
    hero_lead: "Pour apporter saveur et qualité à vos repas quotidiens. Tanjo Foods propose une gamme toujours plus vaste de collations, de boissons, de sauces et de plats prêts à manger.", // (doc)
    hero_explore: "Découvrir nos produits",
    badge_years: "ans dans l’alimentation", badge_ranges: "gammes de produits", badge_authentic: "recettes authentiques",
    float_title: "Saveurs signature", float_sub: "Collations · Sauces · Surgelés",
    years_box: "ans<br>d’expérience",
    about_eyebrow: "Notre histoire",
    about_title: "Le goût de l’expérience",                                                                                  // (doc)
    about_p1: "Forte de 15 ans d’expérience dans l’industrie alimentaire, Tanjo Foods allie la passion pour la gastronomie à une gamme variée de produits. Des collations savoureuses aux boissons rafraîchissantes, en passant par nos sauces emblématiques et nos repas prêts à manger pratiques, nos produits répondent à tous les goûts et s’adaptent à toutes les occasions.", // (doc)
    about_p2: "Notre expérience dans l’industrie alimentaire façonne notre approche visant à offrir des produits alimentaires de qualité à nos clients.", // (doc)
    pil1_t: "La qualité d’abord", pil1_s: "Des ingrédients choisis avec soin",
    pil2_t: "Un goût authentique", pil2_s: "Des recettes ancrées dans la tradition",
    pil3_t: "Pratique", pil3_s: "Prêt à cuire et prêt à manger",
    range_eyebrow: "Notre gamme",
    range_title: "Découvrez nos produits",                                                                                   // (doc)
    range_lead: "Découvrez notre gamme de produits alimentaires, conçue pour satisfaire tous les goûts et accompagner tous les moments du quotidien.", // (doc)
    cat_snacks: "Collations", cat_snacks_p: "Une variété de collations salées et de croustilles à savourer à tout moment.", cat_snacks_go: "Voir les collations →",
    cat_sauces: "Sauce au poulet au beurre", cat_sauces_p: "Une sauce savoureuse pour apporter le goût du poulet au beurre à votre table.", cat_sauces_go: "Voir les sauces →",
    cat_frozen: "Produits surgelés", cat_frozen_p: "Samoussas, rouleaux et classiques du sud de l’Inde, prêts à cuire.", cat_frozen_go: "Voir les surgelés →",
    cta_title: "Déjà faim?", cta_p: "Commandez vos favoris en ligne, en cueillette ou en livraison partout à Montréal.", cta_btn: "Commencer ma commande →",
    contact_title: "Nous joindre",                                                                                           // (doc)
    contact_lead: "Vous avez une question sur nos produits ou vous souhaitez en commander? Remplissez le formulaire ci-dessous et notre équipe vous répondra dans les plus brefs délais.", // (doc)
    f_name: "Nom complet", f_name_err: "Veuillez entrer votre nom.", f_email: "Adresse courriel", f_email_err: "Veuillez entrer un courriel valide.",
    f_phone: "Numéro de téléphone", f_type: "Type de demande", f_select: "Choisir…",
    f_t1: "Demande sur un produit", f_t2: "Demande de gros / en vrac", f_t3: "Partenariat de distribution", f_t4: "Demande générale",
    f_type_err: "Veuillez choisir un type de demande.", f_product: "Produit d’intérêt",
    f_p1: "Croustilles", f_p2: "Samoussas", f_p3: "Sauce au poulet au beurre",
    f_msg: "Message", f_msg_err: "Veuillez entrer un message.", f_send: "Envoyer",
    thx_title: "Merci d’avoir contacté Tanjo Foods!",                                                                       // (doc)
    thx_p1: "Nous avons bien reçu votre demande. Notre équipe examinera votre message et vous répondra sous peu.",          // (doc)
    thx_p2: "Nous vous remercions de l’intérêt que vous portez à Tanjo Foods.",                                             // (doc)
    ci_title: "Coordonnées", ci_address: "Adresse", ci_phone: "Téléphone", ci_email: "Courriel", ci_web: "Site Web",
    shop_title: "Boutique Tanjo Foods", delivery: "Livraison", pickup: "Cueillette",
    search_label: "Rechercher", search_ph: "Rechercher collations, sauces, samoussas…",
    sort_feat: "En vedette", sort_low: "Prix : croissant", sort_high: "Prix : décroissant", sort_name: "Nom A–Z",
    your_order: "Votre commande",
    foot_tag: "De la nourriture pour chaque moment – collations, sauces et produits surgelés de Montréal.",
    foot_shop: "Boutique", foot_sauces: "Sauces", foot_company: "Entreprise", foot_about: "À propos",
    foot_wholesale: "Ventes en gros", foot_dist: "Partenaires de distribution", foot_help: "Aide", foot_contact: "Nous joindre",
    foot_delivery: "Livraison et cueillette", foot_privacy: "Politique de confidentialité", foot_rights: "Tous droits réservés.",
  },

  ui: {
    en: {
      all: "All", popular: "Popular", coming_soon: "Coming soon", sold_out: "Sold out", notify_me: "Notify me", photo_soon: "Photo coming soon",
      added: "{name} added to cart", no_match: "No products match “{q}”.",
      cart_empty_t: "Your cart is empty", cart_empty_s: "Add a few favourites to get started.",
      delivery: "Delivery", pickup: "Pickup", free: "Free", from: "from",
      free_more: "Add <b>{amt}</b> more for free delivery", subtotal: "Subtotal", total: "Total", total_paid: "Total paid",
      min_note: "Minimum order is {min} – add {more} more to check out.", checkout: "Checkout", view_cart: "View cart ({n})",
      fulfil_note: "Pickup or delivery across Montreal · Minimum order {min}",
      pack: "Pack size", type: "Type", price: "Price", sku: "SKU", add_cart: "Add to cart", add_another: "Add another",
      notify_long: "Notify me when available", notify_title: "{name} is coming soon", notify_sub: "Leave your e-mail and we'll tell you when it's available.",
      notify_thanks: "Thanks! We'll let you know when it's available.", email_err: "Valid e-mail required",
      co_title: "Checkout", co_sub: "Review your order and tell us where to bring it.", co_how: "How would you like it?",
      co_delivery_s: "{fee} · free over {free}", co_details: "Your details", co_name: "Full name", co_phone: "Phone", co_email: "Email",
      co_addr: "Street address", co_apt: "Apt / Unit", co_postal: "Postal code", co_date: "Preferred date", co_slot: "Time slot",
      co_pay: "Payment", co_card: "Credit / debit card", co_card_s: "Secure online payment", co_card_test: "TEST MODE – no real charge",
      co_pod: "Pay at {where}", co_pod_door: "the door", co_pod_pickup: "pickup", co_pod_s: "Card or cash",
      co_notes: "Order notes", co_notes_ph: "Allergies, buzzer code, etc.", required: "Required", req_delivery: "Required for delivery",
      postal_err: "Valid Canadian postal code required", co_summary: "Order summary", place: "Place order", placing: "Placing order…",
      co_terms: "By placing your order you agree to our terms. We'll confirm by email.", fix_fields: "Please complete the highlighted fields",
      order_fail: "Sorry – we couldn't place your order. Please try again.",
      thanks: "Thank you, {name}!", received: "Your order has been received. A confirmation has been sent to <b>{email}</b>.",
      paid_ok: "Payment received – your order is confirmed.", confirmed: "Your order is confirmed.", awaiting: "Your order is awaiting payment.",
      sent_to: "A confirmation has been sent to <b>{email}</b>.", order: "Order", on: "on", pay_on: "pay on {where}",
      delivery_to: "Delivery to {addr}", continue: "Continue shopping", not_found: "Order not found", try_again: "Sorry – please try again or email us.",
      ribbon_test: "TEST MODE – orders are saved, but card payments are simulated (no real charge).", gst: "GST", qst: "QST", taxes: "GST + QST",
      prep: { "Ready to Eat": "Ready to Eat", "Ready to Cook": "Ready to Cook", "Ready to Drink": "Ready to Drink" },
    },
    fr: {
      all: "Tout", popular: "Populaire", coming_soon: "Bientôt disponible", sold_out: "Épuisé", notify_me: "M’aviser", photo_soon: "Photo à venir",
      added: "{name} ajouté au panier", no_match: "Aucun produit ne correspond à « {q} ».",
      cart_empty_t: "Votre panier est vide", cart_empty_s: "Ajoutez quelques favoris pour commencer.",
      delivery: "Livraison", pickup: "Cueillette", free: "Gratuite", from: "à partir de",
      free_more: "Ajoutez <b>{amt}</b> pour la livraison gratuite", subtotal: "Sous-total", total: "Total", total_paid: "Total payé",
      min_note: "La commande minimale est de {min} – ajoutez {more} pour passer à la caisse.", checkout: "Passer à la caisse", view_cart: "Voir le panier ({n})",
      fulfil_note: "Cueillette ou livraison partout à Montréal · Commande minimale {min}",
      pack: "Format", type: "Type", price: "Prix", sku: "Code", add_cart: "Ajouter au panier", add_another: "Ajouter encore",
      notify_long: "M’aviser lorsqu’il sera disponible", notify_title: "{name} sera bientôt disponible", notify_sub: "Laissez votre courriel et nous vous aviserons dès qu’il sera disponible.",
      notify_thanks: "Merci! Nous vous aviserons dès qu’il sera disponible.", email_err: "Courriel valide requis",
      co_title: "Paiement", co_sub: "Vérifiez votre commande et indiquez-nous où la livrer.", co_how: "Comment souhaitez-vous la recevoir?",
      co_delivery_s: "{fee} · gratuite dès {free}", co_details: "Vos coordonnées", co_name: "Nom complet", co_phone: "Téléphone", co_email: "Courriel",
      co_addr: "Adresse", co_apt: "App. / Unité", co_postal: "Code postal", co_date: "Date souhaitée", co_slot: "Plage horaire",
      co_pay: "Paiement", co_card: "Carte de crédit / débit", co_card_s: "Paiement en ligne sécurisé", co_card_test: "MODE TEST – aucun montant réel prélevé",
      co_pod: "Payer à {where}", co_pod_door: "la livraison", co_pod_pickup: "la cueillette", co_pod_s: "Carte ou comptant",
      co_notes: "Remarques", co_notes_ph: "Allergies, code d’entrée, etc.", required: "Obligatoire", req_delivery: "Obligatoire pour la livraison",
      postal_err: "Code postal canadien valide requis", co_summary: "Résumé de la commande", place: "Commander", placing: "Commande en cours…",
      co_terms: "En passant votre commande, vous acceptez nos conditions. Nous la confirmerons par courriel.", fix_fields: "Veuillez remplir les champs en surbrillance",
      order_fail: "Désolé – votre commande n’a pas pu être passée. Veuillez réessayer.",
      thanks: "Merci, {name}!", received: "Votre commande a bien été reçue. Une confirmation a été envoyée à <b>{email}</b>.",
      paid_ok: "Paiement reçu – votre commande est confirmée.", confirmed: "Votre commande est confirmée.", awaiting: "Votre commande est en attente de paiement.",
      sent_to: "Une confirmation a été envoyée à <b>{email}</b>.", order: "Commande", on: "le", pay_on: "paiement à {where}",
      delivery_to: "Livraison au {addr}", continue: "Continuer mes achats", not_found: "Commande introuvable", try_again: "Désolé – veuillez réessayer ou nous écrire.",
      ribbon_test: "MODE TEST – les commandes sont enregistrées, mais les paiements par carte sont simulés (aucun montant réel).", gst: "TPS", qst: "TVQ", taxes: "TPS + TVQ",
      prep: { "Ready to Eat": "Prêt à manger", "Ready to Cook": "Prêt à cuire", "Ready to Drink": "Prêt à boire" },
      tags: { "Vegetarian": "Végétarien", "Vegan": "Végane", "Gluten-free": "Sans gluten", "Spicy": "Épicé", "Halal": "Halal" },
    },
  },
};
