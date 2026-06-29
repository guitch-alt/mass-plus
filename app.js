"use strict";

const DB_NAME = "mass-plus-local-db";
const DB_VERSION = 2;
const PREF_SCREEN = "mass-plus-active-screen";
const MEALS = ["petit-déjeuner", "déjeuner", "dîner", "collations"];
const NAV = [
  ["dashboard", "Accueil", "⌂"],
  ["journal", "Journal", "▦"],
  ["add", "Ajouter", "＋"],
  ["photo", "Photo repas", "▣"],
  ["favorites", "Favoris", "★"],
  ["recipes", "Recettes", "☰"],
  ["tips", "Astuces", "✦"],
  ["profile", "Profil", "◎"]
];
const STORE_NAMES = ["settings", "entries", "weights", "savedFoods", "customSnacks", "favorites", "water", "photos"];

let db;
let foods = [];
let recipes = [];
let tips = [];
let profile = null;
let entries = [];
let weights = [];
let savedFoods = [];
let customSnacks = [];
let favorites = [];
let waterToday = 0;
let activeScreen = normalizeScreen(localStorage.getItem(PREF_SCREEN) || "dashboard");
let journalDate = today();
let mealDraft = [];
let photoDraft = { before: "", after: "", percent: 100, items: [], mealType: "déjeuner" };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const fmt = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value || 0));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const attr = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const todayLabel = () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

const quickSnacks = [
  { id: "snack-300", type: "collation", name: "Lait + banane", quantity: "250 ml lait entier + 1 banane", kcal: 310, protein: 10, carbs: 47, fat: 9 },
  { id: "snack-500", type: "collation", name: "Skyr + avoine + miel", quantity: "200 g skyr + 80 g avoine + miel", kcal: 520, protein: 33, carbs: 74, fat: 10 },
  { id: "snack-700", type: "collation", name: "Pain + œufs + avocat", quantity: "pain au levain + 2 œufs + avocat", kcal: 710, protein: 31, carbs: 54, fat: 40 },
  { id: "snack-1000", type: "collation", name: "Shake dense maison", quantity: "lait + avoine + banane + beurre de cacahuète", kcal: 980, protein: 34, carbs: 128, fat: 34 }
];

