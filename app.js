"use strict";

const APP_VERSION = "0.4.5";
const STORAGE_KEY = "mass-plus-state-v2";
const LEGACY_KEYS = ["mass-plus-mvp-v1", "mass-plus-state"];
const DB_NAME = "mass-plus-local";
const DB_VERSION = 1;
const PHOTO_DB = "mass-plus-photos";
const PHOTO_STORE = "photos";
const MEALS = ["petit déjeuner", "déjeuner", "collation", "dîner", "autre"];
const MEAL_TYPES = {
  "petit déjeuner": "breakfast",
  "déjeuner": "lunch",
  "collation": "snack",
  "dîner": "dinner",
  autre: "snack"
};
const NAV = [
  ["home", "Journal", "⌂"],
  ["journal", "Banque", "▦"],
  ["add", "Ajouter", "+"],
  ["recipes", "Recettes", "□"],
  ["profile", "Profil", "◎"]
];
const EXTRA_SCREENS = ["weight", "photo"];
const ACTIVITY_FACTORS = { faible: 1.2, "légère": 1.375, "modérée": 1.55, "élevée": 1.725 };
const PROTEIN_FACTORS = { faible: 1.2, "légère": 1.4, "modérée": 1.6, "élevée": 1.8 };
const EXCLUSION_OPTIONS = ["lactose", "gluten", "œufs", "arachides", "fruits à coque", "soja", "poisson", "végétarien", "aucune"];
const QUICK_SNACK_IDS = ["skyr", "banane", "amandes", "lait-entier", "pain", "beurre-cacahuete", "fromage", "compote", "oeufs", "avocat"];
const OFF_FIELDS = "code,product_name,product_name_fr,generic_name,brands,quantity,serving_size,nutriments,image_front_small_url,countries_tags";
const PHOTO_ANALYSIS_ENDPOINT_KEY = "mass-plus-analysis-endpoint";
const PHOTO_ANALYSIS_MODE_KEY = "mass-plus-analysis-mode";
const PHOTO_ANALYSIS_DISCLAIMER = "Estimation à confirmer : une photo ne permet pas de connaître précisément les quantités, les huiles, sauces ou ingrédients cachés.";
const PHOTO_ANALYSIS_NOT_CONFIGURED = "Analyse IA non configurée. La photo est enregistrée, mais elle n’a pas été analysée. Configurez le service d’analyse ou utilisez la saisie manuelle.";
const PHOTO_ANALYSIS_TIMEOUT_MS = 45000;
const SEARCH_ALIASES = {
  "sucre en morceau": ["sucre en morceaux", "sucre blanc"],
  "morceau de sucre": ["sucre en morceaux", "sucre blanc"],
  "sucre morceaux": ["sucre en morceaux", "sucre blanc"],
  "carre de sucre": ["sucre en morceaux", "sucre blanc"],
  "sucre cafe": ["sucre en morceaux", "café avec un sucre", "café avec deux sucres"],
  "beurre sale": ["beurre demi sel", "beurre demi-sel"],
  "beurre demi sel": ["beurre demi-sel"],
  "beurre demi-sel": ["beurre demi-sel"],
  baguette: ["baguette courante", "pain baguette"],
  lait: ["lait entier", "lait demi ecreme", "lait demi-écrémé"],
  cafe: ["café noir", "café filtre", "café expresso"],
  "tasse cafe": ["café noir", "café filtre"],
  "tasse de cafe": ["café noir", "café filtre"],
  "cafe noir": ["café noir", "café filtre"],
  expresso: ["café expresso", "espresso"],
  espresso: ["café expresso"],
  eau: ["eau du robinet", "eau plate", "eau gazeuse"],
  "verre eau": ["eau du robinet", "eau plate"],
  "verre d eau": ["eau du robinet", "eau plate"],
  "eau robinet": ["eau du robinet"],
  "eau gazeuse": ["eau gazeuse"]
};

