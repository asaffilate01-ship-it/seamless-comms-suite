# Landlord / tenant operating model

## Four separate authority levels

### Platform operator
Runs Omniqora itself. Platform operators are not ordinary tenant users.

Roles: platform owner, platform admin, platform support, platform billing and platform auditor.

### Product landlord operator
Runs one SaaS product across many tenants without joining each customer organisation.

Examples: Dishbee operations, Haccora product support, XpertJobs landlord admins and Fleetora landlord support.

Roles: landlord owner, landlord admin, landlord support, landlord billing and landlord auditor. Landlord access can be restricted to named region packs.

### Tenant member
Belongs to one customer organisation/workspace and sees only that tenant through normal tenant RLS.

### End customer / external actor
Customer, applicant, driver, vendor or other domain user. Domain products retain their specialised access rules until deliberately mapped into shared identity.

## Security rule
A product operator role must never be inferred from a browser field, email domain or product branding. It is a trusted database grant.

The product_operator_tenants view shows only tenant-product records that match the current product operator and region scope, or a platform operator.

## Why this matters

This permits one landlord SaaS to manage 100, 1,000 or more tenant organisations without copying the SaaS, adding landlord staff to every tenant, weakening tenant membership RLS, or sharing customer data across products.