# PromosD'hiver

The storefront currently sends each product to its own Stripe Payment Link:

- Mini projecteur portable — 92,79 €
- Mini-imprimante photo portable — 61,89 €
- Recharge de papier photo couleur 2 × 3 pouces — 45,89 €

These links open Stripe-hosted payment pages. They are separate live payment links, so a purchase can charge a real payment method. The storefront itself does not collect card details. Product prices, shipping options, taxes, payment methods, receipts, and invoice settings are managed on the corresponding Payment Links in the Stripe Dashboard.

The current pages need no Stripe API key. The test secret previously shared for the server-based Checkout setup is not used by these links and is not stored in this project. Rotate it in Stripe because it was shared in chat; do not paste a replacement into the chat.

## Optional API-based Checkout server

`server.js` is an optional foundation for a future combined cart and server-created Checkout Session. The current storefront does not call that API. To use it, follow the steps in `.env.example` and configure Stripe Products, Prices, shipping, and webhook settings first. Keep server secrets in a local `.env` file, never in browser code. Invoice creation in that optional server flow is off by default.

## Paid order email notifications

For every confirmed, paid Checkout Session, the Stripe webhook fetches the purchased line items and sends the buyer's name, email, phone, shipping address, products, quantities, and total to `novia.contacts@gmail.com`. It uses Resend's email API and does not save those personal details in `.data/orders.json`. Stripe retries failed webhook deliveries; the email request uses an idempotency key to avoid duplicate notifications.

Before enabling the webhook:

1. Create a Resend API key and verify a sending domain. Add `RESEND_API_KEY` and a `ORDER_EMAIL_FROM` address on that verified domain to the server's `.env` or hosting secret manager. `ORDER_NOTIFICATION_EMAIL` defaults to the address above.
2. In Stripe, configure each existing Payment Link to collect the customer's name, email, shipping address, and phone number. The links are managed in Stripe Dashboard and are not updated by this code.
3. Add the server's `/api/stripe/webhook` endpoint in Stripe and subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Set the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Add the same privacy disclosure to the storefront and checkout explaining that order details are sent to the shop email address and email provider for order fulfilment.

The server-created Checkout route already requests a shipping address, billing address, and phone number. A paid webhook returns an error until the Resend key and verified sender are configured, so Stripe can retry delivery after configuration is fixed.

## Invoices

Check the invoice and receipt behavior on each live Payment Link in Stripe Dashboard before taking orders. This storefront links to the existing pages; it does not change those links' invoice settings. The optional API Checkout server can request Stripe invoice creation with `STRIPE_ENABLE_INVOICES=true` after the business invoice settings are ready.
