# GoBike Messenger + Instagram Auto-Reply Bot

এই বট আপনার GoBike Facebook Page Messenger আর Instagram DM-এর customer মেসেজ পড়ে,
Claude AI দিয়ে reply বানায় (gobike.au থেকে নেওয়া product/policy তথ্য ব্যবহার করে,
Australian English-এ), আর দরকার হলে আপনার PostgreSQL ডাটাবেস থেকে order status
লুকআপ করে। কমপ্লেক্স/সেনসিটিভ কেসে (রাগান্বিত customer, warranty claim, ইত্যাদি)
স্বয়ংক্রিয়ভাবে human handoff-এর জন্য নোট রেখে দেয়।

কোড টেস্ট করা হয়েছে (syntax + boot + webhook verify + error-handling flow) —
কিন্তু আপনার নিজের Meta App, database আর Anthropic key দিয়ে end-to-end টেস্ট
করাটা must, deploy করার আগে।

---

## ধাপ ১ — Meta Developer App বানানো (যেহেতু এখনো বানানো হয়নি)

1. https://developers.facebook.com/apps এ যান, "Create App" চাপুন।
2. App type হিসেবে **"Business"** বেছে নিন।
3. App বানানোর পর Dashboard-এ **"Messenger"** product যোগ করুন (Add Product থেকে)।
4. **Messenger → Settings** এ গিয়ে:
   - "Access Tokens" সেকশনে আপনার GoBike Facebook Page যোগ করে একটা
     **Page Access Token** জেনারেট করুন। এটাই `META_PAGE_ACCESS_TOKEN`।
   - এই একই টোকেন Messenger আর Instagram DM দুটোর জন্যই কাজ করবে, যদি আপনার
     Instagram professional/business account সেই Facebook Page-এর সাথে link
     করা থাকে (Meta Business Suite থেকে link করা যায়, না থাকলে আগে সেটা করুন)।
5. **App Settings → Basic** পেজ থেকে **App Secret** কপি করুন — এটা
   `META_APP_SECRET`।
6. একটা random string নিজে বানান (যেমন `gobike_wh_9f8x...`) — এটা
   `META_VERIFY_TOKEN`, যেটা এই .env ফাইলে আর একটু পরে Meta-র dashboard-এ,
   দুই জায়গাতেই বসাতে হবে।

### Webhook যুক্ত করা (deploy করার পর)
বট deploy হয়ে যাওয়ার পর (ধাপ ৪ দেখুন) আপনি একটা public URL পাবেন, যেমন
`https://your-app.up.railway.app`। তখন:

1. Meta Dashboard → **Messenger → Settings → Webhooks** এ "Add Callback URL"
   চাপুন।
2. Callback URL: `https://your-app.up.railway.app/webhook`
3. Verify Token: আপনার বানানো `META_VERIFY_TOKEN` (ধাপ ৬ এ যেটা বানিয়েছেন)।
4. Subscribe করুন এই fields-এ: `messages`, `messaging_postbacks`।
5. একই webhook Instagram-এর জন্যও subscribe করুন (Dashboard এ Instagram
   product যোগ করে, বা Messenger settings-এর মধ্যেই Instagram account যুক্ত
   করার অপশন থাকবে) — field: `messages`।

### App Review নিয়ে একটা জরুরি কথা
আপনি নিজে App-এর Admin/Developer/Tester হিসেবে যতক্ষণ যুক্ত থাকবেন, ততক্ষণ
নিজের Page/Instagram-এর সাথে বট টেস্ট করতে **App Review লাগবে না** — Development
mode-এই কাজ করবে। কিন্তু পুরোপুরি সব customer-এর জন্য public ভাবে চালু করতে
চাইলে (App Live mode-এ নিতে), Meta-তে **App Review** সাবমিট করে
`pages_messaging` আর `instagram_manage_messages` permission approve করাতে
হবে, আর সাথে Business Verification। এটা করতে কয়েকদিন লাগতে পারে — তাই আগে
নিজের Page দিয়ে টেস্ট করে নিশ্চিত হয়ে নিন, তারপর Review-এর জন্য সাবমিট করুন।

---

## ধাপ ২ — Claude API (আপনার আগে থেকে আছে)

`.env` ফাইলে আপনার `ANTHROPIC_API_KEY` বসান (console.anthropic.com থেকে)।

`CLAUDE_MODEL` এ কোন model ব্যবহার হচ্ছে সেটা `.env.example`-এ একটা ডিফল্ট
বসানো আছে, কিন্তু deploy করার আগে
https://docs.claude.com/en/docs/about-claude/models চেক করে নিশ্চিত হয়ে নিন
এটাই বর্তমান সময়ের সঠিক/সাপোর্টেড model ID কিনা — model list সময়ের সাথে
বদলায়।

---

## ধাপ ৩ — PostgreSQL সেটাপ

আপনার existing PostgreSQL database-এর connection string `.env`-এ
`DATABASE_URL` এ বসান।

তারপর একবার এই কমান্ড চালান, যেটা বট নিজের conversation-history আর
handoff-log টেবিল বানাবে (আপনার আসল order টেবিলে কোনো পরিবর্তন করবে না):

```bash
psql "$DATABASE_URL" -f sql/schema.sql
```

