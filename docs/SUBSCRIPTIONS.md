# Online weekly-meal subscriptions (feature/subscriber)

In-house replacement for the Shopify weeklymeals.ca store, in the same app and database.

## Customer side (public, no staff login) – `/v1/meals`
| Page | What it does |
|---|---|
| `/meals` | Plans, this week's menu (diet + allergen tags), delivery areas with postal-code check |
| `/meals/order` | Choose plan → pick meals → create account / log in (address must be in a delivery zone) → review with GST/QST → pay |
| `/meals/done` | Return page after payment; confirms it |
| `/meals/account` | Upcoming (change meals / skip until cutoff), Orders & deliveries, Payments (receipts), My plan (change, pause, resume, cancel, update card), My details |

Subscribers have their own accounts (`sub_customer`, e-mail + password). Their login token (type `S`) can only reach `/shop/*` routes.

## Staff side – menu **Online** (Role Master screens SUB_ORDERS, SUB_SETUP, SUB_CUSTOMERS)
| Screen | What it does |
|---|---|
| Shop setup | **Plans** (type Veg / Non-Veg / Combo, meals a week, plan discount %, premium dishes allowed, per-dish discounts), **Dish prices** (regular price, curry or combo meal, premium flag; *Import from Excel* reads the Veg / Non-Veg price sheet and can set the plan discount), delivery zones by postal-code start + fee, settings (delivery day, cutoff, tax, hub branch) |
| Weekly menu | Per delivery date: add dishes, mark chef's picks, set cutoff, publish (every dish needs a price). Dish description / diet / kind / price / premium / allergens / photo link |
| Online orders | Per delivery: totals, kitchen totals per dish, **Run cutoff**, **Send to kitchen**, mark delivered, retry card / mark paid, packing slips + route sheet PDF |
| Subscribers | List with plan, status, paid orders, total paid; detail with orders and payments |

## Plans and pricing
- **Veg** plans offer veg dishes, **Non-Veg** plans non-veg and egg dishes, **Combo** plans any dish - the customer mixes veg and non-veg.
- **Veg / Non-Veg plans have a fixed weekly price** set by the restaurant (Shop setup → Plans → Weekly price, e.g. Veg 5 = $50).
  The customer picks any dishes of that kind; the price does not change with the dishes. A Veg / Non-Veg plan without a weekly
  price is hidden from customers.
- **Combo plans** = sum of the chosen dishes at regular price less a discount: the dish's discount in that plan if set, else the
  dish's own discount, else the plan's discount (**Combo default discount** at the top of Dish prices sets it for all Combo plans).
- **Shop setup → Dish prices** lists every product from Product Master: switch **Online** on, set the diet, the **regular price**
  (used by Combo plans; every dish on a published menu needs one), an optional **own discount** (Combo), and **Costly**.
  Changes save as you go. *Import prices from Excel* is optional.
- **Costly dishes**: each plan (all types) sets how many may be chosen per week (e.g. 2 of 5); customers see them as "Premium".
  The customer cannot add more and the server refuses it too. Chef's picks respect the plan type and the limit.
- Delivery, GST and QST are added. Unpaid weeks are re-priced at cutoff with the current prices. A paid Combo week can only be
  changed to an equal or lower total (Veg / Non-Veg weeks can always be changed - same price).

## Weekly cycle
1. Staff publish the menu for a delivery date (cutoff defaults to 3 days before, 23:59).
2. Customers pick meals until the cutoff; new customers pay at checkout (card saved).
3. **Run cutoff** (or automatic with `SUB_AUTO_CUTOFF=Y`): active subscribers who did not pick get chef's picks (veg preference respected), saved cards are charged, the week locks.
4. **Send to kitchen**: paid meals are totalled per dish into one indent per producing kitchen, raised by the hub branch; it then follows the normal indent flow (accept, finalize, batches, dispatch, receipt).
5. Packing slips / route sheet → deliver → mark delivered.

## Payments
- `STRIPE_SECRET_KEY` empty → **test mode** (no card charged; clearly labelled on every payment screen).
- With Stripe: Checkout for the first order (card saved for off-session renewals), PaymentIntents at each cutoff, card update via Checkout setup mode, webhook `/v1/shop/stripe/webhook` (`checkout.session.completed`).
- Refunds: from the Stripe dashboard (cancelling an order in the app does not refund).

## Database
Migration `009_subscriptions` (in `migrations/run.js`): `sub_settings`, `sub_plan`, `sub_zone`, `sub_menu_week`, `sub_menu_item`, `sub_customer`, `sub_subscription`, `sub_order`, `sub_order_item`, `sub_payment`, plus `product_master.sub_description / sub_diet / sub_allergens / sub_image_url`. Migration `013_meal_pricing`: `sub_plan.plan_type / discount_pct / max_costly`, `product_master.sub_price / sub_kind / sub_costly`, `sub_order_item.unit_price`, `sub_plan_discount` (per-dish discount per plan). Migration `014_dish_discount`: `product_master.sub_discount_pct` (a dish's own discount).

## Not yet included
E-mails (notifications are written to the server log until an e-mail provider is chosen), forgot-password, discount codes, one-time (non-subscription) orders, photo upload (photo is a link).