let baseFoods = [];
let recipes = [];
let tips = [];
let currentScreen = "home";
let selectedMeal = "petit déjeuner";
let selectedDate = "";
let recipesTab = "recipes";
let quickCoffeePanel = false;
let searchResults = [];
let dbPromise = null;
let selectedPhotoFile = null;
let selectedPhotoPreviewUrl = "";
let photoAnalysisDraft = null;
let photoAnalysisRunning = false;
let photoAnalysisRunToken = 0;
let photoAnalysisDiagnostic = null;
let state = emptyState();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const localDateKey = (date = new Date()) => {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = () => localDateKey();
const addDays = (dateKey, offset) => {
  const [year, month, day] = String(dateKey || today()).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
};
const dateLabel = (dateKey) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dateKey}T12:00:00`));
const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fmt = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value || 0));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
const roundTo = (value, step) => Math.round(Number(value || 0) / step) * step;

function normalizeSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll("œ", "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_']/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(text) {
  return normalizeSearch(text)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token);
}

function expandedQueries(query) {
  const normalized = normalizeSearch(query);
  const aliases = SEARCH_ALIASES[normalized] || [];
  return [normalized, ...aliases.map(normalizeSearch)].filter(Boolean);
}

function emptyState() {
  return {
    version: APP_VERSION,
    profile: {
      firstName: "",
      age: "",
      sex: "Femme",
      height: "",
      currentWeight: "",
      targetWeight: "",
      activity: "modérée",
      goalMode: "auto",
      manualCalories: "",
      manualProtein: "",
      exclusions: [],
      exclusionOther: ""
    },
    entries: [],
    weights: [],
    favorites: [],
    customFoods: [],
    offFoods: [],
    offCache: {},
    recipeFavorites: [],
    recipePhotos: {},
    dailyTip: null,
    hiddenTips: {},
    photos: [],
    pendingPhotoMeal: "déjeuner",
    migrations: {}
  };
}

function openMassDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      [
        ["profile", { keyPath: "id" }],
        ["journalEntries", { keyPath: "id" }],
        ["favorites", { keyPath: "id" }],
        ["customFoods", { keyPath: "id" }],
        ["cachedProducts", { keyPath: "id" }],
        ["savedMeals", { keyPath: "id" }],
        ["recipes", { keyPath: "id" }],
        ["settings", { keyPath: "id" }],
        ["photoAnalyses", { keyPath: "id" }],
        ["weights", { keyPath: "id" }],
        ["meta", { keyPath: "id" }]
      ].forEach(([storeName, options]) => {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, options);
      });
      const journal = request.transaction.objectStore("journalEntries");
      if (!journal.indexNames.contains("date")) journal.createIndex("date", "date", { unique: false });
      if (!journal.indexNames.contains("mealType")) journal.createIndex("mealType", "mealType", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idbGetAll(storeName) {
  const db = await openMassDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetOne(storeName, key) {
  const db = await openMassDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function idbReplaceAll(storeName, records) {
  const db = await openMassDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach((record) => store.put(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPutRecord(storeName, record) {
  const db = await openMassDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function weightRecord(item) {
  return { id: item.id || item.date || id(), date: item.date || today(), weight: Number(item.weight || 0) };
}

function normalizeEntry(entry) {
  const createdAt = entry.createdAt || new Date().toISOString();
  const grams = Number(entry.grams || entry.quantity || 0);
  const meal = entry.meal || mealFromType(entry.mealType) || selectedMeal;
  return {
    id: entry.id || id(),
    date: entry.date || today(),
    meal,
    mealType: entry.mealType || MEAL_TYPES[meal] || "snack",
    foodId: entry.foodId || entry.food || "",
    foodSource: entry.foodSource || normalizeFoodSource(entry.source),
    foodName: entry.foodName || entry.name || "Aliment",
    name: entry.name || entry.foodName || "Aliment",
    quantity: Number(entry.quantity || grams || 0),
    unit: entry.unit || "g",
    grams,
    kcal: Number(entry.kcal || 0),
    protein: Number(entry.protein || 0),
    carbs: Number(entry.carbs || 0),
    fat: Number(entry.fat || 0),
    photoId: entry.photoId || "",
    photoMealId: entry.photoMealId || "",
    analysisId: entry.analysisId || "",
    confidence: Number(entry.confidence || 0) || 0,
    analysisDemo: Boolean(entry.analysisDemo),
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    source: entry.source || sourceLabelFromKey(entry.foodSource)
  };
}

function mealFromType(type) {
  return Object.entries(MEAL_TYPES).find(([, value]) => value === type)?.[0] || "";
}

function normalizeFoodSource(source) {
  const value = normalizeSearch(source);
  if (value.includes("open food")) return "openfoodfacts";
  if (value.includes("ciqual")) return "ciqual";
  if (value.includes("perso") || value.includes("custom")) return "custom";
  if (value.includes("recipe") || value.includes("recette")) return "recipe";
  if (value.includes("estimation") || value.includes("photo") || value.includes("analyse")) return "analysis";
  return "local";
}

function sourceLabelFromKey(source) {
  return {
    ciqual: "Base française CIQUAL",
    openfoodfacts: "Open Food Facts",
    custom: "Aliment personnel",
    recipe: "Recette",
    analysis: "Estimation photo confirmée",
    local: "Base Mass+"
  }[source] || "Base Mass+";
}

async function loadPersistentState() {
  const [profileRecord, settingsRecord, entries, favorites, customFoods, cachedProducts, weights, photos] = await Promise.all([
    idbGetOne("profile", "main"),
    idbGetOne("settings", "main"),
    idbGetAll("journalEntries"),
    idbGetAll("favorites"),
    idbGetAll("customFoods"),
    idbGetAll("cachedProducts"),
    idbGetAll("weights"),
    idbGetAll("photoAnalyses")
  ]);
  const hasIndexedData = Boolean(profileRecord || settingsRecord || entries.length || favorites.length || customFoods.length || cachedProducts.length || weights.length || photos.length);
  if (!hasIndexedData) {
    const migrated = loadState();
    state = migrated;
    await persistState();
    await idbPutRecord("meta", { id: "localStorageMigration", completedAt: new Date().toISOString(), version: APP_VERSION });
    return;
  }
  const next = emptyState();
  next.profile = { ...next.profile, ...(profileRecord?.data || {}) };
  next.entries = entries.map(normalizeEntry).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  next.favorites = favorites.map(normalizeFavorite);
  next.customFoods = customFoods;
  next.offFoods = cachedProducts;
  next.offCache = settingsRecord?.offCache || {};
  next.recipeFavorites = settingsRecord?.recipeFavorites || [];
  next.recipePhotos = settingsRecord?.recipePhotos || {};
  next.dailyTip = settingsRecord?.dailyTip || null;
  next.hiddenTips = settingsRecord?.hiddenTips || {};
  next.photos = photos;
  next.pendingPhotoMeal = settingsRecord?.pendingPhotoMeal || "déjeuner";
  next.migrations = settingsRecord?.migrations || {};
  next.weights = weights.map(weightRecord).sort((a, b) => a.date.localeCompare(b.date));
  const latest = latestWeightFrom(next);
  if (latest) next.profile.currentWeight = latest;
  state = next;
}

function loadState() {
  const fallback = emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return fallback;
    return migrateState(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function migrateState(saved) {
  const next = emptyState();
  const profile = saved.profile || {};
  next.profile = {
    ...next.profile,
    firstName: profile.firstName || "",
    age: profile.age || "",
    sex: profile.sex || "Femme",
    height: profile.height || "",
    currentWeight: profile.currentWeight || "",
    targetWeight: profile.targetWeight || "",
    activity: profile.activity || "modérée",
    goalMode: profile.goalMode || "auto",
    manualCalories: profile.manualCalories || profile.calorieGoal || "",
    manualProtein: profile.manualProtein || profile.proteinGoal || "",
    exclusions: Array.isArray(profile.exclusions) ? profile.exclusions : [],
    exclusionOther: profile.exclusionOther || ""
  };
  next.entries = Array.isArray(saved.entries) ? saved.entries : [];
  next.weights = Array.isArray(saved.weights) ? saved.weights : [];
  next.favorites = Array.isArray(saved.favorites) ? saved.favorites.map(normalizeFavorite) : [];
  next.customFoods = Array.isArray(saved.customFoods) ? saved.customFoods : [];
  next.offFoods = Array.isArray(saved.offFoods) ? saved.offFoods : [];
  next.offCache = saved.offCache || {};
  next.recipeFavorites = Array.isArray(saved.recipeFavorites) ? saved.recipeFavorites : [];
  next.recipePhotos = saved.recipePhotos && typeof saved.recipePhotos === "object" ? saved.recipePhotos : {};
  next.dailyTip = saved.dailyTip || null;
  next.hiddenTips = saved.hiddenTips && typeof saved.hiddenTips === "object" ? saved.hiddenTips : {};
  next.photos = Array.isArray(saved.photos) ? saved.photos : [];
  next.pendingPhotoMeal = saved.pendingPhotoMeal || "déjeuner";
  next.migrations = saved.migrations && typeof saved.migrations === "object" ? saved.migrations : {};
  if (!next.migrations.savedMealsV1) next.migrations.savedMealsV1 = APP_VERSION;
  next.version = APP_VERSION;
  const latest = latestWeightFrom(next);
  if (latest) next.profile.currentWeight = latest;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function normalizeFavorite(favorite) {
  return {
    id: favorite.id || id(),
    name: favorite.name || "Favori",
    meal: favorite.meal || "collation",
    items: (favorite.items || []).map((item) => {
      const food = findFood(item.food || item.foodId, false);
      const grams = Number(item.grams || 0);
      const macros = food ? calc(food, grams) : { kcal: item.kcal || 0, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0 };
      return { food: item.food || item.foodId, name: item.name || food?.name || "Aliment", grams, ...macros };
    })
  };
}

function saveState() {
  state.version = APP_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  persistState().catch(() => toast("Sauvegarde locale indisponible."));
}

async function persistState() {
  state.version = APP_VERSION;
  await Promise.all([
    idbPutRecord("profile", { id: "main", data: state.profile, updatedAt: new Date().toISOString() }),
    idbPutRecord("settings", {
      id: "main",
      version: APP_VERSION,
      offCache: state.offCache || {},
      recipeFavorites: state.recipeFavorites || [],
      recipePhotos: state.recipePhotos || {},
      dailyTip: state.dailyTip || null,
      hiddenTips: state.hiddenTips || {},
      pendingPhotoMeal: state.pendingPhotoMeal || "déjeuner",
      migrations: state.migrations || {},
      updatedAt: new Date().toISOString()
    }),
    idbReplaceAll("journalEntries", state.entries.map(normalizeEntry)),
    idbReplaceAll("favorites", state.favorites.map(normalizeFavorite)),
    idbReplaceAll("savedMeals", state.favorites.map(normalizeFavorite)),
    idbReplaceAll("customFoods", state.customFoods || []),
    idbReplaceAll("cachedProducts", state.offFoods || []),
    idbReplaceAll("weights", (state.weights || []).map(weightRecord)),
    idbReplaceAll("photoAnalyses", state.photos || []),
    idbReplaceAll("recipes", recipes || [])
  ]);
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("visible"), 2400);
}

function latestWeightFrom(source) {
  const sorted = [...(source.weights || [])].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.weight || Number(source.profile?.currentWeight || 0);
}

function latestWeight() {
  return latestWeightFrom(state);
}

function profileNumber(key) {
  return Number(state.profile[key] || 0);
}

function bmiFor(weight = latestWeight()) {
  const height = profileNumber("height") / 100;
  if (!weight || !height) return 0;
  return weight / (height * height);
}

function calculatedGoals() {
  const weight = latestWeight();
  const target = profileNumber("targetWeight");
  const height = profileNumber("height");
  const age = profileNumber("age");
  const activity = state.profile.activity || "modérée";
  const activityFactor = ACTIVITY_FACTORS[activity] || ACTIVITY_FACTORS["modérée"];
  const proteinFactor = PROTEIN_FACTORS[activity] || PROTEIN_FACTORS["modérée"];
  const result = { calories: 0, protein: 0, maintenance: 0, bmr: 0, bmi: bmiFor(weight), targetBmi: bmiFor(target), message: "", warning: "" };
  if (!weight || !height || !age) {
    result.message = "Complète le profil pour calculer automatiquement les objectifs.";
    return result;
  }
  const female = state.profile.sex !== "Homme";
  result.bmr = 10 * weight + 6.25 * height - 5 * age + (female ? -161 : 5);
  result.maintenance = result.bmr * activityFactor;
  let surplus = 0;
  if (target > weight) {
    surplus = result.bmi < 16 ? 300 : result.bmi < 18.5 ? 400 : 300;
    if (result.bmi < 16) result.warning = "IMC très bas : une prise de poids progressive avec accompagnement médical ou diététique est recommandée.";
  } else {
    result.message = "Mass+ est principalement conçu pour accompagner une prise de poids progressive.";
  }
  result.calories = roundTo(result.maintenance + surplus, 50);
  result.protein = roundTo(Math.min((target || weight) * proteinFactor, weight * 2), 5);
  return result;
}

function activeGoals() {
  const auto = calculatedGoals();
  if (state.profile.goalMode === "manual") {
    return {
      ...auto,
      calories: Number(state.profile.manualCalories || auto.calories),
      protein: Number(state.profile.manualProtein || auto.protein),
      message: "Objectif personnalisé."
    };
  }
  return auto;
}

function calc(item, grams) {
  const factor = Number(grams || 0) / 100;
  return {
    kcal: Math.round(Number(item.kcalPer100g || 0) * factor),
    protein: +(Number(item.proteinPer100g || 0) * factor).toFixed(1),
    carbs: +(Number(item.carbsPer100g || 0) * factor).toFixed(1),
    fat: +(Number(item.fatPer100g || 0) * factor).toFixed(1)
  };
}

function defaultPortion(food) {
  return Number(food?.defaultPortionG || food?.portionGrams || 100);
}

function unitLabel(foodOrEntry) {
  return foodOrEntry?.unit || (normalizeSearch(foodOrEntry?.category).includes("boisson") ? "ml" : "g");
}

function totals(entries = dayEntries()) {
  return entries.reduce((sum, entry) => ({
    kcal: sum.kcal + Number(entry.kcal || 0),
    protein: sum.protein + Number(entry.protein || 0),
    carbs: sum.carbs + Number(entry.carbs || 0),
    fat: sum.fat + Number(entry.fat || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function dayEntries(date = selectedDate || today()) {
  return state.entries.filter((entry) => entry.date === date);
}

function allFoods() {
  const custom = state.customFoods.map((food) => ({ ...food, source: "Aliment perso" }));
  const off = state.offFoods.map((food) => ({ ...food, source: "Open Food Facts" }));
  const recipeFoods = recipes.map(recipeAsFood);
  return [...baseFoods, ...custom, ...off, ...recipeFoods];
}

function findFood(foodId, includeAll = true) {
  const list = includeAll ? allFoods() : [...baseFoods, ...state.customFoods, ...state.offFoods];
  return list.find((food) => food.id === foodId);
}

function searchLocalFoods(query) {
  const queries = expandedQueries(query);
  const tokens = searchTokens(query);
  return allFoods()
    .map((food) => {
      const haystack = normalizeSearch([food.name, food.aliases?.join(" "), food.category, food.brands].join(" "));
      const exact = queries.some((q) => haystack.split(" ").join(" ") === q || normalizeSearch(food.name) === q || (food.aliases || []).some((alias) => normalizeSearch(alias) === q));
      const partial = queries.some((q) => q && haystack.includes(q));
      const tokenHits = tokens.filter((part) => haystack.includes(part)).length;
      const favoriteBoost = state.favorites.some((favorite) => favorite.items?.some((item) => item.food === food.id)) ? 25 : 0;
      const score = !queries[0] ? 1 : exact ? 220 + favoriteBoost : partial ? 140 + favoriteBoost : tokenHits * 28 + favoriteBoost;
      return { ...food, score };
    })
    .filter((food) => food.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 12);
}

const OpenFoodFactsService = {
  lastQuery: "",
  async search(query) {
    const normalized = normalizeSearch(query);
    if (normalized.length < 3) return [];
    if (state.offCache[normalized]) return state.offCache[normalized];
    if (this.lastQuery === normalized) return [];
    this.lastQuery = normalized;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12&countries_tags_en=france&fields=${OFF_FIELDS}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("off unavailable");
      const data = await response.json();
      const products = (data.products || []).map(mapOffProduct).filter((food) => food && !food.incompleteNutrition);
      state.offCache[normalized] = products;
      saveState();
      return products;
    } finally {
      clearTimeout(timer);
    }
  },
  async productByBarcode(code) {
    const cleanCode = String(code || "").replace(/\D/g, "");
    if (!cleanCode) return null;
    const cached = state.offFoods.find((food) => food.code === cleanCode || food.id === `off-${cleanCode}`);
    if (cached) return cached;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json?fields=${OFF_FIELDS}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("off unavailable");
      const data = await response.json();
      if (!data.product) return null;
      const food = mapOffProduct({ ...data.product, code: cleanCode });
      if (food && !state.offFoods.some((item) => item.id === food.id)) {
        state.offFoods.push(food);
        saveState();
      }
      return food;
    } finally {
      clearTimeout(timer);
    }
  }
};

function mapOffProduct(product) {
  const nutriments = product.nutriments || {};
  const kcal = Number(nutriments["energy-kcal_100g"] || nutriments["energy-kcal"] || 0);
  const protein = Number(nutriments.proteins_100g || 0);
  const name = product.product_name_fr || product.product_name || product.generic_name;
  if (!name) return null;
  const code = product.code || id();
  return {
    id: `off-${code}`,
    code,
    name,
    brands: product.brands || "",
    aliases: [],
    category: "produit",
    source: "Open Food Facts",
    incompleteNutrition: !kcal || !Number.isFinite(protein),
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: Number(nutriments.carbohydrates_100g || 0),
    fatPer100g: Number(nutriments.fat_100g || 0),
    defaultPortionG: parsePortion(product.serving_size) || 100,
    image: product.image_front_small_url || "",
    allergens: product.allergens_tags || []
  };
}

function parsePortion(value) {
  const match = String(value || "").replace(",", ".").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

async function loadData() {
  const [foodsRes, recipesRes, tipsRes] = await Promise.all([
    fetch("./data/aliments-fr.json", { cache: "no-store" }),
    fetch("./data/recettes-fr.json", { cache: "no-store" }),
    fetch("./data/astuces-fr.json", { cache: "no-store" })
  ]);
  baseFoods = foodsRes.ok ? (await foodsRes.json()).map(normalizeFoodRecord) : [];
  recipes = recipesRes.ok ? await recipesRes.json() : [];
  tips = tipsRes.ok ? await tipsRes.json() : [];
}

function normalizeFoodRecord(food) {
  return {
    ...food,
    defaultPortionG: defaultPortion(food),
    source: food.source || "Base Mass+"
  };
}

function renderNav() {
  $("#bottomNav").innerHTML = NAV.map(([screen, label, icon]) => `
    <button class="${screen === "add" ? "add-nav" : ""} ${screen === currentScreen ? "active" : ""}" ${screen === "add" ? "data-open-add-sheet" : `data-screen="${screen}"`} type="button">
      <span>${icon}</span>${label}
    </button>`).join("");
  $$("[data-screen]").forEach((button) => button.addEventListener("click", () => go(button.dataset.screen)));
  $("[data-open-add-sheet]")?.addEventListener("click", openAddSheet);
}

function go(screen) {
  if (screen === "tips") {
    recipesTab = "tips";
    screen = "recipes";
  }
  if (screen === "favorites") screen = "journal";
  if (screen === "add") {
    openAddSheet();
    return;
  }
  currentScreen = screen;
  history.replaceState(null, "", `#${screen}`);
  render();
}

function render() {
  renderNav();
  const screens = { home: renderHome, journal: renderJournal, weight: renderWeight, profile: renderProfile, recipes: renderRecipes, photo: renderPhoto };
  (screens[currentScreen] || renderHome)();
}

function openAddSheet() {
  closeAddSheet({ keepHistory: true });
  const overlay = document.createElement("div");
  overlay.id = "addSheet";
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `
    <div class="add-sheet" role="dialog" aria-modal="true" aria-labelledby="addSheetTitle">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="section-head">
        <h2 id="addSheetTitle">Ajouter</h2>
        <button class="sheet-close" type="button" aria-label="Fermer" data-close-sheet>×</button>
      </div>
      <button class="sheet-choice" type="button" data-add-choice="food"><span>1</span>Ajouter un aliment</button>
      <button class="sheet-choice" type="button" data-add-choice="photo"><span>2</span>Photographier mon repas</button>
      <button class="sheet-choice" type="button" data-add-choice="saved"><span>3</span>Ajouter un repas enregistré</button>
      <button class="sheet-choice" type="button" data-add-choice="scan"><span>4</span>Scanner un code-barres</button>
      <p class="sheet-status" id="addSheetStatus" role="status"></p>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  history.pushState({ massPlusAddSheet: true }, "", location.href);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close-sheet]")) closeAddSheet();
  });
  $$("[data-add-choice]", overlay).forEach((button) => button.addEventListener("click", () => handleAddChoice(button.dataset.addChoice)));
}

function closeAddSheet(options = {}) {
  const sheet = $("#addSheet");
  if (!sheet) return;
  sheet.classList.remove("visible");
  setTimeout(() => sheet.remove(), 160);
  if (!options.keepHistory && !options.fromHistory && history.state?.massPlusAddSheet) history.back();
}

function handleAddChoice(choice) {
  if (choice === "scan") {
    history.replaceState(null, "", location.href);
    closeAddSheet({ keepHistory: true });
    openBarcodeScanner();
    return;
  }
  history.replaceState(null, "", location.href);
  closeAddSheet({ keepHistory: true });
  if (choice === "food") {
    selectedMeal = selectedMeal || "petit déjeuner";
    go("journal");
    setTimeout(() => $("#journalSearch")?.focus(), 80);
  }
  if (choice === "photo") go("photo");
  if (choice === "saved") {
    go("journal");
    setTimeout(() => $("#savedMeals")?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
  }
}

window.addEventListener("popstate", () => closeAddSheet({ fromHistory: true }));

let scannerStream = null;
let scannerTimer = null;
let scannerControls = null;
let scannerDetected = false;

function openBarcodeScanner() {
  const overlay = document.createElement("div");
  overlay.id = "scannerModal";
  overlay.className = "scanner-overlay";
  overlay.innerHTML = `
    <div class="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scannerTitle">
      <div class="section-head">
        <h2 id="scannerTitle">Scanner un code-barres</h2>
        <button class="sheet-close" type="button" aria-label="Fermer" data-close-scanner>×</button>
      </div>
      <div class="scanner-frame">
        <video id="scannerVideo" playsinline muted></video>
        <div class="scan-box"></div>
        <p>Placez le code-barres dans le cadre</p>
      </div>
      <form id="manualBarcodeForm" class="form-grid compact-form">
        <label>Code-barres<input name="barcode" inputmode="numeric" autocomplete="off" placeholder="EAN-13, EAN-8 ou UPC"></label>
        <button class="secondary-button">Saisir le code manuellement</button>
      </form>
      <button class="secondary-button compact scanner-torch" id="scannerTorch" type="button" hidden>Lampe</button>
      <p class="small" id="scannerStatus">Demande d’autorisation caméra...</p>
      <div id="scannerResult"></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close-scanner]")) closeBarcodeScanner();
  });
  $("#manualBarcodeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lookupBarcode(new FormData(event.currentTarget).get("barcode"));
  });
  startBarcodeCamera();
}