**Order lookup আপনার আসল schema-র সাথে মেলাতে হবে।** বট ডিফল্টভাবে ধরে নেয়
একটা `orders` টেবিলে `order_number`, `status`, `tracking_number`, `carrier`,
`estimated_delivery` — এই কলামগুলো আছে। আপনার আসল টেবিলের নাম/কলাম অন্যরকম
হলে দুইভাবে ঠিক করতে পারেন:

- **সহজ:** `.env`-এ `ORDERS_TABLE`, `ORDERS_ORDER_NUMBER_COLUMN` ইত্যাদি env
  var গুলো আপনার আসল নামে বদলে দিন।
- **নিরাপদ (recommended):** `sql/schema.sql`-এর কমেন্টে একটা example view
  দেওয়া আছে — সেটা দিয়ে আপনার আসল টেবিলকে বটের প্রত্যাশিত নামে "ম্যাপ" করুন,
  আর `ORDERS_TABLE=bot_order_view` বসিয়ে দিন। এতে বট কখনো আপনার আসল টেবিল
  সরাসরি টাচ করে না।

---

## ধাপ ৪ — Deploy করা (Railway অথবা Render)

1. এই পুরো ফোল্ডারটা একটা নতুন GitHub repo-তে push করুন (`.env` ফাইলটা
   **push করবেন না** — `.gitignore` এ `.env` যোগ করে দিন, শুধু
   `.env.example` থাকবে)।
2. [railway.app](https://railway.app) অথবা [render.com](https://render.com)
   এ গিয়ে "New Project" → "Deploy from GitHub repo" বেছে সেই repo সিলেক্ট
   করুন।
3. Environment Variables সেকশনে `.env.example`-এর প্রতিটা variable-এর আসল
   ভ্যালু বসান (`META_VERIFY_TOKEN`, `META_APP_SECRET`,
   `META_PAGE_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`,
   `DATABASE_URL`, ইত্যাদি)।
4. Build/Start command এমনিতেই ধরে নেবে (`npm install` + `npm start`),
   `package.json`-এ সেটআপ করা আছে।
5. Deploy হওয়ার পর যে public URL পাবেন (যেমন
   `https://gobike-bot.up.railway.app`), সেটা দিয়ে উপরে ধাপ ১-এর Webhook
   অংশ সম্পূর্ণ করুন (`/webhook` যোগ করে)।

দুটোরই ফ্রি/স্টার্টার টায়ার আছে ছোট ট্রাফিকের জন্য যথেষ্ট, কিন্তু usage বাড়লে
paid plan লাগতে পারে — dashboard-এ pricing দেখে নিন।

---

## ধাপ ৫ — টেস্ট করা

1. আপনার নিজের Facebook/Instagram account দিয়ে GoBike Page-এ একটা মেসেজ
   পাঠান (যেমন "16 inch bike-এর দাম কত?")।
2. রিপ্লাই আসছে কিনা, তথ্য ঠিক আছে কিনা দেখুন।
3. একটা fake order number দিয়ে "আমার অর্ডার কোথায়?" জিজ্ঞেস করে order-lookup
   ফিচার টেস্ট করুন।
4. Hosting platform (Railway/Render) এর Logs ট্যাবে গিয়ে কোনো error আসছে
   কিনা দেখে নিন।

---

## জরুরি নোট

- **রিটার্ন পলিসিতে গরমিল আছে:** আপনার সাইটে banner/FAQ-তে লেখা "30-Day
  Returns" কিন্তু আসল Refund & Returns Policy পেজে লেখা 14 দিন। এই দুটো এক
  করে দিন — ততক্ষণ বটকে বলা আছে exact সংখ্যা না বলে policy page-এ পাঠাতে,
  যাতে ভুল তথ্য না যায়।
- **তথ্য আপডেট রাখুন:** দাম/স্টক/পলিসি বদলালে `lib/knowledgeBase.js` ফাইলটা
  ম্যানুয়ালি আপডেট করে আবার deploy করতে হবে। এটা ২০২৬-০৮-২৯ তারিখে
  gobike.au থেকে নেওয়া তথ্য দিয়ে বানানো।
- **নিরাপত্তা:** `.env` ফাইল/টোকেন কখনো GitHub-এ push করবেন না। কোনো টোকেন
  ফাঁস হলে সাথে সাথে Meta Dashboard আর Anthropic Console থেকে rotate করে
  নিন।
- **খরচ:** Claude API ব্যবহার প্রতি মেসেজে সামান্য খরচ হয় (pay-as-you-go,
  console.anthropic.com এ billing/usage দেখা যায়)। প্রথমদিকে usage মনিটর
  করে দেখে নিন volume অনুযায়ী মাসিক খরচ কেমন আসছে।

---

## ফাইল স্ট্রাকচার

```
server.js              Express server, webhook endpoints
lib/claudeAgent.js      Claude API call + tool-use loop (order lookup, escalation)
lib/systemPrompt.js     Bot-এর persona + instructions
lib/knowledgeBase.js    gobike.au থেকে নেওয়া product/policy তথ্য (এখানে আপডেট করবেন)
lib/db.js               PostgreSQL: conversation history + order lookup
lib/metaSend.js         Messenger/Instagram Send API wrapper
sql/schema.sql          Bot-এর নিজের টেবিল বানানোর SQL + order-schema mapping guide
.env.example            সব দরকারি environment variable-এর তালিকা
```
