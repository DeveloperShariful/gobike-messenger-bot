const Anthropic = require("@anthropic-ai/sdk");
const { buildSystemPrompt } = require("./systemPrompt");
const { lookupOrderStatus, logHandoff } = require("./db");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

const TOOLS = [
  {
    name: "lookup_order_status",
    description:
      "Look up the current status of a GoBike order using the order number (the customer's email can be used as a fallback identifier if they don't have the order number handy). Use this any time a customer asks where their order is, about tracking, or delivery timing.",
    input_schema: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "The customer's order number, e.g. GB-10234 or #10234",
        },
      },
      required: ["order_number"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Flag this conversation for a real GoBike team member to follow up on (complaints, warranty/damage claims, payment issues, or anything you're not confident answering from the knowledge base). Always still send the customer a normal, warm reply as well — this tool just creates an internal note.",
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

async function runTool(toolName, toolInput, ctx) {
  if (toolName === "lookup_order_status") {
    try {
      const order = await lookupOrderStatus(toolInput.order_number);
      if (!order) {
        return { found: false };
      }
      return { found: true, order };
    } catch (err) {
      console.error("lookup_order_status failed", err);
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
  const system = buildSystemPrompt({
    supportEmail: process.env.SUPPORT_EMAIL || "gobike@gobike.au",
    supportPhone: process.env.SUPPORT_PHONE || "",
  });

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  let escalated = false;
  const ctx = { platform, senderId, userText };

  for (let turn = 0; turn < 4; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use"
    );

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

module.exports = { generateReply };
