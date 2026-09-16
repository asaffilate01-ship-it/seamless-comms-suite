"use client";
import { useState } from "react";
import { PortfolioServices } from "./PortfolioServices";
import type { Placement } from "../lib/portfolio-network";

const markets = [
  ["GB", "United Kingdom"], ["DE", "Germany"], ["AE", "United Arab Emirates"],
  ["US", "United States"], ["CA", "Canada"], ["AU", "Australia"],
  ["NZ", "New Zealand"], ["PK", "Pakistan"], ["IN", "India"],
  ["BD", "Bangladesh"], ["LK", "Sri Lanka"], ["IE", "Ireland"],
  ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"],
  ["BE", "Belgium"], ["AT", "Austria"], ["CH", "Switzerland"], ["PL", "Poland"],
  ["PT", "Portugal"], ["TR", "Türkiye"], ["SA", "Saudi Arabia"], ["QA", "Qatar"],
  ["ZA", "South Africa"], ["SG", "Singapore"], ["MY", "Malaysia"],
] as const;

/** Market is chosen explicitly; no location or profile is inferred. */
export function PortfolioMarketServices({ source, placement = "dashboard" }: { source: string; placement?: Placement }) {
  const [country, setCountry] = useState("");
  return <section className="my-8 rounded-xl border border-border bg-card p-5 text-foreground" aria-label="Business services">
    <h2 className="text-lg font-semibold">Explore our business network</h2>
    <p className="mt-1 text-sm text-muted-foreground">Choose your business market to see relevant, optional services. Availability and terms are confirmed separately.</p>
    <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">Business market
      <select className="rounded-lg border border-border bg-background px-3 py-2" value={country} onChange={event => setCountry(event.target.value)}>
        <option value="">Choose a market</option>
        {markets.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
    {country && <PortfolioServices key={country} source={source} country={country} placement={placement} />}
  </section>;
}
