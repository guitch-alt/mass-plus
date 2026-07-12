const defaultAllowedOrigins = [
  "https://guitch-alt.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8090",
  "http://127.0.0.1:8090"
];

function allowedOrigins() {
  return (Deno.env.get("MASS_PLUS_ALLOWED_ORIGINS") || defaultAllowedOrigins.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const origins = allowedOrigins();
  const allowedOrigin = origins.includes(origin) ? origin : origins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function originAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins().includes(origin);
}

const mealSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mealTitle", "foods", "totalEstimatedCalories", "totalEstimatedProteinGrams", "totalEstimatedCarbohydrateGrams", "totalEstimatedFatGrams", "analysisWarnings"],
  properties: {
    mealTitle: { type: "string" },
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimatedQuantityGrams", "estimatedCalories", "estimatedProteinGrams", "estimatedCarbohydrateGrams", "estimatedFatGrams", "confidence", "needsConfirmation"],
        properties: {
          name: { type: "string" },
          estimatedQuantityGrams: { type: "number", minimum: 0 },
          estimatedCalories: { type: "number", minimum: 0 },
          estimatedProteinGrams: { type: "number", minimum: 0 },
          estimatedCarbohydrateGrams: { type: "number", minimum: 0 },
          estimatedFatGrams: { type: "number", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          needsConfirmation: { type: "boolean" }
        }
      }
    },
    totalEstimatedCalories: { type: "number", minimum: 0 },
    totalEstimatedProteinGrams: { type: "number", minimum: 0 },
    totalEstimatedCarbohydrateGrams: { type: "number", minimum: 0 },
    totalEstimatedFatGrams: { type: "number", minimum: 0 },
    analysisWarnings: { type: "array", items: { type: "string" } }
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (!originAllowed(request)) return json(request, { error: "origin_not_allowed", code: "origin_not_allowed" }, 403);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed", code: "method_not_allowed" }, 405);

  let body: { imageBase64?: string; meal?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid_json", code: "invalid_json" }, 400);
  }

  const imageMatch = body.imageBase64?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!imageMatch) return json(request, { error: "missing_or_unsupported_image", code: "missing_or_unsupported_image" }, 400);
  const estimatedBytes = Math.floor(imageMatch[2].length * 0.75);
  if (estimatedBytes > 4_500_000) return json(request, { error: "image_too_large", code: "image_too_large" }, 413);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("Meal analysis unavailable: OPENAI_API_KEY missing");
    return json(request, { error: "missing_api_key", code: "missing_api_key" }, 503);
  }
  if (Deno.env.get("MEAL_ANALYSIS_DEMO") === "true") {
    console.error("Meal analysis disabled: MEAL_ANALYSIS_DEMO=true");
    return json(request, { error: "analysis_demo_disabled", code: "analysis_demo_disabled" }, 503);
  }

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-5.4-mini";
  const prompt = `Tu analyses une photo réelle de repas pour l'application Mass+.

Identifie uniquement les aliments réellement visibles et réponds en français. N'invente jamais d'ingrédient invisible et ne complète jamais la liste jusqu'à un nombre fixe. Si un seul aliment est visible, retourne un seul aliment. Si aucune nourriture n'est visible, retourne foods vide et explique-le dans analysisWarnings.

Pour chaque aliment visible :
- utilise un nom simple en français ;
- estime la quantité, les calories et les macros de cet aliment ;
- mets confidence entre 0 et 1 et needsConfirmation à true ;
- distingue une banane de plusieurs bananes, des courgettes, du pain, une boisson et les composants visibles d'une assiette composée.

Les quantités sont des estimations visuelles : ne prétends jamais connaître exactement le poids sans repère. Pour plusieurs unités, reflète leur nombre dans le nom ou mealTitle et dans la quantité totale. Pour un paquet ou une étiquette lisible, utilise uniquement les informations visibles. Pour une image floue, ambiguë ou non alimentaire, signale clairement l'incertitude dans analysisWarnings et réduis la confiance, ou retourne foods vide. analysisWarnings doit toujours rappeler que les quantités sont des estimations visuelles.

Repas déclaré : ${body.meal || "repas"}. Date : ${body.date || "inconnue"}.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
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
        },
        max_output_tokens: 1800
      }),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    console.error("OpenAI meal analysis request failed", timedOut ? "timeout" : error);
    return json(request, { error: timedOut ? "ai_timeout" : "ai_network_error", code: timedOut ? "ai_timeout" : "ai_network_error" }, timedOut ? 504 : 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("OpenAI meal analysis failed", upstream.status, detail.slice(0, 800));
    if (upstream.status === 429) return json(request, { error: "ai_quota_exceeded", code: "ai_quota_exceeded" }, 429);
    if (upstream.status === 401 || upstream.status === 403) return json(request, { error: "ai_auth_error", code: "ai_auth_error" }, 503);
    return json(request, { error: "ai_service_error", code: "ai_service_error" }, 503);
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    return json(request, { error: "invalid_model_json", code: "invalid_model_json" }, 422);
  }
  const outputText = result.output_text || extractOutputText(result);
  if (!outputText) {
    console.error("OpenAI meal analysis returned empty output", JSON.stringify(result).slice(0, 800));
    return json(request, { error: "empty_ai_response", code: "empty_ai_response" }, 503);
  }

  try {
    return json(request, validateAnalysis(JSON.parse(outputText)));
  } catch (error) {
    console.error("OpenAI meal analysis invalid JSON", error, outputText.slice(0, 800));
    return json(request, { error: "invalid_model_json", code: "invalid_model_json" }, 422);
  }
});

function validateAnalysis(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("analysis_not_object");
  const data = value as Record<string, unknown>;
  const foods = Array.isArray(data.foods) ? data.foods.map(validateFood).slice(0, 16) : [];
  const totals = foods.reduce((sum, food) => ({
    calories: sum.calories + food.estimatedCalories,
    protein: sum.protein + food.estimatedProteinGrams,
    carbs: sum.carbs + food.estimatedCarbohydrateGrams,
    fat: sum.fat + food.estimatedFatGrams
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const warnings = stringArray(data.analysisWarnings);
  return {
    mealTitle: String(data.mealTitle || (foods.length ? "Repas analysé" : "Aucun aliment détecté")).trim(),
    foods,
    totalEstimatedCalories: round1(totals.calories),
    totalEstimatedProteinGrams: round1(totals.protein),
    totalEstimatedCarbohydrateGrams: round1(totals.carbs),
    totalEstimatedFatGrams: round1(totals.fat),
    analysisWarnings: warnings.length ? warnings : ["Les quantités sont des estimations visuelles."]
  };
}

function validateFood(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("food_not_object");
  const food = value as Record<string, unknown>;
  const name = String(food.name || "").trim();
  const grams = positiveNumber(food.estimatedQuantityGrams);
  if (!name || !grams) throw new Error("bad_food_identity");
  return {
    name,
    estimatedQuantityGrams: grams,
    estimatedCalories: nonNegativeNumber(food.estimatedCalories),
    estimatedProteinGrams: nonNegativeNumber(food.estimatedProteinGrams),
    estimatedCarbohydrateGrams: nonNegativeNumber(food.estimatedCarbohydrateGrams),
    estimatedFatGrams: nonNegativeNumber(food.estimatedFatGrams),
    confidence: clamp01(Number(food.confidence || 0)),
    needsConfirmation: true
  };
}

function positiveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? round1(number) : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 16) : [];
}

function extractOutputText(result: any): string {
  return (result.output || [])
    .flatMap((item: any) => item.content || [])
    .map((content: any) => content.text || "")
    .join("")
    .trim();
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" }
  });
}
