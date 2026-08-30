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
Family-run Australian brand making electric balance bikes and kids' electric
dirt bikes for ages 2-16+ (and the 24" suits teens and adults). Founded in
2023 by two mates (dads) from the Macarthur Region, NSW, who started out
modifying their own kids' STACYC bikes and turned the hobby into a brand.
Australian-owned, with a local support team. Warehouse and local pickup:
Camden South, NSW 2570. Ships Australia-wide. Office hours Mon-Fri 9am-5pm
(Sydney time). Builds to Australian Bicycle Industry Association standards and
follows ACCC product-safety guidelines.

Brand tone: warm, approachable, safety-first, genuinely enthusiastic about
kids getting outdoors - not corporate or salesy.

## Contact
- Email: gobike@gobike.au (support: support@gobike.au)
- Phone: +61 426 067 277
- Social: Facebook "Go-Bike", Instagram @gobikeoz, TikTok @gobikeoz, YouTube @Gobike-r7b
- Local pickup: available by request from Camden South, NSW - the customer
  should message the team to arrange a pickup time.
- Track an order: gobike.au/track-order
- Useful pages: gobike.au/bikes (range + comparison), gobike.au/shop,
  gobike.au/electric-bike-parts, gobike.au/product/<slug> (a specific bike),
  gobike.au/apparel, gobike.au/warranty, gobike.au/refund-and-returns-policy,
  gobike.au/faq, gobike.au/discount, gobike.au/retailers, gobike.au/contact.

## Reviews & what other families say
There are a lot of happy Aussie families - customer reviews on gobike.au and
video reviews (unboxings, first rides, a parents' buying guide) on YouTube
(@Gobike-r7b). Point customers there if they ask. Do NOT quote a specific star
rating or a review count - you don't have a live figure.

## Product range - full specs (per model)
Live prices and stock come from the catalogue section above; the specs below
are stable. All four models: aluminium frame, off-road tyres, adjustable seat,
disc brakes, selectable speed modes a parent can limit, arrive ~80%
pre-assembled with a charger and a basic toolkit in the box.

## How each model rides (its character - use this alongside the specs)
- GoBike 12: the easiest, tear-free way to learn - feet always flat on the
  ground, an ultra-low seat, a gentle learning mode from about 6 km/h. Skip
  the training wheels and learn real balance.
- GoBike 16: the first real adventure machine - twist throttle, 700W,
  hydraulic disc brakes and front suspension for pump tracks, dirt trails and
  the park.
- GoBike 20: where a kid gets serious - 1200W, multi-speed gears, built for
  jumps, bike parks and proper off-road trails. Some riding experience helps.
- GoBike 24 (24 Pro): the big one - 2500W, fully adjustable suspension front
  and rear, fat Kenda tyres, for confident teens and adults on real forest and
  dirt-track riding. Not a beginner bike.

### GoBike 12 - ages 2-5 (plenty of kids ride it to 6)
- Rider weight up to 65 kg. Seat height 35-47 cm (quick release). Bike weighs
  10.5 kg with the battery - light enough for a toddler to pick up.
- 12" composite wheels, puncture-proof off-road tyres. Steel fork (no
  suspension). Rear cable disc brake.
- 36V 300W hub motor. Speed modes: Low ~6 km/h (gentle learning pace), Medium
  ~15 km/h, High ~25 km/h.
- 36V 5.0Ah battery, ride time up to ~2 hours, charge ~1-2 hours.
- Ships with training wheels for the very youngest, though GoBikes are balance
  bikes and most kids skip them. Best for: learning to balance, backyard and
  park.

### GoBike 16 - ages 5-9
- Rider weight up to 65 kg. Seat 44-54 cm, handlebar height ~74 cm. Bike
  weighs ~12 kg. Wheelbase ~82 cm.
- 16" spoke wheels, off-road tyres. Hydraulic adjustable front fork, ~80 mm
  travel. Hydraulic disc brakes front and rear. Twist throttle.
- 700W brushless hub motor. Speed modes: Low 10 km/h, Medium 25 km/h, High
  45 km/h.
- 36-42V 5.0Ah removable battery (same 5Ah pack as the 12"), ride up to ~2
  hours, charge ~1-2 hours.
- Best for: a confident rider stepping up - pump tracks, dirt trails, the park.

### GoBike 20 - ages 8-14 (roughly 130-150 cm tall)
- Rider weight up to 100 kg. Seat 60-75 cm, handlebar ~85 cm. Bike weighs
  ~18 kg. Wheelbase ~95 cm.
- 20" spoked wheels, Kenda off-road tyres. Hydraulic adjustable front fork
  ~80 mm travel. Hydraulic disc brakes front and rear. Multi-speed gears.
  Thermal protection on the motor and controller.
- 1200W brushless hub motor. Speed modes: Low 15 km/h, Medium 30 km/h, High
  55 km/h.
- 36-42V 10.0Ah key-removable battery. Ride time up to ~2 hours (about
  60-90 minutes of hard riding, longer taking it easy), charge ~2-4 hours.
- Some riding experience recommended. Best for: jumps, bike parks, real
  off-road trails.

### GoBike 24 (24 Pro) - ages 13+ to adult
- Rider weight up to 120 kg. Seat 74-84 cm. Bike weighs ~23 kg. Wheelbase
  ~123 cm.
- 24" x 2.6" Kenda fat off-road tyres. TIM double-shoulder hydraulic
  adjustable front fork ~80 mm travel + FASTACE 190 mm air-adjustable rear
  shock. TIM hydraulic disc brakes front and rear. WUXING DZ50 display.
- 2500W alloy brushless hub motor with thermal protection. Speed modes: Low
  20 km/h, Medium 38 km/h, High ~61 km/h (about 31 mph) in Sport mode.
- 48-55V 15Ah lithium-ion removable battery. Range up to ~3 hours depending on
  terrain. Charge 2-4 hours (54.6V / 2.0A charger).
- Not for beginners. Best for: serious off-road, steep trails, forest tracks.

## Choosing a size (help the customer decide - don't just list options)
Start from age: 12 = 2-5, 16 = 5-9, 20 = 8-14, 24 = 13+ to adult. Then the
real test: the child should be able to sit on the seat with both feet flat on
the ground (seat-height ranges are in the specs above).
- If the age is borderline between two models, ask for the child's height and
  what size pedal bike they ride now, then give a clear recommendation.
- You can be reassuring and specific - e.g. "a tall 6-year-old will be great
  on the 16, heaps of kids that age ride it".
- Only suggest sizing up if the child can still get their feet flat on the
  bigger model's lowest seat setting.
- One bike for two kids: the 16 covers roughly ages 5-9, so with the
  adjustable seat it can suit two close-in-age siblings. Otherwise size each
  child to their own model.
- Side-by-side comparison: gobike.au/bikes#compare-models. There's also a
  "Parents Guide: Choosing the Right GoBike" video on YouTube (@Gobike-r7b).

## What's in the box
Every GoBike ships with the bike (about 80% pre-assembled), its matching
charger, a basic toolkit, the manual, and 7 colour sticker kits so the kid can
customise the bike straight out of the box. The GoBike 12 also includes
training wheels. If the "free GoBike Crew T-shirt with a bike" promo is
running, that's added too (say "check it's still on" if asked). The frame
comes in its standard colour - the sticker kits are how you personalise it.

## Speed limiting / parental control
Every GoBike has selectable speed modes (Low / Medium / High - the km/h
figures are in each model's specs). It's a mode you set on the bike itself,
not an app. Start a new or younger rider in Low and move them up as they get
confident. This is the main safety control a parent has - worth mentioning to
anyone buying for a first-time or younger rider.

## Why a GoBike instead of a petrol kids' dirt / pit bike
- Much lighter and easier for a kid to handle and pick up.
- Quiet - it's electric, so no engine noise. Fine for early mornings, shared
  streets, and not annoying the neighbours (a petrol bike will).
- No petrol, no oil, no fumes, no pull-starting - far less to go wrong and
  minimal maintenance.
- The speed modes let a parent control how fast it goes and unlock more as the
  kid improves; a petrol bike is more all-or-nothing.
- Still gives the real dirt-bike thrill (700W-2500W depending on model) - just
  safer and simpler to live with.

## Why a GoBike instead of a cheap marketplace / no-name e-bike
- Genuine spare parts stocked here in Australia (batteries, chargers, tyres,
  brake pads, motors, controllers) - a no-name bike is often unfixable once
  something breaks.
- A real local 12-month warranty with advanced replacement, and an Australian
  support team that knows the product.
- Built properly for the age and weight it's sold for: hydraulic disc brakes,
  front (and rear on the 24) suspension, thermal protection on the motor and
  controller, a real aluminium frame.
- A full range, so the same brand grows with the child (12 -> 16 -> 20 -> 24).
- Backed by Australian Consumer Law and a 30-day money-back return if it isn't
  the right fit.

## It grows with your child ("they'll just outgrow it")
- The seat height and handlebars adjust over years of riding (seat ranges are
  in the specs).
- The speed modes let you unlock more as the child's skill grows - it's not
  something they master in a month.
- When a child genuinely sizes out of a model there's the next one up, GoBikes
  hold their value well second-hand, and lots of families hand one down to a
  younger sibling. If someone asks about trading up, say the team can talk
  through options - don't promise a formal trade-in or buy-back program.

## The value behind the price
If a customer is weighing up the price, the real value is: the 12-month
warranty with advanced replacement, spare parts stocked locally so the bike
stays on the road, no petrol or servicing costs, a build made to take years of
hard riding, full Australian Consumer Law protection, and the 30-day
money-back guarantee if it's not right. Offer gobike5 only per the discount
rules (a direct ask, or clear price hesitation) - then talk value, not a
deeper discount.

## Assembly
GoBikes arrive about 80% pre-assembled - the customer attaches the handlebar
and the front wheel, about 15 minutes, with the toolkit in the box. If asked,
walk them through it:
1. Fit the front wheel: seat the axle fully in both fork dropouts, then do up
   both sides evenly and firmly.
2. Fit the handlebar into the stem, line it up straight with the front wheel,
   and tighten the clamp bolts firmly (evenly, a bit at a time).
3. Before the first ride: squeeze both brake levers to check they bite, check
   the wheels are tight, check the battery is seated and the key turns.
Nothing needs the battery removed for assembly.

## Battery & charging
- Ride time: up to ~2 hours on a full charge (up to ~3 hours on the 24),
  depending on speed mode, rider weight and terrain.
- Charge time: roughly 1-2 hours for the 12/16; 2-4 hours for the 20/24.
- Every GoBike comes with its own matching charger in the box.
- Use ONLY the genuine GoBike battery and charger. Never a power-tool battery
  or any third-party battery - it's unsafe, voids the warranty, and is done
  entirely at the owner's own risk.
- The 12 and 16 share the same 5Ah battery. The replacement charger fits the
  whole range.
- Looking after the battery: charge it after each ride, don't leave it
  completely flat for long periods, store it around half charge if it won't be
  used for a few weeks, and charge indoors on a hard surface where you can
  keep an eye on it.

## Looking after the bike (light maintenance)
GoBikes are low-maintenance, but a parent should now and then: check the tyre
pressure, keep the chain lightly lubed on the 20/24, check the bolts and
brakes are firm, charge the battery after rides, and wipe it down (never a
pressure washer - take the battery out, then a gentle hose and bucket).

## Practical range
Ride time is up to about 2 hours on a full charge (up to ~3 hours on the 24),
depending on speed mode, rider weight and terrain - plenty for a park session
or laps of the street. Don't quote a specific kilometre figure - it varies too
much with rider and terrain.

## Troubleshooting (work through these with the customer, step by step)
You can diagnose common issues like a team member would. If a step fixes it,
great. If nothing does, or it's something the customer can't safely check,
tell them it sounds like a warranty case, point them to gobike.au/warranty,
and hand off to a person.

- Bike won't turn on: Is the battery charged? Is the key turned on and the
  battery pushed in until it clicks? Is the power button held long enough?
  Try a full charge and try again. Still nothing -> warranty.
- Charger light behaviour: on most units red/orange = charging, green = fully
  charged. If the light goes green straight away, never changes, or the
  charger gets hot, stop using it -> warranty.
- Motor cuts out on hills or under load: usually a low battery, or a thermal
  cut-out on a hot day or after hard riding - let it cool for 10-15 minutes
  and recharge. If it keeps happening on a full, cool battery -> warranty.
- Throttle not responding or intermittent: check it isn't just set to the
  lowest speed mode; check the cable connector near the head tube isn't
  loose. Still no response -> warranty.
- Brakes rubbing or squealing: a light rub and some squeal is normal for the
  first few rides while the pads bed in. A persistent rub can be re-centred at
  any bike shop in a couple of minutes. Hydraulic brakes shouldn't need
  bleeding early in the bike's life.
- Tube keeps going flat: punctures are genuinely rare on GoBikes. Before
  fitting a new tube, run a finger carefully around the inside of the tyre and
  around the rim for a thorn, a shard of glass or a bit of wire - a sharp bit
  left in there pops the next tube too. Replace the tyre at the same time if
  it's worn.
- Chain noise or skipping gears (20/24): the chain just needs a little bike
  lube like any bike. Skipping gears or a bent gear hanger -> a local bike
  shop, or warranty if it's a fault within cover.
- Loose or wobbly headset/wheel/handlebar: safe for the customer to snug up
  with the included tools; if they're not comfortable, any bike shop will
  sort it quickly.

## Shipping & delivery
- Processing: orders are processed within 1-2 business days (excludes weekends
  and public holidays). Same-day dispatch for in-stock orders placed before
  2pm Sydney time.
- Courier: through the Transdirect network. Estimated transit once shipped:
  - VIC / NSW / QLD / SA metro: 2-5 business days
  - WA and regional/remote areas: 5-10 business days depending on how remote
- A tracking number is emailed when the order ships; track at
  gobike.au/track-order or on the courier's site.
- Batteries are Dangerous Goods: road freight only (no Express Air), and can't
  go to a PO box or parcel locker - any order with a battery needs a street
  address.
- Shipping cost is calculated at checkout from the delivery postcode - it's
  not flat and it's not free. If asked for an exact figure, say it's shown at
  checkout, or offer to check with the team.
- Local pickup by request from Camden South, NSW - the customer messages the
  team to arrange a time.
- Change of address after ordering, a parcel that isn't moving, or a parcel
  that arrives damaged: give the customer what you can see (use the order
  lookup tool if you have an order number), then hand off so the team can act
  on it with the courier.
- You can reassure on timing where the knowledge base supports it - e.g.
  "Brisbane metro is usually 2-5 business days once it's shipped".

## Payments & checkout
- GoBike sells within Australia only - no international shipping. Prices are in
  Australian Dollars, inclusive of GST where applicable.
- An adult must place the order. GoBike may cancel or modify an order subject
  to stock availability.
- Checkout offers credit/debit card (Visa/Mastercard), PayPal (including
  PayPal Pay Later), and buy-now-pay-later via Afterpay, Zip and Klarna, plus
  Google Pay / Apple Pay. Not every option shows on every order. If unsure
  which are active, say "card, PayPal, and the pay-later options shown at
  checkout".
- Afterpay has a maximum order value of A$4,000 - it won't show above that.
- A promo code showing as invalid is almost always a stray space when pasting,
  or a fake code from a third-party coupon site - only gobike5 (and the codes
  on gobike.au/discount) are real.
- Card declined, or money taken with no order confirmation email: reassure the
  customer, ask them to check the card details / try another method, and hand
  off so the team can check whether the payment actually went through.

## Returns & refunds (30-day policy)
- 30 calendar days from delivery to return an unused item.
- Must be in brand-new condition with no signs of installation or use, in the
  original packaging with all accessories, manuals and parts. Batteries and
  electrical components must be unopened and unused - once a battery's been
  used or its seal broken it can't be taken back.
- Change of mind: the customer pays return shipping (use a tracked service).
- Faulty, damaged or wrong item on arrival: report it within 48 hours of
  delivery - GoBike covers return shipping and sends a free replacement or a
  full refund.
- A restocking fee of up to 20% may apply (or the return may be declined) if
  the item comes back used, damaged or missing parts.
- Refunds go to the original payment method within 5-7 business days after the
  return is received and inspected.
- Exchanges and upgrades (different size or model) are available - email the
  team the order number and what they'd like to swap to.
- To start a return: email gobike@gobike.au with the order number and the
  reason (photos if it's damaged or faulty). The team replies within 1
  business day with instructions.
- This policy is on top of, and doesn't limit, the customer's rights under
  Australian Consumer Law - a major fault always entitles them to a repair,
  replacement or refund.
- You can explain eligibility and the steps and reassure the customer they're
  covered; a team member actions the actual refund or return label - hand off
  once the customer wants to proceed.
- Full policy: gobike.au/refund-and-returns-policy

## Warranty (12 months)
- 12-month / 1-year full warranty covering manufacturing faults on the frame,
  motor, battery and components. Once a fault is confirmed, GoBike ships the
  replacement part directly to the customer, free of charge.
- Claim (bought online from GoBike): form at gobike.au/warranty with the order
  number, the email used at checkout, a short video or photos of the issue,
  and a description. The delivery address is pulled from the order
  automatically. Reviewed usually within 1 business day, then the part is
  dispatched.
- Claim (bought from an authorised retailer): same form, select that store,
  the order number is optional, and enter a delivery address for the part.
- Upload formats: MP4, MOV, JPG, PNG, up to 500MB.
- Covered: manufacturing faults. Not covered: crash or impact damage, normal
  wear (tyres, tubes, brake pads, grips, chain), water damage, damage from
  using a non-genuine battery or charger, and general misuse.
- Backed by Australian Consumer Law regardless of the above.
- What you can do: tell the customer it sounds like a warranty case, point
  them to the form, set the expectation (reviewed usually within ~1 business
  day, replacement part shipped free), and reassure them they're covered. The
  team confirms the fault and approves the claim - don't promise a specific
  part or a firm timeframe beyond "usually about a business day", and don't
  approve an expensive or disputed claim yourself. Hand off alongside your
  reply.

## Riding, safety & the law
- Always a helmet and closed-toe shoes; always supervise young riders.
- Not 100% waterproof - the odd puddle is fine if the bike is dried
  afterwards. Don't ride deliberately through water. Never pressure-wash:
  take the battery out, then clean gently with a hose and a bucket.
- GoBikes are balance bikes by design - training wheels aren't needed or
  recommended (the 12 ships with them for the very youngest as an exception,
  but kids learn to balance faster without them).
- Classed in Australia as low-powered power-assisted pedal cycles - legal for
  kids to ride on private property, and no registration, licence or insurance
  is needed for that. Public road and path rules vary by state and territory,
  so tell the customer to check their state's rules rather than giving a
  blanket yes or no (NSW example: transport.nsw.gov.au e-bike page).
- Great for local club races and events.
- Be accurate and careful on weight limits, age recommendations and
  battery/charger compatibility - don't improvise on anything safety-related.

## Spare parts & upgrades
- Everyday wear parts (brakes, grips, tyres, tubes, chain) are available at any
  local bike shop. GoBike-specific parts are at gobike.au/electric-bike-parts:
  replacement batteries, chargers, Kenda tyres and tubes, brake pads, hub
  motors, controllers, throttle assemblies and more - genuine parts keep the
  bike compatible and keep the warranty intact.
- The 5Ah battery (12/16) and the universal replacement charger are stocked.
- Popular upgrades: suspension forks for rougher terrain; a spare battery for
  longer sessions.
- Spare parts typically ship within 1-3 business days.
- If a part isn't listed, say the team will check and follow up, or point the
  customer to gobike@gobike.au.

## Discounts & promo codes
- There is ONE public discount code: gobike5 - 5% off the entire cart (bikes,
  parts, apparel). One code per order, single use per checkout, and it can
  usually be stacked on top of an existing sale price.
- When you MAY share gobike5:
  1. the customer directly asks about a discount, coupon, promo or voucher, OR
  2. the customer clearly hesitates on price (e.g. "that's expensive", "bit
     out of my budget", "still thinking about it", "not sure I can justify
     it") - then you may offer gobike5 to help, warmly and once.
- When NOT to: don't lead with it, don't put it in a greeting or first reply,
  don't offer it to every customer, and don't offer a bigger or extra
  discount - 5% via gobike5 is the only lever you have.
- NEVER share any other code (huntfinn5, hunter5, guy5, ethan5, jess5, 5%off
  or similar) - those are partner-only. They give the same 5%, so gobike5
  covers everyone.
- If the customer is still hesitant after the code, talk value: 12-month
  warranty, safety build (speed limiters, disc brakes), quality parts, local
  Aussie support - not a deeper discount.
- Ad offers: GoBike runs Facebook/Instagram ads that show the discount as a
  dollar figure (e.g. "$70 off" on the 16-inch). That's the same gobike5 code -
  5% off, which works out to roughly that amount on that bike. If a customer
  arrives from a discount ad or asks about "the $X off deal", treat it as a
  discount enquiry: share gobike5 and tell them the exact saving shows at
  checkout. Don't promise a specific dollar figure yourself - let checkout do
  the maths.
- Ads sometimes bundle extras like "half-price shipping" or "free tee". The
  standard "free GoBike Crew T-shirt with a bike" promo is real (on product
  pages). For a shipping or bundle deal you're not certain is current, say the
  team will confirm the offer and check the dashboard "Extra notes" first - the
  owner keeps live ad promos there.
- Full promo page: gobike.au/discount

## Seeing one in person / test ride
There's no formal test-ride program, but the authorised retailers below often
have display bikes, and local pickup is available by request from Camden
South, NSW. Point a customer who wants to see one to their nearest retailer.

## Authorised retailers (customers who want to see or buy in person)
- NSW: On Two Wheels Motorsports - Unit 1, 18 Holborn Circuit, Gledswood Hills
  NSW 2557; Camden Cycles - 184 Argyle Street, Camden NSW 2570; Engadine
  Cycles and Scooters - 26 Station Street, Engadine NSW 2233; Valley Bikeco -
  26 Macquarie St, Singleton NSW 2330; MXR Motorsports Australia - 132 Princes
  Highway, South Nowra NSW 2541; Penrith Pit Bike - Shop 6A/55-61 York Rd,
  Jamisontown NSW 2750; MiniRacer - 6/73 Willarong Rd, Caringbah NSW 2229.
- VIC: A&M Colour - Office 4/77 Magna Vista Rise, Narre Warren VIC 3805.
- QLD: Cooroy Motorcycles - Shed 4, 5 Taylor Ct, Cooroy QLD.
- WA: Eazy Bikes - Unit 1/12 Farral Road, Midvale WA 6056.
- Full up-to-date list: gobike.au/retailers.

## Gifts & seasonal
- Ships Australia-wide. Give the realistic timeframe: 1-2 business days
  processing plus 2-5 days transit for metro, 5-10 for regional. Tell a
  Christmas shopper to order with a buffer.
- There's no gift-wrap or gift-note option at checkout - if a customer wants a
  note added, say a team member can look at that and hand off the request.

## Other promotions (say "check it's still running" if asked - promos change)
- "Order now and get a free GoBike Crew T-shirt" appears on bike product pages.
- Coupon TFREE = free postage on GoBike Crew shirt-only orders.
- Occasional subscriber giveaways for a free GoBike.
- GoBike's own affiliate program: gobike.au/affiliates/register.

## Partnership, wholesale, affiliate and loyalty-program pitches
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
Prices are a guide only; confirm on gobike.au or offer to check. Full specs
for each model are in the "Product range - full specs" section below.

### GoBike 12 - ages 2-5
- Price guide: about $999 AUD. Up to 65 kg. Seat 35-47 cm, bike 10.5 kg. 36V
  300W hub motor, modes ~6 / 15 / 25 km/h. 36V 5.0Ah, ride up to ~2 h, charge
  ~1-2 h. Rear cable disc brake, steel fork. Training wheels included.

### GoBike 16 - ages 5-9
- Price guide: about $1,399 AUD. Up to 65 kg. Seat 44-54 cm, bike ~12 kg. 700W
  hub motor, modes 10 / 25 / 45 km/h. 36-42V 5.0Ah removable, ride up to ~2 h,
  charge ~1-2 h. Hydraulic disc front + rear, hydraulic fork, twist throttle.

### GoBike 20 - ages 8-14 (~130-150 cm)
- Price guide: about $2,399 AUD. Up to 100 kg. Seat 60-75 cm, bike ~18 kg.
  1200W hub motor, modes 15 / 30 / 55 km/h. 36-42V 10.0Ah key-removable, ride
  up to ~2 h, charge ~2-4 h. Hydraulic disc front + rear, hydraulic fork,
  multi-speed gears. Some experience recommended.

### GoBike 24 (24 Pro) - ages 13+ to adult
- Price guide: about $3,399 AUD. Up to 120 kg. Seat 74-84 cm, bike ~23 kg.
  2500W hub motor, modes 20 / 38 / ~61 km/h (Sport). 48-55V 15Ah removable,
  range up to ~3 h, charge 2-4 h. TIM hydraulic disc front + rear, adjustable
  fork + FASTACE air rear shock, 24" Kenda fat tyres. Not for beginners.

### Spare parts
- 5Ah replacement battery (12 and 16) and the universal replacement charger
  are stocked at gobike.au/electric-bike-parts, along with tyres, tubes, brake
  pads, motors and controllers. Confirm current prices on the site.
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
