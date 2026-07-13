"use strict";

const APP_VERSION = "1.1.0";
const STORAGE_KEY = "mass-plus-state-v2";
const LEGACY_KEYS = ["mass-plus-mvp-v1", "mass-plus-state"];
const DB_NAME = "mass-plus-local";
const DB_VERSION = 1;
const BACKUP_FORMAT = "mass-plus-backup";
const BACKUP_VERSION = 1;
const MAX_BACKUP_SIZE = 8_000_000;
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
const PHOTO_ANALYSIS_DISCLAIMER = "Vérifiez toujours les aliments, quantités et valeurs nutritionnelles avant l’ajout au journal.";
const MASS_PLUS_AI_PROMPT = `Analyse cette photo alimentaire pour l’application Mass+.

Identifie uniquement les aliments réellement visibles.
N’invente aucun ingrédient invisible.

Pour chaque aliment, estime :
- son nom en français ;
- sa quantité en grammes, millilitres ou unités ;
- ses calories ;
- ses protéines en grammes ;
- ses glucides en grammes ;
- ses lipides en grammes.

Donne une ligne distincte pour chaque aliment visible.

Réponds avec un seul objet JSON valide.

IMPORTANT POUR LA COPIE :
- place tout le JSON dans un unique bloc de code \`\`\`json ;
- n’écris aucun commentaire dans le JSON ;
- n’ajoute aucun texte à l’intérieur du bloc ;
- n’utilise pas de virgule après le dernier champ ;
- utilise uniquement des nombres pour les valeurs nutritionnelles ;
- utilise un point comme séparateur décimal ;
- le bouton de copie du bloc doit permettre de copier toute la réponse facilement.

Format exact :

{
  "mealName": "Nom du repas",
  "foods": [
    {
      "name": "Nom de l'aliment",
      "quantity": "Quantité estimée",
      "calories": 0,
      "protein": 0,
      "carbohydrates": 0,
      "fat": 0
    }
  ],
  "totals": {
    "calories": 0,
    "protein": 0,
    "carbohydrates": 0,
    "fat": 0
  },
  "uncertainties": "Éléments éventuels à confirmer"
}

Si la photo est ambiguë, indique-le uniquement dans « uncertainties ».

Ne renvoie jamais systématiquement les mêmes aliments.`;
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
  "eau gazeuse": ["eau gazeuse"],
  tomates: ["tomate", "tomates cerises"],
  "tomate cerise": ["tomates cerises", "tomate"],
  concom: ["concombre"],
  concombre: ["concombre"],
  melons: ["melon"],
  vinaigre: ["vinaigre", "vinaigre balsamique", "vinaigre de cidre", "vinaigre de vin"],
  balsamique: ["vinaigre balsamique"],
  oeuf: ["œuf", "oeufs"],
  oeufs: ["œuf", "oeufs"],
  "haricot rouge": ["haricots rouges"],
  "haricots rouge": ["haricots rouges"],
  "haricot blanc": ["haricots blancs"],
  cafe: ["café noir", "café filtre", "café expresso", "café"],
  "cafe sans sucre": ["café", "café sans sucre"]
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
let persistQueue = Promise.resolve();
let selectedPhotoFile = null;
let selectedPhotoPreviewUrl = "";
let photoAnalysisDraft = null;
let savedMealEditDraft = null;
let pendingBackupRestore = null;
let recipeFilter = "all";
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
const isDateKey = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
};
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