const defaultProfile = {
  firstName: "",
  sex: "female",
  age: 27,
  height: 168,
  currentWeight: 51,
  targetWeight: 58,
  deadlineWeeks: 16,
  activity: "modérée",
  mealsPerDay: 4,
  appetite: "moyen",
  likedFoods: "pâtes, riz, skyr, banane",
  dislikedFoods: "",
  allergies: "",
  budget: "moyen",
  objective: "prise de poids",
  calorieGoal: 2450,
  proteinGoal: 95,
  waterGoal: 2000,
  paceAdvice: "+300 à +500 g/semaine",
  advice: []
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeScreen(screen) {
  if (screen === "snacks") return "add";
  if (!NAV.some(([id]) => id === screen)) return "dashboard";
  return screen;
}

function parseNum(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      STORE_NAMES.forEach((name) => {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function getAll(name) {
  return new Promise((resolve, reject) => {
    const request = store(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getOne(name, key) {
  return new Promise((resolve, reject) => {
    const request = store(name).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function putOne(name, value) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function deleteOne(name, key) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(name) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadJson(paths, fallback = []) {
  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) return response.json();
    } catch {
      // Offline cache or legacy path will be tried next.
    }
  }
  return fallback;
}

async function refreshState() {
  const profileSetting = await getOne("settings", "profile");
  profile = profileSetting?.value || null;
  entries = (await getAll("entries")).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  weights = await getAll("weights");
  savedFoods = await getAll("savedFoods");
  customSnacks = await getAll("customSnacks");
  favorites = await getAll("favorites");
  const water = await getOne("water", today());
  waterToday = water?.ml || 0;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("visible"), 2300);
}

function normalizeSearch(text) {
  const normalized = String(text ?? "")
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.split(" ").map((word) => {
    if (word.length > 4 && word.endsWith("s")) return word.slice(0, -1);
    return word;
  }).join(" ");
}

function levenshtein(a, b) {
  if (!a || !b) return Math.max(a.length, b.length);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function foodSearchText(food) {
  return normalizeSearch([
    food.name,
    food.category,
    food.portionLabel,
    food.note,
    ...(food.aliases || []),
    ...(food.tags || [])
  ].join(" "));
}

function searchScore(food, query) {
  const q = normalizeSearch(query);
  if (!q) return 1;
  const text = food._search || foodSearchText(food);
  if (text.includes(q)) return 100 - text.indexOf(q);
  const words = text.split(" ");
  return q.split(" ").reduce((score, token) => {
    if (!token) return score;
    if (words.some((word) => word.startsWith(token))) return score + 35;
    if (words.some((word) => token.startsWith(word) && word.length >= 3)) return score + 18;
    if (words.some((word) => Math.abs(word.length - token.length) <= 2 && levenshtein(word, token) <= 1)) return score + 12;
    return score;
  }, 0);
}

function allFoods() {
  return [...foods, ...savedFoods].map((food) => ({ ...food, _search: food._search || foodSearchText(food) }));
}

function searchFoods(query, limit = 24) {
  return allFoods()
    .map((food) => ({ food, score: searchScore(food, query) }))
    .filter((item) => !query || item.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((item) => item.food);
}

function macroSum(items) {
  return items.reduce((sum, item) => ({
    kcal: sum.kcal + Number(item.kcal || 0),
    protein: sum.protein + Number(item.protein || 0),
    carbs: sum.carbs + Number(item.carbs || 0),
    fat: sum.fat + Number(item.fat || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function scaleFood(food, multiplier = 1) {
  return {
    id: food.id,
    name: food.name,
    quantity: `${fmt(multiplier, 1)} × ${food.portionLabel || food.quantity || "portion"}`,
    kcal: round(food.kcal * multiplier),
    protein: round(food.protein * multiplier),
    carbs: round(food.carbs * multiplier),
    fat: round(food.fat * multiplier)
  };
}

function dayEntries(date = today()) {
  return entries.filter((entry) => entry.date === date);
}

function bmiValue() {
  if (!profile?.height || !profile?.currentWeight) return 0;
  return +(profile.currentWeight / ((profile.height / 100) ** 2)).toFixed(1);
}

function estimateGoals(data) {
  const sexAdjustment = data.sex === "male" ? 5 : data.sex === "female" ? -161 : -78;
  const bmr = 10 * data.currentWeight + 6.25 * data.height - 5 * data.age + sexAdjustment;
  const activity = { faible: 1.35, modérée: 1.55, élevée: 1.75 }[data.activity] || 1.45;
  const maintenance = Math.round(bmr * activity);
  const gainNeeded = Math.max(0, data.targetWeight - data.currentWeight);
  const weeklyGain = gainNeeded / Math.max(1, data.deadlineWeeks);
  const surplus = Math.min(850, Math.max(250, Math.round((weeklyGain * 7700) / 7)));
  const calorieGoal = maintenance + surplus;
  const proteinGoal = Math.round(data.objective === "prise de muscle" ? data.currentWeight * 1.8 : data.currentWeight * 1.5);
  const waterGoal = Math.round(Math.max(1800, data.currentWeight * 35));
  const paceAdvice = weeklyGain > 0.75 ? "rythme rapide : vise plutôt +500 à +750 g/semaine" : weeklyGain < 0.25 ? "+200 à +300 g/semaine" : `environ +${Math.round(weeklyGain * 1000)} g/semaine`;
  const advice = [
    data.appetite === "faible" ? "Privilégie les calories liquides et les petites collations denses." : "Garde un goûter régulier pour stabiliser la moyenne.",
    data.budget === "serré" ? "Base économique : riz, pâtes, œufs, lentilles, pois chiches et huile d’olive." : "Prévois 2 collations prêtes pour les jours chargés.",
    data.mealsPerDay < 4 ? "Ajouter une collation peut suffire à augmenter l’apport sans gros repas." : "Répartir les apports sur la journée aide à tenir l’objectif."
  ];
  return { calorieGoal, proteinGoal, waterGoal, paceAdvice, advice };
}

function setTitle(title) {
  $("#screen-title").textContent = title;
  $("#today-label").textContent = todayLabel();
}

function renderNav() {
  const buttons = NAV.map(([screen, label, icon]) => `<button data-screen="${screen}" class="${screen === activeScreen ? "active" : ""}"><span>${icon}</span><small>${label}</small></button>`).join("");
  $("#bottom-nav").innerHTML = buttons;
  $("#desktop-nav").innerHTML = buttons;
  $$("[data-screen]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.screen)));
}

function navigate(screen) {
  activeScreen = normalizeScreen(screen);
  localStorage.setItem(PREF_SCREEN, activeScreen);
  history.replaceState(null, "", `#${activeScreen}`);
  render();
}

function render() {
  renderNav();
  if (!profile) {
    setTitle("Configurer Mass+");
    renderOnboarding();
    return;
  }
  const screens = {
    dashboard: renderDashboard,
    journal: renderJournal,
    add: renderAdd,
    photo: renderPhoto,
    favorites: renderFavorites,
    recipes: renderRecipes,
    tips: renderTips,
    profile: renderProfile
  };
  (screens[activeScreen] || renderDashboard)();
}

function renderOnboarding() {
  const draft = profile || defaultProfile;
  $("#screen").innerHTML = `
    <article class="card hero-card">
      <p class="muted-label">Mode local/offline</p>
      <h1>Mass+ t’aide à manger assez, sans te compliquer la vie.</h1>
      <p class="small">Pas de compte, pas d’e-mail. Les données restent sur ce téléphone.</p>
    </article>
    <article class="card">
      <h2>Questionnaire de départ</h2>
      <form id="onboarding-form" class="form-grid">
        <label>Prénom local facultatif<input name="firstName" value="${esc(draft.firstName)}" autocomplete="given-name"></label>
        <label>Sexe${select("sex", [["female", "Femme"], ["male", "Homme"], ["other", "Autre"]], draft.sex)}</label>
        <label>Âge<input name="age" inputmode="numeric" value="${esc(draft.age)}"></label>
        <label>Taille (cm)<input name="height" inputmode="decimal" value="${esc(draft.height)}"></label>
        <label>Poids actuel (kg)<input name="currentWeight" inputmode="decimal" value="${esc(draft.currentWeight)}"></label>
        <label>Poids objectif (kg)<input name="targetWeight" inputmode="decimal" value="${esc(draft.targetWeight)}"></label>
        <label>Délai souhaité (semaines)<input name="deadlineWeeks" inputmode="numeric" value="${esc(draft.deadlineWeeks)}"></label>
        <label>Activité physique${select("activity", [["faible", "Faible"], ["modérée", "Modérée"], ["élevée", "Élevée"]], draft.activity)}</label>
        <label>Repas par jour<input name="mealsPerDay" inputmode="numeric" value="${esc(draft.mealsPerDay)}"></label>
        <label>Appétit${select("appetite", [["faible", "Faible"], ["moyen", "Moyen"], ["fort", "Fort"]], draft.appetite)}</label>
        <label>Budget${select("budget", [["serré", "Serré"], ["moyen", "Moyen"], ["confort", "Confort"]], draft.budget)}</label>
        <label>Objectif${select("objective", [["prise de poids", "Prise de poids"], ["prise de muscle", "Prise de muscle"], ["maintien", "Maintien"]], draft.objective)}</label>
        <label>Aliments aimés<input name="likedFoods" value="${esc(draft.likedFoods)}"></label>
        <label>Aliments détestés<input name="dislikedFoods" value="${esc(draft.dislikedFoods)}"></label>
        <label>Allergies / intolérances<textarea name="allergies">${esc(draft.allergies)}</textarea></label>
        <button class="primary-button form-wide">Créer mon plan local</button>
      </form>
    </article>`;
  $("#onboarding-form").addEventListener("submit", saveProfile);
}

function select(name, options, value) {
  return `<select name="${name}">${options.map(([optionValue, label]) => `<option value="${esc(optionValue)}" ${optionValue === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
}

async function saveProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const clean = {
    firstName: data.firstName.trim(),
    sex: data.sex,
    age: parseNum(data.age, 27),
    height: parseNum(data.height, 168),
    currentWeight: parseNum(data.currentWeight, 51),
    targetWeight: parseNum(data.targetWeight, 58),
    deadlineWeeks: parseNum(data.deadlineWeeks, 16),
    activity: data.activity,
    mealsPerDay: parseNum(data.mealsPerDay, 4),
    appetite: data.appetite,
    likedFoods: data.likedFoods.trim(),
    dislikedFoods: data.dislikedFoods.trim(),
    allergies: data.allergies.trim(),
    budget: data.budget,
    objective: data.objective
  };
  profile = { ...clean, ...estimateGoals(clean) };
  await putOne("settings", { id: "profile", value: profile });
  await putOne("weights", { id: `weight-${today()}`, date: today(), value: profile.currentWeight });
  await refreshState();
  navigate("dashboard");
}

function renderDashboard() {
  setTitle(`Bonjour ${profile.firstName || ""}`.trim() || "Bonjour");
  const total = macroSum(dayEntries(today()));
  const remaining = Math.max(0, profile.calorieGoal - total.kcal);
  const progress = Math.min(100, Math.round((total.kcal / profile.calorieGoal) * 100));
  $("#screen").innerHTML = `
    <article class="card hero-card">
      <p class="muted-label">Aujourd’hui · ${progress}%</p>
      <div class="hero-number">${fmt(total.kcal)} <small>kcal</small></div>
      <p>${fmt(remaining)} kcal restantes sur ${fmt(profile.calorieGoal)} kcal</p>
      <div class="bar"><span style="width:${progress}%"></span></div>
    </article>
    <div class="quick-actions">
      <button data-go="add">Ajouter</button>
      <button data-go="photo">Photo repas</button>
      <button data-go="favorites">Favori</button>
      <button data-go="add">Collation rapide</button>
    </div>
    <div class="grid four">
      ${metric("Protéines", `${fmt(total.protein, 1)} g`)}
      ${metric("Glucides", `${fmt(total.carbs, 1)} g`)}
      ${metric("Lipides", `${fmt(total.fat, 1)} g`)}
      ${metric("Eau", `${fmt(waterToday)} ml`)}
    </div>
    <article class="card">
      <div class="row"><div><p class="muted-label">Objectif poids</p><h2>${fmt(profile.currentWeight, 1)} kg → ${fmt(profile.targetWeight, 1)} kg</h2></div><strong>IMC ${fmt(bmiValue(), 1)}</strong></div>
      ${bmiValue() < 17.5 ? `<p class="warning">Suivi médical recommandé en cas de maigreur importante.</p>` : ""}
      <p class="small">${esc(profile.paceAdvice)}</p>
    </article>
    <article class="card">
      <div class="row"><h2>Eau</h2><span class="small">Objectif ${fmt(profile.waterGoal)} ml</span></div>
      <div class="water-buttons">
        <button data-water="250">+250 ml</button>
        <button data-water="500">+500 ml</button>
        <button data-water="-250">-250 ml</button>
      </div>
    </article>`;
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  $$("[data-water]").forEach((button) => button.addEventListener("click", () => updateWater(parseNum(button.dataset.water))));
}

function metric(label, value) {
  return `<div class="metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}

async function updateWater(delta) {
  waterToday = Math.max(0, waterToday + delta);
  await putOne("water", { id: today(), date: today(), ml: waterToday });
  renderDashboard();
}

function renderJournal() {
  setTitle("Journal");
  const list = dayEntries(journalDate);
  const total = macroSum(list);
  const progress = Math.min(100, Math.round((total.kcal / profile.calorieGoal) * 100));
  $("#screen").innerHTML = `
    <article class="card">
      <label>Date<input id="journal-date" type="date" value="${journalDate}"></label>
      <div class="summary-strip">
        ${metric("Calories", `${fmt(total.kcal)} / ${fmt(profile.calorieGoal)}`)}
        ${metric("Protéines", `${fmt(total.protein, 1)} g`)}
        ${metric("Glucides", `${fmt(total.carbs, 1)} g`)}
        ${metric("Lipides", `${fmt(total.fat, 1)} g`)}
      </div>
      <div class="bar dark"><span style="width:${progress}%"></span></div>
      <p class="small">Eau : ${fmt(waterToday)} ml</p>
    </article>
    <div class="quick-actions">
      <button data-go="add">Ajouter</button>
      <button data-go="photo">Photo repas</button>
      <button data-go="favorites">Favori</button>
      <button data-go="add">Collation rapide</button>
    </div>
    <section class="section"><span>Repas du jour</span><h2>Ce qui est déjà ajouté</h2></section>
    <div class="meal-columns">${MEALS.map((meal) => mealCard(meal, list.filter((entry) => entry.mealType === meal))).join("")}</div>`;
  $("#journal-date").addEventListener("change", (event) => { journalDate = event.target.value || today(); renderJournal(); });
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  bindEntryButtons();
}

function mealCard(meal, mealEntries) {
  const total = macroSum(mealEntries);
  return `<article class="card meal-card">
    <h3>${esc(meal)} <span>${fmt(total.kcal)} kcal</span></h3>
    ${mealEntries.length ? mealEntries.map(entryRow).join("") : `<p class="empty">Rien pour le moment.</p>`}
  </article>`;
}

function entryRow(entry) {
  const photoHtml = entry.photos ? `<div class="entry-photos">${entry.photos.before ? `<img src="${entry.photos.before}" alt="Avant">` : ""}${entry.photos.after ? `<img src="${entry.photos.after}" alt="Après">` : ""}</div>` : "";
  const itemText = entry.items?.length ? `<p class="small">${entry.items.map((item) => esc(`${item.name} · ${item.quantity || "portion"}`)).join("<br>")}</p>` : "";
  return `<div class="journal-entry">
    <div>
      <b>${esc(entry.name)}</b>
      <span class="macro-line">${esc(entry.quantity || "1 portion")} · ${fmt(entry.kcal)} kcal · P ${fmt(entry.protein, 1)} · G ${fmt(entry.carbs, 1)} · L ${fmt(entry.fat, 1)}</span>
      ${itemText}${photoHtml}
    </div>
    <div class="entry-actions">
      <button data-fav-entry="${entry.id}" title="Favori">★</button>
      <button data-delete-entry="${entry.id}" title="Supprimer">×</button>
    </div>
  </div>`;
}

function bindEntryButtons() {
  $$("[data-delete-entry]").forEach((button) => button.addEventListener("click", async () => {
    await deleteOne("entries", button.dataset.deleteEntry);
    await refreshState();
    render();
  }));
  $$("[data-fav-entry]").forEach((button) => button.addEventListener("click", async () => {
    const entry = entries.find((item) => item.id === button.dataset.favEntry);
    if (!entry) return;
    await saveFavoriteFromEntry(entry);
    toast("Ajouté aux favoris.");
  }));
}

function renderAdd() {
  setTitle("Ajouter");
  $("#screen").innerHTML = `
    <section class="section"><span>Ajout rapide</span><h2>Que veux-tu ajouter ?</h2></section>
    <div class="action-grid">
      <button data-scroll="food-search-card">Chercher un aliment</button>
      <button data-scroll="favorite-card">Ajouter un favori</button>
      <button data-scroll="manual-food-card">Produit absent</button>
      <button data-scroll="meal-builder-card">Repas complet</button>
    </div>
    <article id="food-search-card" class="card">${foodSearchBlock("add-food-search", "add-food-results", "petit-déjeuner")}</article>
    <article id="favorite-card" class="card">
      <h2>Favoris en 1 clic</h2>
      <div class="food-list">${favorites.length ? favorites.map(favoriteRow).join("") : `<p class="empty">Aucun favori pour le moment. Enregistre un repas depuis le journal, la photo ou les recettes.</p>`}</div>
    </article>
    <article id="manual-food-card" class="card">${manualFoodForm()}</article>
    <article class="card">
      <h2>Collations rapides</h2>
      <div class="food-list">${quickSnacks.map((snack) => snackRow(snack)).join("")}</div>
    </article>
    <article id="meal-builder-card" class="card">${mealBuilderHtml()}</article>`;
  bindScrollButtons();
  bindFoodSearch("add-food-search", "add-food-results");
  bindFavoriteButtons();
  bindSnackButtons();
  $("#manual-food-form").addEventListener("submit", saveManualFood);
  bindMealBuilder();
}

function bindScrollButtons() {
  $$("[data-scroll]").forEach((button) => button.addEventListener("click", () => {
    $(`#${button.dataset.scroll}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function foodSearchBlock(inputId, resultsId, mealType) {
  return `<h2>Chercher un aliment</h2>
    <p class="small">Recherche tolérante : oeuf, œufs, oeu ou oe retrouvent bien “Œufs”.</p>
    <div class="search-tools">
      <input id="${inputId}" placeholder="Ex : oeuf, riz poulet, sandwich..." autocomplete="off">
      <label>Repas${select("mealType", MEALS.map((meal) => [meal, meal]), mealType)}</label>
    </div>
    <div id="${resultsId}" class="food-list"></div>`;
}

function bindFoodSearch(inputId, resultsId) {
  const input = $(`#${inputId}`);
  const results = $(`#${resultsId}`);
  const update = () => {
    const mealSelect = results.closest(".card").querySelector("select[name='mealType']");
    const mealType = mealSelect?.value || "petit-déjeuner";
    const list = searchFoods(input.value, 18);
    results.innerHTML = list.map((food) => foodRow(food, mealType)).join("");
    bindFoodResultButtons(results);
  };
  input.addEventListener("input", update);
  results.closest(".card").querySelector("select[name='mealType']")?.addEventListener("change", update);
  update();
}

function foodRow(food, mealType) {
  return `<div class="food-row">
    <div>
      <b>${esc(food.name)}</b>
      <span class="macro-line">${esc(food.portionLabel || "1 portion")} · ${fmt(food.kcal)} kcal · P ${fmt(food.protein, 1)} · G ${fmt(food.carbs, 1)} · L ${fmt(food.fat, 1)}</span>
      <div class="tag-line">${(food.tags || []).slice(0, 4).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
    </div>
    <div class="food-actions">
      <input data-qty-food="${esc(food.id)}" inputmode="decimal" value="1" aria-label="Quantité">
      <button class="primary-button" data-add-food="${esc(food.id)}" data-meal="${esc(mealType)}">Ajouter</button>
      <button class="secondary-button" data-fav-food="${esc(food.id)}">★</button>
    </div>
  </div>`;
}

function bindFoodResultButtons(root = document) {
  $$("[data-add-food]", root).forEach((button) => button.addEventListener("click", async () => {
    const food = allFoods().find((item) => item.id === button.dataset.addFood);
    const quantityInput = root.querySelector(`[data-qty-food="${attr(button.dataset.addFood)}"]`);
    await addFoodEntry(food, button.dataset.meal, parseNum(quantityInput?.value, 1));
  }));
  $$("[data-fav-food]", root).forEach((button) => button.addEventListener("click", async () => {
    const food = allFoods().find((item) => item.id === button.dataset.favFood);
    if (!food) return;
    await putOne("favorites", favoriteFromItems(food.name, "aliment", [scaleFood(food, 1)]));
    await refreshState();
    toast("Aliment ajouté aux favoris.");
  }));
}

async function addFoodEntry(food, mealType, multiplier = 1) {
  if (!food) return;
  const item = scaleFood(food, multiplier);
  await putOne("entries", {
    id: uid(),
    date: journalDate || today(),
    mealType,
    name: item.name,
    quantity: item.quantity,
    ...macroSum([item]),
    items: [item],
    source: "base locale",
    createdAt: new Date().toISOString()
  });
  await refreshState();
  toast("Ajouté au journal.");
}

function favoriteRow(fav) {
  return `<div class="food-row">
    <div><b>${esc(fav.name)}</b><span class="macro-line">${esc(fav.type || "favori")} · ${fmt(fav.kcal)} kcal · P ${fmt(fav.protein, 1)} · G ${fmt(fav.carbs, 1)} · L ${fmt(fav.fat, 1)}</span></div>
    <div class="food-actions"><button class="primary-button" data-add-favorite="${esc(fav.id)}">Ajouter</button><button class="danger-button" data-delete-favorite="${esc(fav.id)}">×</button></div>
  </div>`;
}

function snackRow(snack) {
  return `<div class="food-row">
    <div><b>${esc(snack.name)}</b><span class="macro-line">${esc(snack.quantity)} · ${fmt(snack.kcal)} kcal · P ${fmt(snack.protein, 1)} · G ${fmt(snack.carbs, 1)} · L ${fmt(snack.fat, 1)}</span></div>
    <div class="food-actions"><button class="primary-button" data-add-snack="${esc(snack.id)}">Ajouter</button><button class="secondary-button" data-fav-snack="${esc(snack.id)}">★</button></div>
  </div>`;
}

function bindSnackButtons() {
  $$("[data-add-snack]").forEach((button) => button.addEventListener("click", async () => {
    const snack = quickSnacks.find((item) => item.id === button.dataset.addSnack);
    await putOne("entries", entryFromFavorite({ ...snack, items: [{ ...snack }] }, "collations"));
    await refreshState();
    toast("Collation ajoutée.");
  }));
  $$("[data-fav-snack]").forEach((button) => button.addEventListener("click", async () => {
    const snack = quickSnacks.find((item) => item.id === button.dataset.favSnack);
    await putOne("favorites", favoriteFromItems(snack.name, "collation", [{ ...snack }]));
    await refreshState();
    toast("Collation ajoutée aux favoris.");
  }));
}

function manualFoodForm() {
  return `<h2>Créer un produit absent</h2>
    <form id="manual-food-form" class="form-grid">
      <label>Nom<input name="name" required placeholder="Ex : yaourt maison"></label>
      <label>Portion<input name="portionLabel" required placeholder="Ex : 1 bol, 100 g"></label>
      <label>Kcal<input name="kcal" inputmode="decimal" required></label>
      <label>Protéines<input name="protein" inputmode="decimal" required></label>
      <label>Glucides<input name="carbs" inputmode="decimal" required></label>
      <label>Lipides<input name="fat" inputmode="decimal" required></label>
      <label>Catégorie<input name="category" value="personnel"></label>
      <label>Alias / synonymes<input name="aliases" placeholder="séparés par virgules"></label>
      <button class="primary-button form-wide">Sauvegarder dans ma base locale</button>
    </form>`;
}

async function saveManualFood(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const food = {
    id: `custom-${uid()}`,
    name: data.name.trim(),
    aliases: data.aliases.split(",").map((item) => item.trim()).filter(Boolean),
    category: data.category.trim() || "personnel",
    portionLabel: data.portionLabel.trim(),
    portionGrams: 0,
    kcal: parseNum(data.kcal),
    protein: parseNum(data.protein),
    carbs: parseNum(data.carbs),
    fat: parseNum(data.fat),
    tags: ["personnel", "hors ligne"]
  };
  await putOne("savedFoods", food);
  await refreshState();
  toast("Produit sauvegardé localement.");
  renderAdd();
}

function mealBuilderHtml() {
  const total = macroSum(mealDraft);
  return `<h2>Créer un repas complet</h2>
    <p class="small">Ajoute plusieurs aliments, puis sauvegarde le repas au journal ou comme favori.</p>
    <input id="meal-search" placeholder="Chercher un aliment à ajouter au repas">
    <div id="meal-results" class="food-list"></div>
    <div class="journal-list">${mealDraft.length ? mealDraft.map((item, index) => `<div class="journal-row row"><div><b>${esc(item.name)}</b><span class="macro-line">${esc(item.quantity)} · ${fmt(item.kcal)} kcal</span></div><button class="danger-button" data-remove-meal-item="${index}">×</button></div>`).join("") : `<p class="empty">Le repas est vide.</p>`}</div>
    <p class="macro-line">Total : ${fmt(total.kcal)} kcal · P ${fmt(total.protein, 1)} · G ${fmt(total.carbs, 1)} · L ${fmt(total.fat, 1)}</p>
    <div class="form-grid">
      <label>Nom du repas<input id="meal-name" value="Repas maison"></label>
      <label>Type de repas${select("mealType", MEALS.map((meal) => [meal, meal]), "déjeuner")}</label>
    </div>
    <div class="row buttons-row">
      <button id="add-meal-journal" class="primary-button">Ajouter au journal</button>
      <button id="save-meal-favorite" class="secondary-button">Mettre en favori</button>
    </div>`;
}

function bindMealBuilder() {
  const input = $("#meal-search");
  const results = $("#meal-results");
  const update = () => {
    results.innerHTML = searchFoods(input.value, 10).map((food) => `<div class="food-row"><div><b>${esc(food.name)}</b><span class="macro-line">${esc(food.portionLabel)} · ${fmt(food.kcal)} kcal</span></div><div class="food-actions"><input data-meal-qty="${esc(food.id)}" inputmode="decimal" value="1"><button class="primary-button" data-meal-food="${esc(food.id)}">Ajouter</button></div></div>`).join("");
    $$("[data-meal-food]", results).forEach((button) => button.addEventListener("click", () => {
      const food = allFoods().find((item) => item.id === button.dataset.mealFood);
      const qty = parseNum(results.querySelector(`[data-meal-qty="${attr(button.dataset.mealFood)}"]`)?.value, 1);
      mealDraft.push(scaleFood(food, qty));
      renderAdd();
      $("#meal-builder-card").scrollIntoView({ block: "start" });
    }));
  };
  input.addEventListener("input", update);
  update();
  $$("[data-remove-meal-item]").forEach((button) => button.addEventListener("click", () => { mealDraft.splice(Number(button.dataset.removeMealItem), 1); renderAdd(); }));
  $("#add-meal-journal").addEventListener("click", async () => saveMealDraft(false));
  $("#save-meal-favorite").addEventListener("click", async () => saveMealDraft(true));
}

async function saveMealDraft(onlyFavorite) {
  if (!mealDraft.length) return toast("Ajoute au moins un aliment.");
  const name = $("#meal-name").value.trim() || "Repas maison";
  const mealType = $("#meal-builder-card select[name='mealType']").value;
  const favorite = favoriteFromItems(name, mealType, mealDraft);
  if (onlyFavorite) {
    await putOne("favorites", favorite);
    await refreshState();
    toast("Repas favori sauvegardé.");
    return;
  }
  await putOne("entries", entryFromFavorite(favorite, mealType));
  await refreshState();
  mealDraft = [];
  toast("Repas ajouté.");
  navigate("journal");
}

function favoriteFromItems(name, type, items) {
  const total = macroSum(items);
  return {
    id: uid(),
    name,
    type,
    items,
    ...total,
    createdAt: new Date().toISOString()
  };
}

function entryFromFavorite(favorite, mealType = favorite.type || "déjeuner", extra = {}) {
  const total = macroSum(favorite.items?.length ? favorite.items : [favorite]);
  return {
    id: uid(),
    date: journalDate || today(),
    mealType: MEALS.includes(mealType) ? mealType : "déjeuner",
    name: favorite.name,
    quantity: favorite.quantity || "1 portion",
    ...total,
    items: favorite.items?.length ? favorite.items : [{ name: favorite.name, quantity: favorite.quantity || "1 portion", ...total }],
    source: "favori/local",
    createdAt: new Date().toISOString(),
    ...extra
  };
}

async function saveFavoriteFromEntry(entry) {
  await putOne("favorites", favoriteFromItems(entry.name, entry.mealType, entry.items?.length ? entry.items : [{ name: entry.name, quantity: entry.quantity, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }]));
  await refreshState();
}

function bindFavoriteButtons() {
  $$("[data-add-favorite]").forEach((button) => button.addEventListener("click", async () => {
    const favorite = favorites.find((item) => item.id === button.dataset.addFavorite);
    if (!favorite) return;
    await putOne("entries", entryFromFavorite(favorite));
    await refreshState();
    toast("Favori ajouté au journal.");
  }));
  $$("[data-delete-favorite]").forEach((button) => button.addEventListener("click", async () => {
    await deleteOne("favorites", button.dataset.deleteFavorite);
    await refreshState();
    render();
  }));
}

function renderPhoto() {
  setTitle("Photo repas");
  const total = macroSum(photoDraft.items);
  const factor = photoDraft.percent / 100;
  const consumed = {
    kcal: round(total.kcal * factor),
    protein: round(total.protein * factor),
    carbs: round(total.carbs * factor),
    fat: round(total.fat * factor)
  };
  $("#screen").innerHTML = `
    <article class="card hero-card">
      <p class="muted-label">Sans IA automatique</p>
      <h1>Photo repas</h1>
      <p class="small">La photo sert de repère visuel. Compose le repas avec les aliments ou favoris pour calculer les calories.</p>
    </article>
    <div class="photo-grid">
      <article class="card"><label>Prendre / importer photo avant<input id="photo-before" type="file" accept="image/*" capture="environment"></label>${photoDraft.before ? `<img class="photo-preview" src="${photoDraft.before}" alt="Photo avant repas">` : ""}</article>
      <article class="card"><label>Photo après repas optionnelle<input id="photo-after" type="file" accept="image/*" capture="environment"></label>${photoDraft.after ? `<img class="photo-preview" src="${photoDraft.after}" alt="Photo après repas">` : ""}</article>
    </div>
    <article class="card">
      <h2>Composer le repas</h2>
      <input id="photo-food-search" placeholder="Chercher un aliment ou plat local">
      <div id="photo-food-results" class="food-list"></div>
      <h3>Favoris</h3>
      <div class="food-list">${favorites.slice(0, 6).map((fav) => `<div class="food-row"><div><b>${esc(fav.name)}</b><span class="macro-line">${fmt(fav.kcal)} kcal</span></div><button class="secondary-button" data-photo-favorite="${esc(fav.id)}">Ajouter</button></div>`).join("") || `<p class="empty">Pas encore de favori.</p>`}</div>
      <div class="journal-list">${photoDraft.items.length ? photoDraft.items.map((item, index) => `<div class="journal-row row"><div><b>${esc(item.name)}</b><span class="macro-line">${esc(item.quantity)} · ${fmt(item.kcal)} kcal</span></div><button class="danger-button" data-remove-photo-item="${index}">×</button></div>`).join("") : `<p class="empty">Ajoute les aliments visibles dans l’assiette.</p>`}</div>
      <div class="form-grid">
        <label>Repas${select("photoMealType", MEALS.map((meal) => [meal, meal]), photoDraft.mealType)}</label>
        <label>Pourcentage mangé${select("photoPercent", [["25", "25 %"], ["50", "50 %"], ["75", "75 %"], ["100", "100 %"]], String(photoDraft.percent))}</label>
      </div>
      <p class="macro-line">Résumé consommé : ${fmt(consumed.kcal)} kcal · P ${fmt(consumed.protein, 1)} · G ${fmt(consumed.carbs, 1)} · L ${fmt(consumed.fat, 1)}</p>
      <div class="row buttons-row">
        <button id="add-photo-journal" class="primary-button">Ajouter au journal</button>
        <button id="save-photo-favorite" class="secondary-button">Enregistrer comme favori</button>
      </div>
    </article>`;
  $("#photo-before").addEventListener("change", (event) => readPhoto(event, "before"));
  $("#photo-after").addEventListener("change", (event) => readPhoto(event, "after"));
  $("select[name='photoPercent']").addEventListener("change", (event) => { photoDraft.percent = parseNum(event.target.value, 100); renderPhoto(); });
  $("select[name='photoMealType']").addEventListener("change", (event) => { photoDraft.mealType = event.target.value; });
  bindPhotoFoodSearch();
  $$("[data-photo-favorite]").forEach((button) => button.addEventListener("click", () => {
    const fav = favorites.find((item) => item.id === button.dataset.photoFavorite);
    if (fav?.items?.length) photoDraft.items.push(...fav.items);
    renderPhoto();
  }));
  $$("[data-remove-photo-item]").forEach((button) => button.addEventListener("click", () => { photoDraft.items.splice(Number(button.dataset.removePhotoItem), 1); renderPhoto(); }));
  $("#add-photo-journal").addEventListener("click", addPhotoMealToJournal);
  $("#save-photo-favorite").addEventListener("click", savePhotoFavorite);
}

function readPhoto(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photoDraft[key] = reader.result;
    renderPhoto();
  };
  reader.readAsDataURL(file);
}

function bindPhotoFoodSearch() {
  const input = $("#photo-food-search");
  const results = $("#photo-food-results");
  const update = () => {
    results.innerHTML = searchFoods(input.value, 10).map((food) => `<div class="food-row"><div><b>${esc(food.name)}</b><span class="macro-line">${esc(food.portionLabel)} · ${fmt(food.kcal)} kcal</span></div><div class="food-actions"><input data-photo-qty="${esc(food.id)}" inputmode="decimal" value="1"><button class="primary-button" data-photo-food="${esc(food.id)}">Ajouter</button></div></div>`).join("");
    $$("[data-photo-food]", results).forEach((button) => button.addEventListener("click", () => {
      const food = allFoods().find((item) => item.id === button.dataset.photoFood);
      const qty = parseNum(results.querySelector(`[data-photo-qty="${attr(button.dataset.photoFood)}"]`)?.value, 1);
      photoDraft.items.push(scaleFood(food, qty));
      renderPhoto();
    }));
  };
  input.addEventListener("input", update);
  update();
}

async function addPhotoMealToJournal() {
  if (!photoDraft.items.length) return toast("Compose d’abord le repas.");
  const total = macroSum(photoDraft.items);
  const factor = photoDraft.percent / 100;
  const consumedItems = photoDraft.items.map((item) => ({
    ...item,
    quantity: `${item.quantity} · ${photoDraft.percent}% mangé`,
    kcal: round(item.kcal * factor),
    protein: round(item.protein * factor),
    carbs: round(item.carbs * factor),
    fat: round(item.fat * factor)
  }));
  await putOne("entries", {
    id: uid(),
    date: journalDate || today(),
    mealType: photoDraft.mealType,
    name: "Repas photo",
    quantity: `${photoDraft.percent}% mangé`,
    kcal: round(total.kcal * factor),
    protein: round(total.protein * factor),
    carbs: round(total.carbs * factor),
    fat: round(total.fat * factor),
    items: consumedItems,
    photos: { before: photoDraft.before, after: photoDraft.after },
    source: "photo repas locale",
    createdAt: new Date().toISOString()
  });
  photoDraft = { before: "", after: "", percent: 100, items: [], mealType: "déjeuner" };
  await refreshState();
  toast("Repas photo ajouté.");
  navigate("journal");
}

async function savePhotoFavorite() {
  if (!photoDraft.items.length) return toast("Ajoute au moins un aliment.");
  await putOne("favorites", favoriteFromItems("Repas photo type", photoDraft.mealType, photoDraft.items));
  await refreshState();
  toast("Repas photo enregistré en favori.");
}

function renderFavorites() {
  setTitle("Favoris");
  const byType = favorites.reduce((groups, fav) => {
    const key = fav.type || "favori";
    groups[key] = groups[key] || [];
    groups[key].push(fav);
    return groups;
  }, {});
  $("#screen").innerHTML = `
    <article class="card hero-card"><p class="muted-label">1 clic</p><h1>Repas types et favoris</h1><p class="small">Petit-déjeuner type, collation favorite, repas complet : ajoute ce que tu manges souvent sans tout ressaisir.</p></article>
    ${Object.keys(byType).length ? Object.entries(byType).map(([type, list]) => `<section class="section"><span>${esc(type)}</span><h2>${esc(type)}</h2></section><div class="food-list">${list.map(favoriteRow).join("")}</div>`).join("") : `<article class="card"><p class="empty">Aucun favori. Depuis un repas du journal, une recette ou la photo, appuie sur ★.</p></article>`}`;
  bindFavoriteButtons();
}

function renderRecipes() {
  setTitle("Recettes");
  $("#screen").innerHTML = `
    <section class="section"><span>Prise de poids</span><h2>${recipes.length} recettes simples</h2></section>
    <div class="recipe-list">${recipes.map((recipe) => `<article class="card recipe-row">
      <div class="row"><div><p class="muted-label">${esc(recipe.type || recipe.category)} · ${esc(recipe.budget || recipe.cost || "€€")}</p><h3>${esc(recipe.name)}</h3></div><strong>${fmt(recipe.kcal)} kcal</strong></div>
      <p class="macro-line">P ${fmt(recipe.protein, 1)} · G ${fmt(recipe.carbs, 1)} · L ${fmt(recipe.fat, 1)}</p>
      <details><summary>Ingrédients et étapes</summary><p class="small"><b>Ingrédients :</b> ${(recipe.ingredients || []).map(esc).join(", ")}</p><ol class="small">${(recipe.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>
      <div class="row buttons-row"><button class="primary-button" data-add-recipe="${esc(recipe.id)}">Ajouter au journal</button><button class="secondary-button" data-fav-recipe="${esc(recipe.id)}">Mettre en favori</button></div>
    </article>`).join("")}</div>`;
  $$("[data-add-recipe]").forEach((button) => button.addEventListener("click", async () => {
    const recipe = recipes.find((item) => item.id === button.dataset.addRecipe);
    const fav = favoriteFromItems(recipe.name, recipe.type || "déjeuner", [{ name: recipe.name, quantity: "1 portion", kcal: recipe.kcal, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat }]);
    await putOne("entries", entryFromFavorite(fav, recipe.type === "petit-déjeuner" ? "petit-déjeuner" : recipe.type === "collation" ? "collations" : "déjeuner"));
    await refreshState();
    toast("Recette ajoutée.");
  }));
  $$("[data-fav-recipe]").forEach((button) => button.addEventListener("click", async () => {
    const recipe = recipes.find((item) => item.id === button.dataset.favRecipe);
    await putOne("favorites", favoriteFromItems(recipe.name, recipe.type || "recette", [{ name: recipe.name, quantity: "1 portion", kcal: recipe.kcal, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat }]));
    await refreshState();
    toast("Recette ajoutée aux favoris.");
  }));
}

function renderTips() {
  setTitle("Astuces");
  const dayTip = tips[new Date().getDate() % tips.length] || tips[0];
  $("#screen").innerHTML = `
    <article class="card hero-card"><p class="muted-label">${esc(dayTip?.category || "astuce")}</p><h1>${esc(dayTip?.title || "Astuce du jour")}</h1><p class="small">${esc(dayTip?.body || "")}</p></article>
    <section class="section"><span>Concret</span><h2>${tips.length} astuces rapides</h2></section>
    <div class="tip-list">${tips.map((tip) => `<article class="card tip-row"><p class="muted-label">${esc(tip.category)}</p><h3>${esc(tip.title)}</h3><p class="small">${esc(tip.body)}</p></article>`).join("")}</div>`;
}

function renderProfile() {
  setTitle("Profil");
  $("#screen").innerHTML = `
    <article class="card">
      <div class="row"><div><p class="muted-label">Aucun compte</p><h2>${esc(profile.firstName || "Profil local")}</h2></div><strong>IMC ${fmt(bmiValue(), 1)}</strong></div>
      <p class="small">${esc(profile.paceAdvice)} · ${fmt(profile.calorieGoal)} kcal · ${fmt(profile.proteinGoal)} g protéines · ${fmt(profile.waterGoal)} ml eau</p>
      ${bmiValue() < 17.5 ? `<p class="warning">Suivi médical recommandé en cas de maigreur importante.</p>` : ""}
    </article>
    <article class="card">
      <h2>Poids actuel</h2>
      <form id="weight-form" class="form-grid">
        <label>Poids aujourd’hui (kg)<input name="weight" inputmode="decimal" value="${esc(profile.currentWeight)}"></label>
        <button class="primary-button">Enregistrer le poids</button>
      </form>
    </article>
    <article class="card">
      <h2>Données locales</h2>
      <div class="grid two">
        <button id="edit-profile" class="secondary-button">Modifier onboarding</button>
        <button id="export-data" class="secondary-button">Exporter mes données</button>
        <button id="delete-data" class="danger-button">Supprimer toutes mes données</button>
        <button id="install-help" class="secondary-button">Installer l’app</button>
      </div>
    </article>
    <article class="card"><h2>Confidentialité</h2><p class="small">IndexedDB local, pas de compte, pas d’e-mail. Les photos de repas restent dans l’appareil.</p></article>`;
  $("#weight-form").addEventListener("submit", saveWeight);
  $("#edit-profile").addEventListener("click", () => { profile = null; renderOnboarding(); });
  $("#export-data").addEventListener("click", exportJson);
  $("#delete-data").addEventListener("click", deleteAllData);
  $("#install-help").addEventListener("click", () => toast("iPhone : Safari > Partager > Sur l’écran d’accueil. Android : Chrome > Installer."));
}

async function saveWeight(event) {
  event.preventDefault();
  const value = parseNum(new FormData(event.currentTarget).get("weight"), profile.currentWeight);
  profile = { ...profile, currentWeight: value, ...estimateGoals({ ...profile, currentWeight: value }) };
  await putOne("settings", { id: "profile", value: profile });
  await putOne("weights", { id: `weight-${today()}`, date: today(), value });
  await refreshState();
  toast("Poids enregistré.");
  renderProfile();
}

async function exportJson() {
  const payload = { profile, entries, weights, savedFoods, customSnacks, favorites, waterToday, exportedAt: new Date().toISOString() };
  download(`mass-plus-${today()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function deleteAllData() {
  if (!confirm("Supprimer toutes les données locales Mass+ ?")) return;
  await Promise.all(STORE_NAMES.map(clearStore));
  localStorage.removeItem(PREF_SCREEN);
  profile = null;
  activeScreen = "dashboard";
  await refreshState();
  render();
}

async function init() {
  db = await openDb();
  [foods, recipes, tips] = await Promise.all([
    loadJson(["./data/aliments-fr.json", "./foods.fr.json"]),
    loadJson(["./data/recettes-fr.json", "./recipes.fr.json"]),
    loadJson(["./data/astuces-fr.json", "./tips.fr.json"])
  ]);
  foods = foods.map((food) => ({ ...food, _search: foodSearchText(food) }));
  await refreshState();
  if (location.hash) activeScreen = normalizeScreen(location.hash.replace("#", ""));
  $("#install-hint").addEventListener("click", () => toast("iPhone : Safari > Partager > Sur l’écran d’accueil. Android : Chrome > Installer."));
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined));
  window.addEventListener("hashchange", () => {
    activeScreen = normalizeScreen(location.hash.replace("#", ""));
    render();
  });
  render();
}

init().catch((error) => {
  console.error(error);
  $("#screen").innerHTML = `<article class="card"><h2>Impossible d’ouvrir Mass+</h2><p class="small">Vérifie que le navigateur autorise IndexedDB et recharge la page.</p></article>`;
});
