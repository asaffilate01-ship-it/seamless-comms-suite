# Connection examples

## Subscription event: source app to central platform
POST /webhooks/haccora. Headers X-Timestamp (current Unix seconds) and X-Signature (hex HMAC-SHA256 over timestamp + '.' + exact raw request body, using the app's webhook signing secret).

```json
{"id":"persisted-unique-event-id","org":"restaurant-org-id","version":1,"status":"active","valid_until":2000000000,"promo":false}
```

The example expiry is illustrative, not a recommended production value. Send the actual paid-through timestamp. Do not trust payment details from browser requests. Send only after verifying the originating billing provider's webhook or authoritative subscription API response. Version increments per organisation for every state change.

## Central platform to discounted SaaS
The worker sends this signed event to the operator-configured HTTPS endpoint for the target app. Same timestamp/HMAC convention. Validate the raw body, deduplicate ID and process only newer revisions.

```json
{"id":"unique-central-event-id","type":"discount.eligibility.changed","org":"eventplanr-org-id","percent":20,"rule":"haccora-eventplanr","revision":2,"effective":"next_renewal","scope":"subscription_only","stackable":false}
```

A later percent:0 event removes the ecosystem discount at the next renewal. Acknowledge only after durable persistence. Update billing separately and record success/failure. Returning 200 does not prove that the customer's invoice was changed.

## Account linking
1. Haccora server calls /link/start with verified actor/org and destination eventplanr.
2. User opens their EventPlanr business account and enters the returned code.
3. EventPlanr server calls /link/finish with its own verified actor/org.
4. Central service confirms the group, consumes the code and recalculates eligibility.

The code expires after 10 minutes and can be used only once, in the nominated destination app. Neither account's organisation ID is exposed to the other account through the listing endpoint. Do not pre-link businesses based solely on matching email addresses or names.

## Membership synchronization
POST /members/sync, with X-App and its API bearer credential:
```json
{"members":[{"actor":"verified-user-id","org":"verified-org-id","role":"owner"}]}
```
Use role remove when access is revoked. App keys can provision only memberships under their own app identity. This is a trusted server operation, not a customer-accessible route.
