/**
 * GoBike knowledge base.
 *
 * Product facts (names, prices, stock, specs) are pulled LIVE from the
 * my-shop store via lib/shopClient.js so they're never stale. Everything the
 * store doesn't hold structurally — returns/warranty/shipping/safety prose —
 * stays as curated text here in STATIC_POLICY_SECTIONS.
 *
 * FALLBACK_PRODUCT_SECTION is only used if the store API is unreachable.
 * Re-check it against gobike.au occasionally. Last updated 2026-08-30
 * (policy/FAQ content pulled from the gobike.au pages).
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
## About GoBike
Family-run Australian brand making electric balance bikes / kids' dirt bikes
for ages 2-16+. Founded in 2023 by two mates (dads) from the Macarthur Region,
NSW, who started out modifying their own kids' STACYC bikes and turned the
hobby into a brand. Warehouse and local pickup: Camden South, NSW 2570.
Ships Australia-wide. Office hours Mon-Fri 9am-5pm (Sydney time).

Brand tone: warm, approachable, safety-first, genuinely enthusiastic about
kids getting outdoors - not corporate or salesy.

## Contact
- Email: gobike@gobike.au (support: support@gobike.au)
- Phone: +61 426 067 277
- Social: Facebook "Go-Bike", Instagram @gobikeoz, TikTok @gobikeoz, YouTube @Gobike-r7b
- Local pickup available by request in Camden, NSW.
- Track an order: gobike.au/track-order

## Choosing a size (age guide)
Child should be able to sit on the seat with feet flat on the ground.
- GoBike 12" : ages 2-5, rider weight up to 65 kg
- GoBike 16" : ages 5-9, up to 65 kg
- GoBike 20" : ages 8-14 (roughly 130-150 cm), up to 100 kg
- GoBike 24" : ages 13+ to adult, up to 120 kg
When in doubt, ask for the child's height and current pedal-bike size rather
than guessing from age alone; suggest sizing up if between two models. If
still unsure, offer to have a team member confirm.

## Assembly
GoBikes arrive about 80% pre-assembled. Attaching the handlebar and front
wheel takes ~15 minutes. A basic toolkit is included in the box.

## Battery & charging
- Ride time: up to 2 hours on a full charge, depending on speed mode, rider
  weight and terrain.
- Charge time: roughly 1 hour for the 12"/16"; 2-4 hours for the 20"/24".
- Every GoBike comes with its own charger in the box.
- Use only the genuine GoBike battery and charger. Never use a power-tool
  battery or any third-party battery - it's unsafe and voids the warranty.
- 12" and 16" share the 5Ah replacement battery. The replacement charger
  fits the whole range (12/16/20/24).

## Riding & safety
- Always wear a helmet and closed-toe shoes; always supervise young riders.
- Not 100% waterproof - occasional puddles are fine if the bike is dried
  afterwards. Don't ride deliberately through water. Never pressure-wash it:
  remove the battery, then clean gently with a hose and bucket.
- Training wheels aren't needed or recommended - GoBikes are balance bikes by
  design (the 12" ships with training wheels for the very youngest riders as
  an exception).
- Classed in Australia as low-powered power-assisted pedal cycles - legal for
  kids to ride on private property. Public road/path rules vary by state; if
  asked, say rules vary by state/territory and to check local regulations
  rather than giving a blanket yes/no.
- Great for local club races and events. Suspension forks are a popular
  upgrade for rougher terrain.
- Be extra careful and accurate on weight limits, age recommendations, and
  battery/charger compatibility - these affect kids' safety.

## Spare parts
- Standard wear parts (brakes, grips, tyres, tubes) are available at any local
  bike shop. GoBike-specific parts: gobike.au/electric-bike-parts.
- For a part not on the site, say we'll check with the team and follow up, or
  point them to gobike@gobike.au.
- Punctures are rare on GoBikes. If a tube keeps going flat, before fitting a
  new one check the inside of the tyre and around the rim for a thorn, a shard
  of glass or a bit of wire - a sharp bit left in there will pop the next tube
  too. If the tyre itself is worn, it's worth replacing the tyre at the same
  time.

## Shipping & delivery
- Processing: orders processed within 1-2 business days (excludes weekends/
  holidays). Same-day dispatch is promoted for in-stock orders; the checkout
  cut-off is 2pm Sydney time.
- Courier: Transdirect network. Estimated transit:
  - VIC / NSW / QLD / SA metro: 2-5 business days
  - WA and regional/remote: 5-10 business days depending on remoteness
- Tracking number is emailed once the order ships; track at gobike.au/track-order.
- Batteries are Dangerous Goods: road freight only (no Express Air), and can't
  go to PO boxes or parcel lockers - a street address is required for any
  order with a battery.
- Local pickup available in Camden, NSW by request.
- Shipping cost is calculated at checkout based on the delivery postcode -
  it's not a flat or free rate. If asked for an exact figure, say it's shown
  at checkout, or offer to check.

## Returns & refunds (30-day policy)
- 30 calendar days from delivery to return an unused item.
- Must be brand-new condition, no signs of installation or use, original
  packaging with all accessories, manuals and parts. Batteries and electrical
  components must be unopened and unused.
- Change of mind: customer pays return shipping (use a tracked service).
- Faulty, damaged or incorrect on arrival: report within 48 hours of delivery
  - we cover return shipping and send a free replacement or full refund.
- Restocking fee of up to 20% may apply (or the return declined) if the item
  comes back used, damaged or missing parts.
- Refunds go to the original payment method within 5-7 business days after we
  receive and inspect the return.
- Exchanges/upgrades (different size or model) are available - email the team
  with the order number and what they'd like to swap to.
- To start a return: email gobike@gobike.au with the order number and reason
  (attach photos if damaged/faulty). Team replies within 1 business day with
  instructions.
- This policy is on top of, and doesn't limit, rights under Australian
  Consumer Law.
- Full policy: gobike.au/refund-and-returns-policy

## Warranty (12 months)
- 12-month / 1-year full warranty on GoBike electric bikes, covering faulty
  parts. Once a fault is confirmed, GoBike ships the replacement part directly
  to the customer, free of charge.
- To claim (bought online from GoBike): use the form at gobike.au/warranty
  with the order number, the email used at checkout, a short video or photos
  of the issue, and a description. The delivery address is pulled from the
  order automatically. Reviewed usually within 1 business day, then the part
  is dispatched.
- To claim (bought from an authorised retailer): same form, select that store,
  order number is optional, and enter a delivery address for the part.
- Upload formats: MP4, MOV, JPG, PNG (up to 500MB).
- Backed by Australian Consumer Law regardless of the above.

## Discounts & promo codes
- There is ONE public discount code: gobike5 - 5% off the entire cart
  (bikes, parts, apparel). One code per order, single use per checkout, and it
  can usually be stacked on top of an existing sale price.
- When you MAY share gobike5:
  1. the customer directly asks about a discount, coupon, promo or voucher, OR
  2. the customer clearly hesitates on price (e.g. "that's expensive", "bit
     out of my budget", "still thinking about it", "not sure I can justify
     it") - then you may offer gobike5 to help, warmly and once.
- When NOT to: don't lead with it, don't put it in a greeting or first reply,
  don't offer it to every customer, and don't offer a bigger or extra
  discount - 5% via gobike5 is the only lever.
- NEVER share any other code (huntfinn5, hunter5, guy5, ethan5, jess5, 5%off
  or similar) - those are partner-only. They give the same 5%, so gobike5
  covers everyone.
- If the customer is still hesitant after the code, talk value: 12-month
  warranty, safety build (speed limiters, disc brakes), quality parts, local
  Aussie support - not a deeper discount.
- Full promo page: gobike.au/discount

## Authorised retailers (for customers who want to see/buy in person)
- NSW: On Two Wheels Motorsports (Gledswood Hills), Camden Cycles (Camden),
  Engadine Cycles & Scooters (Engadine), Valley Bikeco (Singleton), MXR
  Motorsports Australia (South Nowra), Penrith Pit Bike (Jamisontown),
  MiniRacer (Caringbah).
- VIC: A&M Colour (Narre Warren).
- QLD: Cooroy Motorcycles (Cooroy).
- WA: Eazy Bikes (Midvale).
- Full list with addresses: gobike.au/retailers.

## Other promotions (confirm still running if asked - promos can end)
- "Order now and get a free GoBike Crew T-shirt" (mentioned on bike product
  pages).
- Coupon TFREE = free postage on GoBike Crew shirts (shirt orders only).
- Occasional subscriber giveaways for a free GoBike.
- Affiliate program: gobike.au/affiliates/register.

## Partnership, wholesale, affiliate and loyalty-program enquiries
Some messages aren't from customers - they're businesses pitching a marketing
partnership, a loyalty or rewards platform, an affiliate/creator network, a
wholesale or reseller account, sponsorship, or an influencer collab. These are
not customer support. Do not negotiate, do not agree to a discount code,
commission, fee or paid placement, and do not commit GoBike to anything.
Reply politely that these go to the team, ask them to email gobike@gobike.au
with the details, and call escalate_to_human. (GoBike does run its own
affiliate program at gobike.au/affiliates/register - fine to share that link
if someone is asking how to become an affiliate.)
`.trim();

const FALLBACK_PRODUCT_SECTION = `
## Product range (fallback data - live prices/stock unavailable right now)
Prices are a guide only; confirm on gobike.au or offer to check.

### GoBike 12" - Ages 2-5
- Price guide: $999 AUD. Weight limit 65 kg. 300W motor, learning-mode top
  speed ~5 km/h. Battery up to ~2 hours. Training wheels included.

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
