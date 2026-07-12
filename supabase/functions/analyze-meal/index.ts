const defaultAllowedOrigins = [
  "https://guitch-alt.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = (Deno.env.get("MASS_PLUS_ALLOWED_ORIGINS") || defaultAllowedOrigins.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function originAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowedOrigins = (Deno.env.get("MASS_PLUS_ALLOWED_ORIGINS") || defaultAllowedOrigins.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowedOrigins.includes(origin);
}

const mealSchema = {
  type: "object",
  additionalProperties: false,
  required: ["demo", "provider", "foods", "unconfirmedIngredients", "note"],
  properties: {
    demo: { type: "boolean" },
    provider: { type: "string" },
    note: { type: "string" },
    unconfirmedIngredients: { type: "array", items: { type: "string" } },
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimatedGrams", "kcal", "protein", "carbs", "fat", "confidence", "unconfirmedIngredients"],
        properties: {
          name: { type: "string" },
          estimatedGrams: { type: "number" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          unconfirmedIngredients: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (!originAllowed(request)) return json(request, { error: "Origin not allowed" }, 403);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  let body: { imageBase64?: string; meal?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON" }, 400);
  }

  if (!body.imageBase64?.startsWith("data:image/")) {
    return json(request, { error: "Missing imageBase64 data URL" }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const forceDemo = Deno.env.get("MEAL_ANALYSIS_DEMO") === "true";
  if (!apiKey || forceDemo) return json(request, demoAnalysis(body.meal || "repas"));

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-5.6";
  const prompt = `Analyse cette photo de repas (${body.meal || "repas"}, date ${body.date || "inconnue"}). Réponds uniquement au JSON du schéma. Estime chaque aliment visible, les grammes et les macros totales estimées. Signale les huiles, sauces et ingrédients cachés dans unconfirmedIngredients.`;

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: body.imageBase64 }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "meal_photo_analysis",
          strict: true,
          schema: mealSchema
        }
      }
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("OpenAI meal analysis failed", upstream.status, detail.slice(0, 500));
    return json(request, { error: "Analysis service unavailable" }, 503);
  }

  const result = await upstream.json();
  const outputText = result.output_text || extractOutputText(result);
  if (!outputText) return json(request, { error: "Empty model response" }, 503);

  try {
    const parsed = JSON.parse(outputText);
    return json(request, parsed);
  } catch {
    return json(request, { error: "Invalid model JSON" }, 503);
  }
});

function extractOutputText(result: any): string {
  return (result.output || [])
    .flatMap((item: any) => item.content || [])
    .map((content: any) => content.text || "")
    .join("")
    .trim();
}

function demoAnalysis(meal: string) {
  return {
    demo: true,
    provider: "supabase-edge-demo",
    note: `Mode démonstration pour ${meal}. Aucun appel OpenAI effectué car OPENAI_API_KEY est absent ou MEAL_ANALYSIS_DEMO=true.`,
    unconfirmedIngredients: ["huile", "sauce", "assaisonnement"],
    foods: [
      { name: "riz cuit", estimatedGrams: 180, kcal: 234, protein: 4.9, carbs: 50.4, fat: 0.5, confidence: 0.72, unconfirmedIngredients: ["huile éventuelle"] },
      { name: "poulet", estimatedGrams: 120, kcal: 198, protein: 37.2, carbs: 0, fat: 4.3, confidence: 0.68, unconfirmedIngredients: ["sauce"] },
      { name: "légumes", estimatedGrams: 90, kcal: 45, protein: 2.1, carbs: 8.5, fat: 0.5, confidence: 0.54, unconfirmedIngredients: [] }
    ]
  };
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" }
  });
}