function closeBarcodeScanner() {
  stopBarcodeCamera();
  const modal = $("#scannerModal");
  if (!modal) return;
  modal.classList.remove("visible");
  setTimeout(() => modal.remove(), 160);
}

function stopBarcodeCamera() {
  const controls = scannerControls;
  scannerControls = null;
  if (controls?.stop) Promise.resolve(controls.stop()).catch(() => undefined);
  clearInterval(scannerTimer);
  scannerTimer = null;
  if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  const video = $("#scannerVideo");
  if (video) {
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load?.();
  }
}

async function startBarcodeCamera() {
  const video = $("#scannerVideo");
  const status = $("#scannerStatus");
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = "Caméra indisponible. Utilisez la saisie manuelle.";
    return;
  }
  scannerDetected = false;
  if (window.ZXingBrowser?.BrowserMultiFormatReader) {
    await startZxingScanner(video, status);
    return;
  }
  await startBarcodeDetectorFallback(video, status);
}

async function startZxingScanner(video, status) {
  try {
    const reader = new ZXingBrowser.BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 220 });
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    status.textContent = "Scanner ZXing prêt. Placez le code-barres dans le cadre.";
    scannerControls = await reader.decodeFromConstraints(constraints, video, (result) => {
      const code = result?.getText?.() || result?.text;
      if (!code || scannerDetected) return;
      scannerDetected = true;
      navigator.vibrate?.(60);
      stopBarcodeCamera();
      lookupBarcode(code);
    });
    bindScannerTorch();
  } catch {
    await startBarcodeDetectorFallback(video, status);
  }
}

function bindScannerTorch() {
  const button = $("#scannerTorch");
  if (!button || !scannerControls?.switchTorch) return;
  button.hidden = false;
  let torchOn = false;
  button.addEventListener("click", async () => {
    torchOn = !torchOn;
    await scannerControls.switchTorch(torchOn).catch(() => {
      torchOn = false;
      button.hidden = true;
    });
    button.textContent = torchOn ? "Lampe allumée" : "Lampe";
  });
}

async function startBarcodeDetectorFallback(video, status) {
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = scannerStream;
    await video.play();
    if (!("BarcodeDetector" in window)) {
      status.textContent = "Scanner automatique indisponible ici. Utilisez la saisie manuelle.";
      return;
    }
    const detector = new BarcodeDetector({ formats: ["ean_8", "ean_13", "upc_a", "upc_e"] });
    status.textContent = "Repli BarcodeDetector actif. Placez le code-barres dans le cadre.";
    scannerTimer = setInterval(async () => {
      if (!video.videoWidth || scannerDetected) return;
      const codes = await detector.detect(video).catch(() => []);
      const code = codes[0]?.rawValue;
      if (code) {
        scannerDetected = true;
        navigator.vibrate?.(60);
        stopBarcodeCamera();
        lookupBarcode(code);
      }
    }, 500);
  } catch {
    status.textContent = "Autorisation caméra refusée ou indisponible. Utilisez la saisie manuelle.";
  }
}

async function lookupBarcode(rawCode) {
  const code = String(rawCode || "").replace(/\D/g, "");
  const status = $("#scannerStatus");
  const result = $("#scannerResult");
  if (!/^\d{8,14}$/.test(code)) {
    status.textContent = "Code invalide. Saisissez un EAN-8, EAN-13 ou UPC.";
    return;
  }
  stopBarcodeCamera();
  status.textContent = `Recherche du produit ${code}...`;
  try {
    const food = await OpenFoodFactsService.productByBarcode(code);
    if (!food) {
      status.textContent = "Produit non trouvé.";
      result.innerHTML = `<div class="scanner-product"><strong>Code ${esc(code)}</strong><p class="small">Aucun produit Open Food Facts exploitable.</p><button class="primary-button compact" id="createScannedFood" type="button">Créer cet aliment manuellement</button></div>`;
      $("#createScannedFood").addEventListener("click", () => {
        closeBarcodeScanner();
        selectedMeal = "collation";
        go("journal");
        setTimeout(() => $("details.manual-food")?.setAttribute("open", ""), 80);
      });
      return;
    }
    status.textContent = food.incompleteNutrition ? "Informations nutritionnelles incomplètes." : "Produit trouvé. Confirmez avant ajout.";
    result.innerHTML = barcodeConfirmationMarkup(food);
    bindBarcodeConfirmation(food);
  } catch {
    status.textContent = "Open Food Facts est indisponible. Si ce produit est déjà en cache, il restera trouvable hors ligne.";
  }
}

function barcodeConfirmationMarkup(food) {
  return `<div class="scanner-product">
    ${food.image ? `<img class="food-thumb" src="${esc(food.image)}" alt="">` : ""}
    <div>
      <strong>${esc(food.name)}</strong>
      <div class="macro">${esc(food.brands || "Open Food Facts")}</div>
      <div class="macro">${food.incompleteNutrition ? "Informations nutritionnelles incomplètes" : `${fmt(food.kcalPer100g)} kcal / 100 g · ${fmt(food.proteinPer100g, 1)} g prot.`}</div>
    </div>
    <label>Repas<select id="scanMeal">${MEALS.map((meal) => `<option ${meal === selectedMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
    <label class="unit-field"><input id="scanGrams" inputmode="numeric" value="${esc(defaultPortion(food))}"><span>g</span></label>
    <button class="primary-button" id="confirmScanFood" type="button">Ajouter au journal</button>
  </div>`;
}

function bindBarcodeConfirmation(food) {
  $("#confirmScanFood").addEventListener("click", () => {
    selectedDate = selectedDate || today();
    selectedMeal = $("#scanMeal").value;
    const grams = Number($("#scanGrams").value || defaultPortion(food));
    addEntry(food, grams, selectedMeal, false);
    closeBarcodeScanner();
    toast("Produit ajouté après confirmation.");
    go("journal");
  });
}

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function progress(label, value, goal) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return `<div class="progress-line"><div class="row"><span>${esc(label)}</span><strong>${fmt(value, label === "Protéines" ? 1 : 0)} / ${fmt(goal, label === "Protéines" ? 0 : 0)}</strong></div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
}

function calorieRing(value, goal) {
  const pct = goal ? Math.round((Number(value || 0) / goal) * 100) : 0;
  const visual = Math.max(0, Math.min(100, pct));
  return `<div class="calorie-ring" style="--angle:${visual * 3.6}deg" aria-label="Calories consommées à ${pct} pour cent de l’objectif">
    <span>${fmt(pct)}%</span>
  </div>`;
}

function tipForDate(dateKey = today()) {
  if (!tips.length) return null;
  if (state.dailyTip?.date === dateKey && tips.some((tip) => tip.id === state.dailyTip.id)) return tips.find((tip) => tip.id === state.dailyTip.id);
  const recent = Array.isArray(state.dailyTip?.recentIds) ? state.dailyTip.recentIds : [];
  const available = tips.filter((tip) => !recent.includes(tip.id));
  const pool = available.length ? available : tips;
  const daySeed = Number(dateKey.replace(/-/g, ""));
  const tip = pool[daySeed % pool.length];
  state.dailyTip = { date: dateKey, id: tip.id, recentIds: [tip.id, ...recent.filter((id) => id !== tip.id)].slice(0, 30) };
  saveState();
  return tip;
}

function dailyTipCard() {
  const dateKey = today();
  if (state.hiddenTips?.[dateKey]) return "";
  const tip = tipForDate(dateKey);
  if (!tip) return "";
  return `<article class="card daily-tip-card">
    <div class="section-head"><h2>Astuce du jour</h2><button class="icon-button" id="hideDailyTip" type="button" aria-label="Masquer l’astuce du jour">×</button></div>
    <strong>${esc(tip.title)}</strong>
    <p>${esc(tip.body)}</p>
  </article>`;
}

function bindDailyTip() {
  $("#hideDailyTip")?.addEventListener("click", () => {
    state.hiddenTips[today()] = true;
    saveState();
    renderHome();
  });
}

function renderHome() {
  const sum = totals(dayEntries(today()));
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">Journal</p>
          <div class="big-number">${fmt(sum.kcal)} kcal</div>
          <p class="small">${fmt(sum.protein, 1)} g protéines · objectif ${goals.calories ? fmt(goals.calories) : "à calculer"} kcal</p>
        </div>
        ${calorieRing(sum.kcal, goals.calories)}
      </div>
      ${progress("Calories", sum.kcal, goals.calories)}
      ${progress("Protéines", sum.protein, goals.protein)}
    </article>
    ${goals.warning ? `<article class="card notice">${esc(goals.warning)}</article>` : ""}
    ${dailyTipCard()}
    <div class="grid two">
      ${metric("Poids actuel", latestWeight() ? `${fmt(latestWeight(), 1)} kg` : "Profil à compléter")}
      ${metric("Poids cible", profileNumber("targetWeight") ? `${fmt(profileNumber("targetWeight"), 1)} kg` : "Profil à compléter")}
    </div>
    <div class="button-grid">
      <button class="primary-button" id="goAdd">Ajouter un aliment</button>
      <button class="secondary-button" id="quickSnack">Collation rapide</button>
      <button class="secondary-button" id="goWeight">Suivi du poids</button>
      <button class="secondary-button" id="goPhoto" aria-label="Photographier mon repas">Photo repas</button>
    </div>
    <article class="card">
      <div class="section-head"><h2>Mes favoris</h2><button class="ghost-inline" id="allFavorites" type="button">Voir tout</button></div>
      <div class="home-search">
        <label>Rechercher un aliment<input id="homeFoodSearch" placeholder="eau, café, pain..." autocomplete="off"></label>
        <button class="secondary-button compact" id="homeSearchButton" type="button">Rechercher</button>
      </div>
      <div class="quick-grid favorites-home">${homeFavoritesMarkup()}</div>
      <div class="quick-add-line" aria-label="Ajout rapide">
        <span>Ajout rapide</span>
        <button class="secondary-button compact" id="quickWater" type="button">+ Eau</button>
        <button class="secondary-button compact" id="quickCoffee" type="button">+ Café</button>
        <button class="secondary-button compact" id="quickSearch" type="button">Rechercher</button>
      </div>
      ${quickCoffeePanel ? coffeeAdjustMarkup() : ""}
    </article>
    <article class="card">
      <h2>Repas du jour</h2>
      <div class="stack">${MEALS.map(mealBlock).join("")}</div>
    </article>`;
  bindDailyTip();
  $("#goAdd").addEventListener("click", () => { selectedDate = today(); selectedMeal = "petit déjeuner"; go("journal"); });
  $("#quickSnack").addEventListener("click", () => { selectedDate = today(); selectedMeal = "collation"; go("journal"); });
  $("#goWeight").addEventListener("click", () => go("weight"));
  $("#goPhoto").addEventListener("click", () => go("photo"));
  $("#allFavorites").addEventListener("click", () => { selectedMeal = "collation"; selectedDate = today(); go("journal"); setTimeout(() => $("#savedMeals")?.scrollIntoView({ block: "start", behavior: "smooth" }), 80); });
  $("#homeSearchButton").addEventListener("click", () => openHomeSearch());
  $("#quickSearch").addEventListener("click", () => openHomeSearch());
  $("#quickWater").addEventListener("click", () => addQuickDrink("eau-du-robinet"));
  $("#quickCoffee").addEventListener("click", () => addQuickCoffee());
  $("#addCoffeeExtra")?.addEventListener("click", addCoffeeExtra);
  $("#homeFoodSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openHomeSearch();
    }
  });
  bindHomeFavoriteButtons();
  bindEntryButtons();
}

function addQuickDrink(foodId) {
  const food = findFood(foodId);
  if (!food) {
    toast("Aliment introuvable dans la Banque.");
    return;
  }
  selectedDate = today();
  selectedMeal = "collation";
  addEntry(food, defaultPortion(food), selectedMeal, false);
  toast(`${food.name} ajouté.`);
  renderHome();
}

function addQuickCoffee() {
  addQuickDrink("cafe-noir");
  quickCoffeePanel = true;
  renderHome();
}

function coffeeAdjustMarkup() {
  return `<div class="coffee-adjust">
    <label>Compléter le café<select id="coffeeExtra"><option value="">Sans supplément</option><option value="sucre-en-morceaux">1 morceau de sucre</option><option value="cafe-deux-sucres-extra">2 morceaux de sucre</option><option value="dosette-lait-entier">Dosette de lait entier</option><option value="dosette-lait-demi-ecreme">Dosette de lait demi-écrémé</option></select></label>
    <label>Quantité<input id="coffeeExtraQty" inputmode="numeric" value="1"></label>
    <button class="secondary-button compact" id="addCoffeeExtra" type="button">Ajouter</button>
  </div>`;
}

function addCoffeeExtra() {
  const selected = $("#coffeeExtra")?.value;
  const qty = Number($("#coffeeExtraQty")?.value || 1);
  if (!selected) {
    quickCoffeePanel = false;
    renderHome();
    return;
  }
  if (selected === "cafe-deux-sucres-extra") {
    const sugar = findFood("sucre-en-morceaux");
    if (sugar) addEntry(sugar, defaultPortion(sugar) * Math.max(1, qty) * 2, "collation", false);
  } else {
    const food = findFood(selected);
    if (food) addEntry(food, defaultPortion(food) * Math.max(1, qty), "collation", false);
  }
  quickCoffeePanel = false;
  toast("Café complété.");
  renderHome();
}

function homeFavoritesMarkup() {
  if (!state.favorites.length) {
    return `<p class="small empty-state">Aucun favori pour le moment. Recherche un aliment ou crée un repas enregistré depuis le journal.</p>`;
  }
  return state.favorites.slice(0, 4).map(homeFavoriteCard).join("");
}

function homeFavoriteCard(favorite) {
  const sum = favoriteTotals(favorite);
  return `<div class="quick-card">
    <strong>${esc(favorite.name)}</strong>
    <span>${fmt(sum.kcal)} kcal · ${fmt(sum.protein, 1)} g prot. · ${esc(favorite.meal)}</span>
    <button class="secondary-button compact" data-home-favorite="${favorite.id}">Ajouter</button>
  </div>`;
}

function quickSnackCard(foodId) {
  const food = findFood(foodId);
  if (!food) return "";
  const portion = defaultPortion(food);
  const macros = calc(food, portion);
  return `<div class="quick-card">
    <strong>${esc(food.name)}</strong>
    <span>${fmt(portion)} g · ${fmt(macros.kcal)} kcal · ${fmt(macros.protein, 1)} g prot.</span>
    <button class="secondary-button compact" data-quick-food="${food.id}">Ajouter</button>
  </div>`;
}

function openHomeSearch() {
  const value = $("#homeFoodSearch").value.trim();
  selectedDate = today();
  selectedMeal = "collation";
  go("journal");
  setTimeout(() => {
    const search = $("#journalSearch");
    if (!search) return;
    search.value = value;
    search.dispatchEvent(new Event("input"));
    search.focus();
  }, 80);
}

function bindHomeFavoriteButtons() {
  $$("[data-home-favorite]").forEach((button) => button.addEventListener("click", () => {
    selectedDate = today();
    addFavoriteToJournal(button.dataset.homeFavorite);
  }));
}

function renderJournal() {
  const sum = totals(dayEntries(selectedDate));
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card">
      <div class="section-head"><h2>Banque alimentaire</h2><button class="ghost-inline" id="openHistory" type="button">Historique</button></div>
      <p class="small active-date">Ajoute un aliment à ${esc(dateLabel(selectedDate))} · ${esc(selectedDate)}</p>
      <div class="grid two">${metric("Calories du jour", `${fmt(sum.kcal)} / ${fmt(goals.calories)}`)}${metric("Protéines", `${fmt(sum.protein, 1)} / ${fmt(goals.protein)} g`)}</div>
    </article>
    <article class="card">
      <div class="tabs">${MEALS.map((meal) => `<button class="${meal === selectedMeal ? "active" : ""}" data-meal="${meal}">${meal}</button>`).join("")}</div>
      ${foodSearchMarkup("journal", "eau, café, pain, beurre...")}
      <details class="manual-food"><summary>Créer un aliment manuellement</summary>${manualFoodMarkup()}</details>
    </article>
    ${savedMealsSection()}
    <article class="card">
      <h2>Repas de la journée sélectionnée</h2>
      <div class="date-nav" aria-label="Navigation par jour">
        <button class="secondary-button compact" id="prevDay" type="button">Préc.</button>
        <button class="secondary-button compact" id="todayDay" type="button">Aujourd’hui</button>
        <button class="secondary-button compact" id="nextDay" type="button">Suiv.</button>
      </div>
      <div class="stack">${MEALS.map(mealBlock).join("")}</div>
    </article>`;
  bindMealTabs();
  bindDateNav();
  bindFoodSearch("journal", (food, grams) => addEntry(food, grams, selectedMeal));
  bindManualFoodForm();
  bindSavedMeals();
  bindEntryButtons();
}

function bindDateNav() {
  $("#prevDay")?.addEventListener("click", () => {
    selectedDate = addDays(selectedDate, -1);
    renderJournal();
  });
  $("#todayDay")?.addEventListener("click", () => {
    selectedDate = today();
    renderJournal();
  });
  $("#nextDay")?.addEventListener("click", () => {
    selectedDate = addDays(selectedDate, 1);
    renderJournal();
  });
  $("#openHistory")?.addEventListener("click", () => renderHistory());
}

function recentHistoryDays(limit = 30) {
  const dates = new Set();
  for (let i = 0; i < limit; i += 1) dates.add(addDays(today(), -i));
  state.entries.forEach((entry) => dates.add(entry.date));
  return [...dates].sort((a, b) => b.localeCompare(a)).slice(0, limit);
}

function renderHistory() {
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card">
      <div class="section-head"><h2>Historique</h2><button class="ghost-inline" id="backJournal" type="button">Journal</button></div>
      <p class="small">Les 30 derniers jours restent consultables et modifiables.</p>
      <div class="stack history-list">${recentHistoryDays().map((date) => historyRow(date, goals)).join("")}</div>
    </article>`;
  $("#backJournal").addEventListener("click", () => renderJournal());
  $$("[data-open-day]").forEach((button) => button.addEventListener("click", () => {
    selectedDate = button.dataset.openDay;
    renderJournal();
  }));
}

function historyRow(date, goals) {
  const entries = dayEntries(date);
  const sum = totals(entries);
  const caloriePct = goals.calories ? Math.round((sum.kcal / goals.calories) * 100) : 0;
  const proteinPct = goals.protein ? Math.round((sum.protein / goals.protein) * 100) : 0;
  const meals = new Set(entries.map((entry) => entry.mealType || entry.meal)).size;
  return `<button class="history-row" type="button" data-open-day="${esc(date)}">
    <span><strong>${esc(dateLabel(date))}</strong><small>${esc(date)} · ${entries.length} entrée(s) · ${meals} repas</small></span>
    <span><strong>${fmt(sum.kcal)} / ${fmt(goals.calories)} kcal</strong><small>${fmt(sum.protein, 1)} / ${fmt(goals.protein)} g prot. · ${fmt(Math.max(caloriePct, proteinPct))}%</small></span>
  </button>`;
}

function savedMealsSection() {
  return `<article class="card saved-meals-card" id="savedMeals">
    <div class="section-head">
      <div>
        <h2>Repas enregistrés</h2>
        <p class="small">Les anciens favoris sont conservés ici.</p>
      </div>
    </div>
    <form id="savedMealForm" class="form-grid saved-meal-form">
      <label>Nom du repas<input name="name" placeholder="Petit déjeuner habituel"></label>
      <label>Repas<select name="meal">${MEALS.map((meal) => `<option ${meal === selectedMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
      <button class="secondary-button">Créer depuis le journal</button>
    </form>
    <div class="stack saved-meals-list">${state.favorites.length ? state.favorites.map(favoriteEditor).join("") : `<p class="small">Aucun repas enregistré pour le moment.</p>`}</div>
  </article>`;
}

function bindSavedMeals() {
  $("#savedMealForm")?.addEventListener("submit", saveFavoriteFromMeal);
  bindFavoriteEditors();
}

function bindMealTabs() {
  $$("[data-meal]").forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.meal;
    render();
  }));
}

