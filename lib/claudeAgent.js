const Anthropic = require("@anthropic-ai/sdk");
const { buildSystemPrompt } = require("./systemPrompt");
const { buildKnowledgeBase } = require("./knowledgeBase");
const { getOrder, getShippingQuote } = require("./shopClient");
const { logHandoff, pauseThread } = require("./db");
const { notifyEscalation } = require("./notify");
const { getUserName } = require("./metaSend");

// Workspace-scoped ("identity-linked") API keys must tell the API which
// workspace the request acts in. Set ANTHROPIC_WORKSPACE_ID (wrkspc_...) if
// your key is workspace-linked; leave it unset for a normal org/Default key.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_WORKSPACE_ID
    ? {
        defaultHeaders: {
          "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID,
        },
      }
    : {}),
});
// Sonnet 5 is a good fit for high-volume support chat (fast, cheap, 1M ctx).
// Bump CLAUDE_MODEL to claude-opus-5 in .env if you want the strongest model.
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

const TOOLS = [
  {
    name: "lookup_order_status",
    description:
      "Look up the current status of a GoBike order. Requires the order number. Pass the customer's email too whenever they've given it — the store won't return details without a matching email (customer privacy). Use this any time a customer asks where their order is, about tracking, or delivery timing.",
    input_schema: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "The customer's order number, e.g. GB-10234 or #10234",
        },
        email: {
          type: "string",
          description:
            "The email address the order was placed under, if the customer has provided it.",
        },
      },
      required: ["order_number"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Flag this conversation for a real GoBike team member to follow up on (complaints, warranty/damage claims, payment issues, a customer asking for a human, or anything you're not confident answering from the knowledge base). Always still send the customer a normal, warm reply as well — this tool just creates an internal note.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short internal note on why this needs a human.",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "get_shipping_estimate",
    description:
      "Get a rough delivery-cost estimate to an Australian postcode. Use when a customer asks what shipping will cost to their area. It's an estimate, not a checkout quote - the exact figure is confirmed at checkout. Pass the postcode; pass the suburb and the product slug too when you know them for a better estimate.",
    input_schema: {
      type: "object",
      properties: {
        postcode: { type: "string", description: "4-digit Australian postcode" },
        suburb: { type: "string", description: "Delivery suburb, if known" },
        product_slug: {
          type: "string",
          description:
            "The product slug from the catalogue (e.g. ebike-for-sale-16-inch-gobike-ages-5-9) if the customer named a specific bike",
        },
        quantity: { type: "number", description: "Number of bikes (default 1)" },
      },
      required: ["postcode"],
    },
  },
  {
    name: "offer_quick_replies",
    description:
      "Attach a few tappable buttons to your reply so the customer can answer in one tap instead of typing. Use for short multiple-choice follow-ups — which model, which state, yes/no, want the link. Still write your normal text reply; the buttons sit under it. Each label must be short (under 20 characters). Don't use it on every message — only when a quick tappable choice genuinely helps.",
    input_schema: {
      type: "object",
      properties: {
        options: {
          type: "array",
          items: { type: "string" },
          description: "2 to 13 short button labels, e.g. [\"GoBike 12\",\"GoBike 16\",\"GoBike 20\",\"GoBike 24\"]",
        },
      },
      required: ["options"],
    },
  },
];

function describeOrder(order) {
  const parts = [`Order ${order.orderNumber}: status ${order.status}`];
  if (order.paymentStatus) parts.push(`payment ${order.paymentStatus}`);
  if (order.fulfillmentStatus) parts.push(`fulfilment ${order.fulfillmentStatus}`);
  const s = order.shipping || {};
  if (s.provider) parts.push(`courier ${s.provider}`);
  if (s.trackingNumber) parts.push(`tracking number ${s.trackingNumber}`);
  if (s.trackingUrl) parts.push(`tracking link ${s.trackingUrl}`);
  if (s.latestStatus) parts.push(`latest scan "${s.latestStatus}"`);
  if (s.estimatedTransitTime) parts.push(`ETA ${s.estimatedTransitTime}`);
  if (s.deliveredDate) parts.push(`delivered ${String(s.deliveredDate).slice(0, 10)}`);
  if (order.items && order.items.length) {
    parts.push(
      `items: ${order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`
    );
  }
  return parts.join("; ");
}

