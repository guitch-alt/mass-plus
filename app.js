"use strict";

const STORAGE_KEY = "mass-plus-mvp-v1";
const MEALS = ["petit déjeuner", "déjeuner", "collation", "dîner", "autre"];
const NAV = [
  ["home", "Accueil", "⌂"],
  ["journal", "Journal", "▦"],
  ["favorites", "Favoris", "★"],
  ["weight", "Poids", "◌"],
  ["profile", "Profil", "◎"]
];
const DEFAULT_FAVORITES = [
  {
    id: "quick-skyr-banane-amandes",
    name: "Skyr + banane + amandes",
    meal: "collation",
    items: [{ food: "skyr", grams: 150 }, { food: "banane", grams: 120 }, { food: "amandes", grams: 30 }]
  },
  {
    id: "quick-pain-beurre-lait",
    name: "Pain + beurre demi-sel + lait",
    meal: "collation",
    items: [{ food: "pain", grams: 80 }, { food: "beurre-demi-sel", grams: 15 }, { food: "lait-entier", grams: 250 }]
  },
  {
    id: "quick-fromage-choco-noix",
    name: "Fromage blanc + chocolat noir + noix",
    meal: "collation",
    items: [{ food: "fromage-blanc", grams: 200 }, { food: "chocolat-noir", grams: 30 }, { food: "noix", grams: 25 }]
  }
];

let foods = [];
let currentScreen = "home";
let selectedMeal = "petit déjeuner";
let state = loadState();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const today = () => new Date().toISOString().slice(0, 10);
const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fmt = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value || 0));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);

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

function loadState() {
  const fallback = {
    profile: { firstName: "", height: 168, currentWeight: 51, targetWeight: 58, activity: "modérée", calorieGoal: 2400, proteinGoal: 85 },
    entries: [],
    weights: [],
    favorites: []
  };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("visible"), 2200);
}