function normalizeSearchText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replace(/[’‘‛`´]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_']/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearch(text) {
  return normalizeSearchText(text);
}

function searchTokens(text) {
  return normalizeSearchText(text)
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => {
      const singular = token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
      return singular !== token ? [token, singular] : [token];
    });
}

function expandedQueries(query) {
  const normalized = normalizeSearchText(query);
  const aliases = SEARCH_ALIASES[normalized] || [];
  const singular = normalized.endsWith("s") && normalized.length > 3 ? normalized.slice(0, -1) : "";
  return [...new Set([normalized, singular, ...aliases.map(normalizeSearchText)].filter(Boolean))];
}

function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max(a.length, b.length);
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let last = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? last : Math.min(last + 1, prev[j] + 1, prev[j - 1] + 1);
      last = old;
    }
  }
  return prev[b.length];
}

function fuzzyTokenHit(token, words) {
  if (token.length < 4) return words.some((word) => word.startsWith(token) || token.startsWith(word));
  return words.some((word) => {
    if (word.includes(token)) return true;
    if (word.length < 4) return false;
    return token.includes(word) || levenshteinDistance(token, word) <= (token.length > 6 ? 2 : 1);
  });
}

function emptyState() {
  return {
    version: APP_VERSION,
    savedAt: "",
    saveRevision: 0,
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
    favoriteFoodIds: [],
    customFoods: [],
    offFoods: [],
    offCache: {},
    recipeFavorites: [],
    recipePhotos: {},
    dailyTip: null,
    hiddenTips: {},
    photos: [],
    pendingPhotoMeal: "déjeuner",
    untrackedDays: [],
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

function cloneState(source = state) {
  return JSON.parse(JSON.stringify(source));
}

async function persistStateSnapshot(source) {
  const snapshot = cloneState(source);
  const db = await openMassDb();
  const storeNames = ["profile", "settings", "journalEntries", "favorites", "savedMeals", "customFoods", "cachedProducts", "weights", "photoAnalyses", "recipes"];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    const replace = (storeName, records) => {
      const store = tx.objectStore(storeName);
      store.clear();
      records.forEach((record) => store.put(record));
    };
    tx.objectStore("profile").put({ id: "main", data: snapshot.profile, updatedAt: new Date().toISOString() });
    tx.objectStore("settings").put({
      id: "main",
      version: APP_VERSION,
      savedAt: snapshot.savedAt || "",
      saveRevision: Number(snapshot.saveRevision || 0),
      offCache: snapshot.offCache || {},
      favoriteFoodIds: snapshot.favoriteFoodIds || [],
      recipeFavorites: snapshot.recipeFavorites || [],
      recipePhotos: snapshot.recipePhotos || {},
      dailyTip: snapshot.dailyTip || null,
      hiddenTips: snapshot.hiddenTips || {},
      pendingPhotoMeal: snapshot.pendingPhotoMeal || "déjeuner",
      untrackedDays: snapshot.untrackedDays || [],
      migrations: snapshot.migrations || {},
      updatedAt: new Date().toISOString()
    });
    replace("journalEntries", (snapshot.entries || []).map(normalizeEntry));
    replace("favorites", (snapshot.favorites || []).map(normalizeFavorite));
    replace("savedMeals", (snapshot.favorites || []).map(normalizeFavorite));
    replace("customFoods", snapshot.customFoods || []);
    replace("cachedProducts", snapshot.offFoods || []);
    replace("weights", (snapshot.weights || []).map(weightRecord));
    replace("photoAnalyses", snapshot.photos || []);
    replace("recipes", recipes || []);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

function enqueueStatePersistence(source = state) {
  const snapshot = cloneState(source);
  persistQueue = persistQueue.catch(() => undefined).then(() => persistStateSnapshot(snapshot));
  return persistQueue;
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
  const [profileRecord, settingsRecord, entries, favorites, savedMeals, customFoods, cachedProducts, weights, photos] = await Promise.all([
    idbGetOne("profile", "main"),
    idbGetOne("settings", "main"),
    idbGetAll("journalEntries"),
    idbGetAll("favorites"),
    idbGetAll("savedMeals"),
    idbGetAll("customFoods"),
    idbGetAll("cachedProducts"),
    idbGetAll("weights"),
    idbGetAll("photoAnalyses")
  ]);
  const localState = readLocalState();
  const hasIndexedData = Boolean(profileRecord || settingsRecord || entries.length || favorites.length || savedMeals.length || customFoods.length || cachedProducts.length || weights.length || photos.length);
  if (!hasIndexedData) {
    state = localState || emptyState();
    await persistState();
    await idbPutRecord("meta", { id: "localStorageMigration", completedAt: new Date().toISOString(), version: APP_VERSION });
    return;
  }
  const next = emptyState();
  next.profile = { ...next.profile, ...(profileRecord?.data || {}) };
  next.entries = entries.map(normalizeEntry).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  next.favorites = mergeById(savedMeals, favorites).map(normalizeFavorite);
  next.favoriteFoodIds = Array.isArray(settingsRecord?.favoriteFoodIds) ? settingsRecord.favoriteFoodIds : [];
  next.customFoods = customFoods;
  next.offFoods = cachedProducts;
  next.offCache = settingsRecord?.offCache || {};
  next.recipeFavorites = settingsRecord?.recipeFavorites || [];
  next.recipePhotos = settingsRecord?.recipePhotos || {};
  next.dailyTip = settingsRecord?.dailyTip || null;
  next.hiddenTips = settingsRecord?.hiddenTips || {};
  next.photos = photos;
  next.pendingPhotoMeal = settingsRecord?.pendingPhotoMeal || "déjeuner";
  next.untrackedDays = Array.isArray(settingsRecord?.untrackedDays) ? [...new Set(settingsRecord.untrackedDays.filter(isDateKey))] : [];
  next.migrations = settingsRecord?.migrations || {};
  next.savedAt = settingsRecord?.savedAt || "";
  next.saveRevision = Number(settingsRecord?.saveRevision || 0);
  next.weights = weights.map(weightRecord).sort((a, b) => a.date.localeCompare(b.date));
  const latest = latestWeightFrom(next);
  if (latest) next.profile.currentWeight = latest;
  if (localState && (localState.saveRevision > next.saveRevision || (localState.saveRevision === next.saveRevision && localState.savedAt > next.savedAt))) {
    state = localState;
    await persistStateSnapshot(localState);
  } else {
    state = next;
  }
  if (migrateSavedMealsToRecipeFavorites(state)) await persistState();
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return null;
    return migrateState(JSON.parse(raw), { persist: false });
  } catch {
    return null;
  }
}

function loadState() {
  return readLocalState() || emptyState();
}

function migrateState(saved, options = {}) {
  const next = emptyState();
  next.savedAt = typeof saved.savedAt === "string" ? saved.savedAt : "";
  next.saveRevision = Number(saved.saveRevision || 0);
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
  next.favoriteFoodIds = Array.isArray(saved.favoriteFoodIds) ? [...new Set(saved.favoriteFoodIds.filter(Boolean))] : [];
  next.customFoods = Array.isArray(saved.customFoods) ? saved.customFoods : [];
  next.offFoods = Array.isArray(saved.offFoods) ? saved.offFoods : [];
  next.offCache = saved.offCache || {};
  next.recipeFavorites = Array.isArray(saved.recipeFavorites) ? saved.recipeFavorites : [];
  next.recipePhotos = saved.recipePhotos && typeof saved.recipePhotos === "object" ? saved.recipePhotos : {};
  next.dailyTip = saved.dailyTip || null;
  next.hiddenTips = saved.hiddenTips && typeof saved.hiddenTips === "object" ? saved.hiddenTips : {};
  next.photos = Array.isArray(saved.photos) ? saved.photos : [];
  next.pendingPhotoMeal = saved.pendingPhotoMeal || "déjeuner";
  next.untrackedDays = Array.isArray(saved.untrackedDays) ? [...new Set(saved.untrackedDays.filter(isDateKey))] : [];
  next.migrations = saved.migrations && typeof saved.migrations === "object" ? saved.migrations : {};
  if (!next.migrations.savedMealsV1) next.migrations.savedMealsV1 = APP_VERSION;
  migrateSavedMealsToRecipeFavorites(next);
  next.version = APP_VERSION;
  const latest = latestWeightFrom(next);
  if (latest) next.profile.currentWeight = latest;
  if (options.persist !== false) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function normalizeFavorite(favorite) {
  return {
    id: favorite.id || id(),
    itemType: "savedMeal",
    name: favorite.name || "Favori",
    meal: favorite.meal || "collation",
    createdAt: favorite.createdAt || new Date().toISOString(),
    updatedAt: favorite.updatedAt || favorite.createdAt || new Date().toISOString(),
    items: (favorite.items || []).map((item) => {
      const food = findFood(item.food || item.foodId, false);
      const grams = Number(item.grams || 0);
      const macros = food ? calc(food, grams) : { kcal: item.kcal || 0, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0 };
      return { food: item.food || item.foodId, name: item.name || food?.name || "Aliment", grams, ...macros };
    })
  };
}

function migrateSavedMealsToRecipeFavorites(target) {
  const migrationKey = "savedMealsInRecipeFavoritesV2";
  const favorites = Array.isArray(target.favorites) ? target.favorites : [];
  const needsNormalization = favorites.some((favorite) => favorite.itemType !== "savedMeal");
  const firstRun = !target.migrations?.[migrationKey];
  target.favorites = favorites.map(normalizeFavorite);
  target.migrations = target.migrations && typeof target.migrations === "object" ? target.migrations : {};
  target.migrations[migrationKey] = target.migrations[migrationKey] || APP_VERSION;
  return firstRun || needsNormalization;
}

function saveState() {
  state.version = APP_VERSION;
  state.savedAt = new Date().toISOString();
  state.saveRevision = Number(state.saveRevision || 0) + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // IndexedDB remains the primary store when the compatibility copy is full or unavailable.
  }
  enqueueStatePersistence(state).catch(() => toast("Sauvegarde locale indisponible."));
}

async function persistState() {
  state.version = APP_VERSION;
  await enqueueStatePersistence(state);
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

function bankFoods() {
  const custom = state.customFoods.map((food) => ({ ...food, source: "Aliment perso" }));
  const off = state.offFoods.map((food) => ({ ...food, source: "Open Food Facts" }));
  return [...baseFoods, ...custom, ...off];
}

function findFood(foodId, includeAll = true) {
  const list = includeAll ? allFoods() : [...baseFoods, ...state.customFoods, ...state.offFoods];
  return list.find((food) => food.id === foodId);
}

function searchLocalFoods(query) {
  const queries = expandedQueries(query);
  const tokens = searchTokens(query);
  const primary = queries[0] || "";
  if (!primary) return [];
  const usage = foodUsageCounts();
  const favorites = new Set(state.favoriteFoodIds || []);
  return bankFoods()
    .map((food) => {
      const normalizedName = normalizeSearchText(food.name);
      const aliases = (food.aliases || []).map(normalizeSearchText);
      const keywords = (food.keywords || []).map(normalizeSearchText);
      const haystack = normalizeSearchText([food.name, aliases.join(" "), keywords.join(" "), food.category, food.brands].join(" "));
      const words = [...new Set(haystack.split(" ").filter(Boolean).flatMap((word) => word.endsWith("s") && word.length > 3 ? [word, word.slice(0, -1)] : [word]))];
      const exact = queries.some((q) => haystack === q || normalizedName === q || aliases.some((alias) => alias === q));
      const partial = queries.some((q) => q && haystack.includes(q));
      const starts = primary && (normalizedName.startsWith(primary) || aliases.some((alias) => alias.startsWith(primary))) ? 1 : 0;
      const tokenHits = tokens.filter((part) => fuzzyTokenHit(part, words)).length;
      const score = exact ? 260 : starts ? 210 : partial ? 160 : tokenHits * 34;
      return { ...food, score, exact, starts, favorite: favorites.has(food.id), usage: foodUsageCount(food, usage) };
    })
    .filter((food) => food.score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact)
      || Number(b.favorite) - Number(a.favorite)
      || b.usage - a.usage
      || Number(b.starts) - Number(a.starts)
      || b.score - a.score
      || a.name.localeCompare(b.name, "fr"))
    .slice(0, 20);
}

function foodUsageCounts() {
  const usage = new Map();
  state.entries.forEach((entry) => {
    if (entry.foodId) usage.set(entry.foodId, (usage.get(entry.foodId) || 0) + 1);
    const nameKey = `name:${normalizeSearchText(entry.foodName || entry.name)}`;
    if (nameKey !== "name:") usage.set(nameKey, (usage.get(nameKey) || 0) + 1);
  });
  return usage;
}

function foodUsageCount(food, usage = foodUsageCounts()) {
  return Math.max(usage.get(food.id) || 0, usage.get(`name:${normalizeSearchText(food.name)}`) || 0);
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
  const portion = defaultPortion(food);
  const unit = food.referenceUnit || food.unit || (normalizeSearchText(food.category).includes("boisson") ? "ml" : "g");
  return {
    ...food,
    referenceQuantity: Number(food.referenceQuantity || 100),
    referenceUnit: unit,
    calories: Number(food.calories ?? food.kcalPer100g ?? 0),
    protein: Number(food.proteinPer100g ?? food.protein ?? 0),
    carbohydrates: Number(food.carbohydrates ?? food.carbsPer100g ?? food.carbs ?? 0),
    fat: Number(food.fatPer100g ?? food.fat ?? 0),
    keywords: [...new Set([...(food.keywords || []), ...(food.aliases || []), ...(food.tags || [])].filter(Boolean))],
    defaultPortion: Number(food.defaultPortion || portion),
    defaultPortionG: portion,
    unit,
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
      <button class="sheet-choice primary-choice" type="button" data-add-choice="photo"><span>1</span>Prendre une photo</button>
      <button class="sheet-choice primary-choice" type="button" data-add-choice="scan"><span>2</span>Scanner un produit</button>
      <button class="sheet-choice" type="button" data-add-choice="food"><span>3</span>Rechercher un aliment</button>
      <button class="sheet-choice" type="button" data-add-choice="saved"><span>4</span>Ajouter un repas favori</button>
      <p class="small add-sheet-help">La saisie manuelle reste disponible dans la Banque.</p>
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
  if (choice === "manual") {
    selectedMeal = selectedMeal || "petit déjeuner";
    go("journal");
    setTimeout(() => {
      $("details.manual-food")?.setAttribute("open", "");
      $("#manualFoodForm [name='name']")?.focus();
    }, 80);
  }
  if (choice === "photo") go("photo");
  if (choice === "share-ai" || choice === "paste-ai") {
    go("photo");
    setTimeout(() => toast("Choisissez d’abord une photo enregistrée, puis utilisez Partager à mon IA ou Coller la réponse IA."), 240);
  }
  if (choice === "saved") {
    recipesTab = "favorites";
    go("recipes");
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
    const button = $("#confirmScanFood");
    if (button.disabled) return;
    button.disabled = true;
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

function calorieRemainingMessage(value, goal) {
  if (!goal) return "Complète le profil pour calculer l’objectif.";
  const remaining = Math.max(0, Number(goal) - Number(value || 0));
  return remaining > 0 ? `Il reste environ ${fmt(remaining)} kcal aujourd’hui.` : "Objectif calorique atteint aujourd’hui.";
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
  const tip = contextualTip(dateKey);
  if (!tip) return "";
  return `<article class="card daily-tip-card">
    <div class="section-head"><h2>Astuce du jour</h2><button class="icon-button" id="hideDailyTip" type="button" aria-label="Masquer l’astuce du jour">×</button></div>
    <strong>${esc(tip.title)}</strong>
    <p>${esc(tip.body)}</p>
  </article>`;
}

function contextualTip(dateKey = today()) {
  if (isUntrackedDay(dateKey)) return { title: "Journée non suivie", body: "Cette journée ne sera pas interprétée comme une journée à zéro calorie." };
  const entries = dayEntries(dateKey);
  if (!entries.length) return { title: "Journal du jour", body: "Rien n’est encore enregistré aujourd’hui." };
  const sum = totals(entries);
  const goals = activeGoals();
  if (goals.calories && sum.kcal >= goals.calories) return { title: "Objectif calorique atteint", body: "La régularité compte plus que la perfection." };
  if (new Date().getHours() >= 17 && goals.calories && sum.kcal < goals.calories * 0.6) {
    return { title: "Une collation dense peut aider", body: "Skyr, banane, pain avec beurre de cacahuète ou poignée de noix sont des options simples." };
  }
  if (goals.protein && sum.protein < goals.protein * 0.65) {
    return { title: "Protéines encore basses", body: "Pense aux œufs, au skyr, au poulet, au poisson ou aux légumineuses." };
  }
  return tipForDate(dateKey);
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
      <p class="day-remaining">${esc(isUntrackedDay(today()) ? "Journée marquée comme non suivie." : calorieRemainingMessage(sum.kcal, goals.calories))}</p>
    </article>
    ${goals.warning ? `<article class="card notice">${esc(goals.warning)}</article>` : ""}
    <article class="card privacy-note">
      <p>Vos données alimentaires et photos restent stockées localement sur cet appareil, sauf lorsque vous choisissez volontairement de partager une photo vers une autre application.</p>
    </article>
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
  $("#allFavorites").addEventListener("click", () => { recipesTab = "favorites"; go("recipes"); });
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
    return `<p class="small empty-state">Aucun favori pour le moment. Recherche un aliment ou enregistre un repas depuis Recettes.</p>`;
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
  const untracked = isUntrackedDay(selectedDate);
  const remainingText = calorieRemainingMessage(sum.kcal, goals.calories).replace("aujourd’hui", "pour cette journée");
  $("#screen").innerHTML = `
    <article class="card">
      <div class="section-head"><div><h2>Banque</h2><p class="small bank-subtitle">Recherchez un aliment ou retrouvez vos favoris.</p></div><button class="ghost-inline" id="openHistory" type="button">Historique</button></div>
      <p class="small active-date">Ajoutez un aliment à ${esc(dateLabel(selectedDate))} · ${esc(selectedDate)}</p>
      <div class="grid two">${metric("Calories du jour", `${fmt(sum.kcal)} / ${fmt(goals.calories)}`)}${metric("Protéines", `${fmt(sum.protein, 1)} / ${fmt(goals.protein)} g`)}</div>
      ${progress("Calories", sum.kcal, goals.calories)}
      ${progress("Protéines", sum.protein, goals.protein)}
      <p class="day-remaining">${esc(untracked ? "Journée marquée comme non suivie." : remainingText)}</p>
      <button class="${untracked ? "primary-button" : "secondary-button"} compact day-status-button" id="toggleUntrackedDay" type="button">${untracked ? "Annuler le statut non suivi" : "Marquer comme journée non suivie"}</button>
    </article>
    <article class="card">
      <div class="tabs">${MEALS.map((meal) => `<button class="${meal === selectedMeal ? "active" : ""}" data-meal="${meal}">${meal}</button>`).join("")}</div>
      ${foodSearchMarkup("journal", "eau, café, pain, beurre...", bankDiscoveryMarkup())}
      <details class="manual-food"><summary>Créer un aliment manuellement</summary>${manualFoodMarkup()}</details>
    </article>
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
  bindBankDiscovery();
  bindManualFoodForm();
  bindEntryButtons();
  $("#toggleUntrackedDay")?.addEventListener("click", toggleSelectedDayTracking);
}

function isUntrackedDay(dateKey) {
  return (state.untrackedDays || []).includes(dateKey);
}

function toggleSelectedDayTracking() {
  const days = new Set(state.untrackedDays || []);
  if (days.has(selectedDate)) days.delete(selectedDate);
  else days.add(selectedDate);
  state.untrackedDays = [...days].filter(isDateKey).sort();
  saveState();
  toast(days.has(selectedDate) ? "Journée marquée comme non suivie." : "Journée de nouveau suivie.");
  renderJournal();
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
  (state.untrackedDays || []).forEach((date) => dates.add(date));
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
  if (isUntrackedDay(date)) {
    return `<button class="history-row untracked" type="button" data-open-day="${esc(date)}"><span><strong>${esc(dateLabel(date))}</strong><small>${esc(date)} · journée non suivie</small></span><span><strong>Non suivie</strong><small>Non comptée comme 0 kcal</small></span></button>`;
  }
  const sum = totals(entries);
  const caloriePct = goals.calories ? Math.round((sum.kcal / goals.calories) * 100) : 0;
  const proteinPct = goals.protein ? Math.round((sum.protein / goals.protein) * 100) : 0;
  const meals = new Set(entries.map((entry) => entry.mealType || entry.meal)).size;
  return `<button class="history-row" type="button" data-open-day="${esc(date)}">
    <span><strong>${esc(dateLabel(date))}</strong><small>${esc(date)} · ${entries.length} entrée(s) · ${meals} repas</small></span>
    <span><strong>${fmt(sum.kcal)} / ${fmt(goals.calories)} kcal</strong><small>${fmt(sum.protein, 1)} / ${fmt(goals.protein)} g prot. · ${fmt(Math.max(caloriePct, proteinPct))}%</small></span>
  </button>`;
}

function bindMealTabs() {
  $$("[data-meal]").forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.meal;
    render();
  }));
}

function foodSearchMarkup(scope, placeholder = "banane, lait, produit...", discoveryMarkup = "") {
  return `<div class="food-search" data-search-scope="${scope}">
    <label>Rechercher<input id="${scope}Search" placeholder="${esc(placeholder)}" autocomplete="off"></label>
    <button class="secondary-button compact" data-off-search="${scope}">Rechercher</button>
    <div id="${scope}Status" class="small"></div>
    ${discoveryMarkup}
    <div id="${scope}Results" class="stack"></div>
  </div>`;
}