function foodSearchMarkup(scope, placeholder = "banane, lait, produit...") {
  return `<div class="food-search" data-search-scope="${scope}">
    <label>Rechercher<input id="${scope}Search" placeholder="${esc(placeholder)}" autocomplete="off"></label>
    <button class="secondary-button compact" data-off-search="${scope}">Rechercher</button>
    <div id="${scope}Status" class="small"></div>
    <div id="${scope}Results" class="stack"></div>
  </div>`;
}

function manualFoodMarkup() {
  return `<form id="manualFoodForm" class="form-grid compact-form">
    <label>Nom<input name="name" required></label>
    <label>Quantité<input name="quantity" inputmode="decimal" value="100"></label>
    <label>Unité<input name="unit" value="g"></label>
    <label>Calories<input name="kcal" inputmode="numeric" required></label>
    <label>Protéines<input name="protein" inputmode="decimal" value="0"></label>
    <button class="primary-button">Créer et réutiliser</button>
  </form>`;
}

function bindFoodSearch(scope, onAdd) {
  const input = $(`#${scope}Search`);
  const results = $(`#${scope}Results`);
  const status = $(`#${scope}Status`);
  const renderResults = (items) => {
    searchResults = items;
    results.innerHTML = items.length ? items.map((food) => foodRow(food, scope)).join("") : `<p class="small">Aucun résultat local. Essaie Rechercher pour Open Food Facts.</p>`;
    $$(`[data-add-food][data-scope="${scope}"]`).forEach((button) => button.addEventListener("click", () => {
      const food = searchResults.find((item) => item.id === button.dataset.addFood);
      const grams = Number($(`[data-grams="${button.dataset.addFood}"][data-scope="${scope}"]`)?.value || defaultPortion(food));
      if (food.source === "Open Food Facts" && !state.offFoods.some((item) => item.id === food.id)) {
        state.offFoods.push(food);
      }
      onAdd(food, grams);
      saveState();
    }));
  };
  const localSearch = () => renderResults(searchLocalFoods(input.value));
  input.addEventListener("input", localSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      doOffSearch(scope, input.value, renderResults, status);
    }
  });
  $(`[data-off-search="${scope}"]`).addEventListener("click", () => doOffSearch(scope, input.value, renderResults, status));
  localSearch();
}

async function doOffSearch(scope, query, renderResults, status) {
  if (normalizeSearch(query).length < 3) {
    status.textContent = "Tape au moins 3 caractères pour rechercher un produit.";
    return;
  }
  status.textContent = "Recherche Open Food Facts...";
  try {
    const offResults = await OpenFoodFactsService.search(query);
    const merged = [...searchLocalFoods(query), ...offResults].slice(0, 16);
    status.textContent = offResults.length ? `${offResults.length} produit(s) Open Food Facts trouvé(s).` : "Aucun produit exploitable trouvé. La base locale reste disponible.";
    renderResults(merged);
  } catch {
    status.textContent = "Open Food Facts est indisponible. Tu peux utiliser la base locale ou créer un aliment.";
    renderResults(searchLocalFoods(query));
  }
}

function foodRow(food, scope) {
  const source = food.source || "Base Mass+";
  const portion = defaultPortion(food);
  return `<div class="food-row">
    ${food.image ? `<img class="food-thumb" src="${esc(food.image)}" alt="">` : ""}
    <div>
      <strong>${esc(food.name)}</strong>
      <div class="macro">${esc(source)}${food.brands ? ` · ${esc(food.brands)}` : ""}</div>
      <div class="macro">${food.incompleteNutrition ? "Informations nutritionnelles incomplètes" : `${fmt(food.kcalPer100g)} kcal / 100 ${esc(unitLabel(food))} · ${fmt(food.proteinPer100g, 1)} g prot. · portion ${fmt(portion)} ${esc(unitLabel(food))}`}</div>
    </div>
    <div class="food-actions">
      <label class="unit-field"><input inputmode="numeric" value="${portion}" data-grams="${food.id}" data-scope="${scope}" aria-label="Quantité"><span>${esc(unitLabel(food))}</span></label>
      <button class="primary-button compact" data-add-food="${food.id}" data-scope="${scope}">Ajouter</button>
    </div>
  </div>`;
}

function bindManualFoodForm() {
  $("#manualFoodForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const quantity = Number(data.quantity || 100);
    const food = {
      id: `custom-${id()}`,
      name: data.name.trim(),
      aliases: [],
      category: "personnel",
      source: "Aliment perso",
      kcalPer100g: Number(data.kcal || 0) / quantity * 100,
      proteinPer100g: Number(data.protein || 0) / quantity * 100,
      carbsPer100g: 0,
      fatPer100g: 0,
      defaultPortionG: quantity,
      unit: data.unit || "g"
    };
    state.customFoods.push(food);
    addEntry(food, quantity, selectedMeal);
    saveState();
    toast("Aliment personnalisé créé.");
  });
}

function addEntry(food, grams, meal, rerender = true, extras = {}) {
  if (!food || !grams) return;
  const macros = calc(food, grams);
  const now = new Date().toISOString();
  const source = normalizeFoodSource(food.source);
  state.entries.push({
    id: crypto.randomUUID ? crypto.randomUUID() : id(),
    date: selectedDate || today(),
    meal,
    mealType: MEAL_TYPES[meal] || "snack",
    foodId: food.id,
    foodSource: source,
    foodName: food.name,
    name: food.name,
    quantity: Number(grams),
    unit: unitLabel(food),
    grams: Number(grams),
    source: sourceLabelFromKey(source),
    photoId: extras.photoId || "",
    photoMealId: extras.photoMealId || "",
    analysisId: extras.analysisId || "",
    confidence: Number(extras.confidence || 0) || 0,
    analysisDemo: Boolean(extras.analysisDemo),
    createdAt: now,
    updatedAt: now,
    ...macros
  });
  saveState();
  if (rerender) {
    toast("Aliment ajouté.");
    render();
  }
}

function mealBlock(meal) {
  const items = dayEntries().filter((entry) => entry.meal === meal);
  const sum = totals(items);
  return `<div class="meal-block">
    <h3>${esc(meal)} · ${fmt(sum.kcal)} kcal · ${fmt(sum.protein, 1)} g prot.</h3>
    ${items.length ? items.map(entryRow).join("") : `<p class="small">Rien pour le moment.</p>`}
  </div>`;
}