function calc(item, grams) {
  const factor = Number(grams || 0) / 100;
  return {
    kcal: Math.round(item.kcalPer100g * factor),
    protein: +(item.proteinPer100g * factor).toFixed(1),
    carbs: +(item.carbsPer100g * factor).toFixed(1),
    fat: +(item.fatPer100g * factor).toFixed(1)
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

function latestWeight() {
  const sorted = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.weight || state.profile.currentWeight || 0;
}

function customFavorites() {
  const defaultIds = new Set(DEFAULT_FAVORITES.map((favorite) => favorite.id));
  return state.favorites.filter((favorite) => !defaultIds.has(favorite.id));
}

function seedFavorites() {
  const existingIds = new Set(state.favorites.map((favorite) => favorite.id));
  const missingDefaults = DEFAULT_FAVORITES.filter((favorite) => !existingIds.has(favorite.id));
  if (!missingDefaults.length) return;
  state.favorites = [...missingDefaults, ...state.favorites];
  saveState();
}

async function loadFoods() {
  const fallback = [];
  try {
    const response = await fetch("./data/aliments-fr.json", { cache: "no-store" });
    foods = response.ok ? await response.json() : fallback;
  } catch {
    foods = fallback;
  }
}

function findFood(foodId) {
  return foods.find((food) => food.id === foodId);
}

function searchFoods(query) {
  const q = normalizeSearch(query);
  return foods
    .map((food) => {
      const haystack = normalizeSearch([food.name, food.aliases?.join(" "), food.category].join(" "));
      const score = !q ? 1 : haystack.includes(q) ? 100 : q.split(" ").filter((part) => haystack.includes(part)).length * 20;
      return { food, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .slice(0, 10)
    .map((item) => item.food);
}

function renderNav() {
  $("#bottomNav").innerHTML = NAV.map(([screen, label, icon]) => `
    <button class="${screen === currentScreen ? "active" : ""}" data-screen="${screen}">
      <span>${icon}</span>${label}
    </button>`).join("");
  $$("[data-screen]").forEach((button) => button.addEventListener("click", () => {
    currentScreen = button.dataset.screen;
    history.replaceState(null, "", `#${currentScreen}`);
    render();
  }));
}

function render() {
  renderNav();
  const screens = { home: renderHome, journal: renderJournal, favorites: renderFavorites, weight: renderWeight, profile: renderProfile };
  screens[currentScreen]();
}

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function renderHome() {
  const sum = totals();
  $("#screen").innerHTML = `
    <article class="card hero">
      <p class="eyebrow">Aujourd’hui</p>
      <div class="big-number">${fmt(sum.kcal)} kcal</div>
      <p class="small">${fmt(sum.protein, 1)} g protéines · objectif ${fmt(state.profile.calorieGoal)} kcal</p>
    </article>
    <div class="grid two">
      ${metric("Poids", `${fmt(latestWeight(), 1)} kg`)}
      ${metric("Objectif", `${fmt(state.profile.targetWeight, 1)} kg`)}
    </div>
    <div class="button-grid">
      <button class="primary-button" id="goAdd">Ajouter un aliment</button>
      <button class="secondary-button" id="quickSnack">Collation rapide</button>
      <button class="secondary-button" id="goWeight">Suivi poids</button>
    </div>
    <article class="card">
      <h2>Collations rapides</h2>
      <div class="stack">${DEFAULT_FAVORITES.map(favoriteCard).join("")}</div>
    </article>
    <article class="card">
      <h2>Repas favoris</h2>
      <div class="stack">${customFavorites().map(favoriteCard).join("") || `<p class="small">Sauvegarde un repas depuis l’onglet Favoris pour le retrouver ici.</p>`}</div>
    </article>`;
  $("#goAdd").addEventListener("click", () => {
    currentScreen = "journal";
    history.replaceState(null, "", "#journal");
    render();
  });
  $("#quickSnack").addEventListener("click", () => addFavorite("quick-skyr-banane-amandes"));
  $("#goWeight").addEventListener("click", () => {
    currentScreen = "weight";
    history.replaceState(null, "", "#weight");
    render();
  });
  bindFavoriteButtons();
}

function renderJournal() {
  const sum = totals();
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Journal alimentaire</h2>
      <div class="grid two">
        ${metric("Calories", fmt(sum.kcal))}
        ${metric("Protéines", `${fmt(sum.protein, 1)} g`)}
      </div>
    </article>
    <article class="card">
      <div class="tabs">${MEALS.map((meal) => `<button class="${meal === selectedMeal ? "active" : ""}" data-meal="${meal}">${meal}</button>`).join("")}</div>
      <div class="form-grid" style="margin-top:12px">
        <label>Rechercher<input id="foodSearch" placeholder="oeuf, beurre demi sel, riz..." autocomplete="off"></label>
      </div>
      <div id="foodResults" class="stack" style="margin-top:12px"></div>
    </article>
    <article class="card">
      <h2>Repas du jour</h2>
      <div class="stack">${MEALS.map(mealBlock).join("")}</div>
    </article>`;
  $$("[data-meal]").forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.meal;
    renderJournal();
  }));
  $("#foodSearch").addEventListener("input", updateFoodResults);
  updateFoodResults();
  bindEntryButtons();
}

function updateFoodResults() {
  const query = $("#foodSearch")?.value || "";
  $("#foodResults").innerHTML = searchFoods(query).map((food) => `
    <div class="food-row">
      <div>
        <strong>${esc(food.name)}</strong>
        <div class="macro">${fmt(food.kcalPer100g)} kcal / 100 g · portion ${fmt(food.defaultPortionG)} g</div>
      </div>
      <div class="food-actions">
        <input inputmode="numeric" value="${food.defaultPortionG}" data-grams="${food.id}" aria-label="Quantité en grammes">
        <button class="primary-button" data-add-food="${food.id}">Ajouter</button>
      </div>
    </div>`).join("");
  $$("[data-add-food]").forEach((button) => button.addEventListener("click", () => {
    const food = findFood(button.dataset.addFood);
    const grams = Number($(`[data-grams="${button.dataset.addFood}"]`).value || food.defaultPortionG);
    addEntry(food, grams, selectedMeal);
  }));
}

function addEntry(food, grams, meal) {
  const macros = calc(food, grams);
  state.entries.push({ id: id(), date: today(), meal, foodId: food.id, name: food.name, grams, ...macros });
  saveState();
  toast("Aliment ajouté.");
  renderJournal();
}

function mealBlock(meal) {
  const items = dayEntries().filter((entry) => entry.meal === meal);
  const sum = totals(items);
  return `<div>
    <h3>${esc(meal)} · ${fmt(sum.kcal)} kcal</h3>
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
      <input inputmode="numeric" value="${entry.grams}" data-entry-grams="${entry.id}" aria-label="Quantité ${esc(entry.name)} en grammes">
      <button class="secondary-button" data-edit-entry="${entry.id}">OK</button>
      <button class="danger-button" data-delete-entry="${entry.id}">Supprimer</button>
    </div>
  </div>`;
}

function bindEntryButtons() {
  $$("[data-delete-entry]").forEach((button) => button.addEventListener("click", () => {
    state.entries = state.entries.filter((entry) => entry.id !== button.dataset.deleteEntry);
    saveState();
    renderJournal();
  }));
  $$("[data-edit-entry]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.entries.find((item) => item.id === button.dataset.editEntry);
    const next = Number($(`[data-entry-grams="${entry.id}"]`)?.value || entry.grams);
    if (!Number.isFinite(next) || next <= 0) return;
    const food = findFood(entry.foodId);
    Object.assign(entry, { grams: next, ...calc(food, next) });
    saveState();
    renderJournal();
  }));
}

function favoriteCard(favorite) {
  const sum = favorite.items.reduce((acc, item) => {
    const food = findFood(item.food);
    if (!food) return acc;
    const macros = calc(food, item.grams);
    return { kcal: acc.kcal + macros.kcal, protein: acc.protein + macros.protein };
  }, { kcal: 0, protein: 0 });
  return `<div class="favorite-row">
    <div><strong>${esc(favorite.name)}</strong><div class="macro">${esc(favorite.meal)} · ${fmt(sum.kcal)} kcal · ${fmt(sum.protein, 1)} g protéines</div></div>
    <button class="primary-button" data-add-favorite="${favorite.id}">Ajouter</button>
  </div>`;
}

function renderFavorites() {
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Favoris</h2>
      <p class="small">Ajoute une collation ou un repas habituel en un clic.</p>
      <div class="stack">${state.favorites.map(favoriteCard).join("")}</div>
    </article>
    <article class="card">
      <h2>Sauvegarder un repas</h2>
      <p class="small">Enregistre un repas déjà ajouté aujourd’hui pour le réutiliser plus tard.</p>
      <form id="favoriteForm" class="form-grid">
        <label>Nom du favori<input name="name" placeholder="Collation du matin"></label>
        <label>Repas<select name="meal">${MEALS.map((meal) => `<option>${esc(meal)}</option>`).join("")}</select></label>
        <button class="primary-button">Sauvegarder le favori</button>
      </form>
    </article>`;
  bindFavoriteButtons();
  $("#favoriteForm").addEventListener("submit", saveFavoriteFromMeal);
}

function bindFavoriteButtons() {
  $$("[data-add-favorite]").forEach((button) => button.addEventListener("click", () => addFavorite(button.dataset.addFavorite)));
}

function addFavorite(favoriteId) {
  const favorite = state.favorites.find((item) => item.id === favoriteId);
  if (!favorite) return;
  favorite.items.forEach((item) => {
    const food = findFood(item.food);
    if (food) {
      const macros = calc(food, item.grams);
      state.entries.push({ id: id(), date: today(), meal: favorite.meal, foodId: food.id, name: food.name, grams: item.grams, ...macros });
    }
  });
  saveState();
  toast("Favori ajouté.");
  currentScreen = "journal";
  history.replaceState(null, "", "#journal");
  render();
}

function saveFavoriteFromMeal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const meal = data.meal;
  const mealItems = dayEntries().filter((entry) => entry.meal === meal);
  if (!mealItems.length) {
    toast("Ajoute d’abord un aliment dans ce repas.");
    return;
  }
  const name = data.name.trim() || `Favori ${meal}`;
  state.favorites.unshift({
    id: id(),
    name,
    meal,
    items: mealItems.map((entry) => ({ food: entry.foodId, grams: entry.grams }))
  });
  saveState();
  toast("Favori sauvegardé.");
  renderFavorites();
}

function renderWeight() {
  const latest = latestWeight();
  const previous = state.weights.length > 1 ? [...state.weights].sort((a, b) => b.date.localeCompare(a.date))[1]?.weight : null;
  const delta = previous ? latest - previous : 0;
  $("#screen").innerHTML = `
    <article class="card hero">
      <p class="eyebrow">Suivi poids</p>
      <div class="big-number">${fmt(latest, 1)} kg</div>
      <p class="small">${previous ? `${delta >= 0 ? "+" : ""}${fmt(delta, 1)} kg depuis la dernière mesure` : "Ajoute ton poids du jour."}</p>
    </article>
    <article class="card">
      <form id="weightForm" class="form-grid">
        <label>Poids du jour<input name="weight" inputmode="decimal" value="${esc(latest)}"></label>
        <button class="primary-button">Enregistrer</button>
      </form>
    </article>
    <article class="card">
      <h2>Historique</h2>
      <div class="stack">${state.weights.slice(-7).reverse().map((item) => `<div class="row"><span>${esc(item.date)}</span><strong>${fmt(item.weight, 1)} kg</strong></div>`).join("") || `<p class="small">Aucune mesure.</p>`}</div>
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
  $("#screen").innerHTML = `
    <article class="card">
      <h2>Profil simple</h2>
      <form id="profileForm" class="form-grid">
        <label>Prénom<input name="firstName" value="${esc(state.profile.firstName)}"></label>
        <label>Taille (cm)<input name="height" inputmode="numeric" value="${esc(state.profile.height)}"></label>
        <label>Poids actuel<input name="currentWeight" inputmode="decimal" value="${esc(latestWeight())}"></label>
        <label>Objectif poids<input name="targetWeight" inputmode="decimal" value="${esc(state.profile.targetWeight)}"></label>
        <label>Activité<select name="activity"><option>faible</option><option>modérée</option><option>élevée</option></select></label>
        <label>Objectif calories<input name="calorieGoal" inputmode="numeric" value="${esc(state.profile.calorieGoal)}"></label>
        <label>Objectif protéines<input name="proteinGoal" inputmode="numeric" value="${esc(state.profile.proteinGoal)}"></label>
        <button class="primary-button">Sauvegarder</button>
      </form>
      <p class="small" style="margin-top:12px">Mass+ est un outil de suivi simple. Il ne remplace pas un avis médical.</p>
    </article>`;
  $("[name='activity']").value = state.profile.activity;
  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.profile = {
      firstName: data.firstName.trim(),
      height: Number(data.height),
      currentWeight: Number(data.currentWeight),
      targetWeight: Number(data.targetWeight),
      activity: data.activity,
      calorieGoal: Number(data.calorieGoal),
      proteinGoal: Number(data.proteinGoal)
    };
    saveState();
    toast("Profil sauvegardé.");
    renderProfile();
  });
}

async function init() {
  await loadFoods();
  seedFavorites();
  const hashScreen = location.hash.replace("#", "");
  if (NAV.some(([screen]) => screen === hashScreen)) currentScreen = hashScreen;
  render();
  $("#installHelp").addEventListener("click", () => toast("Android Chrome ou iPhone Safari : menu Partager puis Ajouter à l’écran d’accueil."));
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined));
  }
  window.addEventListener("hashchange", () => {
    const next = location.hash.replace("#", "");
    if (NAV.some(([screen]) => screen === next)) {
      currentScreen = next;
      render();
    }
  });
}

init();
