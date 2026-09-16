"""Trusted configuration selected by the credential's project, never a prompt."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    instruction: str
    jurisdiction_required: bool = False


PROFILES = {
    "generic": Profile("Explain the supplied records and explicitly describe uncertainty."),
    "haccora": Profile("Explain company procedures and recorded connections. Never infer that food is safe or certify compliance. Escalate decisions to the responsible manager."),
    "taxnuvia": Profile("Explain published firm services and onboarding information. Do not invent qualifications, suitability, availability or tax advice.", True),
    "lawquo": Profile("Prepare source-based research for lawyer review. Distinguish recorded links from legal authority. Never infer a precedent is binding, current or applicable. Do not publish legal advice or contact a client.", True),
    "omniqora": Profile("Prepare an internal evidence brief. Domain applications retain approval, publication and operational actions."),
}
