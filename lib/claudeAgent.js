const Anthropic = require("@anthropic-ai/sdk");
const { buildSystemPrompt } = require("./systemPrompt");
const { buildKnowledgeBase } = require("./knowledgeBase");
const { getOrder } = require("./shopClient");
const { logHandoff } = require("./db");

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
    await logHandoff({
      platform: ctx.platform,
      senderId: ctx.senderId,
      reason: toolInput.reason,
      lastMessage: ctx.userText,
    }).catch((err) => console.error("logHandoff failed", err));
    return { escalated: true };
  }

  return { error: `Unknown tool ${toolName}` };
}

/**
 * history: array of { role: 'user' | 'assistant', content: string } oldest-first
 * Returns: { replyText, escalated }
 */
async function generateReply({ platform, senderId, userText, history }) {
  const { text: knowledgeBase } = await buildKnowledgeBase();

  const system = buildSystemPrompt({
    knowledgeBase,
    supportEmail: process.env.SUPPORT_EMAIL || "gobike@gobike.au",
    supportPhone: process.env.SUPPORT_PHONE || "",
  });

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  let escalated = false;
  const ctx = { platform, senderId, userText };

  // The system prompt carries the whole knowledge base (~5k tokens) and is
  // identical across the tool-use loop and back-to-back customer messages, so
  // cache it — big cost saving on a busy page.
  const systemBlocks = [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
  ];

  for (let turn = 0; turn < 4; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
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

  return {
    replyText:
      "Sorry, that one's a bit tricky — I've flagged it for the team and someone will follow up with you shortly.",
    escalated: true,
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