function entryRow(entry) {
  return `<div class="entry-row">
    <div>
      <strong>${esc(entry.name)}</strong>
      <div class="macro">${fmt(entry.grams)} ${esc(entry.unit || "g")} · ${fmt(entry.kcal)} kcal · ${fmt(entry.protein, 1)} g protéines</div>
    </div>
    <div class="entry-actions">
      <label class="unit-field"><input inputmode="numeric" value="${entry.grams}" data-entry-grams="${entry.id}" aria-label="Quantité ${esc(entry.name)}"><span>${esc(entry.unit || "g")}</span></label>
      <button class="secondary-button compact" data-edit-entry="${entry.id}">OK</button>
      <button class="danger-button compact" data-delete-entry="${entry.id}">Supprimer</button>
    </div>
  </div>`;
}

function bindEntryButtons() {
  $$("[data-delete-entry]").forEach((button) => button.addEventListener("click", () => {
    state.entries = state.entries.filter((entry) => entry.id !== button.dataset.deleteEntry);
    saveState();
    render();
  }));
  $$("[data-edit-entry]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.entries.find((item) => item.id === button.dataset.editEntry);
    const next = Number($(`[data-entry-grams="${entry.id}"]`)?.value || entry.grams);
    const food = findFood(entry.foodId);
    if (!entry || !food || !Number.isFinite(next) || next <= 0) return;
    Object.assign(entry, { quantity: next, grams: next, updatedAt: new Date().toISOString(), ...calc(food, next) });
    saveState();
    render();
  }));
}

function favoriteTotals(favorite) {
  return (favorite.items || []).reduce((sum, item) => {
    const food = findFood(item.food);
    const macros = food ? calc(food, item.grams) : item;
    return { kcal: sum.kcal + Number(macros.kcal || 0), protein: sum.protein + Number(macros.protein || 0) };
  }, { kcal: 0, protein: 0 });
}

function renderFavorites() {
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Favoris</h2>
      <p class="small">Un favori contient maintenant la liste complète des aliments.</p>
      <div class="stack">${state.favorites.length ? state.favorites.map(favoriteEditor).join("") : `<p class="small">Aucun favori pour le moment.</p>`}</div>
    </article>
    <article class="card">
      <h2>Sauvegarder un repas du jour</h2>
      <form id="favoriteForm" class="form-grid">
        <label>Nom du favori<input name="name" placeholder="Collation du matin"></label>
        <label>Repas<select name="meal">${MEALS.map((meal) => `<option>${esc(meal)}</option>`).join("")}</select></label>
        <button class="primary-button">Sauvegarder le favori</button>
      </form>
    </article>`;
  bindFavoriteEditors();
  $("#favoriteForm").addEventListener("submit", saveFavoriteFromMeal);
}

function favoriteEditor(favorite) {
  const sum = favoriteTotals(favorite);
  return `<div class="favorite-row">
    <div class="favorite-head">
      <label>Nom<input value="${esc(favorite.name)}" data-fav-name="${favorite.id}"></label>
      <label>Repas<select data-fav-meal="${favorite.id}">${MEALS.map((meal) => `<option ${meal === favorite.meal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
    </div>
    <div class="macro">${fmt(sum.kcal)} kcal · ${fmt(sum.protein, 1)} g protéines</div>
    <div class="stack">${favorite.items.map((item, index) => favoriteItemRow(favorite, item, index)).join("") || `<p class="small">Ajoute un aliment à ce repas enregistré.</p>`}</div>
    <div class="favorite-add">${foodSearchMarkup(`fav-${favorite.id}`, "ajouter un aliment au repas enregistré")}</div>
    <div class="inline-actions">
      <button class="primary-button compact" data-add-favorite="${favorite.id}">Ajouter ce repas</button>
      <button class="secondary-button compact" data-save-favorite="${favorite.id}">Enregistrer</button>
      <button class="danger-button compact" data-delete-favorite="${favorite.id}">Supprimer</button>
    </div>
  </div>`;
}

function favoriteItemRow(favorite, item, index) {
  const food = findFood(item.food);
  const macros = food ? calc(food, item.grams) : item;
  return `<div class="entry-row mini">
    <div><strong>${esc(item.name || food?.name || "Aliment")}</strong><div class="macro">${fmt(macros.kcal)} kcal · ${fmt(macros.protein, 1)} g prot.</div></div>
    <div class="entry-actions">
      <label class="unit-field"><input value="${esc(item.grams)}" inputmode="numeric" data-fav-grams="${favorite.id}" data-index="${index}"><span>g</span></label>
      <button class="secondary-button compact" data-fav-update="${favorite.id}" data-index="${index}">OK</button>
      <button class="danger-button compact" data-fav-remove="${favorite.id}" data-index="${index}">Suppr.</button>
    </div>
  </div>`;
}

function bindFavoriteEditors() {
  $$("[data-add-favorite]").forEach((button) => button.addEventListener("click", () => addFavoriteToJournal(button.dataset.addFavorite)));
  $$("[data-save-favorite]").forEach((button) => button.addEventListener("click", () => saveFavoriteMeta(button.dataset.saveFavorite)));
  $$("[data-delete-favorite]").forEach((button) => button.addEventListener("click", () => {
    const favorite = state.favorites.find((item) => item.id === button.dataset.deleteFavorite);
    if (!confirm(`Supprimer le repas enregistré "${favorite?.name || "sans nom"}" ?`)) return;
    state.favorites = state.favorites.filter((favorite) => favorite.id !== button.dataset.deleteFavorite);
    saveState();
    renderAfterSavedMealChange();
  }));
  $$("[data-fav-update]").forEach((button) => button.addEventListener("click", () => updateFavoriteItem(button.dataset.favUpdate, Number(button.dataset.index))));
  $$("[data-fav-remove]").forEach((button) => button.addEventListener("click", () => removeFavoriteItem(button.dataset.favRemove, Number(button.dataset.index))));
  state.favorites.forEach((favorite) => bindFoodSearch(`fav-${favorite.id}`, (food, grams) => addFoodToFavorite(favorite.id, food, grams)));
}

function saveFavoriteMeta(favoriteId) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.name = $(`[data-fav-name="${favoriteId}"]`).value.trim() || favorite.name;
  favorite.meal = $(`[data-fav-meal="${favoriteId}"]`).value;
  saveState();
  toast("Repas enregistré mis à jour.");
  renderAfterSavedMealChange();
}

function addFoodToFavorite(favoriteId, food, grams) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.push({ food: food.id, name: food.name, grams, ...calc(food, grams) });
  saveState();
  renderAfterSavedMealChange();
}

function updateFavoriteItem(favoriteId, index) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  const item = favorite?.items[index];
  const food = findFood(item?.food);
  const grams = Number($(`[data-fav-grams="${favoriteId}"][data-index="${index}"]`)?.value || item?.grams);
  if (!favorite || !item || !food || !grams) return;
  favorite.items[index] = { ...item, grams, ...calc(food, grams) };
  saveState();
  renderAfterSavedMealChange();
}

function removeFavoriteItem(favoriteId, index) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.splice(index, 1);
  saveState();
  renderAfterSavedMealChange();
}

function addFavoriteToJournal(favoriteId) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  if (!favorite.items.length) {
    toast("Ce repas enregistré est vide.");
    return;
  }
  favorite.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) addEntry(food, item.grams, favorite.meal, false);
  });
  saveState();
  toast("Repas enregistré ajouté au journal.");
  selectedMeal = favorite.meal;
  go("journal");
}

function saveFavoriteFromMeal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const mealItems = dayEntries().filter((entry) => entry.meal === data.meal);
  if (!mealItems.length) {
    state.favorites.unshift({
      id: id(),
      name: data.name.trim() || `Favori ${data.meal}`,
      meal: data.meal,
      items: []
    });
    saveState();
    toast("Repas enregistré créé. Ajoute des aliments dedans.");
    renderAfterSavedMealChange();
    return;
  }
  state.favorites.unshift({
    id: id(),
    name: data.name.trim() || `Favori ${data.meal}`,
    meal: data.meal,
    items: mealItems.map((entry) => ({ food: entry.foodId, name: entry.name, grams: entry.grams, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }))
  });
  saveState();
  toast("Repas enregistré sauvegardé.");
  renderAfterSavedMealChange();
}

function renderAfterSavedMealChange() {
  if (currentScreen === "journal") renderJournal();
  else render();
}

function renderWeight() {
  const latest = latestWeight();
  const previous = state.weights.length > 1 ? [...state.weights].sort((a, b) => b.date.localeCompare(a.date))[1]?.weight : null;
  const delta = previous ? latest - previous : 0;
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card hero">
      <p class="eyebrow">Suivi poids</p>
      <div class="big-number">${latest ? `${fmt(latest, 1)} kg` : "À saisir"}</div>
      <p class="small">${previous ? `${delta >= 0 ? "+" : ""}${fmt(delta, 1)} kg depuis la dernière mesure` : "Ajoute ton poids du jour."}</p>
    </article>
    <article class="card">
      <form id="weightForm" class="form-grid">
        <label>Poids du jour<input name="weight" inputmode="decimal" value="${esc(latest || "")}"></label>
        <button class="primary-button">Enregistrer</button>
      </form>
      <p class="small">Objectifs recalculés : ${goals.calories ? `${fmt(goals.calories)} kcal · ${fmt(goals.protein)} g protéines` : "profil à compléter"}</p>
    </article>
    <article class="card">
      <h2>Historique</h2>
      <div class="stack">${state.weights.slice(-10).reverse().map((item) => `<div class="row"><span>${esc(item.date)}</span><strong>${fmt(item.weight, 1)} kg</strong></div>`).join("") || `<p class="small">Aucune mesure.</p>`}</div>
    </article>`;
  $("#weightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const weight = Number(new FormData(event.currentTarget).get("weight"));
    if (!weight) return;
    state.profile.currentWeight = weight;
    const existing = state.weights.find((item) => item.date === today());
    if (existing) existing.weight = weight;
    else state.weights.push({ date: today(), weight });
    saveState();
    toast("Poids enregistré.");
    renderWeight();
  });
}

function renderProfile() {
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Profil</h2>
      <form id="profileForm" class="form-grid">
        <label>Prénom<input name="firstName" value="${esc(state.profile.firstName)}"></label>
        <label>Âge<input name="age" inputmode="numeric" value="${esc(state.profile.age)}"></label>
        <label>Sexe pour le calcul<select name="sex"><option>Femme</option><option>Homme</option></select></label>
        <label>Taille (cm)<input name="height" inputmode="numeric" value="${esc(state.profile.height)}"></label>
        <label>Poids actuel<input name="currentWeight" inputmode="decimal" value="${esc(latestWeight() || "")}"></label>
        <label>Poids cible<input name="targetWeight" inputmode="decimal" value="${esc(state.profile.targetWeight)}"></label>
        <label>Activité<select name="activity">${Object.keys(ACTIVITY_FACTORS).map((activity) => `<option>${esc(activity)}</option>`).join("")}</select></label>
        ${goalFieldsMarkup(goals)}
        <button class="primary-button">Sauvegarder</button>
      </form>
    </article>
    ${goals.warning ? `<article class="card notice">${esc(goals.warning)}</article>` : ""}
    <article class="card">
      <h2>Calcul indicatif</h2>
      <div class="grid two">${metric("IMC actuel", goals.bmi ? fmt(goals.bmi, 1) : "à calculer")}${metric("IMC cible", goals.targetBmi ? fmt(goals.targetBmi, 1) : "à calculer")}</div>
      <p class="small">Métabolisme de base Mifflin-St Jeor, ajusté selon l’activité et un surplus progressif si l’objectif est une prise de poids.</p>
      <p class="small">Estimation indicative calculée à partir du profil. Elle ne remplace pas l’avis d’un médecin ou d’un diététicien.</p>
      <button class="secondary-button wide" id="profileWeight" type="button">Suivi du poids</button>
    </article>
    <article class="card">
      <h2>Intolérances, allergies et préférences</h2>
      <form id="exclusionForm" class="chips">${EXCLUSION_OPTIONS.map((item) => exclusionChip(item)).join("")}<label class="wide">Autre exclusion<input name="other" value="${esc(state.profile.exclusionOther)}"></label><button class="primary-button compact">Sauvegarder</button></form>
    </article>
    <article class="card">
      <h2>Mes données</h2>
      <div class="inline-actions">
        <button class="secondary-button compact" id="exportData" type="button">Exporter JSON</button>
        <label class="secondary-button compact import-button">Importer JSON<input id="importData" type="file" accept="application/json,.json"></label>
      </div>
      <p class="small">Export local complet : journal, profil, favoris, aliments personnels, cache Open Food Facts et photos sauvegardées.</p>
    </article>
    <p class="small app-version">Mass+ v${APP_VERSION}</p>`;
  $("[name='sex']").value = state.profile.sex;
  $("[name='activity']").value = state.profile.activity;
  bindGoalMode();
  bindProfileForm();
  bindExclusionForm();
  $("#exportData").addEventListener("click", exportUserData);
  $("#importData").addEventListener("change", importUserData);
  $("#profileWeight").addEventListener("click", () => go("weight"));
}

function goalFieldsMarkup(goals) {
  if (state.profile.goalMode === "manual") {
    return `<label>Objectif calories personnalisé<input name="manualCalories" inputmode="numeric" value="${esc(state.profile.manualCalories || goals.calories)}"></label>
      <label>Objectif protéines personnalisé<input name="manualProtein" inputmode="numeric" value="${esc(state.profile.manualProtein || goals.protein)}"></label>
      <p class="small wide">Objectif personnalisé.</p>
      <button class="secondary-button compact wide" type="button" id="autoGoal">Revenir au calcul automatique</button>`;
  }
  return `<div class="metric"><span>Objectif calories</span><strong>${goals.calories ? `${fmt(goals.calories)} kcal` : "Profil à compléter"}</strong></div>
    <div class="metric"><span>Objectif protéines</span><strong>${goals.protein ? `${fmt(goals.protein)} g` : "Profil à compléter"}</strong></div>
    <button class="secondary-button compact wide" type="button" id="manualGoal">Personnaliser manuellement</button>`;
}

