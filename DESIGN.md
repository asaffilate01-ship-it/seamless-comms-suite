# Omniqora — design authority

## Product truth
Audience: Business operators, staff, agents, administrators, and customers using connected communications and operations.

Jobs-to-be-done: Connect conversations, approvals, CRM, WhatsApp workflows, AI agents, analytics, and vertical services under governed access.

Existing visual system: Current src/styles.css has OKLCH indigo/violet primary (0.50 0.22 268) with pale cyan supporting accent and a dedicated dark theme. Treat agent-action and alert colours semantically; use the product typography already defined.

## Flow priorities
Information hierarchy for agent actions, approval queues, human handoff, communication consent, inbox status, workflow history, customer privacy, and AI provenance. Never make an unexecuted agent action appear complete.

First high-leverage areas: Review unified public homepage, Business360 operations, conversation inbox, workflow canvas, AI-agent activity and connector/setup states; make setup failures and unsupported integrations explicit.

## Craft and accessibility contract
- Public marketing can be expressive but cannot imply live capabilities, testimonials, totals, certifications or integration availability that the backend does not substantiate.
- Protected screens retain real role boundaries. Put next action, owner, status, key numbers, evidence and recovery where users can find them; never hide material workflows behind decorative graphs.
- Use the present component library, spacing system, local brand tokens and dark-mode definitions. Avoid third-party logos and copied showcase layouts.
- Test 360px/390px mobile, 768px tablet, 1440px desktop, 200% text zoom, contrast, keyboard, visible focus and reduced motion. Verify long labels and no clipped/overlapping content.
- Inspect loading, empty, validation, permission-denied, disconnected and error/retry states; screen readers need meaningful announcements and labels.

## Reference skills and commands
- Taste Skill: https://github.com/Leonxlnx/taste-skill — adopt the agent skill via `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend` when running supported coding agents.
- Impeccable: https://github.com/pbakaus/impeccable — `npx impeccable install` sets up coding-agent commands; run `critique`, `audit`, `harden`, `polish` on a **specific** screen, not an entire site blindly. The optional CI scan runs `npx impeccable detect src/` and is not a real-browser accessibility certificate.
- Awesome DESIGN.md: https://github.com/VoltAgent/awesome-design-md — pattern/documentation reference only; this product's `DESIGN.md` remains authoritative.

## Done criteria
Existing build/lint/tests, real route/role acceptance, responsive screenshots and keyboard QA. Keep work in a PR until checks and launch gates are verified. No Lovable credits or forced history rewrites.