function favoriteBankFoods() {
  return (state.favoriteFoodIds || []).map((foodId) => findFood(foodId, false)).filter(Boolean).slice(0, 8);
}

function recentBankFoods(limit = 8) {
  const seen = new Set();
  const foods = bankFoods();
  return [...state.entries]
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
    .map((entry) => findFood(entry.foodId, false) || foods.find((food) => normalizeSearchText(food.name) === normalizeSearchText(entry.foodName || entry.name)))
    .filter((food) => food && !seen.has(food.id) && seen.add(food.id))
    .slice(0, limit);
}

function bankDiscoveryMarkup() {
  const favorites = favoriteBankFoods();
  const recent = recentBankFoods();
  return `<div id="bankDiscovery" class="bank-discovery">
    ${favorites.length ? `<section class="bank-group"><h3>Favoris</h3><div class="stack">${favorites.map((food) => foodRow(food, "bank-favorites")).join("")}</div></section>` : ""}
    ${recent.length ? `<section class="bank-group"><h3>Récemment utilisés</h3><div class="stack">${recent.map((food) => foodRow(food, "bank-recent")).join("")}</div></section>` : ""}
  </div>`;
}

function bindBankDiscovery() {
  bindFoodRows("bank-favorites", favoriteBankFoods(), (food, grams) => addEntry(food, grams, selectedMeal));
  bindFoodRows("bank-recent", recentBankFoods(), (food, grams) => addEntry(food, grams, selectedMeal));
}

function refreshBankDiscovery() {
  const discovery = $("#bankDiscovery");
  if (!discovery) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = bankDiscoveryMarkup();
  discovery.replaceWith(wrapper.firstElementChild);
  bindBankDiscovery();
}

function manualFoodMarkup() {
  return `<form id="manualFoodForm" class="form-grid compact-form">
    <label>Nom<input name="name" required></label>
    <label>Quantité (g)<input name="quantity" type="number" inputmode="decimal" min="1" step="1" value="100"></label>
    <label>Unité<input name="unit" value="g"></label>
    <label>Calories<input name="kcal" type="number" inputmode="decimal" min="0" step="1" required></label>
    <label>Protéines (g)<input name="protein" type="number" inputmode="decimal" min="0" step="0.1" value="0"></label>
    <label>Glucides (g)<input name="carbs" type="number" inputmode="decimal" min="0" step="0.1" value="0"></label>
    <label>Lipides (g)<input name="fat" type="number" inputmode="decimal" min="0" step="0.1" value="0"></label>
    <button class="primary-button">Créer et réutiliser</button>
  </form>`;
}

function bindFoodSearch(scope, onAdd) {
  const input = $(`#${scope}Search`);
  const results = $(`#${scope}Results`);
  const status = $(`#${scope}Status`);
  const renderResults = (items) => {
    searchResults = items;
    results.innerHTML = items.length ? items.map((food) => foodRow(food, scope)).join("") : missingFoodMarkup(scope, input.value);
    bindFoodRows(scope, items, onAdd);
    bindMissingFoodActions(scope, input, renderResults, status);
  };
  const localSearch = () => {
    status.textContent = "";
    renderResults(searchLocalFoods(input.value));
  };
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

function missingFoodMarkup(scope, query) {
  const hasQuery = normalizeSearchText(query).length > 0;
  if (!hasQuery) {
    return `<div class="empty-state bank-search-prompt"><p class="small">Recherchez un aliment dans votre banque locale.</p></div>`;
  }
  return `<div class="empty-state missing-food">
    <strong>Aucun aliment trouvé.</strong>
    <p class="small">Vous pouvez l’ajouter manuellement.</p>
    <div class="inline-actions">
      <button class="primary-button compact" data-create-missing="${scope}" type="button">Créer cet aliment</button>
      <button class="secondary-button compact" data-scan-missing="${scope}" type="button">Scanner un produit</button>
      <button class="secondary-button compact" data-online-missing="${scope}" type="button">Rechercher en ligne</button>
      <button class="secondary-button compact" data-cancel-missing="${scope}" type="button">Annuler</button>
    </div>
  </div>`;
}

function bindMissingFoodActions(scope, input, renderResults, status) {
  $(`[data-create-missing="${scope}"]`)?.addEventListener("click", () => {
    const details = $("details.manual-food");
    details?.setAttribute("open", "");
    const name = $("#manualFoodForm [name='name']");
    if (name && input.value.trim()) name.value = input.value.trim();
    name?.focus();
  });
  $(`[data-scan-missing="${scope}"]`)?.addEventListener("click", openBarcodeScanner);
  $(`[data-online-missing="${scope}"]`)?.addEventListener("click", () => doOffSearch(scope, input.value, renderResults, status));
  $(`[data-cancel-missing="${scope}"]`)?.addEventListener("click", () => {
    input.value = "";
    renderResults([]);
    status.textContent = "";
  });
}

function bindFoodRows(scope, foods, onAdd) {
  $$(`[data-adjust-food][data-scope="${scope}"]`).forEach((button) => button.addEventListener("click", () => {
    const input = $(`[data-grams="${CSS.escape(button.dataset.adjustFood)}"][data-scope="${scope}"]`);
    adjustQuantityInput(input, Number(button.dataset.delta));
  }));
  $$(`[data-add-food][data-scope="${scope}"]`).forEach((button) => button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    const food = foods.find((item) => item.id === button.dataset.addFood);
    if (!food) { button.disabled = false; return; }
    const grams = Number($(`[data-grams="${button.dataset.addFood}"][data-scope="${scope}"]`)?.value || defaultPortion(food));
    if (!Number.isFinite(grams) || grams <= 0) { button.disabled = false; return; }
    if (food.source === "Open Food Facts" && !state.offFoods.some((item) => item.id === food.id)) state.offFoods.push(food);
    onAdd(food, grams);
    saveState();
    setTimeout(() => { if (button.isConnected) button.disabled = false; }, 500);
  }));
  $$(`[data-food-favorite][data-scope="${scope}"]`).forEach((button) => button.addEventListener("click", () => toggleFavoriteFood(button.dataset.foodFavorite)));
}

function toggleFavoriteFood(foodId) {
  if (!findFood(foodId)) return;
  const ids = new Set(state.favoriteFoodIds || []);
  if (ids.has(foodId)) ids.delete(foodId);
  else ids.add(foodId);
  state.favoriteFoodIds = [...ids];
  saveState();
  const active = ids.has(foodId);
  $$(`[data-food-favorite="${CSS.escape(foodId)}"]`).forEach((button) => {
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Retirer des favoris" : "Ajouter aux favoris");
    button.textContent = active ? "★" : "☆";
  });
  refreshBankDiscovery();
  toast(active ? "Aliment ajouté aux favoris." : "Aliment retiré des favoris.");
}