function exclusionChip(item) {
  const checked = state.profile.exclusions.includes(item);
  return `<label class="chip"><input type="checkbox" name="exclusions" value="${esc(item)}" ${checked ? "checked" : ""}>${esc(item)}</label>`;
}

function bindGoalMode() {
  $("#manualGoal")?.addEventListener("click", () => {
    const goals = calculatedGoals();
    state.profile.goalMode = "manual";
    state.profile.manualCalories = state.profile.manualCalories || goals.calories;
    state.profile.manualProtein = state.profile.manualProtein || goals.protein;
    saveState();
    renderProfile();
  });
  $("#autoGoal")?.addEventListener("click", () => {
    state.profile.goalMode = "auto";
    saveState();
    renderProfile();
  });
}

function bindProfileForm() {
  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    Object.assign(state.profile, {
      firstName: data.firstName.trim(),
      age: Number(data.age || 0),
      sex: data.sex,
      height: Number(data.height || 0),
      currentWeight: Number(data.currentWeight || 0),
      targetWeight: Number(data.targetWeight || 0),
      activity: data.activity,
      manualCalories: Number(data.manualCalories || state.profile.manualCalories || 0),
      manualProtein: Number(data.manualProtein || state.profile.manualProtein || 0)
    });
    if (state.profile.currentWeight) {
      const existing = state.weights.find((item) => item.date === today());
      if (existing) existing.weight = state.profile.currentWeight;
      else state.weights.push({ date: today(), weight: state.profile.currentWeight });
    }
    saveState();
    toast("Profil sauvegardé.");
    renderProfile();
  });
}

function bindExclusionForm() {
  $("#exclusionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const exclusions = form.getAll("exclusions");
    state.profile.exclusions = exclusions.includes("aucune") ? [] : exclusions;
    state.profile.exclusionOther = form.get("other") || "";
    saveState();
    toast("Préférences sauvegardées.");
    renderProfile();
  });
}

function exportUserData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mass-plus-sauvegarde-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Sauvegarde JSON exportée.");
}

async function importUserData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = migrateState(parsed.data || parsed);
    const replace = confirm("Remplacer les données actuelles par cette sauvegarde ? Annuler = fusionner sans effacer.");
    if (replace) {
      state = imported;
    } else {
      state.profile = { ...state.profile, ...imported.profile };
      state.entries = mergeById(state.entries, imported.entries).map(normalizeEntry);
      state.weights = mergeById(state.weights.map(weightRecord), imported.weights.map(weightRecord));
      state.favorites = mergeById(state.favorites, imported.favorites).map(normalizeFavorite);
      state.customFoods = mergeById(state.customFoods, imported.customFoods);
      state.offFoods = mergeById(state.offFoods, imported.offFoods);
      state.offCache = { ...imported.offCache, ...state.offCache };
      state.photos = mergeById(state.photos, imported.photos);
    }
    await persistState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    toast("Sauvegarde importée.");
    renderProfile();
  } catch {
    toast("Import impossible : fichier JSON invalide.");
  } finally {
    event.target.value = "";
  }
}

function mergeById(current, incoming) {
  const map = new Map((current || []).map((item) => [item.id, item]));
  (incoming || []).forEach((item) => map.set(item.id || id(), item));
  return [...map.values()];
}

function filteredRecipes() {
  const exclusions = state.profile.exclusions || [];
  const list = recipes.filter((recipe) => {
    if (exclusions.includes("végétarien") && !recipe.tags?.includes("végétarien")) return false;
    return !exclusions.some((item) => (recipe.exclusions || []).includes(item));
  });
  if (recipesTab === "favorites") return list.filter((recipe) => isRecipeFavorite(recipe.id));
  return list;
}

function isRecipeFavorite(recipeId) {
  return (state.recipeFavorites || []).includes(recipeId);
}

function toggleRecipeFavorite(recipeId) {
  const set = new Set(state.recipeFavorites || []);
  if (set.has(recipeId)) {
    set.delete(recipeId);
    toast("Recette retirée des favorites.");
  } else {
    set.add(recipeId);
    toast("Recette ajoutée aux favorites.");
  }
  state.recipeFavorites = [...set];
  saveState();
  renderRecipes();
}

function renderRecipes() {
  const list = filteredRecipes();
  $("#screen").innerHTML = `<article class="card">
    <div class="section-head"><h2>Recettes</h2><button class="ghost-inline" data-go="home">Journal</button></div>
    <div class="tabs sub-tabs">
      <button class="${recipesTab === "recipes" ? "active" : ""}" data-recipes-tab="recipes">Recettes</button>
      <button class="${recipesTab === "favorites" ? "active" : ""}" data-recipes-tab="favorites">Mes favorites</button>
      <button class="${recipesTab === "tips" ? "active" : ""}" data-recipes-tab="tips">Astuces</button>
    </div>
    ${recipesTab === "tips"
      ? `<p class="small">Astuces déjà présentes dans Mass+.</p><div class="stack">${tips.map(tipCard).join("")}</div>`
      : `<p class="small">${list.length} recette(s) ${recipesTab === "favorites" ? "favorite(s)" : "compatibles avec le profil"}.</p><div class="stack">${list.map(recipeCard).join("") || `<p class="small">Aucune recette favorite pour le moment.</p>`}</div>`}
  </article>`;
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
  $$('[data-recipes-tab]').forEach((button) => button.addEventListener("click", () => {
    recipesTab = button.dataset.recipesTab;
    renderRecipes();
  }));
  bindRecipeButtons();
  renderRecipePhotoThumbs();
}

function recipeImageMarkup(recipe) {
  const label = recipe.category || recipe.type || "recette";
  return `<div class="recipe-media" data-recipe-image="${esc(recipe.id)}" aria-label="Image ${esc(recipe.name)}"><span>${esc(label)}</span></div>`;
}

function recipeCard(recipe) {
  const duration = recipe.duration || recipe.time || "15 min";
  const difficulty = recipe.difficulty || recipe.type || recipe.category || "recette";
  const cost = recipe.cost || recipe.budget || "";
  const favorite = isRecipeFavorite(recipe.id);
  return `<div class="recipe-card">
    <div class="recipe-card-head">${recipeImageMarkup(recipe)}<div><strong>${esc(recipe.name)}</strong><div class="macro">${esc(duration)} · ${esc(difficulty)} ${cost ? `· ${esc(cost)} ` : ""}· ${fmt(recipe.kcal)} kcal · ${fmt(recipe.protein)} g prot.</div></div><button class="heart-button ${favorite ? "active" : ""}" data-recipe-heart="${recipe.id}" type="button" aria-label="${favorite ? "Retirer des favorites" : "Ajouter aux favorites"}">♥</button></div>
    <details><summary>Voir les ingrédients</summary>${recipeImageMarkup({ ...recipe, id: `${recipe.id}-detail`, name: recipe.name, category: "aperçu" })}<ul>${(recipe.ingredients || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul><ol>${(recipe.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>
    <div class="recipe-controls"><label>Portions<input inputmode="decimal" value="1" data-recipe-portions="${recipe.id}"></label><button class="primary-button compact" data-recipe-journal="${recipe.id}">Ajouter</button><label class="secondary-button compact recipe-photo-button">Photo<input type="file" accept="image/*" data-recipe-photo="${recipe.id}"></label>${state.recipePhotos?.[recipe.id] ? `<button class="danger-button compact" data-delete-recipe-photo="${recipe.id}">Suppr. photo</button>` : ""}</div>
  </div>`;
}

function bindRecipeButtons() {
  $$('[data-recipe-journal]').forEach((button) => button.addEventListener("click", () => addRecipeToJournal(button.dataset.recipeJournal)));
  $$('[data-recipe-heart]').forEach((button) => button.addEventListener("click", () => toggleRecipeFavorite(button.dataset.recipeHeart)));
  $$('[data-recipe-photo]').forEach((input) => input.addEventListener("change", saveRecipePhoto));
  $$('[data-delete-recipe-photo]').forEach((button) => button.addEventListener("click", () => deleteRecipePhoto(button.dataset.deleteRecipePhoto)));
}

function recipePortions(recipeId) {
  const value = Number($(`[data-recipe-portions="${recipeId}"]`)?.value || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function addRecipeToJournal(recipeId) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  const portions = recipePortions(recipeId);
  if (!recipe.items?.length) {
    addEntry(recipeAsFood(recipe), portions, selectedMeal || "déjeuner", false);
    saveState();
    toast("Recette ajoutée au journal.");
    go("home");
    return;
  }
  recipe.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) addEntry(food, item.grams * portions, recipe.meal || "déjeuner", false);
  });
  saveState();
  toast("Recette ajoutée au journal.");
  selectedMeal = recipe.meal || "déjeuner";
  go("home");
}

function addRecipeToFavorites(recipeId) {
  toggleRecipeFavorite(recipeId);
}

function recipeAsFood(recipe) {
  return {
    id: `recipe-${recipe.id}`,
    name: recipe.name,
    source: "Recette",
    kcalPer100g: Number(recipe.kcal || 0) * 100,
    proteinPer100g: Number(recipe.protein || 0) * 100,
    carbsPer100g: Number(recipe.carbs || 0) * 100,
    fatPer100g: Number(recipe.fat || 0) * 100,
    defaultPortionG: 1,
    unit: "portion"
  };
}

async function saveRecipePhoto(event) {
  const file = event.target.files?.[0];
  const recipeId = event.target.dataset.recipePhoto;
  if (!file || !recipeId) return;
  const blob = await compressImage(file, "image/webp", 0.68);
  await idbPut({ id: `recipe-photo-${recipeId}`, blob });
  state.recipePhotos[recipeId] = { id: `recipe-photo-${recipeId}`, updatedAt: new Date().toISOString() };
  saveState();
  toast("Photo de recette enregistrée.");
  renderRecipes();
}

async function deleteRecipePhoto(recipeId) {
  await idbDelete(`recipe-photo-${recipeId}`);
  delete state.recipePhotos[recipeId];
  saveState();
  toast("Photo supprimée.");
  renderRecipes();
}

async function renderRecipePhotoThumbs() {
  await Promise.all(Object.keys(state.recipePhotos || {}).map(async (recipeId) => {
    const stored = await idbGet(`recipe-photo-${recipeId}`).catch(() => null);
    if (!stored?.blob) return;
    const url = URL.createObjectURL(stored.blob);
    $$(`[data-recipe-image="${recipeId}"], [data-recipe-image="${recipeId}-detail"]`).forEach((node) => {
      node.innerHTML = `<img src="${url}" alt="Photo de recette">`;
    });
  }));
}

function renderTips() {
  $("#screen").innerHTML = `<article class="card"><div class="section-head"><h2>Astuces simples</h2><button class="ghost-inline" data-go="home">Accueil</button></div><div class="stack">${tips.map(tipCard).join("")}</div></article>`;
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
}

function tipCard(tip) {
  return `<div class="tip-card"><span>${esc(tip.category)}</span><strong>${esc(tip.title)}</strong><p>${esc(tip.body)}</p></div>`;
}

