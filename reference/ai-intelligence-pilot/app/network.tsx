"use client";
import { useMemo, useState } from "react";
import { Download, ArrowUpRight, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portfolioProducts } from "@/lib/portfolio-products";
import {
  networkVersion,
  placements,
  recommendations,
  offerDestination,
  type Audience,
  type Placement,
} from "@/lib/portfolio-network";
import { Choice, Field, Head, Tag } from "./console";
import { PortfolioRollout } from "./portfolio-rollout";

export function Network() {
  const [source, setSource] = useState("haccora"),
    [country, setCountry] = useState("GB"),
    [audience, setAudience] = useState<Audience>("business"),
    [placement, setPlacement] = useState<Placement>("dashboard"),
    [owned, setOwned] = useState<string[]>([]);
  const context = { source, country, audience, placement, owned, limit: 12 };
  const offers = useMemo(
    () => recommendations(context),
    [source, country, audience, placement, owned],
  );
  const product = portfolioProducts.find((p) => p.slug === source)!;
  const matrix = portfolioProducts.map((p) => ({
    source: p.slug,
    name: p.name,
    scope: p.scope,
    placements: Object.fromEntries(
      placements.map((placement) => [
        placement,
        recommendations({
          ...context,
          source: p.slug,
          placement,
          owned: [],
          limit: 3,
        }).map((o) => ({
          id: o.id,
          stage: o.stage,
          reason: o.reason,
          insuranceTypes: o.insuranceTypes,
        })),
      ]),
    ),
  }));
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: networkVersion,
              country,
              audience,
              meaning:
                "Recommendation configuration, not a deployment or conversion report",
              products: matrix,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-cross-selling-" + country.toLowerCase() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6">
      <PortfolioRollout />
      <section className="panel p-6">
        <Head title="The next useful service">
          <Button variant="outline" onClick={download}>
            <Download size={16} /> Export portfolio rules
          </Button>
        </Head>
        <p className="muted mt-2 max-w-3xl">
          Choose a product and customer journey to inspect complementary
          services. Recommendations use the product, country and stated business
          need. Each provider retains its own account, pricing and terms.
        </p>
        <div className="grid gap-4 md:grid-cols-4 mt-6">
          <Field label="Source product">
            <Choice
              value={source}
              onChange={(v: string) => {
                setSource(v);
                setOwned([]);
              }}
              options={portfolioProducts.map((p) => ({
                value: p.slug,
                label: p.name + (p.scope === "review" ? " · scope review" : ""),
              }))}
            />
          </Field>
          <Field label="Customer country">
            <Choice
              value={country}
              onChange={setCountry}
              options={[
                { value: "GB", label: "United Kingdom" },
                { value: "DE", label: "Germany" },
                { value: "US", label: "United States" },
                { value: "AE", label: "United Arab Emirates" },
                { value: "PK", label: "Pakistan" },
                { value: "IN", label: "India" },
                { value: "CA", label: "Canada" },
                { value: "AU", label: "Australia" },
              ]}
            />
          </Field>
          <Field label="Audience">
            <Choice
              value={audience}
              onChange={setAudience}
              options={[
                { value: "business", label: "Business decision-maker" },
                { value: "consumer", label: "Individual customer" },
              ]}
            />
          </Field>
          <Field label="Journey placement">
            <Choice
              value={placement}
              onChange={setPlacement}
              options={placements.map((p) => ({
                value: p,
                label: p.charAt(0).toUpperCase() + p.slice(1),
              }))}
            />
          </Field>
        </div>
      </section>
      <div className="metric-grid">
        <div className="metric">
          <span>Portfolio products</span>
          <strong>{portfolioProducts.length}</strong>
          <small>One common recommendation catalogue</small>
        </div>
        <div className="metric">
          <span>Defined product scopes</span>
          <strong>
            {portfolioProducts.filter((p) => p.scope === "confirmed").length}
          </strong>
          <small>Rules available for integration</small>
        </div>
        <div className="metric">
          <span>Journey placements</span>
          <strong>{placements.length}</strong>
          <small>Three suggestions by default in each app</small>
        </div>
        <div className="metric">
          <span>Scope to review</span>
          <strong>
            {portfolioProducts.filter((p) => p.scope !== "confirmed").length}
          </strong>
          <small>Suggestions stay off until scope is defined</small>
        </div>
      </div>
      <section className="panel p-6">
        <Head title={product.name + " · " + placement}>
          <Tag>
            {country} · {audience}
          </Tag>
        </Head>
        {product.scope !== "confirmed" ? (
          <p className="mt-4 muted">
            This product needs a confirmed scope before customer offers can be
            selected.
          </p>
        ) : !offers.length ? (
          <p className="mt-4 muted">
            No suitable offers for this selection. Change the journey or restore
            services marked as already used.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-5">
            {offers.map((offer, index) => {
              const url = offerDestination(offer, source, placement);
              return (
                <article
                  key={offer.id}
                  className="border rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex justify-between gap-2">
                    <Tag>{offer.category}</Tag>
                    <span className="text-xs muted">
                      {index < 3 ? "Shown in compact view" : "More services"}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg">{offer.name}</h3>
                  <p className="text-sm muted">{offer.description}</p>
                  <p className="text-sm">{offer.reason}</p>
                  {offer.insuranceTypes && (
                    <div className="text-sm space-y-2">
                      <p className="font-medium">Enquiry topics</p>
                      <p className="muted">
                        {offer.insuranceTypes.join(" · ")}
                      </p>
                      <p className="muted">
                        Availability, suitability, price and cover require
                        provider review. This is an introduction, not a policy
                        or personal recommendation.
                      </p>
                    </div>
                  )}
                  <div className="mt-auto pt-3 space-y-3">
                    <Tag>{offer.stage}</Tag>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-2 items-center text-sm font-medium"
                      >
                        Explore provider <ArrowUpRight size={15} />
                      </a>
                    ) : (
                      <p className="text-xs muted">
                        Collect an enquiry in the source app. A public provider
                        destination is not configured.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOwned((x) => [...x, offer.id])}
                    >
                      Preview already used
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {owned.length > 0 && (
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => setOwned([])}
          >
            Restore {owned.length} hidden services
          </Button>
        )}
      </section>
      <section className="panel p-6">
        <div className="flex gap-3 items-center">
          <Layers3 size={20} />
          <h2 className="font-semibold">Portfolio integration</h2>
        </div>
        <p className="muted text-sm mt-3">
          Use the shared catalogue in each product’s business dashboard,
          billing, people, purchasing, assets, sales and document journeys. Keep
          urgent support, active checkout and sign-in free from promotions. The
          export describes configured suggestions; it does not claim that an app
          is deployed or a sale has occurred.
        </p>
        <p className="muted text-sm mt-3">
          The authenticated opportunities endpoint returns product-scoped
          suggestions for existing integrations. A referral label contains only
          the product and placement. Customer records, children’s details,
          messages and payment credentials remain in their source systems.
        </p>
      </section>
    </div>
  );
}
