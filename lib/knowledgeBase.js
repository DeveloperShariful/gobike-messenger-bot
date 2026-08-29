/**
 * GoBike knowledge base.
 *
 * Product facts (names, prices, stock, specs) are pulled LIVE from the
 * my-shop store via lib/shopClient.js so they're never stale. Everything the
 * store doesn't hold structurally — returns/warranty/shipping/safety prose —
 * stays as curated text here in STATIC_POLICY_SECTIONS.
 *
 * FALLBACK_PRODUCT_SECTION is only used if the store API is unreachable.
 * Re-check it against gobike.au occasionally. Last updated 2026-08-29.
 */

const { getCatalog } = require("./shopClient");

let getSetting = async () => null;
try {
  // Loaded lazily-ish to avoid a hard crash if pg isn't configured in some
  // contexts (e.g. a quick local KB dump). db.js has no side effects on load.
  ({ getSetting } = require("./db"));
} catch {
  /* keep the no-op */
}

// --------------------------------------------------------------------------
// Curated, non-product content (policies, safety, contact)
// --------------------------------------------------------------------------

const STATIC_POLICY_SECTIONS = `
## About
GoBike is a family-run Australian brand selling electric balance bikes for
kids and teens (ages 2-16+), founded by two parents who couldn't find a good
kids' electric bike for their own children. Warehouse/local pickup: Camden
South, NSW. Ships Australia-wide.

Brand tone: warm, approachable, safety-first, genuinely enthusiastic about
kids getting outdoors - not corporate or salesy.

## Contact
- Email: gobike@gobike.au (support: support@gobike.au)
- Phone: +61 426 067 277
- Social: Facebook "Go-Bike", Instagram @gobikeoz, TikTok @gobikeoz, YouTube @Gobike-r7b
- Local pickup available by request in Camden South, NSW.

## Choosing a size
Child should be able to sit on the seat with feet flat on the ground. Rough
age guide: 12" (2-5), 16" (5-9), 20" (8-14, ~130-150cm), 24" (13+). When in
doubt, ask for the child's height and current pedal-bike size rather than
guessing from age alone, and suggest sizing up if between two models - but if
truly unsure, offer to have a human confirm.

## Spare parts & batteries
- Only genuine GoBike batteries/chargers should be used. Third-party or power
  tool batteries void the warranty and are unsafe.
- The 5Ah replacement battery fits the 12" and 16". The replacement charger
  fits the whole range (12/16/20/24).
- For a part not shown on the site, tell the customer we'll check with the
  team and follow up, or point them to gobike@gobike.au. Parts are listed
  under gobike.au/electric-bike-parts.

## Shipping
- Dispatch: processed within 1-2 business days (excludes weekends/holidays);
  same-day dispatch is promoted for in-stock orders. Tracking is emailed once
  shipped.
- Delivery via the Transdirect courier network:
  - VIC / NSW / QLD / SA metro: 2-5 business days
  - WA and remote areas: 5-10 business days depending on location
- Batteries are Dangerous Goods: road freight only (no Express Air), cannot
  be sent to PO boxes or parcel lockers - a street address is required for
  any order containing a battery.
- Local pickup available in Camden South, NSW by request.
- Exact shipping cost isn't published - it's calculated at checkout based on
  postcode, or offer to check.

## Returns & refunds
IMPORTANT: the site currently shows two different return windows (marketing
says "30-Day Returns", the formal policy page says 14 days). Until that's
reconciled, DO NOT quote a specific number of days - point the customer to
gobike.au/refund-and-returns-policy or offer to check with the team.
- Eligibility: item unused, undamaged, no signs of installation/use, original
  packaging with all accessories/manuals. Batteries must be unopened/unused.
- Customer pays return shipping unless the item arrived faulty/damaged (then
  return shipping and replacement/refund are free).
- A restocking fee of up to 20% may apply if a returned item shows signs of
  use, damage, or missing parts.
- Process: email gobike@gobike.au with order number + reason (photos if
  damaged/faulty) -> return instructions within 1 business day -> send via
  tracked post -> refund processed 5-7 business days after inspection.
- Faulty/damaged items: report within 48 hours of delivery for a free
  replacement or full refund.

## Warranty
- 12 months / "1 Year Full Warranty" on GoBike electric bikes, covering
  faulty parts - GoBike sends a free replacement part directly once a fault
  is confirmed.
- To claim: submit purchase details (order number for online purchases),
  contact info, delivery address, a short video or photos of the issue, and a
  description - reviewed usually within 1 business day, then the part is
  dispatched. Form: gobike.au/warranty
- Complies with Australian Consumer Law regardless of the above.

## Safety & usage highlights
- Always wear a helmet and closed-toe shoes; always supervise young riders.
- Not 100% waterproof - occasional puddles are fine if the bike is dried
  afterwards; don't ride deliberately through water and never pressure-wash
  it (remove the battery, then clean gently with a hose/bucket).
- Training wheels are not needed/recommended - GoBikes are balance bikes by
  design (the 12" ships with training wheels for the very youngest riders as
  an exception).
- Classed in Australia as low-powered power-assisted pedal cycles - legal for
  kids to ride on private property. Public-road/path rules vary by state; if
  asked specifically, say rules vary by state/territory and to check local
  regulations rather than giving a blanket yes/no.
- Be extra careful and accurate on weight limits, age recommendations, and
  battery/charger compatibility - these affect kids' safety. Don't improvise
  beyond what's in this knowledge base.

## Promotions (confirm still running if asked - promos can end)
- "Order now and get a free GoBike Crew T-shirt" (on bike product pages).
- Occasional subscriber giveaways for a free GoBike.
- Retailers page lists authorised physical stockists across NSW, VIC, QLD, WA.
- Affiliate program available (gobike.au/affiliates/register).
`.trim();