function renderPhoto() {
  selectedPhotoFile = null;
  revokePhotoPreview();
  photoAnalysisDraft = null;
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Photographier mon repas</h2>
      <p class="small">La photo sert de repère visuel. Les calories sont calculées à partir des aliments et quantités que vous confirmez.</p>
      <form id="photoForm" class="form-grid photo-form">
        <label>Repas<select name="meal">${MEALS.map((meal) => `<option ${meal === state.pendingPhotoMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
        <div class="photo-picker wide">
          <input id="photoCameraInput" class="visually-hidden-file" type="file" accept="image/*" capture="environment">
          <input id="photoLibraryInput" class="visually-hidden-file" type="file" accept="image/*">
          <button class="secondary-button wide" id="takePhotoButton" type="button">Prendre une photo</button>
          <button class="secondary-button wide" id="choosePhotoButton" type="button">Choisir dans la photothèque</button>
          <div id="photoPreview" class="photo-preview"><span>Aucune photo sélectionnée</span></div>
          <p class="small" id="photoFileStatus">La photo reste stockée localement tant que vous ne lancez pas l’analyse.</p>
        </div>
        <button class="primary-button wide" id="savePhotoButton" disabled>Enregistrer la photo</button>
      </form>
    </article>
    <article class="card">
      <h2>Photos enregistrées</h2>
      <div id="photoList" class="stack"><p class="small">Chargement...</p></div>
    </article>
    <div id="photoAnalysisPanel"></div>`;
  bindPhotoForm();
  renderPhotoList();
}

function bindPhotoForm() {
  const cameraInput = $("#photoCameraInput");
  const libraryInput = $("#photoLibraryInput");
  $("#takePhotoButton").addEventListener("click", () => cameraInput.click());
  $("#choosePhotoButton").addEventListener("click", () => libraryInput.click());
  cameraInput.addEventListener("change", () => selectPhotoFile(cameraInput.files?.[0]));
  libraryInput.addEventListener("change", () => selectPhotoFile(libraryInput.files?.[0]));
  $("#photoForm").addEventListener("submit", savePhotoFromForm);
}

function revokePhotoPreview() {
  if (selectedPhotoPreviewUrl) URL.revokeObjectURL(selectedPhotoPreviewUrl);
  selectedPhotoPreviewUrl = "";
}

function selectPhotoFile(file) {
  if (!file) return;
  selectedPhotoFile = file;
  revokePhotoPreview();
  selectedPhotoPreviewUrl = URL.createObjectURL(file);
  $("#photoPreview").innerHTML = `<img src="${selectedPhotoPreviewUrl}" alt="Aperçu du repas">`;
  $("#photoFileStatus").textContent = file.name ? `${file.name} prêt à enregistrer.` : "Photo prête à enregistrer.";
  $("#savePhotoButton").disabled = false;
}

async function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(photo) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(photoId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(photoId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(photoId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const request = tx.objectStore(PHOTO_STORE).get(photoId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function compressImage(file, mimeType = "image/jpeg", quality = 0.72) {
  const bitmap = await loadImageBitmap(file);
  const max = 1100;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("image_compression_failed"));
  }, mimeType, quality));
}

async function loadImageBitmap(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      console.info("ImageBitmap decoding unavailable, using image fallback", { type: file.type, error: error?.message });
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function savePhotoFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = selectedPhotoFile;
  const meal = form.meal.value;
  if (!file) {
    toast("Choisis une photo.");
    return;
  }
  const saveButton = $("#savePhotoButton");
  saveButton.disabled = true;
  saveButton.textContent = "Compression...";
  try {
    const blob = await compressImage(file);
    const photoId = id();
    await idbPut({ id: photoId, blob });
    state.photos.unshift({ id: photoId, date: today(), meal, createdAt: new Date().toISOString() });
    state.pendingPhotoMeal = meal;
    saveState();
    toast("Photo enregistrée.");
    renderPhoto();
    setTimeout(() => startPhotoAnalysis(photoId), 80);
  } catch {
    toast("Photo impossible à enregistrer.");
    saveButton.disabled = false;
    saveButton.textContent = "Enregistrer la photo";
  }
}

async function renderPhotoList() {
  const node = $("#photoList");
  if (!state.photos.length) {
    node.innerHTML = `<p class="small">Aucune photo pour le moment.</p>`;
    return;
  }
  const cards = await Promise.all(state.photos.slice(0, 8).map(async (meta) => {
    const stored = await idbGet(meta.id).catch(() => null);
    const url = stored?.blob ? URL.createObjectURL(stored.blob) : "";
    const total = meta.analysisTotals ? `<div class="macro">Confirmé : ${fmt(meta.analysisTotals.kcal)} kcal · ${fmt(meta.analysisTotals.protein, 1)} g prot.</div>` : "";
    return `<div class="photo-card">${url ? `<img src="${url}" alt="Photo repas">` : ""}<div><strong>${esc(meta.meal)}</strong><div class="macro">${esc(meta.date)}</div>${total}<div class="photo-actions"><button class="primary-button compact" data-photo-analyze="${esc(meta.id)}">Analyser le repas</button><button class="secondary-button compact" data-photo-manual="${esc(meta.meal)}">Saisie manuelle</button><button class="danger-button compact" data-delete-photo="${esc(meta.id)}">Supprimer</button></div></div></div>`;
  }));
  node.innerHTML = cards.join("");
  $$('[data-photo-analyze]').forEach((button) => button.addEventListener("click", () => startPhotoAnalysis(button.dataset.photoAnalyze)));
  $$('[data-photo-manual]').forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.photoManual;
    selectedDate = today();
    go("journal");
  }));
  $$('[data-delete-photo]').forEach((button) => button.addEventListener("click", async () => {
    await idbDelete(button.dataset.deletePhoto);
    state.photos = state.photos.filter((photo) => photo.id !== button.dataset.deletePhoto);
    if (photoAnalysisDraft?.photoId === button.dataset.deletePhoto) photoAnalysisDraft = null;
    saveState();
    renderPhoto();
  }));
}

function photoAnalysisEndpoint() {
  return localStorage.getItem(PHOTO_ANALYSIS_ENDPOINT_KEY) || window.MASS_PLUS_ANALYSIS_ENDPOINT || "";
}

function photoAnalysisMode() {
  return localStorage.getItem(PHOTO_ANALYSIS_MODE_KEY) || window.MASS_PLUS_ANALYSIS_MODE || "live";
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function photoAnalysisDevelopmentMode() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname) || localStorage.getItem("mass-plus-analysis-diagnostic") === "true";
}

function photoAnalysisDiagnosticMarkup(diagnostic = photoAnalysisDiagnostic) {
  if (!photoAnalysisDevelopmentMode() || !diagnostic) return "";
  return `<details class="analysis-diagnostic"><summary>Diagnostic développement</summary>
    <dl><dt>Fonction</dt><dd>${esc(diagnostic.functionName || "analyze-meal")}</dd><dt>Statut HTTP</dt><dd>${esc(String(diagnostic.httpStatus || "aucun"))}</dd><dt>Durée</dt><dd>${esc(String(diagnostic.durationMs || 0))} ms</dd><dt>Détail</dt><dd>${esc(diagnostic.message || "Aucun")}</dd></dl>
  </details>`;
}

const PhotoAnalysisService = {
  controller: null,
  cancel() {
    this.controller?.abort();
    this.controller = null;
  },
  async analyze(meta) {
    const startedAt = performance.now();
    let httpStatus = 0;
    const finish = (result, detail = result.message || result.status) => ({
      ...result,
      diagnostic: {
        functionName: "analyze-meal",
        httpStatus,
        durationMs: Math.round(performance.now() - startedAt),
        message: String(detail || "")
      }
    });
    if (!navigator.onLine) {
      console.info("Meal analysis skipped: offline");
      return finish({ status: "offline", message: "Analyse disponible avec une connexion internet." }, "navigator_offline");
    }
    const endpoint = photoAnalysisEndpoint();
    if (!endpoint || photoAnalysisMode() === "demo") {
      console.info("Meal analysis not configured", { endpointConfigured: Boolean(endpoint), mode: photoAnalysisMode() });
      return finish({ status: "notConfigured", message: PHOTO_ANALYSIS_NOT_CONFIGURED }, "endpoint_missing_or_disabled");
    }
    const stored = await idbGet(meta.id).catch((error) => {
      console.error("Meal analysis photo lookup failed", error);
      return null;
    });
    if (!stored?.blob) return finish({ status: "error", message: "Photo locale introuvable." }, "local_photo_missing");
    if (stored.blob.size > 4_500_000) {
      console.error("Meal analysis image too large", { bytes: stored.blob.size });
      return finish({ status: "tooLarge", message: "Image trop volumineuse. Reprends une photo plus légère." }, `image_too_large:${stored.blob.size}`);
    }

    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), PHOTO_ANALYSIS_TIMEOUT_MS);
    try {
      const imageBase64 = await blobToDataUrl(stored.blob);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, meal: meta.meal, date: meta.date }),
        signal: controller.signal
      });
      httpStatus = response.status;
      const responseText = await response.text();
      let responseBody;
      try {
        responseBody = JSON.parse(responseText);
      } catch (error) {
        console.error("Meal analysis returned invalid JSON", { status: response.status, error });
        return finish({ status: "invalidJson", message: "Réponse JSON invalide ou inexploitable." }, "response_not_json");
      }
      if (!response.ok) return finish(this.errorFromResponse(response, responseBody), responseBody?.code || responseBody?.error || `http_${response.status}`);
      let payload;
      try {
        payload = validatePhotoAnalysisPayload(responseBody);
      } catch (error) {
        console.error("Meal analysis payload validation failed", error);
        return finish({ status: "invalidJson", message: "Réponse JSON invalide ou inexploitable." }, error.message);
      }
      if (!payload.foods.length) return finish({ status: "empty", message: payload.analysisWarnings[0] || "Aucun aliment détecté.", payload }, "no_food_detected");
      return finish({ status: "ok", payload, demo: false }, "success");
    } catch (error) {
      console.error("Meal analysis network failure", error);
      if (controller.signal.aborted) return finish({ status: "timeout", message: "L’analyse a dépassé le délai autorisé. Réessaie." }, "request_timeout_or_cancelled");
      return finish({ status: "network", message: "Connexion au service d’analyse impossible." }, error?.message || "network_error");
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  },
  errorFromResponse(response, body) {
    const code = body?.code || body?.error || "unknown_error";
    console.error("Meal analysis backend error", { status: response.status, code, body });
    if (response.status === 413) return { status: "tooLarge", message: "Image trop volumineuse pour le service d’analyse." };
    if (code === "missing_api_key") return { status: "missingApiKey", message: "Clé API absente côté backend. Configure OPENAI_API_KEY dans les secrets Supabase." };
    if (response.status === 429 || code === "ai_quota_exceeded") return { status: "quota", message: "Quota du service IA atteint. Réessaie plus tard." };
    if (response.status === 504 || code === "ai_timeout") return { status: "timeout", message: "Le service IA a mis trop de temps à répondre." };
    if (response.status === 401 || response.status === 403) return { status: "backendAuth", message: "Backend configuré, mais accès refusé. Vérifie les origines autorisées et les secrets." };
    if (response.status === 422 || code === "invalid_model_json") return { status: "invalidJson", message: "Réponse JSON invalide ou inexploitable." };
    if (response.status >= 500) return { status: "unavailable", message: "Service IA indisponible. Réessaie plus tard." };
    return { status: "network", message: "Erreur réseau pendant l’analyse." };
  }
};

function validatePhotoAnalysisPayload(raw) {
  const data = raw?.analysis && typeof raw.analysis === "object" ? raw.analysis : raw;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid analysis payload");
  if (!Array.isArray(data.foods)) throw new Error("Invalid foods list");
  const foods = data.foods.slice(0, 16).map((food) => {
    if (!food || typeof food !== "object" || Array.isArray(food)) throw new Error("Invalid food item");
    const name = String(food.name || "").trim();
    const estimatedGrams = nullableNumber(food.estimatedQuantityGrams);
    let confidence = Number(food.confidence);
    if (!name || estimatedGrams <= 0) throw new Error("Invalid food identity");
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Invalid confidence");
    return {
      name,
      estimatedGrams: Math.round(estimatedGrams),
      estimatedCalories: nonNegativeNumber(food.estimatedCalories),
      estimatedProteinGrams: nonNegativeNumber(food.estimatedProteinGrams),
      estimatedCarbohydrateGrams: nonNegativeNumber(food.estimatedCarbohydrateGrams),
      estimatedFatGrams: nonNegativeNumber(food.estimatedFatGrams),
      confidence: +confidence.toFixed(2),
      needsConfirmation: food.needsConfirmation !== false
    };
  });
  return {
    mealTitle: String(data.mealTitle || (foods.length ? "Repas analysé" : "Aucun aliment détecté")).trim(),
    foods,
    analysisWarnings: arrayOfStrings(data.analysisWarnings || [])
  };
}

function nullableNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? +number.toFixed(1) : 0;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [];
}

function cancelPhotoAnalysisPanel() {
  photoAnalysisRunToken += 1;
  photoAnalysisRunning = false;
  PhotoAnalysisService.cancel();
  const panel = $("#photoAnalysisPanel");
  if (panel) panel.innerHTML = "";
  photoAnalysisDraft = null;
}

async function startPhotoAnalysis(photoId) {
  if (photoAnalysisRunning) {
    toast("Une analyse est déjà en cours.");
    return;
  }
  const meta = state.photos.find((photo) => photo.id === photoId);
  if (!meta) return;
  const runToken = ++photoAnalysisRunToken;
  photoAnalysisRunning = true;
  photoAnalysisDiagnostic = null;
  selectedMeal = meta.meal;
  selectedDate = meta.date || today();
  renderPhotoAnalysisState(meta, "loading");
  try {
    const result = await PhotoAnalysisService.analyze(meta);
    if (runToken !== photoAnalysisRunToken) return;
    photoAnalysisDiagnostic = result.diagnostic || null;
    if (result.status !== "ok") {
      renderPhotoAnalysisState(meta, result.status, result.message);
      return;
    }
    photoAnalysisDraft = buildPhotoAnalysisDraft(meta, result.payload);
    renderPhotoAnalysisDraft();
  } finally {
    if (runToken === photoAnalysisRunToken) photoAnalysisRunning = false;
  }
}

function buildPhotoAnalysisDraft(meta, payload) {
  return {
    id: id(),
    photoId: meta.id,
    meal: meta.meal,
    date: meta.date || today(),
    demo: false,
    mealTitle: payload.mealTitle || "Repas analysé",
    analysisWarnings: payload.analysisWarnings || [],
    items: payload.foods.map((food) => ({
      id: id(),
      name: food.name,
      detectedName: food.name,
      grams: food.estimatedGrams,
      kcal: food.estimatedCalories,
      protein: food.estimatedProteinGrams,
      carbs: food.estimatedCarbohydrateGrams,
      fat: food.estimatedFatGrams,
      needsConfirmation: food.needsConfirmation,
      matchedFoodId: bestFoodMatch(food.name)?.id || "",
      confidence: food.confidence,
      source: "Analyse IA à confirmer"
    }))
  };
}

function bestFoodMatch(name) {
  const normalized = normalizeSearch(name);
  const genericTerms = new Set(["aliment", "aliments", "plat", "repas", "legume", "legumes", "fruit", "fruits", "feculent", "feculents", "viande", "viandes", "poisson", "poissons", "sauce", "garniture"]);
  if (genericTerms.has(normalized)) return null;
  const results = searchLocalFoods(name);
  const first = results[0];
  if (!first) return null;
  const targetTokens = new Set(searchTokens(name));
  const foodTokens = new Set(searchTokens([first.name, ...(first.aliases || [])].join(" ")));
  const hasSharedSpecificToken = [...targetTokens].some((token) => token.length > 3 && foodTokens.has(token));
  const exact = normalizeSearch(first.name) === normalized || (first.aliases || []).some((alias) => normalizeSearch(alias) === normalized);
  return exact || hasSharedSpecificToken ? first : null;
}

