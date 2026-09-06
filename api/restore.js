const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    composer: { type: "string" },
    key: { type: "string" },
    meter: { type: "string" },
    tempo: { type: "string" },
    abc: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    detected_parts: {
      type: "array",
      items: { type: "string" }
    },
    summary: { type: "string" },
    uncertainties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          location: { type: "string" },
          issue: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 }
        },
        required: ["location", "issue", "confidence"]
      }
    },
    changes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "title",
    "composer",
    "key",
    "meter",
    "tempo",
    "abc",
    "confidence",
    "detected_parts",
    "summary",
    "uncertainties",
    "changes"
  ]
};

const BASE_INSTRUCTIONS = `You restore conventional Western staff notation from score photographs and scans into valid ABC notation that abcjs can render.

Rules:
- Transcribe only evidence visible in the image. Never silently invent unreadable passages.
- Preserve meter, key signature, bar structure, rests, accidentals, durations, ties/slurs when legible, repeats, dynamics and multiple voices/parts when practical.
- The abc field must be a complete self-contained ABC tune beginning with X:1 and containing T:, M:, L:, Q: and K: headers. For multiple parts, use V: definitions and [V:...] lines in an abcjs-compatible form.
- If a symbol is ambiguous, choose the most plausible reading only when necessary to produce valid ABC and report that location under uncertainties.
- Confidence is transcription confidence, not artistic quality.
- Do not claim to identify a composer or title unless the text is visible. Use an empty string when unknown.
- The result must render rather than merely describe the music.
- Keep explanations short and concrete.`;

function promptFor(mode, instruction, currentAbc) {
  if (mode === "verify") {
    return `${BASE_INSTRUCTIONS}\n\nYou are performing a verification pass. Compare the score image against the candidate ABC below measure by measure. Correct concrete mismatches, keep correct work unchanged, and list each substantive correction in changes.\n\nCandidate ABC:\n${currentAbc || "(missing)"}\n\nUser steering instruction:\n${instruction || "No extra instruction. Prioritize literal fidelity to the image."}`;
  }
  return `${BASE_INSTRUCTIONS}\n\nPerform the first reconstruction pass. Return the cleanest faithful ABC transcription you can.\n\nUser instruction:\n${instruction || "No extra instruction. Preserve printed notation and flag ambiguity."}`;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the deployment." });
  }

  const { imageDataUrl, mode = "transcribe", instruction = "", currentAbc = "", previousResponseId } = req.body || {};
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "A resized image data URL is required." });
  }
  if (!["transcribe", "verify"].includes(mode)) {
    return res.status(400).json({ error: "Unknown mode." });
  }

  const body = {
    model: "gpt-6-astra",
    reasoning: { effort: mode === "verify" ? "high" : "medium" },
    store: true,
    max_output_tokens: 12000,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: promptFor(mode, instruction, currentAbc) },
          { type: "input_image", image_url: imageDataUrl, detail: "high" }
        ]
      }
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "score_reconstruction",
        strict: true,
        schema: SCORE_SCHEMA
      }
    }
  };

  if (previousResponseId && typeof previousResponseId === "string") {
    body.previous_response_id = previousResponseId;
  }

  try {
    const openai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await openai.json();
    if (!openai.ok) {
      const message = payload?.error?.message || `OpenAI request failed (${openai.status}).`;
      return res.status(openai.status).json({ error: message, detail: payload?.error?.code || null });
    }

    const raw = extractOutputText(payload);
    if (!raw) return res.status(502).json({ error: "Astra returned no structured text output." });

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "Astra output could not be parsed as JSON.", raw: raw.slice(0, 1000) });
    }

    return res.status(200).json({
      responseId: payload.id,
      result,
      model: payload.model,
      usage: payload.usage || null
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