const FALLBACK_PRODUCT_SECTION = `
## Product range (fallback data - live prices/stock unavailable right now)
Prices are a guide only; confirm on gobike.au or offer to check.

### GoBike 12" - Ages 2-5
- Price guide: $999 AUD. Weight limit 65 kg. 300W motor, learning-mode top
  speed ~5 km/h. Battery ~75 min typical. Training wheels included.

### GoBike 16" - Ages 5-9
- Price guide: $1,399 AUD. Weight limit 65 kg. 700W hub motor. Speed modes
  10/25/45 km/h plus learning mode. Removable battery, hydraulic disc brakes,
  front suspension.

### GoBike 20" - Ages 8-14 (~130-150 cm)
- Price guide: $2,399 AUD. Weight limit 100 kg. 1200W motor. Speed modes
  15/30/55 km/h. Multi-speed gears, removable battery.

### GoBike 24" - Ages 13+
- Price guide: $3,399 AUD. Weight limit 120 kg. 2500W motor. Top speed up to
  ~61 km/h in Sport mode. Adjustable air shock, fat tyres.

### Spare parts
- 5Ah replacement battery (12" & 16") ~ $250. Replacement charger (whole
  range) ~ $99.
`.trim();

// --------------------------------------------------------------------------
// Rendering the live catalogue into plain text
// --------------------------------------------------------------------------

function money(n, symbol = "$") {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `${symbol}${Number(n).toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function availabilityLabel(p) {
  if (p.isPreOrder) return `Pre-order${p.preOrderMessage ? ` (${p.preOrderMessage})` : ""}`;
  if (p.inStock) {
    if (p.stock != null && p.stock > 0 && p.stock <= 3) return `In stock (only ${p.stock} left)`;
    return "In stock";
  }
  if (p.backorderAllowed) return "Available on backorder";
  return "Out of stock";
}

function renderProduct(p, symbol) {
  const lines = [];
  lines.push(`### ${p.name}`);
  if (p.categories && p.categories.length) {
    lines.push(`- Category: ${p.categories.join(", ")}`);
  }

  const price = money(p.price, symbol);
  const sale = money(p.salePrice, symbol);
  if (sale && price) lines.push(`- Price: ${sale} (on sale, normally ${price})`);
  else if (price) lines.push(`- Price: ${price}`);

  lines.push(`- Availability: ${availabilityLabel(p)}`);

  if (p.shortDescription) lines.push(`- ${p.shortDescription}`);

  if (p.attributes && p.attributes.length) {
    const specs = p.attributes
      .map((a) => `${a.name}: ${a.values.join(" / ")}`)
      .join("; ");
    lines.push(`- Specs: ${specs}`);
  }

  if (p.variants && p.variants.length) {
    const vs = p.variants
      .map((v) => {
        const vp = money(v.salePrice ?? v.price, symbol);
        const stock = v.inStock ? "" : " (out of stock)";
        return `${v.name}${vp ? ` ${vp}` : ""}${stock}`;
      })
      .join("; ");
    lines.push(`- Options: ${vs}`);
  }

  if (p.url) lines.push(`- Link: ${p.url}`);
  return lines.join("\n");
}

function renderCatalog(catalog) {
  const symbol = catalog.currencySymbol || "$";
  const products = (catalog.products || []).map((p) => renderProduct(p, symbol));
  const when = catalog.generatedAt
    ? new Date(catalog.generatedAt).toISOString().slice(0, 16).replace("T", " ")
    : "just now";
  return `## Product range (live from the store, as of ${when} UTC)
Currency: ${catalog.currency || "AUD"}. If a price/stock detail looks wrong,
say you'll double-check rather than guessing.

${products.join("\n\n")}`;
}

// --------------------------------------------------------------------------
// Public: build the full knowledge base string for the system prompt
// --------------------------------------------------------------------------

async function buildKnowledgeBase() {
  let productSection = FALLBACK_PRODUCT_SECTION;
  let live = false;
  try {
    const catalog = await getCatalog();
    if (catalog && catalog.products && catalog.products.length) {
      productSection = renderCatalog(catalog);
      live = true;
    }
  } catch (err) {
    console.error("[knowledgeBase] catalog render failed:", err.message);
  }

  let override = "";
  try {
    override = (await getSetting("kb_override", "")) || "";
  } catch {
    /* dashboard override is optional */
  }

  const parts = [
    "# GOBIKE AUSTRALIA - BUSINESS KNOWLEDGE BASE",
    productSection,
    STATIC_POLICY_SECTIONS,
  ];

  if (override.trim()) {
    parts.push(
      `## Extra notes from the GoBike team (treat as authoritative, overrides anything above)\n${override.trim()}`
    );
  }

  return { text: parts.join("\n\n").trim(), live };
}

module.exports = {
  buildKnowledgeBase,
  STATIC_POLICY_SECTIONS,
  FALLBACK_PRODUCT_SECTION,
};