function renderPhotoAnalysisState(meta, status, message = "") {
  const panel = $("#photoAnalysisPanel");
  if (!panel) return;
  const statusText = {
    loading: "Analyse en cours…",
    offline: "Analyse disponible avec une connexion internet.",
    notConfigured: PHOTO_ANALYSIS_NOT_CONFIGURED,
    missingApiKey: "Clé API absente côté backend. Configure OPENAI_API_KEY dans les secrets Supabase.",
    backendAuth: "Backend configuré, mais accès refusé.",
    tooLarge: "Image trop volumineuse.",
    invalidJson: "Réponse JSON invalide ou inexploitable.",
    unavailable: "Service IA indisponible.",
    quota: "Quota du service IA atteint.",
    timeout: "Le service d’analyse a mis trop de temps à répondre.",
    network: "Erreur réseau pendant l’analyse.",
    empty: "Aucun aliment détecté.",
    error: "Analyse impossible."
  }[status] || "Analyse impossible.";
  panel.innerHTML = `<article class="card analysis-card">
    <div class="section-head"><h2>Analyse du repas</h2><button class="ghost-inline" id="closeAnalysis" type="button">Fermer</button></div>
    <p class="small" aria-live="polite">${esc(message || statusText)}</p>
    ${status === "loading" ? `<div class="analysis-loading" aria-hidden="true"></div>` : ""}
    ${photoAnalysisDiagnosticMarkup()}
    ${status !== "loading" ? `<div class="inline-actions"><button class="primary-button compact" id="retryAnalysis" type="button">Relancer l’analyse</button><button class="secondary-button compact" id="manualAnalysisEntry" type="button">Saisie manuelle</button></div>` : ""}
  </article>`;
  $("#closeAnalysis")?.addEventListener("click", cancelPhotoAnalysisPanel);
  $("#retryAnalysis")?.addEventListener("click", () => startPhotoAnalysis(meta.id));
  $("#manualAnalysisEntry")?.addEventListener("click", () => { selectedMeal = meta.meal; selectedDate = meta.date || today(); go("journal"); });
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

function renderPhotoAnalysisDraft() {
  const panel = $("#photoAnalysisPanel");
  if (!panel || !photoAnalysisDraft) return;
  const options = allFoods().slice(0, 120).map((food) => `<option value="${esc(food.name)}"></option>`).join("");
  panel.innerHTML = `<article class="card analysis-card">
    <div class="section-head"><h2>Confirmer le repas</h2><button class="ghost-inline" id="closeAnalysis" type="button">Fermer</button></div>
    <div id="analysisPhotoPreview" class="analysis-photo-preview"><span>Photo analysée</span></div>
    <p class="notice analysis-notice">${esc(PHOTO_ANALYSIS_DISCLAIMER)}</p>
    <p class="small"><strong>${esc(photoAnalysisDraft.mealTitle)}</strong></p>
    <datalist id="analysisFoodOptions">${options}</datalist>
    <div class="stack analysis-list">${photoAnalysisDraft.items.map(analysisItemRow).join("") || `<p class="small">Aucun aliment à confirmer.</p>`}</div>
    ${photoAnalysisDraft.analysisWarnings.length ? `<div class="analysis-warnings">${photoAnalysisDraft.analysisWarnings.map((warning) => `<p class="small">${esc(warning)}</p>`).join("")}</div>` : ""}
    <div class="analysis-add">
      <label>Aliment manquant<input id="analysisAddName" list="analysisFoodOptions" placeholder="ex. huile d’olive"></label>
      <label>Grammes<input id="analysisAddGrams" inputmode="numeric" value="50"></label>
      <button class="secondary-button compact" id="analysisAddFood" type="button">Ajouter un aliment</button>
    </div>
    <div class="analysis-totals" id="analysisTotals">${analysisTotalsMarkup()}</div>
    ${photoAnalysisDiagnosticMarkup()}
    <div class="inline-actions">
      <button class="secondary-button compact" id="focusCorrection" type="button">Corriger</button>
      <button class="secondary-button compact" id="cancelPhotoAnalysis" type="button">Annuler</button>
      <button class="primary-button" id="confirmPhotoMeal" type="button">Confirmer et ajouter au journal</button>
    </div>
  </article>`;
  bindPhotoAnalysisDraft();
  renderAnalysisPhotoPreview(photoAnalysisDraft.photoId);
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

function analysisItemRow(item) {
  const macros = analysisItemMacros(item);
  return `<div class="analysis-row" data-analysis-row="${esc(item.id)}">
    <label>Aliment<input value="${esc(item.name)}" list="analysisFoodOptions" data-analysis-name="${esc(item.id)}"></label>
    <label>Quantité (g)<input value="${esc(item.grams)}" type="number" min="1" step="1" data-analysis-field="grams" data-analysis-id="${esc(item.id)}"></label>
    <div class="analysis-nutrition-grid">
      <label>Calories<input value="${esc(macros.kcal)}" type="number" min="0" step="1" data-analysis-field="kcal" data-analysis-id="${esc(item.id)}"></label>
      <label>Protéines (g)<input value="${esc(macros.protein)}" type="number" min="0" step="0.1" data-analysis-field="protein" data-analysis-id="${esc(item.id)}"></label>
      <label>Glucides (g)<input value="${esc(macros.carbs)}" type="number" min="0" step="0.1" data-analysis-field="carbs" data-analysis-id="${esc(item.id)}"></label>
      <label>Lipides (g)<input value="${esc(macros.fat)}" type="number" min="0" step="0.1" data-analysis-field="fat" data-analysis-id="${esc(item.id)}"></label>
    </div>
    <p class="analysis-confidence">Confiance ${fmt(item.confidence * 100)} % · ${esc(item.source)}</p>
    <button class="danger-button compact" data-analysis-delete="${esc(item.id)}" type="button">Supprimer</button>
  </div>`;
}

function bindPhotoAnalysisDraft() {
  $("#closeAnalysis")?.addEventListener("click", cancelPhotoAnalysisPanel);
  $("#cancelPhotoAnalysis")?.addEventListener("click", cancelPhotoAnalysisPanel);
  $("#confirmPhotoMeal")?.addEventListener("click", confirmPhotoAnalysis);
  $("#focusCorrection")?.addEventListener("click", () => $('[data-analysis-name]')?.focus());
  $("#analysisAddFood")?.addEventListener("click", addAnalysisFoodRow);
  $$('[data-analysis-delete]').forEach((button) => button.addEventListener("click", () => {
    photoAnalysisDraft.items = photoAnalysisDraft.items.filter((item) => item.id !== button.dataset.analysisDelete);
    renderPhotoAnalysisDraft();
  }));
  $$('[data-analysis-name]').forEach((input) => input.addEventListener("input", () => updateAnalysisItem(input.dataset.analysisName, { name: input.value })));
  $$('[data-analysis-field]').forEach((input) => input.addEventListener("input", () => {
    updateAnalysisItem(input.dataset.analysisId, { [input.dataset.analysisField]: Math.max(0, Number(input.value || 0)) });
  }));
}

async function renderAnalysisPhotoPreview(photoId) {
  const node = $("#analysisPhotoPreview");
  if (!node) return;
  const stored = await idbGet(photoId).catch(() => null);
  if (!stored?.blob) return;
  const url = URL.createObjectURL(stored.blob);
  node.innerHTML = `<img src="${url}" alt="Photo analysée">`;
}

function updateAnalysisItem(itemId, patch) {
  const item = photoAnalysisDraft?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  Object.assign(item, patch);
  if (Object.prototype.hasOwnProperty.call(patch, "name")) item.matchedFoodId = bestFoodMatch(item.name)?.id || "";
  refreshAnalysisDraftDisplay();
}

function analysisTotalsMarkup(totals = photoAnalysisTotals()) {
  return `${metric("Calories", `${fmt(totals.kcal)} kcal`)}
    ${metric("Protéines", `${fmt(totals.protein, 1)} g`)}
    ${metric("Glucides", `${fmt(totals.carbs, 1)} g`)}
    ${metric("Lipides", `${fmt(totals.fat, 1)} g`)}`;
}

function refreshAnalysisDraftDisplay() {
  if (!photoAnalysisDraft) return;
  const totalsNode = $("#analysisTotals");
  if (totalsNode) totalsNode.innerHTML = analysisTotalsMarkup();
}

function addAnalysisFoodRow() {
  const name = $("#analysisAddName").value.trim();
  const grams = Number($("#analysisAddGrams").value || 0);
  if (!name || !grams) {
    toast("Ajoute un nom et une quantité.");
    return;
  }
  const match = bestFoodMatch(name);
  const macros = match ? calc(match, grams) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  photoAnalysisDraft.items.push({
    id: id(),
    name: match?.name || name,
    detectedName: name,
    grams,
    matchedFoodId: match?.id || "",
    confidence: match ? 1 : 0,
    kcal: macros.kcal,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    needsConfirmation: true,
    source: match ? `Base Mass+ : ${match.name}` : "Ajout manuel"
  });
  renderPhotoAnalysisDraft();
}

function analysisItemMacros(item) {
  const grams = Math.max(0, Number(item.grams || 0));
  const values = [item.kcal, item.protein, item.carbs, item.fat].map(Number);
  const usable = Boolean(item.name?.trim()) && grams > 0 && values.every((value) => Number.isFinite(value) && value >= 0);
  return { kcal: values[0] || 0, protein: values[1] || 0, carbs: values[2] || 0, fat: values[3] || 0, usable, food: null };
}

function photoAnalysisTotals() {
  return (photoAnalysisDraft?.items || []).reduce((sum, item) => {
    const macros = analysisItemMacros(item);
    if (!macros.usable) return sum;
    return { kcal: sum.kcal + macros.kcal, protein: sum.protein + macros.protein, carbs: sum.carbs + macros.carbs, fat: sum.fat + macros.fat };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function foodFromAnalysisItem(item) {
  const macros = analysisItemMacros(item);
  const grams = Math.max(1, Number(item.grams || 100));
  return {
    id: `analysis-${photoAnalysisDraft.id}-${item.id}`,
    name: item.name || "Aliment estimé",
    source: "Estimation photo confirmée",
    kcalPer100g: macros.kcal / grams * 100,
    proteinPer100g: macros.protein / grams * 100,
    carbsPer100g: macros.carbs / grams * 100,
    fatPer100g: macros.fat / grams * 100,
    defaultPortionG: grams,
    unit: "g"
  };
}

function confirmPhotoAnalysis() {
  if (!photoAnalysisDraft?.items.length) {
    toast("Aucun aliment à ajouter.");
    return;
  }
  const incomplete = photoAnalysisDraft.items.filter((item) => !analysisItemMacros(item).usable);
  if (incomplete.length) {
    toast("Vérifie les noms, quantités et valeurs nutritionnelles avant confirmation.");
    return;
  }
  selectedDate = photoAnalysisDraft.date;
  selectedMeal = photoAnalysisDraft.meal;
  photoAnalysisDraft.items.forEach((item) => {
    addEntry(foodFromAnalysisItem(item), Number(item.grams), photoAnalysisDraft.meal, false, {
      photoId: photoAnalysisDraft.photoId,
      photoMealId: photoAnalysisDraft.id,
      analysisId: photoAnalysisDraft.id,
      confidence: item.confidence,
      analysisDemo: false
    });
  });
  const totals = photoAnalysisTotals();
  const meta = state.photos.find((photo) => photo.id === photoAnalysisDraft.photoId);
  if (meta) {
    meta.analysisConfirmedAt = new Date().toISOString();
    meta.analysisDemo = false;
    meta.analysisTotals = totals;
    meta.analysisFoods = photoAnalysisDraft.items.map((item) => {
      const macros = analysisItemMacros(item);
      return { name: item.name, grams: Number(item.grams), confidence: item.confidence, kcal: macros.kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
    });
  }
  saveState();
  toast("Repas ajouté au journal après confirmation.");
  photoAnalysisDraft = null;
  go("home");
}

async function init() {
  await loadData();
  selectedDate = today();
  try {
    await loadPersistentState();
  } catch {
    state = loadState();
    setTimeout(() => toast("Stockage IndexedDB indisponible : mode local de secours."), 500);
  }
  const hashScreen = location.hash.replace("#", "");
  if (hashScreen === "tips") {
    recipesTab = "tips";
    currentScreen = "recipes";
  } else if (hashScreen === "favorites") {
    currentScreen = "journal";
  } else if ([...NAV.map(([screen]) => screen).filter((screen) => screen !== "add"), ...EXTRA_SCREENS].includes(hashScreen)) {
    currentScreen = hashScreen;
  }
  render();
  $("#installHelp").addEventListener("click", () => toast("iPhone Safari : Partager puis Ajouter à l’écran d’accueil. Android Chrome : Installer l’application."));
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined));
  }
  window.addEventListener("hashchange", () => {
    const next = location.hash.replace("#", "");
    if (next === "tips") {
      recipesTab = "tips";
      currentScreen = "recipes";
      render();
      return;
    }
    if (next === "favorites") {
      currentScreen = "journal";
      render();
      return;
    }
    if ([...NAV.map(([screen]) => screen).filter((screen) => screen !== "add"), ...EXTRA_SCREENS].includes(next)) {
      currentScreen = next;
      render();
    }
  });
}

init();