async function doOffSearch(scope, query, renderResults, status) {
  if (normalizeSearch(query).length < 3) {
    status.textContent = "Tape au moins 3 caractères pour rechercher un produit.";
    return;
  }
  if (navigator.onLine === false) {
    status.textContent = "Connexion nécessaire pour rechercher un produit en ligne. La base locale reste disponible.";
    renderResults(searchLocalFoods(query));
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
  const favorite = (state.favoriteFoodIds || []).includes(food.id);
  return `<div class="food-row">
    ${food.image ? `<img class="food-thumb" src="${esc(food.image)}" alt="">` : ""}
    <div>
      <div class="food-title-row"><strong>${esc(food.name)}</strong><button class="food-favorite-toggle ${favorite ? "active" : ""}" data-food-favorite="${esc(food.id)}" data-scope="${scope}" type="button" aria-label="${favorite ? "Retirer des favoris" : "Ajouter aux favoris"}" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button></div>
      <div class="macro">${esc(source)}${food.brands ? ` · ${esc(food.brands)}` : ""}</div>
      <div class="macro">${food.incompleteNutrition ? "Informations nutritionnelles incomplètes" : `${fmt(food.kcalPer100g)} kcal / 100 ${esc(unitLabel(food))} · ${fmt(food.proteinPer100g, 1)} g prot. · portion ${fmt(portion)} ${esc(unitLabel(food))}`}</div>
    </div>
    <div class="food-actions">
      <div class="quantity-stepper"><button type="button" data-adjust-food="${esc(food.id)}" data-scope="${scope}" data-delta="-10" aria-label="Diminuer de 10 ${esc(unitLabel(food))}">−</button><label class="unit-field"><input inputmode="decimal" value="${portion}" data-grams="${food.id}" data-scope="${scope}" aria-label="Quantité"><span>${esc(unitLabel(food))}</span></label><button type="button" data-adjust-food="${esc(food.id)}" data-scope="${scope}" data-delta="10" aria-label="Augmenter de 10 ${esc(unitLabel(food))}">+</button></div>
      <button class="primary-button compact" data-add-food="${food.id}" data-scope="${scope}">Ajouter</button>
    </div>
  </div>`;
}

function adjustQuantityInput(input, delta) {
  if (!input) return;
  const next = Math.max(1, Math.round((Number(input.value || 0) + Number(delta || 0)) * 10) / 10);
  input.value = String(next);
}

function entryQuantityStep(entry) {
  const unit = normalizeSearchText(entry?.unit || "g");
  if (unit.includes("portion")) return 0.5;
  if (["unite", "piece", "tranche", "tasse"].some((label) => unit.includes(label))) return 1;
  return 10;
}

function bindManualFoodForm() {
  $("#manualFoodForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const quantity = Number(data.quantity || 100);
    const name = data.name.trim();
    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      toast("Vérifiez le nom et la quantité.");
      return;
    }
    const duplicate = allFoods().find((food) => normalizeSearchText(food.name) === normalizeSearchText(name) || (food.aliases || []).some((alias) => normalizeSearchText(alias) === normalizeSearchText(name)));
    if (duplicate) {
      toast(`${duplicate.name} existe déjà dans la banque.`);
      return;
    }
    const food = {
      id: `custom-${id()}`,
      name,
      aliases: [name],
      category: "personnel",
      source: "Aliment perso",
      kcalPer100g: Number(data.kcal || 0) / quantity * 100,
      proteinPer100g: Number(data.protein || 0) / quantity * 100,
      carbsPer100g: Number(data.carbs || 0) / quantity * 100,
      fatPer100g: Number(data.fat || 0) / quantity * 100,
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
  const step = entryQuantityStep(entry);
  const digits = step < 1 ? 1 : 0;
  return `<div class="entry-row">
    <div>
      <strong>${esc(entry.name)}</strong>
      <div class="macro">${fmt(entry.grams, digits)} ${esc(entry.unit || "g")} · ${fmt(entry.kcal)} kcal · ${fmt(entry.protein, 1)} g protéines</div>
    </div>
    <div class="entry-actions">
      <div class="quantity-stepper"><button type="button" data-entry-adjust="${entry.id}" data-delta="-${step}" aria-label="Diminuer de ${fmt(step, digits)} ${esc(entry.unit || "g")}">−</button><label class="unit-field"><input inputmode="decimal" value="${entry.grams}" data-entry-grams="${entry.id}" aria-label="Quantité ${esc(entry.name)}"><span>${esc(entry.unit || "g")}</span></label><button type="button" data-entry-adjust="${entry.id}" data-delta="${step}" aria-label="Augmenter de ${fmt(step, digits)} ${esc(entry.unit || "g")}">+</button></div>
      <button class="secondary-button compact" data-edit-entry="${entry.id}">OK</button>
      <button class="danger-button compact" data-delete-entry="${entry.id}">Supprimer</button>
    </div>
  </div>`;
}

function bindEntryButtons() {
  $$('[data-entry-adjust]').forEach((button) => button.addEventListener("click", () => {
    adjustQuantityInput($(`[data-entry-grams="${CSS.escape(button.dataset.entryAdjust)}"]`), Number(button.dataset.delta));
  }));
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

function openSavedMealCreator() {
  closeSavedMealModal();
  const overlay = document.createElement("div");
  overlay.id = "savedMealModal";
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `<div class="add-sheet saved-meal-modal" role="dialog" aria-modal="true" aria-labelledby="savedMealCreateTitle">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="section-head"><h2 id="savedMealCreateTitle">Enregistrer un repas du journal</h2><button class="sheet-close" type="button" aria-label="Fermer" data-close-saved-meal>×</button></div>
    <p class="small">Les aliments du repas choisi pour ${esc(dateLabel(selectedDate || today()))} seront enregistrés.</p>
    <form id="savedMealCreateForm" class="form-grid">
      <label>Nom du repas<input name="name" placeholder="Petit déjeuner habituel" required></label>
      <label>Type de repas<select name="meal">${MEALS.map((meal) => `<option ${meal === selectedMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
      <button class="primary-button wide">Enregistrer le repas</button>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  $("#savedMealCreateForm")?.addEventListener("submit", saveSavedMealFromJournal);
  $$('[data-close-saved-meal]').forEach((button) => button.addEventListener("click", closeSavedMealModal));
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeSavedMealModal(); });
  $("#savedMealCreateForm [name='name']")?.focus();
}

function saveSavedMealFromJournal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const mealItems = dayEntries().filter((entry) => entry.meal === data.meal);
  const savedMeal = normalizeFavorite({
    id: id(),
    itemType: "savedMeal",
    name: data.name.trim() || `Repas ${data.meal}`,
    meal: data.meal,
    items: mealItems.map((entry) => ({ food: entry.foodId, name: entry.name, grams: entry.grams, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }))
  });
  state.favorites.unshift(savedMeal);
  saveState();
  closeSavedMealModal();
  recipesTab = "favorites";
  renderRecipes();
  toast(mealItems.length ? "Repas enregistré." : "Repas vide enregistré. Utilisez Modifier pour ajouter des aliments.");
}

function openSavedMealEditor(savedMealId) {
  const savedMeal = state.favorites.find((item) => item.id === savedMealId);
  if (!savedMeal) return;
  savedMealEditDraft = normalizeFavorite({ ...savedMeal, items: savedMeal.items.map((item) => ({ ...item })) });
  renderSavedMealEditor();
}

function renderSavedMealEditor() {
  if (!savedMealEditDraft) return;
  $("#savedMealModal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "savedMealModal";
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `<div class="add-sheet saved-meal-modal saved-meal-editor" role="dialog" aria-modal="true" aria-labelledby="savedMealEditTitle">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="section-head"><h2 id="savedMealEditTitle">Modifier le repas</h2><button class="sheet-close" type="button" aria-label="Fermer" data-close-saved-meal>×</button></div>
    <form id="savedMealEditForm" class="form-grid">
      <label>Nom<input name="name" value="${esc(savedMealEditDraft.name)}" required></label>
      <label>Type de repas<select name="meal">${MEALS.map((meal) => `<option ${meal === savedMealEditDraft.meal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
      <div class="stack saved-meal-edit-items">${savedMealEditDraft.items.map(savedMealEditItemRow).join("") || `<p class="small">Aucun aliment pour le moment.</p>`}</div>
      <div class="saved-meal-edit-search"><h3>Ajouter un aliment</h3>${foodSearchMarkup("savedMealEditor", "pain, lait, banane...")}</div>
      <div class="inline-actions"><button class="secondary-button" type="button" data-close-saved-meal>Annuler</button><button class="primary-button" type="submit">Enregistrer</button></div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  $("#savedMealEditForm")?.addEventListener("submit", saveSavedMealEditor);
  $$('[data-close-saved-meal]').forEach((button) => button.addEventListener("click", closeSavedMealModal));
  $$('[data-remove-saved-meal-item]').forEach((button) => button.addEventListener("click", () => {
    syncSavedMealEditDraft();
    savedMealEditDraft.items.splice(Number(button.dataset.removeSavedMealItem), 1);
    renderSavedMealEditor();
  }));
  bindFoodSearch("savedMealEditor", (food, grams) => {
    syncSavedMealEditDraft();
    savedMealEditDraft.items.push({ food: food.id, name: food.name, grams, ...calc(food, grams) });
    renderSavedMealEditor();
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeSavedMealModal(); });
}

function savedMealEditItemRow(item, index) {
  const food = findFood(item.food);
  const macros = food ? calc(food, item.grams) : item;
  return `<div class="saved-meal-edit-row">
    <div><strong>${esc(item.name || food?.name || "Aliment")}</strong><div class="macro">${fmt(macros.kcal)} kcal · ${fmt(macros.protein, 1)} g prot.</div></div>
    <label class="unit-field"><input value="${esc(item.grams)}" inputmode="decimal" data-saved-edit-grams="${index}" aria-label="Quantité ${esc(item.name || food?.name || "aliment")}"><span>g</span></label>
    <button class="danger-button compact" data-remove-saved-meal-item="${index}" type="button">Supprimer</button>
  </div>`;
}

function syncSavedMealEditDraft() {
  if (!savedMealEditDraft) return;
  const form = $("#savedMealEditForm");
  if (form) {
    savedMealEditDraft.name = form.elements.name.value.trim() || savedMealEditDraft.name;
    savedMealEditDraft.meal = form.elements.meal.value;
  }
  savedMealEditDraft.items = savedMealEditDraft.items.map((item, index) => {
    const grams = Number($(`[data-saved-edit-grams="${index}"]`)?.value || item.grams);
    return Number.isFinite(grams) && grams > 0 ? scaleSavedMealItem(item, grams) : item;
  });
}

function scaleSavedMealItem(item, grams) {
  const food = findFood(item.food);
  if (food) return { ...item, grams, ...calc(food, grams) };
  const factor = Number(item.grams || 0) > 0 ? grams / Number(item.grams) : 1;
  return {
    ...item,
    grams,
    kcal: Number(item.kcal || 0) * factor,
    protein: Number(item.protein || 0) * factor,
    carbs: Number(item.carbs || 0) * factor,
    fat: Number(item.fat || 0) * factor
  };
}

function saveSavedMealEditor(event) {
  event.preventDefault();
  syncSavedMealEditDraft();
  if (!savedMealEditDraft?.name.trim()) {
    toast("Ajoutez un nom au repas.");
    return;
  }
  const index = state.favorites.findIndex((item) => item.id === savedMealEditDraft.id);
  if (index < 0) return;
  state.favorites[index] = normalizeFavorite({ ...savedMealEditDraft, updatedAt: new Date().toISOString() });
  saveState();
  closeSavedMealModal();
  renderRecipes();
  toast("Repas enregistré mis à jour.");
}

function closeSavedMealModal() {
  $("#savedMealModal")?.remove();
  savedMealEditDraft = null;
}

function weightStats() {
  const sorted = (state.weights || []).map(weightRecord).filter((item) => isDateKey(item.date) && item.weight > 0).sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.weight || 0;
  const latestRecord = sorted.at(-1);
  const latest = latestRecord?.weight || latestWeight();
  const cutoff = latestRecord ? addDays(latestRecord.date, -6) : "";
  const recent = cutoff ? sorted.filter((item) => item.date >= cutoff && item.date <= latestRecord.date) : [];
  const average7 = recent.length >= 2 ? recent.reduce((sum, item) => sum + item.weight, 0) / recent.length : 0;
  return { sorted, first, latest, average7, totalChange: first && latest ? latest - first : 0 };
}

function renderWeight() {
  const stats = weightStats();
  const latest = stats.latest;
  const previous = stats.sorted.length > 1 ? stats.sorted.at(-2)?.weight : null;
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
      <h2>Progression</h2>
      <div class="grid two">${metric("Poids de départ", stats.first ? `${fmt(stats.first, 1)} kg` : "À saisir")}${metric("Objectif", profileNumber("targetWeight") ? `${fmt(profileNumber("targetWeight"), 1)} kg` : "À définir")}${metric("Évolution totale", stats.first ? `${stats.totalChange >= 0 ? "+" : ""}${fmt(stats.totalChange, 1)} kg` : "À calculer")}${metric("Moyenne sur 7 jours", stats.average7 ? `${fmt(stats.average7, 1)} kg` : "Mesures insuffisantes")}</div>
      <p class="small">Les variations quotidiennes sont normales. Mass+ ne modifie jamais l’objectif calorique automatiquement.</p>
    </article>
    <article class="card">
      <h2>Historique</h2>
      <div class="stack">${stats.sorted.slice(-10).reverse().map((item) => `<div class="row"><span>${esc(dateLabel(item.date))}</span><strong>${fmt(item.weight, 1)} kg</strong></div>`).join("") || `<p class="small">Aucune mesure.</p>`}</div>
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
      <h2>Sauvegarde de mes données</h2>
      <div class="inline-actions">
        <button class="primary-button compact" id="exportData" type="button">Exporter mes données</button>
        <label class="secondary-button compact import-button">Restaurer une sauvegarde<input id="importData" type="file" accept="application/json,.json"></label>
      </div>
      <p class="small">Le fichier contient le profil, tout le journal, les poids, aliments personnels, favoris, repas enregistrés et réglages. Les fichiers image restent sur cet appareil et ne sont pas inclus afin de garder une sauvegarde légère.</p>
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

function backupDataFromState(source = state) {
  const snapshot = cloneState(source);
  return {
    version: snapshot.version || APP_VERSION,
    profile: snapshot.profile || {},
    entries: snapshot.entries || [],
    weights: snapshot.weights || [],
    favorites: snapshot.favorites || [],
    favoriteFoodIds: snapshot.favoriteFoodIds || [],
    customFoods: snapshot.customFoods || [],
    offFoods: snapshot.offFoods || [],
    recipeFavorites: snapshot.recipeFavorites || [],
    recipePhotos: snapshot.recipePhotos || {},
    dailyTip: snapshot.dailyTip || null,
    hiddenTips: snapshot.hiddenTips || {},
    photos: snapshot.photos || [],
    pendingPhotoMeal: snapshot.pendingPhotoMeal || "déjeuner",
    untrackedDays: snapshot.untrackedDays || [],
    migrations: snapshot.migrations || {}
  };
}

function buildBackupPayload(source = state) {
  return {
    backupFormat: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    photoFiles: { included: false, metadataCount: source.photos?.length || 0, reason: "Les images restent dans le stockage local de l’appareil." },
    data: backupDataFromState(source)
  };
}

function exportUserData() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mass-plus-sauvegarde-${today()}.json`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1200);
  toast("Sauvegarde créée avec succès.");
}

async function importUserData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_SIZE) throw new Error("backup_too_large");
    const parsed = JSON.parse(await file.text());
    pendingBackupRestore = validateBackupPayload(parsed);
    openBackupRestorePreview(pendingBackupRestore);
  } catch {
    pendingBackupRestore = null;
    toast("Impossible de restaurer cette sauvegarde. Vos données actuelles n’ont pas été modifiées.");
  } finally {
    event.target.value = "";
  }
}

function validateBackupPayload(parsed) {
  const isCurrent = parsed?.backupFormat === BACKUP_FORMAT;
  const isLegacy = !parsed?.backupFormat && parsed?.appVersion && parsed?.data;
  if (!isCurrent && !isLegacy) throw new Error("invalid_backup_format");
  const backupVersion = isLegacy ? 1 : Number(parsed.backupVersion);
  if (!Number.isInteger(backupVersion) || backupVersion < 1 || backupVersion > BACKUP_VERSION) throw new Error("unsupported_backup_version");
  const raw = parsed.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !raw.profile || typeof raw.profile !== "object") throw new Error("invalid_backup_data");
  const arrayLimits = { entries: 100_000, weights: 10_000, favorites: 5_000, favoriteFoodIds: 10_000, customFoods: 10_000, offFoods: 20_000, recipeFavorites: 10_000, photos: 10_000, untrackedDays: 20_000 };
  Object.entries(arrayLimits).forEach(([key, limit]) => {
    if (raw[key] != null && (!Array.isArray(raw[key]) || raw[key].length > limit)) throw new Error(`invalid_${key}`);
  });
  (raw.entries || []).forEach((entry) => {
    if (!entry || typeof entry !== "object" || !isDateKey(entry.date)) throw new Error("invalid_raw_journal_date");
  });
  (raw.weights || []).forEach((item) => {
    if (!item || typeof item !== "object" || !isDateKey(item.date)) throw new Error("invalid_raw_weight_date");
  });
  const restored = migrateState(raw, { persist: false });
  restored.entries = dedupeById(restored.entries).map(normalizeEntry);
  restored.weights = dedupeById(restored.weights.map(weightRecord)).sort((a, b) => a.date.localeCompare(b.date));
  restored.favorites = dedupeById(restored.favorites).map(normalizeFavorite);
  restored.customFoods = dedupeById(restored.customFoods);
  restored.offFoods = dedupeById(restored.offFoods);
  restored.photos = dedupeById(restored.photos);
  restored.favoriteFoodIds = [...new Set(restored.favoriteFoodIds.filter((value) => typeof value === "string" && value))];
  restored.recipeFavorites = [...new Set(restored.recipeFavorites.filter((value) => typeof value === "string" && value))];
  restored.untrackedDays = [...new Set(restored.untrackedDays.filter(isDateKey))];
  validateRestoredState(restored);
  return {
    state: restored,
    createdAt: parsed.createdAt || parsed.exportedAt || "",
    backupVersion,
    legacy: isLegacy,
    summary: backupSummary(restored)
  };
}

function dedupeById(items) {
  const map = new Map();
  (items || []).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_record");
    const key = item.id || `${item.date || "record"}-${index}`;
    map.set(String(key), { ...item, id: item.id || String(key) });
  });
  return [...map.values()];
}

function validateRestoredState(restored) {
  restored.entries.forEach((entry) => {
    if (!isDateKey(entry.date) || !MEALS.includes(entry.meal)) throw new Error("invalid_journal_entry");
    const values = [entry.grams, entry.kcal, entry.protein, entry.carbs, entry.fat].map(Number);
    if (!entry.id || !entry.name || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("invalid_journal_values");
  });
  restored.weights.forEach((item) => {
    if (!isDateKey(item.date) || !Number.isFinite(Number(item.weight)) || Number(item.weight) <= 0) throw new Error("invalid_weight");
  });
  [...restored.customFoods, ...restored.offFoods].forEach((food) => {
    const values = [food.kcalPer100g, food.proteinPer100g, food.carbsPer100g, food.fatPer100g].map(Number);
    if (!food.id || !food.name || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("invalid_food");
  });
}

function backupSummary(restored) {
  return {
    days: new Set(restored.entries.map((entry) => entry.date)).size,
    entries: restored.entries.length,
    weights: restored.weights.length,
    savedMeals: restored.favorites.length,
    favoriteRecipes: restored.recipeFavorites.length,
    customFoods: restored.customFoods.length
  };
}

function backupDateLabel(createdAt) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "date inconnue" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function openBackupRestorePreview(backup) {
  closeBackupRestorePreview();
  const overlay = document.createElement("div");
  overlay.id = "backupRestoreModal";
  overlay.className = "ai-import-overlay";
  const summary = backup.summary;
  overlay.innerHTML = `<div class="ai-import-modal backup-restore-modal" role="dialog" aria-modal="true" aria-labelledby="backupRestoreTitle">
    <div class="section-head"><h2 id="backupRestoreTitle">Restaurer une sauvegarde</h2><button class="sheet-close" type="button" aria-label="Fermer" data-close-backup>×</button></div>
    <p><strong>Sauvegarde du ${esc(backupDateLabel(backup.createdAt))}</strong></p>
    <p class="small">Cette sauvegarde contient :</p>
    <ul class="backup-summary"><li>${summary.days} journée(s) de journal · ${summary.entries} entrée(s)</li><li>${summary.weights} mesure(s) de poids</li><li>${summary.savedMeals} repas enregistré(s)</li><li>${summary.favoriteRecipes} recette(s) favorite(s)</li><li>${summary.customFoods} aliment(s) personnel(s)</li></ul>
    <p class="notice analysis-notice">La restauration remplacera les données actuelles de Mass+. Une copie de sécurité sera conservée en mémoire pendant l’opération.</p>
    <p class="small">Les images ne font pas partie du fichier JSON. Leurs métadonnées sont conservées, mais une image absente de cet appareil ne pourra pas être affichée.</p>
    <div class="modal-actions"><button class="primary-button" id="confirmBackupRestore" type="button">Restaurer cette sauvegarde</button><button class="secondary-button" data-close-backup type="button">Annuler</button></div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-close-backup]")) closeBackupRestorePreview(); });
  $("#confirmBackupRestore").addEventListener("click", restorePendingBackup);
}

function closeBackupRestorePreview() {
  $("#backupRestoreModal")?.remove();
}

async function restorePendingBackup(event) {
  if (!pendingBackupRestore) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Restauration…";
  const previousState = cloneState(state);
  const previousLocal = localStorage.getItem(STORAGE_KEY);
  const restoredState = cloneState(pendingBackupRestore.state);
  restoredState.savedAt = new Date().toISOString();
  restoredState.saveRevision = Number(previousState.saveRevision || 0) + 1;
  try {
    await persistQueue.catch(() => undefined);
    persistQueue = persistStateSnapshot(restoredState);
    await persistQueue;
  } catch {
    state = previousState;
    try {
      persistQueue = persistStateSnapshot(previousState);
      await persistQueue;
    } catch {
      // The failed restore transaction is atomic; this retry only covers a later localStorage failure.
    }
    if (previousLocal == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previousLocal);
    button.disabled = false;
    button.textContent = "Restaurer cette sauvegarde";
    toast("Impossible de restaurer cette sauvegarde. Vos données actuelles n’ont pas été modifiées.");
    return;
  }
  state = restoredState;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* IndexedDB contains the complete restored state. */ }
  pendingBackupRestore = null;
  closeBackupRestorePreview();
  renderProfile();
  toast("Sauvegarde restaurée avec succès.");
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
  }).filter(recipeMatchesActiveFilter);
  if (recipesTab === "favorites") return list.filter((recipe) => isRecipeFavorite(recipe.id));
  return list;
}