async function runTool(toolName, toolInput, ctx) {
  if (toolName === "lookup_order_status") {
    try {
      const result = await getOrder({
        orderNumber: toolInput.order_number,
        email: toolInput.email,
      });
      if (!result || result.found === false) {
        return {
          found: false,
          message:
            "No order matches that number. Ask the customer to double-check it, and offer to escalate to a human if it still doesn't turn up.",
        };
      }
      if (result.needsVerification) {
        return {
          found: true,
          needs_verification: true,
          message:
            "That order exists but the store won't release details without the email it was placed under. Ask the customer for that email, then call this tool again with order_number AND email.",
        };
      }
      return { found: true, summary: describeOrder(result), order: result };
    } catch (err) {
      console.error("lookup_order_status failed", err.message);
      return {
        found: false,
        error:
          "The order lookup system is temporarily unavailable. Tell the customer you'll follow up shortly, and call escalate_to_human.",
      };
    }
  }

  if (toolName === "escalate_to_human") {
    await flagForHuman(ctx, toolInput.reason);
    const warrantyish = /warrant|damage|broke|broken|snap|crack|fault|defect|replace|not working|stopped working/i.test(
      `${toolInput.reason || ""} ${ctx.userText || ""}`
    );
    return {
      escalated: true,
      now_write_the_customer_reply:
        "The internal note is created. Now write the actual customer reply yourself - it must NOT be a one-liner like 'all flagged' or 'all sorted, team's aware'." +
        (warrantyish
          ? " This is a fault/warranty message, so the reply MUST include, in your own warm words: (1) whether it's covered - for a part that has cracked or snapped with no crash, say clearly yes it's covered under the 12-month warranty; (2) the link gobike.au/warranty and the exact three things to lodge it - their order number, the email they ordered with, and a short video or a couple of clear close-up photos of the actual break; (3) that it's usually reviewed within about a business day and the replacement part is then shipped free. If they also sent a happy/riding photo or a kind message, react to that warmly and separately - don't treat a riding photo as the claim evidence."
          : " Give them a genuine, useful reply on the substance of what they asked - a warm 'a team member will follow up' on its own is not enough.") +
        " You may add tappable buttons with offer_quick_replies if a short choice would help, but do not end the turn without the full reply above.",
    };
  }

  if (toolName === "get_shipping_estimate") {
    try {
      const q = await getShippingQuote({
        postcode: toolInput.postcode,
        suburb: toolInput.suburb,
        productSlug: toolInput.product_slug,
        quantity: toolInput.quantity,
      });
      if (!q || q.available === false) {
        return {
          available: false,
          message:
            (q && q.note) ||
            "Couldn't get an estimate - tell the customer the exact figure shows at checkout, or offer to have the team confirm.",
        };
      }
      return { available: true, quote: q };
    } catch (err) {
      console.error("get_shipping_estimate failed", err.message);
      return {
        available: false,
        message:
          "Shipping estimate unavailable right now - tell the customer it's shown at checkout, or offer to check.",
      };
    }
  }

  if (toolName === "offer_quick_replies") {
    const opts = (toolInput.options || [])
      .map((o) => String(o || "").trim())
      .filter(Boolean)
      .slice(0, 13);
    if (opts.length >= 2) ctx.quickReplies = opts;
    return { ok: true, attached: opts.length >= 2 };
  }

  return { error: `Unknown tool ${toolName}` };
}

/**
 * Record a handoff, hush the bot on this thread, and ping the team once.
 * Called both when the model uses escalate_to_human and when the tool-use
 * loop gives up (so "I've flagged it for the team" is never a lie).
 */
async function flagForHuman(ctx, reason) {
  const label = reason || "Escalated to a human";
  const isNew = await logHandoff({
    platform: ctx.platform,
    senderId: ctx.senderId,
    reason: label,
    lastMessage: ctx.userText,
  }).catch((err) => {
    console.error("logHandoff failed", err);
    return true; // still notify — better a duplicate ping than silence
  });
  // Hush the bot on this thread so it doesn't talk over the team member who
  // picks it up. Lapses on its own (see isThreadPaused / BOT_RESUME_AFTER_MINUTES).
  await pauseThread({
    platform: ctx.platform,
    senderId: ctx.senderId,
    reason: label,
  }).catch((err) => console.error("pauseThread failed", err));
  // Ping the team (Telegram) once per fresh handoff.
  if (isNew) {
    const customerName = await getUserName(ctx.platform, ctx.senderId).catch(
      () => null
    );
    // Recent back-and-forth so the team has the context, not just the last line.
    const transcript = [
      ...(ctx.history || []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: ctx.userText },
    ].slice(-8);
    await notifyEscalation({
      platform: ctx.platform,
      reason: label,
      lastMessage: ctx.userText,
      customerName,
      transcript,
    }).catch((err) => console.error("notifyEscalation failed", err));
  }
}

