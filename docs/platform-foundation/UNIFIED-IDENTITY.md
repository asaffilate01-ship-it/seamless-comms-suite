# Unified identity

Omniqora owns the identity policy and tenant/product membership boundary. Authentication providers perform credential verification.

Supported policy methods:

- email/password;
- magic link;
- SMS OTP;
- WhatsApp OTP;
- Google;
- Apple;
- Microsoft;
- passkeys.

A tenant/product decides which methods are enabled. Product code should not implement its own separate password/OTP/passkey policy.

## WhatsApp OTP

WhatsApp OTP is a communications + identity integration:

1. user enters a phone number;
2. server normalises the number and creates a short-lived challenge;
3. approved WhatsApp authentication template is sent through Omniqora Connect/provider;
4. challenge verification occurs server-side;
5. verified phone identity is linked to the platform user/tenant under policy;
6. rate limits, replay protection and audit events apply.

A WhatsApp message alone does not imply tenant membership; invitation/onboarding rules still apply.

## Passkeys

Use the configured identity provider/WebAuthn implementation. Omniqora stores policy and provider references, not private passkey material.

## SSO

Enterprise tenants may later bind SAML/OIDC/Entra/Google Workspace providers. The same tenant membership and entitlement checks remain authoritative after authentication.
