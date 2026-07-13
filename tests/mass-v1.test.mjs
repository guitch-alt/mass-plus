import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\ninit\(\);\s*$/, "");
const foods = JSON.parse(fs.readFileSync(new URL("../data/aliments-fr.json", import.meta.url), "utf8"));

const testCode = `
baseFoods = ${JSON.stringify(foods)}.map(normalizeFoodRecord);
state = emptyState();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
  "beurre demi sel": "Beurre demi-sel"
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

const samples = [
  '{"mealName":"Test","foods":[{"name":"Banane","quantity":"120 g","calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}]}',
  'Voici la réponse:\\n\\\`\\\`\\\`json\\n{"nomRepas":"Test","aliments":[{"nom":"Banane","quantité":"120 g","kcal":"105","protéines":"1,3","glucides":"27","lipides":"0,4",}]}\\n\\\`\\\`\\\`\\nBon appétit',
  'texte avant {"meal":"Test","items":[{"food":"Tomate","amount":"80 g","energy":"14","proteins":"0,7 g","carbs":"2,1","fats":"0,2"}]} texte après',
  '{"mealName":"Test","foods":[{"name":"Avocat","quantity":"100 g","calories":160,"protein":2,"carbohydrates":9,"lipids":15}]}'
];
for (const sample of samples) {
  const parsed = extractAndParseAIResponse(sample);
  assert(parsed.foods.length > 0, "Import IA sans aliment");
}

const matchedImport = extractAndParseAIResponse('{"mealName":"Test","foods":[{"name":"banane mûre","quantity":"120 g","calories":105,"protein":1.3,"carbohydrates":27,"fat":0.4}]}');
assert(matchedImport.foods[0].localFoodId === "banane", "Correspondance IA locale échouée");

let ambiguousRejected = false;
try {
  extractAndParseAIResponse('{"mealName":"Un","foods":[{"name":"Banane","quantity":"100 g","calories":92,"protein":1.1,"carbohydrates":20,"fat":0.3}]} {"mealName":"Deux","foods":[{"name":"Skyr","quantity":"100 g","calories":60,"protein":10,"carbohydrates":4,"fat":0.2}]}');
} catch (error) {
  ambiguousRejected = /plusieurs|ambigu/i.test(error.message);
}
assert(ambiguousRejected, "Un import IA ambigu devrait être refusé");

const fallback = parseNutritionTextFallback("Banane — 120 g — 105 kcal — 1,3 g protéines — 27 g glucides — 0,4 g lipides");
assert(fallback.foods[0].name === "Banane" && fallback.foods[0].kcal === 105, "Fallback texte échoué");

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
  window: { addEventListener: () => undefined },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  setTimeout,
  clearTimeout,
  URL,
  fetch: async () => ({ ok: false, json: async () => ({}) })
};

vm.runInNewContext(`${app}\n${testCode}`, context, { timeout: 5000 });
console.log("Tests Mass+ V1.1.0 OK");
