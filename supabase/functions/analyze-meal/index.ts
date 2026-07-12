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
  required: ["analysis_status", "meal_description", "foods", "hidden_ingredients_warning", "general_confidence"],
  properties: {
    analysis_status: { type: "string", enum: ["success", "no_food_detected", "uncertain"] },
    meal_description: { type: "string" },
    hidden_ingredients_warning: { type: "array", items: { type: "string" } },
    general_confidence: { type: "number", minimum: 0, maximum: 1 },
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimated_quantity_g", "estimated_quantity_min_g", "estimated_quantity_max_g", "estimated_count", "confidence", "visible_state", "needs_confirmation", "uncertainties"],
        properties: {
          name: { type: "string" },
          estimated_quantity_g: { type: "number" },
          estimated_quantity_min_g: { type: "number" },
          estimated_quantity_max_g: { type: "number" },
          estimated_count: { type: "number" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          visible_state: { type: "string" },
          needs_confirmation: { type: "boolean" },
          uncertainties: { type: "array", items: { type: "string" } }
        }
      }
    }
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

  if (!body.imageBase64?.startsWith("data:image/")) {
    return json(request, { error: "missing_image", code: "missing_image" }, 400);
  }
  if (body.imageBase64.length > 6_500_000) {
    return json(request, { error: "image_too_large", code: "image_too_large" }, 413);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("Meal analysis unavailable: OPENAI_API_KEY missing");
    return json(request, { error: "missing_api_key", code: "missing_api_key" }, 503);
  }
  if (Deno.env.get("MEAL_ANALYSIS_DEMO") === "true") {
    console.error("Meal analysis disabled: MEAL_ANALYSIS_DEMO=true");
    return json(request, { error: "analysis_demo_disabled", code: "analysis_demo_disabled" }, 503);
  }

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-5.6";
  const prompt = `Tu analyses une photo réelle de repas pour l'application Mass+.

Étape 1 reconnaissance visuelle : identifie uniquement les aliments clairement visibles. N'invente aucun aliment pour remplir une liste. Si un seul aliment est visible, retourne un seul aliment. Si rien ne ressemble à de la nourriture, analysis_status doit être no_food_detected et foods doit être vide.

Pour chaque aliment visible :
- nom français singulier et simple, par exemple Banane, Courgette, Riz cuit ;
- état visible : cru, cuit, entier, découpé, épluché, avec peau, etc. ;
- estimated_count si l'aliment est comptable, sinon 0 ;
- estimated_quantity_min_g, estimated_quantity_max_g et estimated_quantity_g. Pour une plage honnête, mets la médiane dans estimated_quantity_g ;
- confidence entre 0 et 1 ;
- needs_confirmation toujours true ;
- uncertainties avec les limites réelles de la photo.

Exemples : photo de bananes => seulement Banane. Photo de courgettes découpées => seulement Courgette. Photo floue ou ambiguë => confidence basse ou foods vide, sans aliment inventé.

Ne calcule pas les calories. Le frontend Mass+ fera les macros avec sa banque locale. Repas déclaré : ${body.meal || "repas"}. Date : ${body.date || "inconnue"}.`;

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
          name: "meal_photo_visual_analysis",
          strict: true,
          schema: mealSchema
        }
      }
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("OpenAI meal analysis failed", upstream.status, detail.slice(0, 800));
    return json(request, { error: "ai_service_error", code: "ai_service_error" }, 503);
  }

  const result = await upstream.json();
  const outputText = result.output_text || extractOutputText(result);
  if (!outputText) {
    console.error("OpenAI meal analysis returned empty output", JSON.stringify(result).slice(0, 800));
    return json(request, { error: "empty_ai_response", code: "empty_ai_response" }, 503);
  }

  try {
    const parsed = validateAnalysis(JSON.parse(outputText));
    return json(request, parsed);
  } catch (error) {
    console.error("OpenAI meal analysis invalid JSON", error, outputText.slice(0, 800));
    return json(request, { error: "invalid_model_json", code: "invalid_model_json" }, 422);
  }
});

function validateAnalysis(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("analysis_not_object");
  const data = value as Record<string, unknown>;
  const status = String(data.analysis_status || "");
  if (!["success", "no_food_detected", "uncertain"].includes(status)) throw new Error("bad_status");
  const foods = Array.isArray(data.foods) ? data.foods.map(validateFood).slice(0, 16) : [];
  if (status === "success" && foods.length === 0) throw new Error("success_without_foods");
  return {
    analysis_status: status,
    meal_description: String(data.meal_description || "").trim(),
    foods,
    hidden_ingredients_warning: stringArray(data.hidden_ingredients_warning),
    general_confidence: clamp01(Number(data.general_confidence || 0))
  };
}

function validateFood(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("food_not_object");
  const food = value as Record<string, unknown>;
  const name = String(food.name || "").trim();
  const grams = positiveNumber(food.estimated_quantity_g);
  const min = positiveNumber(food.estimated_quantity_min_g);
  const max = positiveNumber(food.estimated_quantity_max_g);
  if (!name || !grams) throw new Error("bad_food_identity");
  return {
    name,
    estimated_quantity_g: grams,
    estimated_quantity_min_g: min || grams,
    estimated_quantity_max_g: max || grams,
    estimated_count: Math.max(0, Number(food.estimated_count || 0)),
    confidence: clamp01(Number(food.confidence || 0)),
    visible_state: String(food.visible_state || "").trim(),
    needs_confirmation: food.needs_confirmation !== false,
    uncertainties: stringArray(food.uncertainties)
  };
}

function positiveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
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
