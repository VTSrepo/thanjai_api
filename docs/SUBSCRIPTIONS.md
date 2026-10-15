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
| Shop setup | Plans (seeded: Starter 5 / $64.99, Family 10 / $119.99, Value 15 / $169.99), delivery zones by postal-code start + fee, settings (delivery day, cutoff, tax, hub branch) |
| Weekly menu | Per delivery date: add dishes, mark chef's picks, set cutoff, publish. Dish description / diet / allergens / photo link |
| Online orders | Per delivery: totals, kitchen totals per dish, **Run cutoff**, **Send to kitchen**, mark delivered, retry card / mark paid, packing slips + route sheet PDF |
| Subscribers | List with plan, status, paid orders, total paid; detail with orders and payments |

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
Migration `009_subscriptions` (in `migrations/run.js`): `sub_settings`, `sub_plan`, `sub_zone`, `sub_menu_week`, `sub_menu_item`, `sub_customer`, `sub_subscription`, `sub_order`, `sub_order_item`, `sub_payment`, plus `product_master.sub_description / sub_diet / sub_allergens / sub_image_url`.

## Not yet included
E-mails (notifications are written to the server log until an e-mail provider is chosen), forgot-password, discount codes, one-time (non-subscription) orders, photo upload (photo is a link).
