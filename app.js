"use strict";

const APP_VERSION = "0.2.1";
const STORAGE_KEY = "mass-plus-state-v2";
const LEGACY_KEYS = ["mass-plus-mvp-v1", "mass-plus-state"];
const PHOTO_DB = "mass-plus-photos";
const PHOTO_STORE = "photos";
const MEALS = ["petit déjeuner", "déjeuner", "collation", "dîner", "autre"];
const NAV = [
  ["home", "Accueil", "⌂"],
  ["journal", "Journal", "▦"],
  ["favorites", "Favoris", "★"],
  ["weight", "Poids", "◌"],
  ["profile", "Profil", "◎"]
];
const EXTRA_SCREENS = ["recipes", "tips", "photo"];
const ACTIVITY_FACTORS = { faible: 1.2, "légère": 1.375, "modérée": 1.55, "élevée": 1.725 };
const PROTEIN_FACTORS = { faible: 1.2, "légère": 1.4, "modérée": 1.6, "élevée": 1.8 };
const EXCLUSION_OPTIONS = ["lactose", "gluten", "œufs", "arachides", "fruits à coque", "soja", "poisson", "végétarien", "aucune"];
const QUICK_SNACK_IDS = ["skyr", "banane", "amandes", "lait-entier", "pain", "beurre-cacahuete", "fromage", "compote", "oeufs", "avocat"];
const OFF_FIELDS = "product_name_fr,product_name,brands,nutriments,serving_size,image_front_small_url,allergens_tags,code";

let baseFoods = [];
let recipes = [];
let tips = [];
let currentScreen = "home";
let selectedMeal = "petit déjeuner";
let searchResults = [];
let state = loadState();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const today = () => new Date().toISOString().slice(0, 10);
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
    photos: [],
    pendingPhotoMeal: "déjeuner"
  };
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
  next.photos = Array.isArray(saved.photos) ? saved.photos : [];
  next.pendingPhotoMeal = saved.pendingPhotoMeal || "déjeuner";
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

