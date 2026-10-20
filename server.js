const express = require('express');
const helmet = require('helmet');
const Stripe = require('stripe');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT || 4242);
const siteUrl = process.env.SITE_URL;
const allowedCountries = (process.env.STRIPE_ALLOWED_SHIPPING_COUNTRIES || 'FR')
  .split(',').map(country => country.trim().toUpperCase()).filter(Boolean);
const products = {
  projecteur: process.env.STRIPE_PROJECTOR_PRICE_ID,
  imprimante: process.env.STRIPE_PRINTER_PRICE_ID,
  recharge: process.env.STRIPE_RECHARGE_PRICE_ID
};
const orderNotificationEmail = process.env.ORDER_NOTIFICATION_EMAIL || 'novia.contacts@gmail.com';
const dataDirectory = path.join(__dirname, '.data');
const ordersFile = path.join(dataDirectory, 'orders.json');

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required.');
if (!siteUrl) throw new Error('SITE_URL is required.');
if (!allowedCountries.length || allowedCountries.some(country => !/^[A-Z]{2}$/.test(country))) {
  throw new Error('STRIPE_ALLOWED_SHIPPING_COUNTRIES must contain comma-separated ISO country codes.');
}
const parsedSiteUrl = new URL(siteUrl);
if (!['http:', 'https:'].includes(parsedSiteUrl.protocol) || parsedSiteUrl.username || parsedSiteUrl.password || parsedSiteUrl.search || parsedSiteUrl.hash) {
  throw new Error('SITE_URL must be an http(s) origin without credentials.');
}
if (process.env.NODE_ENV === 'production' && parsedSiteUrl.protocol !== 'https:') {
  throw new Error('SITE_URL must use HTTPS in production.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const invoicesEnabled = process.env.STRIPE_ENABLE_INVOICES === 'true';
const initialOrders = fs.existsSync(ordersFile)
  ? JSON.parse(fs.readFileSync(ordersFile, 'utf8'))
  : { events: [], orders: {}, invoices: {} };
const processedEventIds = new Set(initialOrders.events);
const orderState = {
  events: [...processedEventIds],
  orders: initialOrders.orders || {},
  invoices: initialOrders.invoices || {}
};

function persistOrderState() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryFile = `${ordersFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(orderState), { mode: 0o600 });
  fs.renameSync(temporaryFile, ordersFile);
}

function recordEvent(event) {
  if (processedEventIds.has(event.id)) return;
  const object = event.data.object;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    orderState.orders[object.id] = {
      ...orderState.orders[object.id],
      status: event.type.endsWith('async_payment_succeeded') || object.payment_status === 'paid' ? 'paid' : 'pending',
      amountTotal: object.amount_total,
      currency: object.currency,
      invoiceId: typeof object.invoice === 'string' ? object.invoice : object.invoice?.id || null,
      updatedAt: new Date().toISOString()
    };
  } else if (event.type === 'checkout.session.async_payment_failed') {
    orderState.orders[object.id] = {
      ...orderState.orders[object.id],
      status: 'payment_failed',
      updatedAt: new Date().toISOString()
    };
  } else if (event.type === 'invoice.paid') {
    orderState.invoices[object.id] = { status: 'paid', updatedAt: new Date().toISOString() };
  }
  processedEventIds.add(event.id);
  orderState.events.push(event.id);
  persistOrderState();
}

function isPaidCheckout(event) {
  return event.type === 'checkout.session.async_payment_succeeded'
    || (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid');
}

function orderAddress(session) {
  const collected = session.collected_information?.shipping_details;
  const shipping = session.shipping_details || collected;
  const billing = session.customer_details?.address;
  const address = shipping?.address || billing;
  return {
    name: shipping?.name || session.customer_details?.name || '',
    phone: shipping?.phone || '',
    lines: address
      ? [address.line1, address.line2, [address.postal_code, address.city].filter(Boolean).join(' '), address.state, address.country]
          .filter(Boolean)
      : []
  };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function sendOrderNotification(sessionId) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !sender) {
    throw new Error('Order email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM.');
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
  const shipping = orderAddress(session);
  const email = session.customer_details?.email || session.customer_email || '';
  const phone = session.customer_details?.phone || shipping.phone || '';
  const valueOrMissing = value => value || 'Non renseigné';
  const money = (amount, currency) => {
    if (!Number.isInteger(amount)) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (currency || 'eur').toUpperCase() })
      .format(amount / 100);
  };
  const purchased = lineItems.data.map(item => ({
    name: item.description || item.price?.product?.name || item.price?.id || 'Produit',
    quantity: item.quantity || 1,
    total: money(item.amount_total, session.currency)
  }));
  const customerName = shipping.name || session.customer_details?.name || '';
  const addressText = shipping.lines.length ? shipping.lines.join(', ') : 'Non renseignée';
  const productText = purchased.map(item => `• ${item.name} — quantité ${item.quantity} — ${item.total}`).join('\n') || 'Détails indisponibles';
  const text = [
    'Nouvelle commande payée sur PromosD\'hiver',
    `Référence : ${session.id}`,
    `Nom et prénom : ${valueOrMissing(customerName)}`,
    `E-mail : ${valueOrMissing(email)}`,
    `Téléphone : ${valueOrMissing(phone)}`,
    `Adresse de livraison : ${addressText}`,
    '',
    'Articles :',
    productText,
    `Total payé : ${money(session.amount_total, session.currency)}`
  ].join('\n');
  const html = `<!doctype html><html lang="fr"><body><h1>Nouvelle commande payée</h1><p><strong>PromosD'hiver</strong> · Référence ${escapeHtml(session.id)}</p><h2>Client</h2><p>Nom et prénom : ${escapeHtml(valueOrMissing(customerName))}<br>E-mail : ${escapeHtml(valueOrMissing(email))}<br>Téléphone : ${escapeHtml(valueOrMissing(phone))}<br>Adresse de livraison : ${shipping.lines.map(escapeHtml).join('<br>') || 'Non renseignée'}</p><h2>Articles</h2><ul>${purchased.map(item => `<li>${escapeHtml(item.name)} — quantité ${item.quantity} — ${escapeHtml(item.total)}</li>`).join('') || '<li>Détails indisponibles</li>'}</ul><p><strong>Total payé : ${escapeHtml(money(session.amount_total, session.currency))}</strong></p></body></html>`;

  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `promosdhiver-order-${session.id}`
    },
    body: JSON.stringify({
      from: sender,
      to: [orderNotificationEmail],
      subject: `Nouvelle commande PromosD'hiver — ${session.id}`,
      text,
      html
    })
  });
  if (!result.ok) throw new Error(`Order email provider returned HTTP ${result.status}.`);
}