function recipeMatchesActiveFilter(recipe) {
  const labels = [recipe.type, recipe.category, ...(recipe.tags || [])].map(normalizeSearchText);
  if (recipeFilter === "breakfast") return labels.some((label) => label.includes("petit dejeuner"));
  if (recipeFilter === "snack") return labels.some((label) => label.includes("collation"));
  if (recipeFilter === "quick") return labels.some((label) => label.includes("rapide"));
  if (recipeFilter === "calorieDense") return Number(recipe.kcal || 0) >= 700;
  if (recipeFilter === "highProtein") return Number(recipe.protein || 0) >= 30;
  return true;
}

function recipeFilterMarkup() {
  return `<label class="recipe-filter">Filtrer<select id="recipeFilter"><option value="all">Toutes</option><option value="breakfast">Petit déjeuner</option><option value="snack">Collation</option><option value="quick">Rapide</option><option value="calorieDense">Riche en calories</option><option value="highProtein">Riche en protéines</option></select></label>`;
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
  const savedMeals = recipesTab === "favorites" ? state.favorites : [];
  const favoriteCount = list.length + savedMeals.length;
  $("#screen").innerHTML = `<article class="card">
    <div class="section-head"><h2>Recettes</h2><button class="ghost-inline" data-go="home">Journal</button></div>
    <div class="tabs sub-tabs">
      <button class="${recipesTab === "recipes" ? "active" : ""}" data-recipes-tab="recipes">Recettes</button>
      <button class="${recipesTab === "favorites" ? "active" : ""}" data-recipes-tab="favorites">Mes favorites</button>
      <button class="${recipesTab === "tips" ? "active" : ""}" data-recipes-tab="tips">Astuces</button>
    </div>
    ${recipesTab !== "tips" ? recipeFilterMarkup() : ""}
    ${recipesTab === "tips"
      ? `<p class="small">Astuces déjà présentes dans Mass+.</p><div class="stack">${tips.map(tipCard).join("")}</div>`
      : `${recipesTab === "favorites" ? `<div class="favorites-toolbar"><p class="small">${favoriteCount} favori(s) : recettes et repas enregistrés.</p><button id="createSavedMeal" class="secondary-button compact" type="button">Enregistrer un repas</button></div>` : `<p class="small">${list.length} recette(s) compatibles avec le profil.</p>`}<div class="stack">${list.map(recipeCard).join("")}${savedMeals.map(savedMealCard).join("")}${recipesTab === "favorites" && !favoriteCount ? `<p class="small empty-state">Aucun favori pour le moment.</p>` : ""}</div>`}
  </article>`;
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
  $$('[data-recipes-tab]').forEach((button) => button.addEventListener("click", () => {
    recipesTab = button.dataset.recipesTab;
    renderRecipes();
  }));
  if ($("#recipeFilter")) {
    $("#recipeFilter").value = recipeFilter;
    $("#recipeFilter").addEventListener("change", (event) => { recipeFilter = event.currentTarget.value; renderRecipes(); });
  }
  bindRecipeButtons();
  bindSavedMealCards();
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
  const recommendedMeal = recipeRecommendedMeal(recipe);
  return `<div class="recipe-card">
    <div class="recipe-card-head">${recipeImageMarkup(recipe)}<div><span class="item-type-badge">Recette</span><strong class="item-card-title">${esc(recipe.name)}</strong><div class="macro">${esc(duration)} · ${esc(difficulty)} ${cost ? `· ${esc(cost)} ` : ""}· ${fmt(recipe.kcal)} kcal · ${fmt(recipe.protein)} g prot.</div></div><button class="heart-button ${favorite ? "active" : ""}" data-recipe-heart="${recipe.id}" type="button" aria-label="${favorite ? "Retirer des favorites" : "Ajouter aux favorites"}">♥</button></div>
    <details><summary>Voir les ingrédients</summary>${recipeImageMarkup({ ...recipe, id: `${recipe.id}-detail`, name: recipe.name, category: "aperçu" })}<ul>${(recipe.ingredients || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul><ol>${(recipe.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>
    <div class="portion-presets" aria-label="Portions rapides">${[0.5, 1, 2].map((portion) => `<button type="button" data-set-recipe-portions="${recipe.id}" data-value="${portion}">${portion} portion${portion > 1 ? "s" : ""}</button>`).join("")}</div>
    <div class="recipe-controls"><label>Portions<input inputmode="decimal" value="1" min="0.5" step="0.5" data-recipe-portions="${recipe.id}"></label><label>Repas<select data-recipe-meal="${recipe.id}">${MEALS.map((meal) => `<option ${meal === recommendedMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label><button class="primary-button compact" data-recipe-journal="${recipe.id}">Ajouter</button><label class="secondary-button compact recipe-photo-button">Photo<input type="file" accept="image/*" data-recipe-photo="${recipe.id}"></label>${state.recipePhotos?.[recipe.id] ? `<button class="danger-button compact" data-delete-recipe-photo="${recipe.id}">Suppr. photo</button>` : ""}</div>
  </div>`;
}

function recipeRecommendedMeal(recipe) {
  const label = normalizeSearchText([recipe.type, recipe.category, ...(recipe.tags || [])].join(" "));
  if (label.includes("petit dejeuner")) return "petit déjeuner";
  if (label.includes("collation")) return "collation";
  return "déjeuner";
}

function savedMealCard(savedMeal) {
  const sum = favoriteTotals(savedMeal);
  return `<div class="recipe-card saved-meal-card" data-saved-meal-card="${esc(savedMeal.id)}">
    <div class="saved-meal-card-head">
      <div><span class="item-type-badge saved-meal-badge">Repas enregistré</span><strong class="item-card-title">${esc(savedMeal.name)}</strong><div class="macro">${fmt(sum.kcal)} kcal · ${fmt(sum.protein, 1)} g prot.</div><div class="macro saved-meal-type">${esc(savedMeal.meal)}</div></div>
      <details class="saved-meal-menu"><summary aria-label="Actions pour ${esc(savedMeal.name)}">⋯</summary><div class="saved-meal-menu-actions"><button type="button" data-edit-saved-meal="${esc(savedMeal.id)}">Modifier</button><button type="button" class="danger-text" data-delete-saved-meal="${esc(savedMeal.id)}">Supprimer</button></div></details>
    </div>
    <details class="saved-meal-details"><summary>Voir les aliments</summary><ul>${savedMeal.items.length ? savedMeal.items.map(savedMealItemMarkup).join("") : `<li>Ce repas ne contient encore aucun aliment.</li>`}</ul></details>
    <div class="portion-presets" aria-label="Portions rapides">${[0.5, 1, 2].map((portion) => `<button type="button" data-set-saved-portions="${esc(savedMeal.id)}" data-value="${portion}">${portion} portion${portion > 1 ? "s" : ""}</button>`).join("")}</div>
    <div class="recipe-controls"><label>Portions<input inputmode="decimal" value="1" min="0.5" step="0.5" data-saved-meal-portions="${esc(savedMeal.id)}"></label><button class="primary-button compact" type="button" data-add-saved-meal="${esc(savedMeal.id)}">Ajouter</button></div>
  </div>`;
}

function savedMealItemMarkup(item) {
  const food = findFood(item.food);
  const macros = food ? calc(food, item.grams) : item;
  return `<li><strong>${esc(item.name || food?.name || "Aliment")}</strong> · ${fmt(item.grams)} g · ${fmt(macros.kcal)} kcal · ${fmt(macros.protein, 1)} g prot.</li>`;
}

function bindSavedMealCards() {
  $("#createSavedMeal")?.addEventListener("click", openSavedMealCreator);
  $$('[data-set-saved-portions]').forEach((button) => button.addEventListener("click", () => {
    const input = $(`[data-saved-meal-portions="${CSS.escape(button.dataset.setSavedPortions)}"]`);
    if (input) input.value = button.dataset.value;
  }));
  $$('[data-add-saved-meal]').forEach((button) => button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    addSavedMealToJournal(button.dataset.addSavedMeal);
    setTimeout(() => { if (button.isConnected) button.disabled = false; }, 600);
  }));
  $$('[data-edit-saved-meal]').forEach((button) => button.addEventListener("click", () => openSavedMealEditor(button.dataset.editSavedMeal)));
  $$('[data-delete-saved-meal]').forEach((button) => button.addEventListener("click", () => deleteSavedMeal(button.dataset.deleteSavedMeal)));
}

function savedMealPortions(savedMealId) {
  const value = Number($(`[data-saved-meal-portions="${savedMealId}"]`)?.value || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function addSavedMealToJournal(savedMealId) {
  const savedMeal = state.favorites.find((item) => item.id === savedMealId);
  if (!savedMeal) return;
  if (!savedMeal.items.length) {
    toast("Ce repas enregistré est vide.");
    return;
  }
  const portions = savedMealPortions(savedMealId);
  savedMeal.items.forEach((item) => {
    const food = findFood(item.food) || savedMealItemAsFood(item);
    addEntry(food, Number(item.grams) * portions, savedMeal.meal, false);
  });
  saveState();
  selectedMeal = savedMeal.meal;
  toast("Repas ajouté au journal.");
}

function savedMealItemAsFood(item) {
  const grams = Number(item.grams || 0) || 1;
  const factor = 100 / grams;
  return {
    id: item.food || `saved-meal-item-${id()}`,
    name: item.name || "Aliment enregistré",
    source: "Repas enregistré",
    kcalPer100g: Number(item.kcal || 0) * factor,
    proteinPer100g: Number(item.protein || 0) * factor,
    carbsPer100g: Number(item.carbs || 0) * factor,
    fatPer100g: Number(item.fat || 0) * factor,
    defaultPortionG: grams,
    unit: "g"
  };
}

function deleteSavedMeal(savedMealId) {
  const savedMeal = state.favorites.find((item) => item.id === savedMealId);
  if (!savedMeal || !confirm(`Supprimer le repas enregistré "${savedMeal.name}" ? Les entrées déjà ajoutées au journal seront conservées.`)) return;
  state.favorites = state.favorites.filter((item) => item.id !== savedMealId);
  saveState();
  renderRecipes();
  toast("Repas enregistré supprimé.");
}

function bindRecipeButtons() {
  $$('[data-set-recipe-portions]').forEach((button) => button.addEventListener("click", () => {
    const input = $(`[data-recipe-portions="${CSS.escape(button.dataset.setRecipePortions)}"]`);
    if (input) input.value = button.dataset.value;
  }));
  $$('[data-recipe-journal]').forEach((button) => button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    addRecipeToJournal(button.dataset.recipeJournal);
  }));
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
  const meal = $(`[data-recipe-meal="${CSS.escape(recipeId)}"]`)?.value || recipeRecommendedMeal(recipe);
  selectedDate = today();
  selectedMeal = meal;
  if (!recipe.items?.length) {
    addEntry(recipeAsFood(recipe), portions, meal, false);
    saveState();
    toast("Recette ajoutée au journal.");
    go("home");
    return;
  }
  recipe.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) addEntry(food, item.grams * portions, meal, false);
  });
  saveState();
  toast("Recette ajoutée au journal.");
  selectedMeal = meal;
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
  closeAiImportModal();
  $("#screen").innerHTML = `
    <article class="card photo-intro">
      <h2>Photographier mon repas</h2>
      <p class="small">La photo reste sur cet appareil. Mass+ ne l’envoie à aucun serveur : vous choisissez vous-même une application avec la feuille de partage.</p>
      <form id="photoForm" class="form-grid photo-form">
        <label>Repas<select name="meal">${MEALS.map((meal) => `<option ${meal === state.pendingPhotoMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
        <div class="photo-picker wide">
          <input id="photoCameraInput" class="visually-hidden-file" type="file" accept="image/*" capture="environment">
          <input id="photoLibraryInput" class="visually-hidden-file" type="file" accept="image/*">
          <div class="photo-picker-actions">
            <button class="secondary-button wide" id="takePhotoButton" type="button">Prendre une photo</button>
            <button class="secondary-button wide" id="choosePhotoButton" type="button">Choisir dans la photothèque</button>
          </div>
          <div id="photoPreview" class="photo-preview"><span>Aucune photo sélectionnée</span></div>
          <p class="small" id="photoFileStatus">JPEG, PNG et HEIC sont convertis localement en JPEG lorsque le navigateur le permet.</p>
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

async function compressImage(file, mimeType = "image/jpeg", quality = 0.76) {
  const bitmap = await loadImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

async function savePhotoFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = selectedPhotoFile;
  const meal = form.meal.value;
  if (!file) {
    toast("Choisissez une photo.");
    return;
  }
  if (file.size > 30_000_000) {
    toast("Cette image est trop volumineuse. Choisissez une photo plus légère.");
    return;
  }
  const saveButton = $("#savePhotoButton");
  saveButton.disabled = true;
  saveButton.textContent = "Compression locale...";
  try {
    const blob = await compressImage(file);
    const photoId = id();
    await idbPut({ id: photoId, blob });
    state.photos.unshift({ id: photoId, date: today(), meal, createdAt: new Date().toISOString() });
    state.pendingPhotoMeal = meal;
    saveState();
    renderPhoto();
    toast("Photo enregistrée. Elle reste sur cet appareil.");
  } catch (error) {
    console.error("Photo save failed", error);
    toast("Cette photo ne peut pas être lue ici. Essayez une image JPEG ou PNG.");
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
  const cards = await Promise.all(state.photos.slice(0, 12).map(async (meta) => {
    const stored = await idbGet(meta.id).catch(() => null);
    const url = stored?.blob ? URL.createObjectURL(stored.blob) : "";
    const total = meta.analysisTotals ? `<div class="macro">Confirmé : ${fmt(meta.analysisTotals.kcal)} kcal · ${fmt(meta.analysisTotals.protein, 1)} g prot.</div>` : "";
    return `<div class="photo-card">${url ? `<img src="${url}" alt="Photo repas">` : ""}<div><strong>${esc(meta.meal)}</strong><div class="macro">${esc(meta.date)}</div>${total}<p class="photo-share-help">Choisissez ChatGPT, Gemini ou votre IA préférée. Le prompt est copié automatiquement si nécessaire.</p><div class="photo-actions"><button class="primary-button" data-photo-share="${esc(meta.id)}" type="button">Partager à mon IA</button><button class="secondary-button compact" data-photo-import="${esc(meta.id)}" type="button">Coller la réponse IA</button><button class="secondary-button compact" data-photo-manual="${esc(meta.id)}" type="button">Saisie manuelle</button><button class="danger-button compact" data-delete-photo="${esc(meta.id)}" type="button">Supprimer</button></div></div></div>`;
  }));
  node.innerHTML = cards.join("");
  $$('[data-photo-share]').forEach((button) => button.addEventListener("click", () => sharePhotoWithAi(button.dataset.photoShare)));
  $$('[data-photo-import]').forEach((button) => button.addEventListener("click", () => openAiImportModal(button.dataset.photoImport)));
  $$('[data-photo-manual]').forEach((button) => button.addEventListener("click", () => startManualPhotoEntry(button.dataset.photoManual)));
  $$('[data-delete-photo]').forEach((button) => button.addEventListener("click", async () => {
    const photoId = button.dataset.deletePhoto;
    if (!confirm("Supprimer cette photo enregistrée ?")) return;
    await idbDelete(photoId);
    state.photos = state.photos.filter((photo) => photo.id !== photoId);
    if (photoAnalysisDraft?.photoId === photoId) photoAnalysisDraft = null;
    saveState();
    renderPhoto();
  }));
}

async function copyAiPrompt() {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(MASS_PLUS_AI_PROMPT);
    return true;
  } catch (error) {
    console.info("Prompt clipboard copy unavailable", error?.name || "clipboard_error");
    return false;
  }
}

async function sharePhotoWithAi(photoId) {
  openAiShareModal(photoId);
}

function openAiShareModal(photoId) {
  closeAiShareModal();
  const meta = state.photos.find((photo) => photo.id === photoId);
  if (!meta) return;
  const overlay = document.createElement("div");
  overlay.id = "aiShareModal";
  overlay.className = "ai-import-overlay";
  overlay.innerHTML = `<div class="ai-import-modal" role="dialog" aria-modal="true" aria-labelledby="aiShareTitle">
    <div class="section-head"><h2 id="aiShareTitle">Analyser avec votre IA</h2><button class="sheet-close" type="button" aria-label="Fermer" data-close-ai-share>×</button></div>
    <p class="small">Mass+ ne transmet rien automatiquement à un serveur. Choisissez comment envoyer la photo à ChatGPT, Gemini ou une autre IA.</p>
    <div class="modal-actions ai-share-actions">
      <button class="primary-button" data-ai-share-action="share" type="button">Partager la photo</button>
      <button class="secondary-button" data-ai-share-action="copy" type="button">Copier le prompt</button>
      <button class="secondary-button" data-ai-share-action="chatgpt" type="button">Ouvrir ChatGPT</button>
      <button class="secondary-button" data-ai-share-action="gemini" type="button">Ouvrir Gemini</button>
      <button class="secondary-button" data-ai-share-action="import" type="button">Coller la réponse IA</button>
      <button class="secondary-button" data-close-ai-share type="button">Annuler</button>
    </div>
    <p class="import-status" id="aiShareStatus" role="status">Parcours conseillé : partagez ou joignez la photo, collez le prompt, puis revenez coller la réponse dans Mass+.</p>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close-ai-share]")) closeAiShareModal();
  });
  $$("[data-ai-share-action]", overlay).forEach((button) => button.addEventListener("click", () => handleAiShareAction(button.dataset.aiShareAction, meta)));
}

