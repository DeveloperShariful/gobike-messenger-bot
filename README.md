# GoBike Messenger + Instagram Auto-Reply Bot

এই বট আপনার GoBike Facebook Page Messenger আর Instagram DM-এর customer মেসেজ পড়ে,
Claude AI দিয়ে মানুষের মতো reply বানায়। Product, দাম, stock — এসব তথ্য **live আসে
আপনার my-shop স্টোর থেকে** (gobike.au), তাই কখনো পুরনো হয় না। Order status জিজ্ঞেস
করলে স্টোরের API থেকে লুকআপ করে (order number + সেই order-এর email মিললে তবেই details
দেয়)। রাগান্বিত customer / warranty claim / payment issue হলে স্বয়ংক্রিয়ভাবে human
handoff-এর জন্য নোট রেখে দেয়।

সাথে আছে একটা **password-protected dashboard** (`/dashboard`) — handoff queue,
সব conversation log, bot চালু/বন্ধ toggle, আর extra knowledge যোগ করার জায়গা।

---

## দুই রিপো, দুই জায়গা

| রিপো | কী | কোথায় deploy |
|---|---|---|
| `gobike-messenger-bot` (এটা) | বট + dashboard | Render |
| `my-shop` | স্টোর — এখানে `/api/bot/*` read-only API যোগ করা হয়েছে | Vercel (gobike.au) |

বট HTTPS দিয়ে `https://gobike.au/api/bot/*` কল করে, একটা shared secret (`BOT_API_KEY`)
দিয়ে। দুই রিপোতে **একই** `BOT_API_KEY` বসাতে হবে।

---

## ধাপ ১ — Meta Developer App বানানো

1. https://developers.facebook.com/apps এ যান, "Create App" → type **"Business"**।
2. Dashboard-এ **"Messenger"** product যোগ করুন।
3. **Messenger → Settings**:
   - "Access Tokens" সেকশনে আপনার GoBike Facebook Page যোগ করে একটা
     **Page Access Token** জেনারেট করুন → এটাই `META_PAGE_ACCESS_TOKEN`।
   - এই একই টোকেন Messenger আর Instagram DM দুটোর জন্যই কাজ করে, যদি Instagram
     professional account সেই Page-এর সাথে link করা থাকে।
4. **App Settings → Basic** → **App Secret** কপি করুন → `META_APP_SECRET`।
5. নিজে একটা random string বানান (যেমন `gobike_wh_9f8x...`) → `META_VERIFY_TOKEN`।
   এটা `.env` আর Meta dashboard — দুই জায়গায় বসাতে হবে।

### Webhook যুক্ত করা (deploy করার পর)
1. Meta Dashboard → **Messenger → Settings → Webhooks** → "Add Callback URL"।
2. Callback URL: `https://gobike-messenger-bot.onrender.com/webhook`
3. Verify Token: আপনার `META_VERIFY_TOKEN`।
4. Subscribe: `messages`, `messaging_postbacks`, `message_echoes`,
   `messaging_referrals`।
   (`message_echoes` = team Business Suite থেকে reply দিলে বট বুঝে চুপ হয়ে যায়।
   `messaging_referrals` = click-to-Messenger ad থেকে customer এলে বট বুঝে কোন ad/
   offer, "this bike" ঠিকভাবে ধরে।)
5. Instagram-এর জন্যও `messages` field-এ subscribe করুন।

### App Review
নিজের Page/Instagram দিয়ে টেস্ট করতে **App Review লাগে না** (Development mode)। সব
customer-এর জন্য public চালু করতে `pages_messaging` +
`instagram_manage_messages` permission-এর জন্য App Review + Business Verification
সাবমিট করতে হবে (কয়েকদিন লাগে)।

---

## ধাপ ২ — Claude API

`.env`-এ `ANTHROPIC_API_KEY` বসান (console.anthropic.com থেকে)।

`CLAUDE_MODEL` ডিফল্ট `claude-sonnet-5` — support chat-এর জন্য দ্রুত/সাশ্রয়ী। সবচেয়ে
শক্তিশালী reply চাইলে `claude-opus-5` দিন (খরচ বেশি)। Deploy-এর আগে
https://docs.claude.com/en/docs/about-claude/models চেক করে নিশ্চিত হয়ে নিন model ID
বর্তমানে সঠিক কিনা।

Knowledge base বড় (পুরো product catalog) — তাই system prompt **prompt-cache** করা
আছে, ব্যস্ত page-এ এটা API খরচ অনেক কমায়।

---

## ধাপ ৩ — my-shop স্টোরে bot API চালু করা

my-shop রিপোতে `app/api/bot/` ফোল্ডারে ৩টা read-only endpoint যোগ করা হয়েছে:
`catalog` (products/দাম/stock), `order` (status lookup), `policies` (contact/config)।
সবগুলো `x-api-key` header দিয়ে protected।

**করণীয়:**
1. একটা লম্বা random string বানান — এটাই `BOT_API_KEY`।
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. my-shop-এর Vercel project settings → Environment Variables → `BOT_API_KEY` বসান।
   (লোকালি টেস্ট করতে my-shop-এর `.env`-এও বসান — সেটা করা আছে।)