function markOrderNotificationSent(sessionId) {
  orderState.orders[sessionId] = {
    ...orderState.orders[sessionId],
    notificationSent: true,
    updatedAt: new Date().toISOString()
  };
  persistOrderState();
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://checkout.stripe.com']
    }
  }
}));

app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (request, response) => {
  const signature = request.get('stripe-signature');
  if (!process.env.STRIPE_WEBHOOK_SECRET || !signature) {
    return response.status(400).send('Webhook signature configuration is missing.');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return response.status(400).send('Invalid webhook signature.');
  }
  try {
    if (!processedEventIds.has(event.id)) {
      const sessionId = event.data.object.id;
      const alreadyNotified = orderState.orders[sessionId]?.notificationSent;
      if (isPaidCheckout(event) && !alreadyNotified) {
        await sendOrderNotification(sessionId);
        markOrderNotificationSent(sessionId);
      }
    }
    recordEvent(event);
    return response.sendStatus(200);
  } catch (error) {
    process.stderr.write(`Stripe webhook processing failed: ${error.message}\n`);
    return response.sendStatus(500);
  }
});

app.use(express.json({ limit: '16kb' }));

app.post('/api/create-checkout-session', async (request, response) => {
  const requestedItems = request.body?.items;
  if (!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length > 3) {
    return response.status(400).json({ error: 'Votre panier est vide ou invalide.' });
  }
  const quantities = new Map();
  for (const item of requestedItems) {
    if (!item || !Object.hasOwn(products, item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      return response.status(400).json({ error: 'Un produit ou une quantité est invalide.' });
    }
    quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
  }
  if ([...quantities.keys()].some(id => !products[id])) {
    return response.status(503).json({ error: 'Les prix de la boutique ne sont pas encore configurés.' });
  }
  if (!process.env.STRIPE_SHIPPING_RATE_ID) {
    return response.status(503).json({ error: 'Les frais de livraison ne sont pas encore configurés.' });
  }

  const lineItems = [...quantities].map(([id, quantity]) => ({ price: products[id], quantity }));
  const sessionParams = {
    mode: 'payment',
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: allowedCountries },
    shipping_options: [{ shipping_rate: process.env.STRIPE_SHIPPING_RATE_ID }],
    success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/index.html?checkout=cancelled`,
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    automatic_tax: { enabled: false }
  };
  if (invoicesEnabled) sessionParams.invoice_creation = { enabled: true };

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return response.json({ url: session.url });
  } catch {
    return response.status(502).json({ error: 'Impossible de démarrer le paiement. Réessayez plus tard.' });
  }
});

app.get('/api/checkout-session/:id', async (request, response) => {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Session invalide.' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(request.params.id);
    return response.json({ paymentStatus: session.payment_status });
  } catch {
    return response.status(404).json({ error: 'Session introuvable.' });
  }
});

const publicPaths = new Set(['/', '/index.html', '/styles.css', '/payments.css', '/navigation.css', '/immersive.css', '/projector-gallery.css', '/blog.html', '/blog.css', '/app.js', '/success.html', '/success.css', '/success.js']);
app.use((request, response, next) => {
  const isGalleryImage = /^\/assets\/images\/(?:projecteur\/(?:0[1-9]|1[0-7])\.jpg|imprimante\/0[1-5]\.png|recharge-photo\/0[1-2]\.png)$/.test(request.path);
  if (request.method !== 'GET' || (!publicPaths.has(request.path) && !isGalleryImage)) return next();
  return express.static(__dirname, { index: 'index.html', dotfiles: 'deny' })(request, response, next);
});
app.listen(port, () => process.stdout.write(`PromosD'hiver listening on port ${port}\n`));