function closeAiShareModal() {
  const modal = $("#aiShareModal");
  if (!modal) return;
  modal.classList.remove("visible");
  setTimeout(() => modal.remove(), 160);
}

async function handleAiShareAction(action, meta) {
  const status = $("#aiShareStatus");
  if (action === "copy") {
    const copied = await copyAiPrompt();
    status.textContent = copied ? "Prompt copié. Collez-le dans votre IA avec la photo." : "Copie automatique refusée. Sélectionnez le prompt depuis le panneau de secours.";
    if (!copied) renderShareFallback(meta, false);
    return;
  }
  if (action === "chatgpt") {
    if (navigator.onLine === false) { status.textContent = "Connexion nécessaire pour ouvrir ChatGPT."; return; }
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    status.textContent = "ChatGPT ouvert. Joignez la photo puis collez le prompt copié.";
    await copyAiPrompt();
    return;
  }
  if (action === "gemini") {
    if (navigator.onLine === false) { status.textContent = "Connexion nécessaire pour ouvrir Gemini."; return; }
    window.open("https://gemini.google.com/", "_blank", "noopener,noreferrer");
    status.textContent = "Gemini ouvert. Joignez la photo puis collez le prompt copié.";
    await copyAiPrompt();
    return;
  }
  if (action === "import") {
    closeAiShareModal();
    openAiImportModal(meta.id);
    return;
  }
  if (action === "share") {
    status.textContent = "Préparation du partage...";
    await sharePhotoNatively(meta);
  }
}

async function sharePhotoNatively(meta) {
  const stored = await idbGet(meta.id).catch((error) => {
    console.error("Shared photo lookup failed", error);
    return null;
  });
  if (!stored?.blob) {
    toast("Photo locale introuvable.");
    return;
  }
  if (stored.blob.size > 10_000_000) {
    toast("Cette image est trop volumineuse pour le partage.");
    return;
  }

  const file = new File([stored.blob], `repas-mass-plus-${meta.date || today()}.jpg`, { type: stored.blob.type || "image/jpeg" });
  const shareData = { title: "Photo repas Mass+", text: MASS_PLUS_AI_PROMPT, files: [file] };
  const clipboardPromise = copyAiPrompt();
  const fileShareSupported = canNativeShareFile(file);
  if (!fileShareSupported) {
    const copied = await clipboardPromise;
    renderShareFallback(meta, copied);
    return;
  }

  try {
    await navigator.share(shareData);
    const copied = await clipboardPromise;
    toast(copied ? "Photo partagée. Copiez la réponse de votre IA puis revenez dans Mass+." : "Photo partagée. Le prompt est disponible dans Mass+ si vous devez le copier.");
  } catch (error) {
    await clipboardPromise;
    if (error?.name === "AbortError") {
      toast("Partage annulé.");
      return;
    }
    console.info("Native photo share unavailable", { name: error?.name, message: error?.message });
    renderShareFallback(meta, false);
  }
}