3. my-shop redeploy করুন।
4. যাচাই: `curl https://gobike.au/api/bot/catalog` → `401` (key ছাড়া)।
   `curl -H "x-api-key: <KEY>" https://gobike.au/api/bot/catalog` → product JSON।

> দাম/স্টক live আসে — কিছু করতে হয় না। বাকি সব curated থাকে বটের ভেতরে
> ([lib/knowledgeBase.js](lib/knowledgeBase.js) → `STATIC_POLICY_SECTIONS`): প্রতিটা
> মডেলের full spec, troubleshooting (charger/motor/throttle/brake/puncture/chain
> step-by-step), delivery, payment (card/PayPal/Afterpay/Zip), returns, warranty,
> riding-law, spare parts, retailer address। gobike.au-র পেজ বদলালে এই ফাইল আপডেট
> করতে হবে।
>
> KB-তে buying-decision content-ও আছে: box-এ কী আসে (charger, toolkit, ৭টা colour
> sticker kit), petrol bike vs GoBike, সস্তা marketplace bike vs GoBike, "grows with
> your child", value story, প্রতিটা model-এর character।
>
> Persona: বট এখন KB-তে থাকা প্রশ্নের **সরাসরি confident উত্তর** দেয়, everyday
> সিদ্ধান্ত নেয় (bike suggest, "এটা normal" vs "warranty দরকার", delivery estimate),
> covered থাকার আশ্বাস দেয়, আর কেউ কিনতে চাইলে **helpful ভাবে সাহায্য করে** (recommend
> + value + link) — কিন্তু pushy না, fake urgency না, আর website-এর "fastest/best on
> the market" superlative বলে না (proof ছাড়া ACL ঝুঁকি)। শুধু আসল কঠিন ১% —
> রাগ/অভিযোগ, payment/refund action, দামি warranty approval, partnership pitch —
> human-এ যায়।

---

## ধাপ ৪ — বটের database

যেকোনো **PostgreSQL** চলবে (Neon / Render / Supabase — MySQL নয়)। Connection
string `.env` / Render-এ `DATABASE_URL`-এ বসান — ব্যস।

বট boot হওয়ার সময় নিজে থেকেই `bot_conversations`, `bot_handoffs`,
`bot_settings` টেবিল বানিয়ে নেয় ([lib/db.js](lib/db.js) → `runMigrations`,
`sql/schema.sql` চালায়)। কোনো `psql` কমান্ড চালানোর দরকার নেই। এটা শুধু
`bot_*` টেবিল বানায় — DB-র আর কিছু ছোঁয় না, তাই স্টোরের একই Neon database-ও
ব্যবহার করা নিরাপদ (আলাদা রাখলে আরও পরিষ্কার)।

---

## ধাপ ৫ — Deploy (Render)

1. এই ফোল্ডার একটা GitHub repo-তে push করুন (`.env` push করবেন **না**)।
2. render.com → "New Web Service" → GitHub repo সিলেক্ট।
3. Environment Variables — `.env.example`-এর প্রতিটা ভ্যালু বসান:
   - `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`
   - `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`
   - `DATABASE_URL`
   - `SHOP_API_BASE_URL=https://gobike.au`, `BOT_API_KEY` (my-shop-এর সাথে একই)
   - `DASHBOARD_USER`, `DASHBOARD_PASSWORD`
4. Build/Start আপনা থেকেই হবে (`npm install` + `npm start`)।
5. Deploy হলে যে URL পাবেন সেটা দিয়ে ধাপ ১-এর Webhook অংশ সম্পূর্ণ করুন।

---

## Dashboard

`https://gobike-messenger-bot.onrender.com/dashboard` — `/login` styled sign-in
পেজে `DASHBOARD_USER` / `DASHBOARD_PASSWORD` দিয়ে লগইন। session cookie ১২ ঘণ্টা
থাকে, header-এ "Log out" বোতাম। দুটো env var সেট না থাকলে dashboard বন্ধ থাকে।
(ঐচ্ছিক `SESSION_SECRET` — না দিলে password থেকে derive হয়।)

- **Overview** — ২৪ঘণ্টা/৭দিনের message count, customer সংখ্যা, খোলা handoff, স্টোর
  connection status।
- **Handoffs** — যেসব conversation human দরকার। "Resolve" দিয়ে কেটে দিন।
  বট escalate করলে **ওই একটা thread-এ** নিজে থেকে চুপ হয়ে যায় (পুরো বট বন্ধ না)।
  team Business Suite inbox থেকে reply দিলে বট সেটা টের পায় (`message_echoes`) আর
  চুপই থাকে। শেষ human reply-র `BOT_RESUME_AFTER_MINUTES` (default 10) মিনিট পর
  বট নিজে থেকেই ওই thread-এ আবার reply শুরু করে — Resolve করার দরকার নেই।
  নতুন handoff হলে **Telegram group-এ alert** যায় (`TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` সেট থাকলে; Setup ট্যাবে "Send test alert" বোতাম)।
