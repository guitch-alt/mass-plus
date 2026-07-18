import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\ninit\(\);\s*$/, "");
const foods = JSON.parse(fs.readFileSync(new URL("../data/aliments-fr.json", import.meta.url), "utf8"));
const require = createRequire(import.meta.url);
const MassPlusCore = require("../engagement-core.js");

for (const expected of [
  "Dicter mon repas",
  "window.SpeechRecognition || window.webkitSpeechRecognition",
  'voiceRecognition.lang = "fr-FR"',
  "Je vous écoute… Décrivez votre repas.",
  "Analyser mon repas avec l’IA",
  "navigator.share"
]) {
  if (!app.includes(expected)) throw new Error(`Parcours vocal manquant dans app.js : ${expected}`);
}

const testCode = `
baseFoods = ${JSON.stringify(foods)}.map(normalizeFoodRecord);
state = emptyState();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(baseFoods.length >= 800 && baseFoods.length <= 1200, "La base alimentaire doit contenir entre 800 et 1200 références utiles");
assert(new Set(baseFoods.map((food) => food.id)).size === baseFoods.length, "La base contient des identifiants en double");
assert(new Set(baseFoods.map((food) => normalizeSearchText(food.name))).size === baseFoods.length, "La base contient des noms en double");

const queries = {
  ban: "Banane",
  pou: "Poulet",
  lent: "Lentilles cuites",
  vinaigre: "Vinaigre",
  "vinaigre balsamique": "Vinaigre balsamique",
  concom: "Concombre",
  melon: "Melon",
  tomate: "Tomate",
  tomates: "Tomate",
  "tomates cerises": "Tomates cerises",
  oeufs: "Œufs",
  cafe: "Café",
  "haricot rouge": "Haricots rouges",
  "beurre demi sel": "Beurre demi-sel",
  "petit pain au chocolat": "Petit pain au chocolat",
  "pain chocolat": "Pain au chocolat",
  chocolatine: "Pain au chocolat",
  courgette: "Courgette",
  lentilles: "Lentilles",
  "steak 5": "Steak",
  "cafe au lait": "Café au lait",
  "cafe lait": "Café au lait",
  yahourt: "Yaourt"
};

assert(searchLocalFoods("").length === 0, "La Banque ne doit rien lister sans recherche");
assert(searchLocalFoods("zzzzaliment").length === 0, "La recherche retourne de faux résultats");
assert(searchLocalFoods("a").length <= 20, "La Banque dépasse 20 résultats");
for (const [query, expected] of Object.entries(queries)) {
  const names = searchLocalFoods(query).map((food) => normalizeSearchText(food.name));
  assert(
    names.some((name) => name.includes(normalizeSearchText(expected).split(" ")[0])),
    "Recherche échouée: " + query + " -> " + names.join(", ")
  );
}

assert(localDateKey(new Date(2026, 6, 13, 0, 5)) === "2026-07-13", "Date locale incorrecte à minuit");
assert(addDays("2026-03-29", -1) === "2026-03-28", "Calcul de date incorrect au changement d'heure");
assert(addDays("2026-12-31", 1) === "2027-01-01", "Calcul de date incorrect au changement d'année");
assert(isDateKey("2026-02-28"), "Une date valide est refusée");
assert(!isDateKey("2026-02-30"), "Une date impossible est acceptée");

const calculated = calc({
  kcalPer100g: 230,
  proteinPer100g: 8,
  carbsPer100g: 45,
  fatPer100g: 2
}, 90);
assert(calculated.kcal === 207, "Calcul kcal pour 90 g incorrect");
assert(calculated.protein === 7.2, "Calcul protéines pour 90 g incorrect");
const calculatedMl = calc(normalizeFoodRecord({
  id: "drink", name: "Boisson test", referenceQuantity: 100, referenceUnit: "ml",
  calories: 60, protein: 3, carbohydrates: 5, fat: 3, defaultPortion: 250
}), 250);
assert(calculatedMl.kcal === 150 && calculatedMl.protein === 7.5, "Calcul pour millilitres incorrect");
const calculatedUnits = calc(normalizeFoodRecord({
  id: "unit", name: "Unité test", referenceQuantity: 1, referenceUnit: "unité",
  calories: 210, protein: 5, carbohydrates: 24, fat: 10, defaultPortion: 1
}), 2);
assert(calculatedUnits.kcal === 420 && calculatedUnits.protein === 10, "Calcul par unité incorrect");
assert(parseUserNumber("1,5") === 1.5, "La virgule française n'est pas acceptée");
assert(!Number.isFinite(checkedQuantity("", "g", false)), "Une quantité vide devrait être refusée");
assert(!Number.isFinite(checkedQuantity("-2", "g", false)), "Une quantité négative devrait être refusée");
assert(checkedQuantity("6000", "g", false) === 6000, "Une quantité élevée confirmable ne doit pas être bloquée");

const samples = [
  '{"mealName":"Test","foods":[{"name":"Banane","quantity":"120 g","calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}],"totals":{"calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}}',
  'Voici la réponse:\\n\\\`\\\`\\\`json\\n{"nomRepas":"Test","aliments":[{"nom":"Banane","quantité":"120 g","kcal":"105","protéines":"1,3","glucides":"27","lipides":"0,4",}],"totaux":{"kcal":"105","protéines":"1,3","glucides":"27","lipides":"0,4"}}\\n\\\`\\\`\\\`\\nBon appétit',
  'texte avant {"meal":"Test","items":[{"food":"Tomate","amount":"80 g","energy":"14","proteins":"0,7 g","carbs":"2,1","fats":"0,2"}],"total":{"energy":14,"proteins":0.7,"carbs":2.1,"fats":0.2}} texte après',
  '{"mealName":"Test","foods":[{"name":"Avocat","quantity":"100 g","calories":160,"protein":2,"carbohydrates":9,"lipids":15}],"totals":{"calories":160,"protein":2,"carbohydrates":9,"lipids":15}}',
  '{"mealName":"Test","foods":[{"name":"Yaourt grec","quantity":150,"unit":"g","calories":180,"protein":9,"carbs":7,"fat":12,"confidence":"low","uncertainty":"Pot peu visible"}],"generalWarning":"À vérifier"}'
];
for (const sample of samples) {
  const parsed = extractAndParseAIResponse(sample);
  assert(parsed.foods.length > 0, "Import IA sans aliment");
  assert(parsed.mealName === "Test", "Le nom du repas n'est pas conservé");
  assert(typeof parsed.totals.kcal === "number", "Les totaux ne sont pas validés");
}

let missingMealNameRejected = false;
try {
  extractAndParseAIResponse('{"foods":[{"name":"Banane","quantity":"120 g","calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}],"totals":{"calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}}');
} catch {
  missingMealNameRejected = true;
}
assert(missingMealNameRejected, "Un repas sans mealName devrait être refusé");

const withoutTotals = extractAndParseAIResponse('{"mealName":"Test","foods":[{"name":"Banane","quantity":120,"unit":"g","calories":105,"protein":1.3,"carbs":27,"fat":0.4,"confidence":"medium"}]}');
assert(withoutTotals.totals.kcal === 105, "Les totaux absents devraient être recalculés");
assert(withoutTotals.foods[0].quantityLabel === "120 g", "La quantité et son unité ne sont pas normalisées");

let invalidNutritionRejected = false;
try {
  extractAndParseAIResponse('{"mealName":"Test","foods":[{"name":"Banane","quantity":"120 g","calories":"inconnu","protein":1.3,"carbohydrates":27,"fat":0.4}],"totals":{"calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}}');
} catch {
  invalidNutritionRejected = true;
}
assert(invalidNutritionRejected, "Une valeur nutritionnelle non numérique devrait être refusée");

const matchedImport = extractAndParseAIResponse('{"mealName":"Test","foods":[{"name":"banane mûre","quantity":"120 g","calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}],"totals":{"calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}}');
assert(matchedImport.foods[0].localFoodId === "banane", "Correspondance IA locale échouée");

let ambiguousRejected = false;
try {
  extractAndParseAIResponse('{"mealName":"Un","foods":[{"name":"Banane","quantity":"100 g","calories":92,"protein":1.1,"carbohydrates":20,"fat":0.3}],"totals":{"calories":92,"protein":1.1,"carbohydrates":20,"fat":0.3}} {"mealName":"Deux","foods":[{"name":"Skyr","quantity":"100 g","calories":60,"protein":10,"carbohydrates":4,"fat":0.2}],"totals":{"calories":60,"protein":10,"carbohydrates":4,"fat":0.2}}');
} catch (error) {
  ambiguousRejected = /plusieurs|ambigu/i.test(error.message);
}
assert(ambiguousRejected, "Un import IA ambigu devrait être refusé");

const fallback = parseNutritionTextFallback("Banane — 120 g — 105 kcal — 1,3 g protéines — 27 g glucides — 0,4 g lipides");
assert(fallback.foods[0].name === "Banane" && fallback.foods[0].kcal === 105, "Fallback texte échoué");

const voiceDescription = "Deux tartines avec du beurre, un skyr et une banane.";
const voicePrompt = buildVoiceAiPrompt(voiceDescription);
assert(voicePrompt.includes(voiceDescription), "La dictée manque dans le prompt vocal");
assert(voicePrompt.includes("unique objet JSON valide"), "Le prompt vocal ne demande pas un JSON unique");
assert(voicePrompt.includes("commençant exactement par \\\`\\\`\\\`json et se terminant par \\\`\\\`\\\`"), "Le prompt vocal n'impose pas un bloc JSON copiable");
assert(voicePrompt.includes("n’écris aucun texte avant le bloc de code"), "Le prompt vocal autorise du texte avant le JSON");
assert(voicePrompt.includes("n’écris aucun texte après le bloc de code"), "Le prompt vocal autorise du texte après le JSON");
assert(voicePrompt.includes("N'invente aucun aliment"), "Le prompt vocal autorise des aliments inventés");
assert(voicePrompt.includes("estimation raisonnable et prudente"), "Le prompt vocal ne gère pas les quantités imprécises");
for (const field of ["mealName", "foods", "quantity", "unit", "calories", "protein", "carbs", "fat", "confidence", "uncertainty", "generalWarning"]) {
  assert(voicePrompt.includes('"' + field + '"'), "Champ JSON vocal manquant : " + field);
}
assert(MASS_PLUS_AI_PROMPT.includes(AI_JSON_FORMAT_INSTRUCTIONS), "Le prompt photo n'utilise pas les instructions JSON communes");
assert(voicePrompt.includes(AI_JSON_FORMAT_INSTRUCTIONS), "Le prompt vocal n'utilise pas les instructions JSON communes");
assert(MASS_PLUS_AI_PROMPT.includes("Ne suppose jamais automatiquement"), "Le prompt photo autorise des ingrédients cachés");
assert(AI_JSON_FORMAT_INSTRUCTIONS.includes('"confidence": "medium"'), "Le niveau de confiance manque");
assert(PHOTO_ANALYSIS_DISCLAIMER.includes("Analyse estimée par une IA"), "L'avertissement IA manque");

const legacyMeal = {
  id: "legacy-test",
  name: "Test",
  meal: "petit déjeuner",
  items: [{ food: "pain-au-levain", name: "Pain au levain", grams: 90, kcal: 230, protein: 8, carbs: 45, fat: 2 }]
};
state.favorites = [legacyMeal];
state.migrations = {};
assert(migrateSavedMealsToRecipeFavorites(state), "Migration initiale non détectée");
assert(state.favorites.length === 1 && state.favorites[0].itemType === "savedMeal", "Migration du repas enregistré incorrecte");
assert(!migrateSavedMealsToRecipeFavorites(state), "Migration non idempotente");
assert(state.favorites.length === 1, "Migration duplique les repas");

state = emptyState();
state.profile = { ...state.profile, firstName: "Test", height: 165, currentWeight: 52, targetWeight: 58 };
state.entries = [{
  id: "entry-1", date: "2026-07-13", meal: "déjeuner", food: "pain-au-levain", name: "Pain au levain",
  grams: 90, kcal: 207, protein: 7.2, carbs: 40.5, fat: 1.8, createdAt: "2026-07-13T10:00:00.000Z"
}];
state.weights = [{ id: "weight-1", date: "2026-07-13", weight: 52, createdAt: "2026-07-13T08:00:00.000Z" }];
state.favorites = [{ ...legacyMeal, itemType: "savedMeal" }];
state.customFoods = [{
  id: "custom-test", name: "Test maison", kcalPer100g: 300, proteinPer100g: 10,
  carbsPer100g: 40, fatPer100g: 12, defaultPortion: 100, source: "custom"
}];
state.untrackedDays = ["2026-07-12"];

const backup = buildBackupPayload(state);
const restored = validateBackupPayload(backup).state;
assert(restored.profile.firstName === "Test", "Le profil n'est pas restauré");
assert(restored.entries.length === 1 && restored.entries[0].grams === 90, "Le journal n'est pas restauré");
assert(restored.weights.length === 1, "Le poids n'est pas restauré");
assert(restored.favorites.length === 1, "Le repas enregistré n'est pas restauré");
assert(restored.customFoods.length === 1, "L'aliment personnalisé n'est pas restauré");
assert(restored.untrackedDays[0] === "2026-07-12", "Le jour non suivi n'est pas restauré");

const incoming = cloneState(restored);
incoming.entries.push({
  id: "entry-2", date: "2026-07-14", meal: "dîner", foodId: "banane", name: "Banane",
  grams: 120, kcal: 110, protein: 1.3, carbs: 24, fat: 0.4
});
const merged = mergeRestoredState(restored, incoming);
assert(merged.entries.length === 2, "La fusion n'ajoute pas les nouvelles entrées");
assert(merged.entries.filter((entry) => entry.id === "entry-1").length === 1, "La fusion duplique une entrée existante");
assert(merged.profile.firstName === "Test", "La fusion ne conserve pas le profil actuel");

let invalidBackupRejected = false;
try {
  validateBackupPayload({ backupFormat: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, data: { entries: [{ date: "non-date" }] } });
} catch {
  invalidBackupRejected = true;
}
assert(invalidBackupRejected, "Une sauvegarde invalide devrait être refusée");

let missingDateRejected = false;
try {
  validateBackupPayload({ backupFormat: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, data: { profile: {}, entries: [{ id: "entry-without-date" }] } });
} catch {
  missingDateRejected = true;
}
assert(missingDateRejected, "Une entrée sans date devrait être refusée");

state.weights = [
  { id: "w1", date: "2026-07-01", weight: 50 },
  { id: "w2", date: "2026-07-10", weight: 51 },
  { id: "w3", date: "2026-07-13", weight: 52 }
];
const stats = weightStats();
assert(stats.totalChange === 2, "Évolution totale du poids incorrecte");
assert(stats.average7 === 51.5, "Moyenne de poids sur 7 jours incorrecte");
`;

const storage = new Map();
let id = 0;
const context = {
  console,
  Intl,
  crypto: { randomUUID: () => `test-id-${++id}` },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  },
  indexedDB: {},
  navigator: { onLine: true },
  window: { addEventListener: () => undefined, MassPlusCore },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  setTimeout,
  clearTimeout,
  URL,
  fetch: async () => ({ ok: false, json: async () => ({}) })
};

vm.runInNewContext(`${app}\n${testCode}`, context, { timeout: 5000 });
console.log("Tests Mass+ V1.4.0 OK");