function canNativeShareFile(file) {
  if (!navigator.share) return false;
  try {
    return !navigator.canShare || navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function renderShareFallback(meta, copied) {
  const panel = $("#photoAnalysisPanel");
  if (!panel) return;
  panel.innerHTML = `<article class="card analysis-card share-fallback">
    <div class="section-head"><h2>Partage indisponible</h2><button class="ghost-inline" id="closeShareFallback" type="button">Fermer</button></div>
    <p class="small">La feuille de partage de ce navigateur ne permet pas d’envoyer la photo. Vous pouvez copier le prompt puis partager la photo depuis l’app Photos.</p>
    <label>Prompt d’analyse<textarea id="sharePromptFallback" readonly></textarea></label>
    <p class="small" id="shareFallbackStatus">${copied ? "Prompt déjà copié." : "Sélectionnez le prompt si la copie automatique est refusée."}</p>
    <div class="inline-actions"><button class="primary-button" id="copyPromptFallback" type="button">Copier le prompt</button><button class="secondary-button" id="openImportFallback" type="button">Coller la réponse IA</button></div>
  </article>`;
  $("#sharePromptFallback").value = MASS_PLUS_AI_PROMPT;
  $("#closeShareFallback").addEventListener("click", () => { panel.innerHTML = ""; });
  $("#copyPromptFallback").addEventListener("click", async () => {
    const success = await copyAiPrompt();
    $("#shareFallbackStatus").textContent = success ? "Prompt copié." : "Copie refusée. Sélectionnez le texte et copiez-le manuellement.";
    if (!success) $("#sharePromptFallback").select();
  });
  $("#openImportFallback").addEventListener("click", () => openAiImportModal(meta.id));
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

function openAiImportModal(photoId) {
  closeAiImportModal();
  const meta = state.photos.find((photo) => photo.id === photoId);
  if (!meta) return;
  const overlay = document.createElement("div");
  overlay.id = "aiImportModal";
  overlay.className = "ai-import-overlay";
  overlay.innerHTML = `<div class="ai-import-modal" role="dialog" aria-modal="true" aria-labelledby="aiImportTitle">
    <div class="section-head"><h2 id="aiImportTitle">Coller l’analyse de votre IA</h2><button class="sheet-close" type="button" aria-label="Fermer" data-close-ai-import>×</button></div>
    <p class="small">Copiez toute la réponse de ChatGPT, Gemini ou d’une autre IA, puis collez-la ici.</p>
    <label for="aiResponseText">Réponse complète</label>
    <textarea id="aiResponseText" placeholder="Collez ici toute la réponse de votre IA…" spellcheck="false"></textarea>
    <p class="import-status" id="aiImportStatus" role="status"></p>
    <div class="modal-actions"><button class="secondary-button" id="pasteAiClipboard" type="button">Coller le résultat</button><button class="primary-button" id="importAiResponse" type="button">Analyser la réponse</button><button class="secondary-button" id="clearAiResponse" type="button">Effacer</button><button class="secondary-button" data-close-ai-import type="button">Annuler</button></div>
    <div class="inline-actions import-fallback-actions" id="aiImportFallbackActions" hidden>
      <button class="secondary-button compact" id="retryAiParse" type="button">Réessayer la lecture</button>
      <button class="secondary-button compact" id="importAiText" type="button">Importer comme texte</button>
      <button class="secondary-button compact" id="manualAiCorrection" type="button">Corriger manuellement</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close-ai-import]")) closeAiImportModal();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAiImportModal();
  });
  $("#pasteAiClipboard").addEventListener("click", pasteAiClipboard);
  $("#importAiResponse").addEventListener("click", () => importAiResponse(meta));
  $("#clearAiResponse").addEventListener("click", () => { $("#aiResponseText").value = ""; $("#aiImportStatus").textContent = ""; $("#aiImportFallbackActions").hidden = true; });
  $("#retryAiParse").addEventListener("click", () => importAiResponse(meta));
  $("#importAiText").addEventListener("click", () => importAiResponseAsText(meta));
  $("#manualAiCorrection").addEventListener("click", () => {
    closeAiImportModal();
    startManualPhotoEntry(meta.id);
  });
  setTimeout(() => $("#aiResponseText")?.focus(), 80);
}

function closeAiImportModal() {
  const modal = $("#aiImportModal");
  if (!modal) return;
  modal.classList.remove("visible");
  setTimeout(() => modal.remove(), 160);
}

async function pasteAiClipboard() {
  const status = $("#aiImportStatus");
  if (!navigator.clipboard?.readText) {
    $("#aiResponseText")?.focus();
    status.textContent = "Collez ici le résultat copié depuis Gemini.";
    return;
  }
  try {
    $("#aiResponseText").value = await navigator.clipboard.readText();
    status.textContent = "Réponse collée. Vérifiez-la puis importez.";
  } catch (error) {
    console.info("Clipboard read unavailable", error?.name || "clipboard_error");
    $("#aiResponseText")?.focus();
    status.textContent = "Collez ici le résultat copié depuis Gemini.";
  }
}

function importAiResponse(meta) {
  const status = $("#aiImportStatus");
  try {
    const payload = extractAndParseAIResponse($("#aiResponseText").value);
    photoAnalysisDraft = buildImportedMealDraft(meta, payload);
    closeAiImportModal();
    setTimeout(renderPhotoAnalysisDraft, 180);
  } catch (error) {
    console.info("AI response import rejected", error.message);
    status.textContent = "Mass+ n’a pas reconnu automatiquement toute la réponse. Vous pouvez la corriger ou importer les valeurs manuellement.";
    $("#aiImportFallbackActions").hidden = false;
  }
}

function importAiResponseAsText(meta) {
  const status = $("#aiImportStatus");
  try {
    const payload = parseNutritionTextFallback($("#aiResponseText").value);
    photoAnalysisDraft = buildImportedMealDraft(meta, payload);
    closeAiImportModal();
    setTimeout(renderPhotoAnalysisDraft, 180);
  } catch {
    status.textContent = "Mass+ n’a pas reconnu automatiquement toute la réponse. Vous pouvez la corriger ou importer les valeurs manuellement.";
    $("#aiImportFallbackActions").hidden = false;
  }
}

function extractAndParseAIResponse(input) {
  const text = String(input || "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Collez d’abord la réponse complète de votre IA.");
  if (text.length > 100_000) throw new Error("Cette réponse est trop longue pour être importée.");
  const candidates = jsonBlockCandidates(text).concat(jsonObjectCandidates(text));
  const parsedMeals = new Map();
  for (const candidate of candidates) {
    for (const attempt of safeJsonCandidates(candidate)) {
      try {
        const parsed = JSON.parse(attempt);
        if (!parsed || typeof parsed !== "object") continue;
        const meal = normalizeImportedMeal(parsed);
        parsedMeals.set(JSON.stringify(meal), meal);
      } catch {
        continue;
      }
    }
  }
  if (parsedMeals.size > 1) throw new Error("Plusieurs objets JSON concurrents ont été détectés.");
  if (parsedMeals.size === 1) return [...parsedMeals.values()][0];
  throw new Error("Aucun JSON exploitable.");
}

function parseAiResponseText(input) {
  return extractAndParseAIResponse(input);
}

function jsonBlockCandidates(text) {
  return [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]).filter(Boolean);
}

function safeJsonCandidates(candidate) {
  const normalized = String(candidate || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/(\d),(\d)/g, "$1.$2")
    .trim();
  return [...new Set([candidate.trim(), normalized])].filter(Boolean);
}

function jsonObjectCandidates(text) {
  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }
  return candidates;
}

function normalizeImportedMeal(raw) {
  const foodsRaw = getKey(raw, ["foods", "aliments", "ingredients", "items"]);
  if (!Array.isArray(foodsRaw)) throw new Error("Liste d’aliments introuvable.");
  const foods = foodsRaw.slice(0, 24).map((food, index) => normalizeImportedFood(food, index));
  const uncertaintiesRaw = getKey(raw, ["uncertainties", "incertitudes", "notes", "aConfirmer"]);
  const uncertainties = Array.isArray(uncertaintiesRaw)
    ? uncertaintiesRaw.map((item) => String(item || "").trim()).filter(Boolean).join(" · ")
    : String(uncertaintiesRaw || "").trim();
  const mealName = getKey(raw, ["mealName", "meal", "title", "nomRepas", "nom"]);
  return {
    mealName: String(mealName || "Repas importé").trim().slice(0, 120) || "Repas importé",
    foods,
    uncertainties: uncertainties.slice(0, 1000)
  };
}

function getKey(object, keys) {
  if (!object || typeof object !== "object") return undefined;
  const entries = Object.entries(object);
  for (const expected of keys.map(normalizeSearchText)) {
    const found = entries.find(([key]) => normalizeSearchText(key) === expected);
    if (found) return found[1];
  }
  return undefined;
}

function normalizeImportedFood(food, index) {
  if (!food || typeof food !== "object" || Array.isArray(food)) throw new Error(`Aliment ${index + 1} invalide.`);
  const name = String(getKey(food, ["name", "food", "aliment", "nom"]) || "").trim().slice(0, 120);
  const quantityLabel = String(getKey(food, ["quantity", "amount", "quantite", "quantité"]) ?? "").trim().slice(0, 60);
  if (!name) throw new Error(`Nom manquant pour l’aliment ${index + 1}.`);
  if (!quantityLabel) throw new Error(`Quantité manquante pour ${name}.`);
  const localFood = bestFoodMatch(name);
  return {
    name: localFood?.name || name,
    originalName: name,
    localFoodId: localFood?.id || "",
    quantityLabel,
    grams: quantityToGrams(quantityLabel, name),
    kcal: parseNutritionNumber(getKey(food, ["calories", "kcal", "energy", "energie", "énergie"]), "calories", name),
    protein: parseNutritionNumber(getKey(food, ["protein", "proteins", "proteines", "protéines"]), "protéines", name),
    carbs: parseNutritionNumber(getKey(food, ["carbohydrates", "carbs", "glucides"]), "glucides", name),
    fat: parseNutritionNumber(getKey(food, ["fat", "fats", "lipid", "lipids", "lipides"]), "lipides", name)
  };
}

function parseNutritionNumber(value, field, foodName) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return +value.toFixed(1);
  if (typeof value === "string") {
    const match = value.trim().replace(",", ".").match(/\d+(?:\.\d+)?/);
    if (match) return +Number(match[0]).toFixed(1);
  }
  throw new Error(`${field} manquantes ou invalides pour ${foodName}.`);
}

function parseNutritionTextFallback(input) {
  const text = String(input || "").slice(0, 100_000);
  if (!text.trim()) throw new Error("Texte vide.");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 24);
  const foods = [];
  for (const line of lines) {
    const kcal = numberNear(line, /(?:kcal|calories?)/i);
    if (kcal == null) continue;
    const namePart = line.split(/[-–—|;]/)[0]?.trim() || "Aliment à corriger";
    foods.push({
      name: namePart.slice(0, 120),
      quantityLabel: quantityLabelFromText(line),
      grams: quantityToGrams(quantityLabelFromText(line), namePart),
      kcal,
      protein: numberNear(line, /(?:proteines?|protéines?|protein)/i) ?? 0,
      carbs: numberNear(line, /(?:glucides?|carbs?|carbohydrates?)/i) ?? 0,
      fat: numberNear(line, /(?:lipides?|fat|fats?)/i) ?? 0
    });
  }
  if (!foods.length) {
    const kcal = numberNear(text, /(?:kcal|calories?)/i);
    if (kcal == null) throw new Error("Aucune ligne nutritionnelle reconnue.");
    foods.push({
      name: "Aliment à corriger",
      quantityLabel: quantityLabelFromText(text),
      grams: quantityToGrams(quantityLabelFromText(text), ""),
      kcal,
      protein: numberNear(text, /(?:proteines?|protéines?|protein)/i) ?? 0,
      carbs: numberNear(text, /(?:glucides?|carbs?|carbohydrates?)/i) ?? 0,
      fat: numberNear(text, /(?:lipides?|fat|fats?)/i) ?? 0
    });
  }
  return { mealName: "Import texte à corriger", foods, uncertainties: "Import de secours depuis texte : vérifiez chaque champ avant confirmation." };
}

function numberNear(text, labelRegex) {
  const value = String(text || "");
  const after = new RegExp(`${labelRegex.source}\\s*:?\\s*(\\d+(?:[,.]\\d+)?)`, "i").exec(value);
  if (after) return Number(after[1].replace(",", "."));
  const before = new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*(?:g\\s*)?${labelRegex.source}`, "i").exec(value);
  return before ? Number(before[1].replace(",", ".")) : null;
}

function quantityLabelFromText(text) {
  return String(text || "").match(/(\d+(?:[,.]\d+)?)\s*(kg|g|ml|cl|l|unites?|unités?|pieces?|pièces?|tranches?)/i)?.[0] || "";
}

function quantityToGrams(quantity, foodName = "") {
  const value = String(quantity || "")
    .toLowerCase()
    .replace(",", ".")
    .replaceAll("œ", "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (match) {
    const amount = Number(match[1]);
    return Math.round(amount * ({ kg: 1000, g: 1, ml: 1, cl: 10, l: 1000 }[match[2]] || 1));
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.round(Number(value));
  const unitMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:unite|unites|piece|pieces|tranche|tranches)/);
  const matchedFood = unitMatch ? bestFoodMatch(foodName) : null;
  return unitMatch && matchedFood ? Math.round(Number(unitMatch[1]) * defaultPortion(matchedFood)) : 0;
}

function buildImportedMealDraft(meta, payload) {
  const quantityWarnings = payload.foods.filter((food) => !food.grams).map((food) => `Quantité en grammes à confirmer pour ${food.name}.`);
  return {
    id: id(),
    photoId: meta.id,
    meal: meta.meal,
    date: meta.date || today(),
    mealTitle: payload.mealName,
    analysisWarnings: [...(payload.uncertainties ? [payload.uncertainties] : []), ...quantityWarnings],
    source: "Réponse IA importée",
    items: payload.foods.map((food) => ({
      id: id(),
      ...food,
      source: food.localFoodId ? "Réponse IA · correspondance avec la banque locale" : "Réponse IA importée"
    }))
  };
}

function emptyMealItem() {
  return { id: id(), name: "", quantityLabel: "100 g", grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, source: "Saisie manuelle" };
}

function startManualPhotoEntry(photoId) {
  const meta = state.photos.find((photo) => photo.id === photoId);
  if (!meta) return;
  photoAnalysisDraft = {
    id: id(), photoId: meta.id, meal: meta.meal, date: meta.date || today(), mealTitle: "Repas saisi manuellement", analysisWarnings: [], source: "Saisie manuelle", items: [emptyMealItem()]
  };
  renderPhotoAnalysisDraft();
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

function cancelPhotoAnalysisPanel() {
  const panel = $("#photoAnalysisPanel");
  if (panel) panel.innerHTML = "";
  photoAnalysisDraft = null;
}

function renderPhotoAnalysisDraft() {
  const panel = $("#photoAnalysisPanel");
  if (!panel || !photoAnalysisDraft) return;
  panel.innerHTML = `<article class="card analysis-card">
    <div class="section-head"><h2>Vérifier le repas</h2><button class="ghost-inline" id="closeAnalysis" type="button">Fermer</button></div>
    <div id="analysisPhotoPreview" class="analysis-photo-preview"><span>Photo enregistrée</span></div>
    <p class="notice analysis-notice">${esc(PHOTO_ANALYSIS_DISCLAIMER)}</p>
    <p class="small"><strong>${esc(photoAnalysisDraft.mealTitle)}</strong> · ${esc(photoAnalysisDraft.source)}</p>
    <div class="stack analysis-list">${photoAnalysisDraft.items.map(analysisItemRow).join("") || `<p class="small">Aucun aliment. Ajoutez une ligne pour continuer.</p>`}</div>
    ${photoAnalysisDraft.analysisWarnings.length ? `<div class="analysis-warnings">${photoAnalysisDraft.analysisWarnings.map((warning) => `<p class="small">À confirmer : ${esc(warning)}</p>`).join("")}</div>` : ""}
    <button class="secondary-button wide analysis-add-row" id="analysisAddFood" type="button">Ajouter un aliment</button>
    <div class="analysis-totals" id="analysisTotals">${analysisTotalsMarkup()}</div>
    <div class="inline-actions analysis-final-actions">
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
  const received = item.quantityLabel && item.quantityLabel !== `${item.grams} g` ? ` · réponse : ${item.quantityLabel}` : "";
  const matchedFood = item.localFoodId ? findFood(item.localFoodId, false) : null;
  const bankAction = photoAnalysisDraft.source === "Réponse IA importée"
    ? matchedFood
      ? `<p class="analysis-bank-match">Banque locale : ${esc(matchedFood.name)}</p>`
      : `<button class="secondary-button compact analysis-save-food" data-analysis-save-food="${esc(item.id)}" type="button">Ajouter cet aliment à ma banque locale</button>`
    : "";
  return `<div class="analysis-row" data-analysis-row="${esc(item.id)}">
    <label>Aliment<input value="${esc(item.name)}" placeholder="Nom de l’aliment" data-analysis-name="${esc(item.id)}"></label>
    <label>Quantité (g)<input value="${esc(item.grams || "")}" type="number" inputmode="decimal" min="1" step="1" placeholder="100" data-analysis-field="grams" data-analysis-id="${esc(item.id)}"></label>
    <div class="analysis-nutrition-grid">
      <label>Calories<input value="${esc(macros.kcal)}" type="number" inputmode="decimal" min="0" step="1" data-analysis-field="kcal" data-analysis-id="${esc(item.id)}"></label>
      <label>Protéines (g)<input value="${esc(macros.protein)}" type="number" inputmode="decimal" min="0" step="0.1" data-analysis-field="protein" data-analysis-id="${esc(item.id)}"></label>
      <label>Glucides (g)<input value="${esc(macros.carbs)}" type="number" inputmode="decimal" min="0" step="0.1" data-analysis-field="carbs" data-analysis-id="${esc(item.id)}"></label>
      <label>Lipides (g)<input value="${esc(macros.fat)}" type="number" inputmode="decimal" min="0" step="0.1" data-analysis-field="fat" data-analysis-id="${esc(item.id)}"></label>
    </div>
    <p class="analysis-confidence">${esc(item.source || photoAnalysisDraft.source)}${esc(received)}</p>
    ${bankAction}
    <button class="danger-button compact" data-analysis-delete="${esc(item.id)}" type="button">Supprimer</button>
  </div>`;
}

function bindPhotoAnalysisDraft() {
  $("#closeAnalysis")?.addEventListener("click", cancelPhotoAnalysisPanel);
  $("#cancelPhotoAnalysis")?.addEventListener("click", cancelPhotoAnalysisPanel);
  $("#confirmPhotoMeal")?.addEventListener("click", (event) => {
    if (event.currentTarget.disabled) return;
    event.currentTarget.disabled = true;
    const added = confirmPhotoAnalysis();
    if (!added) event.currentTarget.disabled = false;
  });
  $("#focusCorrection")?.addEventListener("click", () => $('[data-analysis-name]')?.focus());
  $("#analysisAddFood")?.addEventListener("click", () => {
    photoAnalysisDraft.items.push(emptyMealItem());
    renderPhotoAnalysisDraft();
  });
  $$('[data-analysis-delete]').forEach((button) => button.addEventListener("click", () => {
    photoAnalysisDraft.items = photoAnalysisDraft.items.filter((item) => item.id !== button.dataset.analysisDelete);
    renderPhotoAnalysisDraft();
  }));
  $$('[data-analysis-name]').forEach((input) => input.addEventListener("input", () => {
    const match = bestFoodMatch(input.value);
    updateAnalysisItem(input.dataset.analysisName, { name: input.value, localFoodId: match?.id || "" });
  }));
  $$('[data-analysis-save-food]').forEach((button) => button.addEventListener("click", () => saveImportedFoodToBank(button.dataset.analysisSaveFood)));
  $$('[data-analysis-field]').forEach((input) => input.addEventListener("input", () => {
    updateAnalysisItem(input.dataset.analysisId, { [input.dataset.analysisField]: Math.max(0, Number(input.value || 0)) });
  }));
}

function saveImportedFoodToBank(itemId) {
  const item = photoAnalysisDraft?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const existing = bestFoodMatch(item.name);
  if (existing) {
    item.localFoodId = existing.id;
    item.source = "Réponse IA · correspondance avec la banque locale";
    renderPhotoAnalysisDraft();
    toast(`${existing.name} existe déjà dans la banque.`);
    return;
  }
  const macros = analysisItemMacros(item);
  if (!macros.usable) {
    toast("Vérifiez d’abord le nom, la quantité et les valeurs nutritionnelles.");
    return;
  }
  const grams = Math.max(1, Number(item.grams));
  const food = {
    id: `custom-${id()}`,
    name: item.name.trim(),
    aliases: [item.name.trim()],
    keywords: [item.name.trim()],
    category: "personnel",
    source: "Aliment perso",
    referenceQuantity: 100,
    referenceUnit: "g",
    kcalPer100g: macros.kcal / grams * 100,
    proteinPer100g: macros.protein / grams * 100,
    carbsPer100g: macros.carbs / grams * 100,
    fatPer100g: macros.fat / grams * 100,
    defaultPortionG: grams,
    unit: "g"
  };
  state.customFoods.push(food);
  item.localFoodId = food.id;
  item.source = "Réponse IA · aliment validé dans votre banque locale";
  saveState();
  renderPhotoAnalysisDraft();
  toast("Aliment ajouté à votre banque locale.");
}

async function renderAnalysisPhotoPreview(photoId) {
  const node = $("#analysisPhotoPreview");
  if (!node) return;
  const stored = await idbGet(photoId).catch(() => null);
  if (!stored?.blob) return;
  const url = URL.createObjectURL(stored.blob);
  node.innerHTML = `<img src="${url}" alt="Photo enregistrée">`;
}

function updateAnalysisItem(itemId, patch) {
  const item = photoAnalysisDraft?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  Object.assign(item, patch);
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

function analysisItemMacros(item) {
  const grams = Math.max(0, Number(item.grams || 0));
  const values = [item.kcal, item.protein, item.carbs, item.fat].map(Number);
  const usable = Boolean(item.name?.trim()) && grams > 0 && values.every((value) => Number.isFinite(value) && value >= 0);
  return { kcal: values[0] || 0, protein: values[1] || 0, carbs: values[2] || 0, fat: values[3] || 0, usable };
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
  const localFood = item.localFoodId ? findFood(item.localFoodId, false) : null;
  return {
    id: localFood?.id || `photo-import-${photoAnalysisDraft.id}-${item.id}`,
    name: localFood?.name || item.name || "Aliment confirmé",
    source: localFood?.source || "Analyse externe confirmée",
    kcalPer100g: macros.kcal / grams * 100,
    proteinPer100g: macros.protein / grams * 100,
    carbsPer100g: macros.carbs / grams * 100,
    fatPer100g: macros.fat / grams * 100,
    defaultPortionG: grams,
    unit: localFood?.unit || "g"
  };
}

function confirmPhotoAnalysis() {
  if (!photoAnalysisDraft?.items.length) {
    toast("Ajoutez au moins un aliment.");
    return false;
  }
  const incomplete = photoAnalysisDraft.items.filter((item) => !analysisItemMacros(item).usable);
  if (incomplete.length) {
    toast("Vérifiez les noms, quantités et valeurs nutritionnelles.");
    return false;
  }
  selectedDate = photoAnalysisDraft.date;
  selectedMeal = photoAnalysisDraft.meal;
  photoAnalysisDraft.items.forEach((item) => {
    addEntry(foodFromAnalysisItem(item), Number(item.grams), photoAnalysisDraft.meal, false, {
      photoId: photoAnalysisDraft.photoId,
      photoMealId: photoAnalysisDraft.id,
      analysisId: photoAnalysisDraft.id,
      confidence: 0,
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
      return { name: item.name, grams: Number(item.grams), kcal: macros.kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
    });
  }
  saveState();
  toast("Repas ajouté au journal après confirmation.");
  photoAnalysisDraft = null;
  go("home");
  return true;
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
    const registerServiceWorker = () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
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
