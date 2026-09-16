# OMNIQORA - ON

build this saas/app to work with whatsapp etc, good ui/ux and features, read the document comprehensively and calmly and check competitors for gaps

 Admin, staff, client, customer and third-party experiences

 Roles, permissions, approvals and dashboards

 End-to-end WhatsApp workflows

 Embedded paid add-on integration

 Standalone SaaS and white-label editions

 Packaging, pricing and revenue model

 Vertical workflow packs for LoungeTech products

 Architecture, data model, AI controls and German compliance

 Delivery roadmap and acceptance criteria

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://omniqora.itechlounge.co.uk

## Integrated business platform

The 16 September 2026 source update adds the public services website at `/website`, authenticated Business360 at `/app/transformation`, and knowledge/compliance at `/app/compliance-intelligence`. Existing communication and commercial routes remain in place.

Business360 covers business and department discovery, people and stakeholders, evidence, financial baselines, improvement opportunities and transaction planning. It shares the transformation service with the standalone edition and the optional specialist AI hub.

See [integration and activation](docs/INTEGRATION-2026-09-16.md) for the source map, required migrations, service configuration, validation and current delivery boundaries. Git sync alone does not deploy the Python services or activate customer entitlements.

```sh
npm ci
npm run build
npm run typecheck
npm run test:security
npm run test:services
```

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4d8eec5e-9d37-4819-9b0c-0a8c2300d4a1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
