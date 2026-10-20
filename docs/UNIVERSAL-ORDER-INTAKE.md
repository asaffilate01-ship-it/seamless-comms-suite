# Universal Order Intake

This service gives Omniqora a reusable tenant-aware intake layer for telephone, WhatsApp and staff-entered orders.

## Target flow

1. Customer calls a Twilio/PSTN number or starts a WhatsApp conversation.
2. Twilio sends the inbound webhook to `order-intake`.
3. `order_intake_channels` resolves the number/sender to tenant + product + location.
4. A staff member answers the call/chat and opens the matching order-intake session.
5. Staff builds the basket against the tenant's normal catalogue/menu service.
6. Omniqora saves the draft and requests a hosted payment link from the configured payment adapter.
7. The link is sent by SMS/WhatsApp.
8. Payment provider calls `/payment/status`.
9. On paid status, Omniqora hands the order to MealDeck, Dishbee or another product order API.
10. The normal downstream flow takes over: KDS/EPOS, kitchen, dispatch, tracking, receipts and CRM.

## Twilio endpoints

- Voice: `POST /functions/v1/order-intake/voice/inbound`
- WhatsApp: `POST /functions/v1/order-intake/whatsapp/inbound`
- Health: `GET /functions/v1/order-intake/health`

Twilio supports inbound Programmable Voice webhooks and inbound WhatsApp webhooks. WhatsApp Business Calling can also route user-initiated WhatsApp calls into a Twilio Voice application, subject to Twilio/Meta support and configuration.

## Internal API

`POST /functions/v1/order-intake/manual/order`

Header: `x-order-intake-secret`

Example body:

```json
{
  "tenant_id": "TENANT_UUID",
  "product_key": "mealdeck",
  "location_id": "LOCATION_UUID",
  "channel": "voice",
  "customer_phone": "+447700900000",
  "customer_name": "Customer",
  "order": {
    "items": [{"sku":"BURGER-1","qty":2,"unit_minor":899}],
    "total_minor": 1798,
    "currency": "GBP"
  },
  "send_payment_link": true
}
```

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_AUTH_TOKEN`
- `INTERNAL_ORDER_INTAKE_SECRET`
- `PAYMENT_LINK_URL` — adapter that creates a hosted payment link
- `ORDER_HANDOFF_URL` — tenant-aware order-create bridge to Dishbee / MealDeck / other SaaS

## Production hardening still required

Before go-live, validate Twilio webhook signatures, validate payment-provider webhook signatures, add idempotency keys, configure tenant RLS policies for staff UI access, add expiry jobs for abandoned sessions/payment links, and connect the staff order screen to catalogue/search/customer/address APIs.