- **Conversations** — recent customer লিস্ট → ক্লিক করে পুরো চ্যাট দেখুন।
- **Knowledge base** — "Extra knowledge" box-এ যা লেখেন সেটা বট authoritative ধরে
  (correction, current promo, one-off নোট)। নিচে স্টোর থেকে আসা live catalog দেখা
  যায় + "Refresh from store" বাটন।
- **Settings** — বট চালু/বন্ধ toggle (বন্ধ থাকলে customer একটা offline message পায়,
  Claude কল হয় না), আর সেই offline message-এর লেখা।
- **Setup** — কোনটা connected আর কোনটা নয় (DB, store API, Claude key, Meta
  tokens), আর Meta-তে বসানোর webhook URL। কোনো secret দেখায় না, শুধু ✓/✕।

---

## ধাপ ৬ — টেস্ট

1. নিজের FB/Instagram account থেকে GoBike Page-এ মেসেজ করুন ("20 inch bike-এর দাম কত?")।
2. reply-তে দাম live catalog-এর সাথে মিলছে কিনা দেখুন।
3. একটা আসল order number দিয়ে "আমার অর্ডার কোথায়?" — বট email চাইবে, তারপর status দেবে।
4. "তুমি কি রোবট?" — বট সৎভাবে বলবে (assistant + real team) আর human-এ flag করবে।
5. রাগী complaint মেসেজ — dashboard-এর Handoffs-এ চলে আসা উচিত।
6. Render Logs-এ error আছে কিনা দেখুন।

---

## নিরাপত্তা (security)

- **`.env` / টোকেন / `BOT_API_KEY` / Anthropic key কখনো GitHub-এ বা chat-এ পাঠাবেন
  না।** ভুলে কোথাও চলে গেলে সাথে সাথে rotate করুন — Anthropic Console → API Keys,
  Meta Dashboard → App Secret / Page token, তারপর নতুন value দুই রিপোর env-এ বসান।
- **`META_APP_SECRET` অবশ্যই সেট করুন।** না থাকলে বট webhook-এ যেকোনো fake মেসেজ
  বিশ্বাস করবে (কেউ POST করে বট দিয়ে আজেবাজে reply পাঠাতে পারবে)। Setup ট্যাবে এটা
  লাল দেখাবে যদি সেট না থাকে।
- **Dashboard password শক্ত দিন** (`DASHBOARD_PASSWORD`)। `/dashboard` আর
  `/api/admin/*` session-cookie auth + rate limit (৫ মিনিটে ৩০০ request/IP) দিয়ে
  protected। `/login` POST আলাদা tight limit (১৫ মিনিটে ২০ চেষ্টা/IP)। cookie
  HttpOnly + SameSite=Lax + HTTPS-এ Secure। `/webhook`-ও rate-limited (মিনিটে ৬০০/IP)।
- সব traffic HTTPS (Render/Vercel নিজে থেকেই)। বটের DB-তে শুধু conversation/handoff/
  settings — কোনো payment বা customer password নেই।

## জরুরি নোট

- **রিটার্ন পলিসি:** সাইটে banner/FAQ-তে "30-Day Returns" কিন্তু policy পেজে 14 দিন।
  এই দুটো এক করুন — ততক্ষণ বট exact সংখ্যা না বলে policy page-এ পাঠাবে।
- **খরচ:** প্রতি মেসেজে সামান্য Claude API খরচ (pay-as-you-go)। prompt caching থাকায়
  পরপর মেসেজে অনেক সস্তা। প্রথমদিকে console.anthropic.com-এ usage মনিটর করুন।
- **Order privacy:** বট শুধু order number + সেই order-এর email মিললে তবেই details দেয়।
  Guest order-এ email না থাকলে details দিয়ে দেয় — এটা my-shop-এর
  [app/api/bot/order/route.ts](../my-shop/app/api/bot/order/route.ts)-এ বদলানো যায়।

---

## ফাইল স্ট্রাকচার

```
server.js                Express server, webhook + dashboard mount, bot on/off gate
lib/claudeAgent.js       Claude API call + tool-use loop (order lookup, escalation), prompt cache
lib/systemPrompt.js      বট-এর persona + instructions (honest-if-asked)
lib/knowledgeBase.js     live catalog → plain text + big curated KB (specs, troubleshooting, policies) + kb_override
lib/shopClient.js        my-shop /api/bot/* client (cache + graceful fallback)
lib/db.js                বটের Postgres: history, handoffs, settings, dashboard queries
lib/metaSend.js          Messenger/Instagram Send API wrapper
lib/adminApi.js          /api/admin/* — dashboard-এর JSON API
lib/notify.js            escalate হলে Telegram group-এ alert
lib/dashboardAuth.js     session-cookie auth (login/logout handlers + guards)
public/login.html        styled sign-in page
public/dashboard.html    dashboard UI (single self-contained file)
sql/schema.sql           bot_conversations / bot_handoffs / bot_settings
.env.example             সব environment variable

my-shop রিপোতে:
app/api/bot/_auth.ts      x-api-key যাচাই + helpers
app/api/bot/catalog/      GET — published products, live দাম/stock
app/api/bot/order/        POST — order status (order number + email মিলতে হবে)
app/api/bot/policies/     GET — store contact + config
```