function totals(entries = dayEntries()) {
  return entries.reduce((sum, entry) => ({
    kcal: sum.kcal + Number(entry.kcal || 0),
    protein: sum.protein + Number(entry.protein || 0),
    carbs: sum.carbs + Number(entry.carbs || 0),
    fat: sum.fat + Number(entry.fat || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function dayEntries(date = today()) {
  return state.entries.filter((entry) => entry.date === date);
}

function allFoods() {
  const custom = state.customFoods.map((food) => ({ ...food, source: "Aliment perso" }));
  const off = state.offFoods.map((food) => ({ ...food, source: "Open Food Facts" }));
  return [...baseFoods, ...custom, ...off];
}

function findFood(foodId, includeAll = true) {
  const list = includeAll ? allFoods() : [...baseFoods, ...state.customFoods, ...state.offFoods];
  return list.find((food) => food.id === foodId);
}

function searchLocalFoods(query) {
  const q = normalizeSearch(query);
  return allFoods()
    .map((food) => {
      const haystack = normalizeSearch([food.name, food.aliases?.join(" "), food.category, food.brands].join(" "));
      const score = !q ? 1 : haystack.includes(q) ? 100 : q.split(" ").filter((part) => haystack.includes(part)).length * 20;
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
      const products = (data.products || []).map(mapOffProduct).filter(Boolean);
      state.offCache[normalized] = products;
      saveState();
      return products;
    } finally {
      clearTimeout(timer);
    }
  }
};

function mapOffProduct(product) {
  const nutriments = product.nutriments || {};
  const kcal = Number(nutriments["energy-kcal_100g"] || nutriments["energy-kcal"] || 0);
  if (!kcal) return null;
  const name = product.product_name_fr || product.product_name;
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
    kcalPer100g: kcal,
    proteinPer100g: Number(nutriments.proteins_100g || 0),
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
  baseFoods = foodsRes.ok ? await foodsRes.json() : [];
  recipes = recipesRes.ok ? await recipesRes.json() : [];
  tips = tipsRes.ok ? await tipsRes.json() : [];
}

function renderNav() {
  $("#bottomNav").innerHTML = NAV.map(([screen, label, icon]) => `
    <button class="${screen === currentScreen ? "active" : ""}" data-screen="${screen}">
      <span>${icon}</span>${label}
    </button>`).join("");
  $$("[data-screen]").forEach((button) => button.addEventListener("click", () => go(button.dataset.screen)));
}

function go(screen) {
  currentScreen = screen;
  history.replaceState(null, "", `#${screen}`);
  render();
}

function render() {
  renderNav();
  const screens = { home: renderHome, journal: renderJournal, favorites: renderFavorites, weight: renderWeight, profile: renderProfile, recipes: renderRecipes, tips: renderTips, photo: renderPhoto };
  (screens[currentScreen] || renderHome)();
}

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function progress(label, value, goal) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return `<div class="progress-line"><div class="row"><span>${esc(label)}</span><strong>${fmt(value, label === "Protéines" ? 1 : 0)} / ${fmt(goal, label === "Protéines" ? 0 : 0)}</strong></div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
}

function renderHome() {
  const sum = totals();
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card hero">
      <p class="eyebrow">Aujourd’hui</p>
      <div class="big-number">${fmt(sum.kcal)} kcal</div>
      <p class="small">${fmt(sum.protein, 1)} g protéines · objectif ${goals.calories ? fmt(goals.calories) : "à calculer"} kcal</p>
      ${progress("Calories", sum.kcal, goals.calories)}
      ${progress("Protéines", sum.protein, goals.protein)}
    </article>
    ${goals.warning ? `<article class="card notice">${esc(goals.warning)}</article>` : ""}
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
      <div class="section-head"><h2>Collations rapides</h2><span class="small">Ajout individuel</span></div>
      <div class="quick-grid">${QUICK_SNACK_IDS.map(quickSnackCard).join("")}</div>
    </article>
    <article class="card">
      <div class="section-head"><h2>Recettes hypercaloriques</h2><button class="ghost-inline" data-go="recipes">Voir tout</button></div>
      <div class="stack">${filteredRecipes().slice(0, 2).map(recipeCard).join("")}</div>
    </article>
    <article class="card">
      <div class="section-head"><h2>Astuces simples</h2><button class="ghost-inline" data-go="tips">Voir tout</button></div>
      <div class="stack">${tips.slice(0, 2).map(tipCard).join("")}</div>
    </article>`;
  $("#goAdd").addEventListener("click", () => { selectedMeal = "petit déjeuner"; go("journal"); });
  $("#quickSnack").addEventListener("click", () => { selectedMeal = "collation"; go("journal"); });
  $("#goWeight").addEventListener("click", () => go("weight"));
  $("#goPhoto").addEventListener("click", () => go("photo"));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
  bindQuickSnackButtons();
  bindRecipeButtons();
}

function quickSnackCard(foodId) {
  const food = findFood(foodId);
  if (!food) return "";
  const macros = calc(food, food.defaultPortionG);
  return `<div class="quick-card">
    <strong>${esc(food.name)}</strong>
    <span>${fmt(food.defaultPortionG)} g · ${fmt(macros.kcal)} kcal · ${fmt(macros.protein, 1)} g prot.</span>
    <button class="secondary-button compact" data-quick-food="${food.id}">Ajouter</button>
  </div>`;
}

function bindQuickSnackButtons() {
  $$("[data-quick-food]").forEach((button) => button.addEventListener("click", () => {
    const food = findFood(button.dataset.quickFood);
    addEntry(food, food.defaultPortionG, "collation", false);
    toast(`${food.name} ajouté en collation.`);
    renderHome();
  }));
}

function renderJournal() {
  const sum = totals();
  const goals = activeGoals();
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Journal alimentaire</h2>
      <div class="grid two">${metric("Calories", `${fmt(sum.kcal)} / ${fmt(goals.calories)}`)}${metric("Protéines", `${fmt(sum.protein, 1)} / ${fmt(goals.protein)} g`)}</div>
    </article>
    <article class="card">
      <div class="tabs">${MEALS.map((meal) => `<button class="${meal === selectedMeal ? "active" : ""}" data-meal="${meal}">${meal}</button>`).join("")}</div>
      ${foodSearchMarkup("journal")}
      <details class="manual-food"><summary>Créer un aliment manuellement</summary>${manualFoodMarkup()}</details>
    </article>
    <article class="card">
      <h2>Repas du jour</h2>
      <div class="stack">${MEALS.map(mealBlock).join("")}</div>
    </article>`;
  bindMealTabs();
  bindFoodSearch("journal", (food, grams) => addEntry(food, grams, selectedMeal));
  bindManualFoodForm();
  bindEntryButtons();
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
      const grams = Number($(`[data-grams="${button.dataset.addFood}"][data-scope="${scope}"]`)?.value || food.defaultPortionG);
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
  return `<div class="food-row">
    ${food.image ? `<img class="food-thumb" src="${esc(food.image)}" alt="">` : ""}
    <div>
      <strong>${esc(food.name)}</strong>
      <div class="macro">${esc(source)}${food.brands ? ` · ${esc(food.brands)}` : ""}</div>
      <div class="macro">${fmt(food.kcalPer100g)} kcal / 100 g · ${fmt(food.proteinPer100g, 1)} g prot. · portion ${fmt(food.defaultPortionG)} g</div>
    </div>
    <div class="food-actions">
      <label class="unit-field"><input inputmode="numeric" value="${food.defaultPortionG}" data-grams="${food.id}" data-scope="${scope}" aria-label="Quantité en grammes"><span>g</span></label>
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

function addEntry(food, grams, meal, rerender = true) {
  if (!food || !grams) return;
  const macros = calc(food, grams);
  state.entries.push({ id: id(), date: today(), meal, foodId: food.id, name: food.name, grams, source: food.source || "Base Mass+", ...macros });
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
      <div class="macro">${fmt(entry.grams)} g · ${fmt(entry.kcal)} kcal · ${fmt(entry.protein, 1)} g protéines</div>
    </div>
    <div class="entry-actions">
      <label class="unit-field"><input inputmode="numeric" value="${entry.grams}" data-entry-grams="${entry.id}" aria-label="Quantité ${esc(entry.name)} en grammes"><span>g</span></label>
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
    Object.assign(entry, { grams: next, ...calc(food, next) });
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
    <div class="stack">${favorite.items.map((item, index) => favoriteItemRow(favorite, item, index)).join("") || `<p class="small">Ajoute un aliment à ce favori.</p>`}</div>
    <div class="favorite-add">${foodSearchMarkup(`fav-${favorite.id}`, "ajouter un aliment au favori")}</div>
    <div class="inline-actions">
      <button class="primary-button compact" data-add-favorite="${favorite.id}">Ajouter au journal</button>
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
    state.favorites = state.favorites.filter((favorite) => favorite.id !== button.dataset.deleteFavorite);
    saveState();
    renderFavorites();
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
  toast("Favori enregistré.");
  renderFavorites();
}

function addFoodToFavorite(favoriteId, food, grams) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.push({ food: food.id, name: food.name, grams, ...calc(food, grams) });
  saveState();
  renderFavorites();
}

function updateFavoriteItem(favoriteId, index) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  const item = favorite?.items[index];
  const food = findFood(item?.food);
  const grams = Number($(`[data-fav-grams="${favoriteId}"][data-index="${index}"]`)?.value || item?.grams);
  if (!favorite || !item || !food || !grams) return;
  favorite.items[index] = { ...item, grams, ...calc(food, grams) };
  saveState();
  renderFavorites();
}

function removeFavoriteItem(favoriteId, index) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.splice(index, 1);
  saveState();
  renderFavorites();
}

function addFavoriteToJournal(favoriteId) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) addEntry(food, item.grams, favorite.meal, false);
  });
  saveState();
  toast("Favori ajouté au journal.");
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
    toast("Favori créé. Ajoute des aliments dedans.");
    renderFavorites();
    return;
  }
  state.favorites.unshift({
    id: id(),
    name: data.name.trim() || `Favori ${data.meal}`,
    meal: data.meal,
    items: mealItems.map((entry) => ({ food: entry.foodId, name: entry.name, grams: entry.grams, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }))
  });
  saveState();
  toast("Favori sauvegardé.");
  renderFavorites();
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
    </article>
    <article class="card">
      <h2>Intolérances, allergies et préférences</h2>
      <form id="exclusionForm" class="chips">${EXCLUSION_OPTIONS.map((item) => exclusionChip(item)).join("")}<label class="wide">Autre exclusion<input name="other" value="${esc(state.profile.exclusionOther)}"></label><button class="primary-button compact">Sauvegarder</button></form>
    </article>
    <p class="small app-version">Mass+ v${APP_VERSION}</p>`;
  $("[name='sex']").value = state.profile.sex;
  $("[name='activity']").value = state.profile.activity;
  bindGoalMode();
  bindProfileForm();
  bindExclusionForm();
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

function filteredRecipes() {
  const exclusions = state.profile.exclusions || [];
  return recipes.filter((recipe) => {
    if (exclusions.includes("végétarien") && !recipe.tags?.includes("végétarien")) return false;
    return !exclusions.some((item) => (recipe.exclusions || []).includes(item));
  });
}

function renderRecipes() {
  const list = filteredRecipes();
  $("#screen").innerHTML = `<article class="card"><div class="section-head"><h2>Recettes hypercaloriques</h2><button class="ghost-inline" data-go="home">Accueil</button></div><p class="small">${list.length} recette(s) compatibles avec le profil.</p><div class="stack">${list.map(recipeCard).join("")}</div></article>`;
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
  bindRecipeButtons();
}

function recipeCard(recipe) {
  return `<div class="recipe-card">
    <div><strong>${esc(recipe.name)}</strong><div class="macro">${esc(recipe.duration)} · ${esc(recipe.difficulty)} · ${esc(recipe.cost)} · ${fmt(recipe.kcal)} kcal · ${fmt(recipe.protein)} g prot.</div></div>
    <details><summary>Voir les ingrédients</summary><ul>${recipe.ingredients.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><ol>${recipe.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>
    <div class="inline-actions"><button class="primary-button compact" data-recipe-journal="${recipe.id}">Ajouter au journal</button><button class="secondary-button compact" data-recipe-fav="${recipe.id}">Ajouter aux favoris</button></div>
  </div>`;
}

function bindRecipeButtons() {
  $$("[data-recipe-journal]").forEach((button) => button.addEventListener("click", () => addRecipeToJournal(button.dataset.recipeJournal)));
  $$("[data-recipe-fav]").forEach((button) => button.addEventListener("click", () => addRecipeToFavorites(button.dataset.recipeFav)));
}

function addRecipeToJournal(recipeId) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  recipe.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) addEntry(food, item.grams, recipe.meal || "déjeuner", false);
  });
  saveState();
  toast("Recette ajoutée au journal.");
  selectedMeal = recipe.meal || "déjeuner";
  go("journal");
}

function addRecipeToFavorites(recipeId) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  state.favorites.unshift({
    id: id(),
    name: recipe.name,
    meal: recipe.meal || "déjeuner",
    items: recipe.items.map((item) => {
      const food = findFood(item.food);
      return { food: item.food, name: food?.name || item.food, grams: item.grams, ...calc(food || {}, item.grams) };
    })
  });
  saveState();
  toast("Recette ajoutée aux favoris.");
}

function renderTips() {
  $("#screen").innerHTML = `<article class="card"><div class="section-head"><h2>Astuces simples</h2><button class="ghost-inline" data-go="home">Accueil</button></div><div class="stack">${tips.map(tipCard).join("")}</div></article>`;
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
}

function tipCard(tip) {
  return `<div class="tip-card"><span>${esc(tip.category)}</span><strong>${esc(tip.title)}</strong><p>${esc(tip.body)}</p></div>`;
}

function renderPhoto() {
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Photographier mon repas</h2>
      <p class="small">La photo sert de repère visuel. Les calories sont calculées à partir des aliments et quantités que vous confirmez.</p>
      <form id="photoForm" class="form-grid">
        <label>Repas<select name="meal">${MEALS.map((meal) => `<option ${meal === state.pendingPhotoMeal ? "selected" : ""}>${esc(meal)}</option>`).join("")}</select></label>
        <label>Photo<input name="photo" type="file" accept="image/*" capture="environment"></label>
        <button class="primary-button">Enregistrer la photo</button>
      </form>
    </article>
    <article class="card">
      <h2>Photos enregistrées</h2>
      <div id="photoList" class="stack"><p class="small">Chargement...</p></div>
    </article>`;
  $("#photoForm").addEventListener("submit", savePhotoFromForm);
  renderPhotoList();
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

async function compressImage(file) {
  const bitmap = await loadImageBitmap(file);
  const max = 1100;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
}

async function loadImageBitmap(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
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
  const file = form.photo.files[0];
  const meal = form.meal.value;
  if (!file) {
    toast("Choisis une photo.");
    return;
  }
  const blob = await compressImage(file);
  const photoId = id();
  await idbPut({ id: photoId, blob });
  state.photos.unshift({ id: photoId, date: today(), meal });
  state.pendingPhotoMeal = meal;
  saveState();
  toast("Photo enregistrée.");
  renderPhoto();
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
    return `<div class="photo-card">${url ? `<img src="${url}" alt="Photo repas">` : ""}<div><strong>${esc(meta.meal)}</strong><div class="macro">${esc(meta.date)}</div><button class="secondary-button compact" data-photo-journal="${meta.meal}">Quels aliments contient ce repas ?</button><button class="danger-button compact" data-delete-photo="${meta.id}">Supprimer</button></div></div>`;
  }));
  node.innerHTML = cards.join("");
  $$("[data-photo-journal]").forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.photoJournal;
    go("journal");
  }));
  $$("[data-delete-photo]").forEach((button) => button.addEventListener("click", async () => {
    await idbDelete(button.dataset.deletePhoto);
    state.photos = state.photos.filter((photo) => photo.id !== button.dataset.deletePhoto);
    saveState();
    renderPhoto();
  }));
}

async function init() {
  await loadData();
  const hashScreen = location.hash.replace("#", "");
  if ([...NAV.map(([screen]) => screen), ...EXTRA_SCREENS].includes(hashScreen)) currentScreen = hashScreen;
  render();
  $("#installHelp").addEventListener("click", () => toast("iPhone Safari : Partager puis Ajouter à l’écran d’accueil. Android Chrome : Installer l’application."));
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined));
  }
  window.addEventListener("hashchange", () => {
    const next = location.hash.replace("#", "");
    if ([...NAV.map(([screen]) => screen), ...EXTRA_SCREENS].includes(next)) {
      currentScreen = next;
      render();
    }
  });
}

init();
