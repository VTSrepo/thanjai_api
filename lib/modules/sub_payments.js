// Payment provider for the online shop.
// STRIPE_SECRET_KEY set  -> Stripe Checkout (card saved for weekly renewals, charged off-session at cutoff).
// not set                -> "mock" mode for local testing / UAT without Stripe: payments succeed instantly.
const crypto = require('crypto');

const MODE = process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock';
let stripe = null;
if (MODE === 'stripe') stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const cents = (amount) => Math.round(Number(amount) * 100);

const cardOf = (pm) => (pm && pm.card ? { brand: pm.card.brand, last4: pm.card.last4 } : { brand: null, last4: null });

async function ensureStripeCustomer(customer) {
  if (customer.stripe_customer_id) return customer.stripe_customer_id;
  const c = await stripe.customers.create({
    email: customer.email, name: customer.full_name, phone: customer.phone || undefined,
    metadata: { customer_id: customer.customer_id, org_id: customer.org_id },
  });
  return c.id;
}

/** Hosted checkout for an order. Returns { url, ref, stripe_customer_id }. */
async function createCheckout({ order, customer, description, successUrl, cancelUrl }) {
  if (MODE === 'mock') {
    // test mode: skip the card page and go straight to the success page, which confirms the payment
    const ref = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return { url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}ref=${ref}`, ref, stripe_customer_id: null };
  }
  const stripeCustomer = await ensureStripeCustomer(customer);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomer,
    line_items: [{
      quantity: 1,
      price_data: { currency: 'cad', unit_amount: cents(order.total), product_data: { name: description } },
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: { org_id: order.org_id, order_id: order.order_id },
    },
    metadata: { org_id: order.org_id, order_id: order.order_id },
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}ref={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });
  return { url: session.url, ref: session.id, stripe_customer_id: stripeCustomer };
}

/** Result of a checkout: { paid, payment_method, brand, last4, receipt_url, intent } */
async function verifyCheckout(ref) {
  if (MODE === 'mock' || String(ref).startsWith('mock_')) {
    return { paid: true, payment_method: 'pm_mock', brand: 'visa', last4: '4242', receipt_url: null, intent: ref };
  }
  const s = await stripe.checkout.sessions.retrieve(ref, { expand: ['payment_intent.payment_method', 'payment_intent.latest_charge'] });
  const pi = s.payment_intent || {};
  const card = cardOf(pi.payment_method);
  return {
    paid: s.payment_status === 'paid',
    payment_method: pi.payment_method && pi.payment_method.id,
    ...card,
    receipt_url: pi.latest_charge && pi.latest_charge.receipt_url,
    intent: pi.id,
  };
}

/** Charge the saved card (weekly renewal). Returns { ok, ref, receipt_url, message } */
async function chargeSaved({ order, customer }) {
  if (MODE === 'mock') {
    if (!customer.stripe_payment_method) return { ok: false, message: 'No saved card' };
    return { ok: true, ref: `mock_${crypto.randomBytes(8).toString('hex')}`, receipt_url: null };
  }
  if (!customer.stripe_customer_id || !customer.stripe_payment_method) return { ok: false, message: 'No saved card' };
  try {
    const pi = await stripe.paymentIntents.create({
      amount: cents(order.total), currency: 'cad',
      customer: customer.stripe_customer_id, payment_method: customer.stripe_payment_method,
      off_session: true, confirm: true,
      description: `Weekly meals ${order.delivery_date} (${order.order_id})`,
      metadata: { org_id: order.org_id, order_id: order.order_id },
      expand: ['latest_charge'],
    });
    if (pi.status === 'succeeded') return { ok: true, ref: pi.id, receipt_url: pi.latest_charge && pi.latest_charge.receipt_url };
    return { ok: false, ref: pi.id, message: `Payment ${pi.status}` };
  } catch (e) {
    return { ok: false, ref: e.raw && e.raw.payment_intent && e.raw.payment_intent.id, message: e.message };
  }
}

/** Hosted page to replace the saved card. Returns { url, ref } */
async function createCardSetup({ customer, successUrl, cancelUrl }) {
  if (MODE === 'mock') {
    const ref = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return { url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}card_ref=${ref}`, ref, stripe_customer_id: null };
  }
  const stripeCustomer = await ensureStripeCustomer(customer);
  const s = await stripe.checkout.sessions.create({
    mode: 'setup', customer: stripeCustomer, currency: 'cad', payment_method_types: ['card'],
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}card_ref={CHECKOUT_SESSION_ID}`, cancel_url: cancelUrl,
  });
  return { url: s.url, ref: s.id, stripe_customer_id: stripeCustomer };
}

async function verifyCardSetup(ref) {
  if (MODE === 'mock' || String(ref).startsWith('mock_')) return { ok: true, payment_method: 'pm_mock', brand: 'visa', last4: '4242' };
  const s = await stripe.checkout.sessions.retrieve(ref, { expand: ['setup_intent.payment_method'] });
  const si = s.setup_intent || {};
  if (si.status !== 'succeeded') return { ok: false };
  return { ok: true, payment_method: si.payment_method.id, ...cardOf(si.payment_method) };
}

/** Verifies a Stripe webhook; returns the event or throws. */
function webhookEvent(rawBody, signature) {
  if (MODE !== 'stripe' || !process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Webhook not configured');
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { MODE, createCheckout, verifyCheckout, chargeSaved, createCardSetup, verifyCardSetup, webhookEvent };