/**
 * history: array of { role: 'user' | 'assistant', content: string } oldest-first
 * Returns: { replyText, escalated }
 */
async function generateReply({
  platform,
  senderId,
  userText,
  history,
  adContext,
  imageSources,
  imagesFailed,
  replyContext,
}) {
  const { text: knowledgeBase } = await buildKnowledgeBase();

  const system = buildSystemPrompt({
    knowledgeBase,
    supportEmail: process.env.SUPPORT_EMAIL || "gobike@gobike.au",
    supportPhone: process.env.SUPPORT_PHONE || "",
  });

  // Images are already fetched by the webhook handler (Meta URLs expire fast),
  // passed in as Anthropic image-source objects. Cap at 3.
  const imageBlocks = (imageSources || [])
    .slice(0, 3)
    .map((source) => ({ type: "image", source }));

  // Build the note that rides on this turn only (kept out of the cached system
  // prompt so per-customer context doesn't fragment the cache).
  let note = userText || "";
  if (adContext) {
    const adHint =
      adContext.ad_title ? ` titled "${adContext.ad_title}"` :
      adContext.ref ? ` (ref: ${adContext.ref})` : "";
    note =
      `[Context, not from the customer: they arrived by clicking a GoBike ad${adHint}.` +
      ` They're most likely asking about that bike or offer - if a model isn't` +
      ` named, assume it's the one in the ad. If the ad advertised a dollar` +
      ` discount like "$70 off", that's the gobike5 code (5% off, which works` +
      ` out to about that much on that bike) - share gobike5 and say the exact` +
      ` saving shows at checkout.]\n\n` + note;
  }
  if (replyContext) {
    note = `[Context: ${replyContext}.]\n\n` + note;
  }
  if (imageBlocks.length) {
    note =
      `[The customer attached ${imageBlocks.length} image(s) - look at them and use` +
      ` what's clearly visible. For a formal warranty claim still point them to` +
      ` gobike.au/warranty, which handles photos and video properly.]\n\n` + note;
  } else if (imagesFailed) {
    note = adContext
      ? `[The customer attached an image that couldn't be loaded - it's most` +
        ` likely the ad creative they clicked. Don't say you can't see it; just` +
        ` help them with the bike/offer from that ad using what you know.]\n\n` +
        (note || "(no text)")
      : `[The customer attached an image but it couldn't be loaded - ask them to` +
        ` describe it or send it again.]\n\n` + (note || "(no text)");
  }

  const currentUserContent = imageBlocks.length
    ? [...imageBlocks, { type: "text", text: note || "(the customer sent an image)" }]
    : note;

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentUserContent },
  ];

  let escalated = false;
  const ctx = { platform, senderId, userText, history };

  // The system prompt carries the whole knowledge base (~5k tokens) and is
  // identical across the tool-use loop and back-to-back customer messages, so
  // cache it — big cost saving on a busy page.
  const systemBlocks = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];

  for (let turn = 0; turn < 4; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      // Chat replies are short, but a full spec sheet or step-by-step
      // troubleshooting answer needs headroom so it doesn't get cut off.
      max_tokens: 2048,
      system: systemBlocks,
      tools: TOOLS,
      messages,
    });

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter((b) => b.type === "text");
      const replyText = textBlocks.map((b) => b.text).join("\n\n").trim();
      return {
        replyText:
          replyText ||
          "Sorry, I had a bit of trouble putting that reply together — could you say that again?",
        escalated,
        quickReplies: ctx.quickReplies || null,
      };
    }

    // Model wants to use one or more tools: run them, then continue the loop.
    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      if (block.name === "escalate_to_human") escalated = true;
      const result = await runTool(block.name, block.input, ctx);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Ran out of tool-use turns without a final answer — genuinely flag it.
  await flagForHuman(
    ctx,
    "Bot couldn't resolve this after several steps — needs a human"
  ).catch((err) => console.error("flagForHuman (loop limit) failed", err));
  return {
    replyText:
      "Sorry, that one's a bit tricky — I've flagged it for the team and someone will follow up with you shortly.",
    escalated: true,
    quickReplies: ctx.quickReplies || null,
  };
}

/**
 * Minimal live call to the Claude API, for the dashboard's self-test.
 * Returns a plain object describing success or the exact failure.
 */
async function selfTest() {
  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, model: MODEL, reply: text };
  } catch (err) {
    return {
      ok: false,
      model: MODEL,
      status: err.status || null,
      type: err.name || null,
      error: err.message || String(err),
    };
  }
}

module.exports = { generateReply, selfTest };
