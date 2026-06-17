"use strict";

const DB_NAME = "mass-plus-local-db";
const DB_VERSION = 1;
const PREF_SCREEN = "mass-plus-active-screen";
const MEALS = ["petit-déjeuner", "déjeuner", "dîner", "collations"];
const NAV = [
  ["dashboard", "Accueil"],
  ["journal", "Journal"],
  ["snacks", "Collations"],
  ["photo", "Photo"],
  ["recipes", "Recettes"],
  ["tips", "Astuces"],
  ["profile", "Profil"]
];

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
let activeScreen = localStorage.getItem(PREF_SCREEN) || "dashboard";
let composer = [];
let photoState = { before: "", after: "", percent: 100 };
let editingSnackId = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value || 0));
const dateHuman = (date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

const quickSnacks = [
  { target: 300, name: "Lait + banane", kcal: 310, protein: 10, carbs: 47, fat: 9, items: "250 ml lait entier + 1 banane" },
  { target: 500, name: "Skyr + avoine + miel", kcal: 520, protein: 33, carbs: 74, fat: 10, items: "200 g skyr + 80 g avoine + miel" },
  { target: 700, name: "Pain + œufs + avocat", kcal: 710, protein: 31, carbs: 54, fat: 40, items: "pain au levain + 2 œufs + avocat" },
  { target: 1000, name: "Semoule + huile + thon", kcal: 1010, protein: 55, carbs: 115, fat: 35, items: "semoule, thon, pois chiches, huile d’olive" },
  { target: 500, name: "Fruits secs + lait", kcal: 505, protein: 13, carbs: 74, fat: 17, items: "50 g fruits secs + 500 ml lait" }
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

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      ["settings", "entries", "weights", "savedFoods", "customSnacks", "favorites", "water"].forEach((store) => {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
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

async function loadJson(path, fallback = []) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? response.json() : fallback;
  } catch {
    return fallback;
  }
}

async function refreshState() {
  const profileSetting = await getOne("settings", "profile");
  profile = profileSetting?.value || null;
  entries = await getAll("entries");
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

function macros(items) {
  return items.reduce((sum, item) => ({
    kcal: sum.kcal + Number(item.kcal || 0),
    protein: sum.protein + Number(item.protein || 0),
    carbs: sum.carbs + Number(item.carbs || 0),
    fat: sum.fat + Number(item.fat || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function todaysEntries() {
  return entries.filter((entry) => entry.date === today());
}

function bmi() {
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
  const paceAdvice = weeklyGain > 0.75 ? "rythme demandé agressif : vise plutôt +500 à +750 g/semaine" : weeklyGain < 0.25 ? "+200 à +300 g/semaine" : `environ +${Math.round(weeklyGain * 1000)} g/semaine`;
  const advice = [
    data.appetite === "faible" ? "Mise sur les calories liquides et les petites collations denses." : "Garde un goûter régulier pour stabiliser la moyenne.",
    data.budget === "serré" ? "Base économique : riz, pâtes, œufs, lentilles, pois chiches et huile d’olive." : "Prévois 2 collations prêtes pour les jours chargés.",
    data.mealsPerDay < 4 ? "Ajouter une collation peut suffire à augmenter l’apport sans gros repas." : "Répartir les apports sur la journée aide à tenir l’objectif."
  ];
  return { calorieGoal, proteinGoal, waterGoal, paceAdvice, advice };
}

function renderNav() {
  const template = $("#nav-template").content;
  $("#bottom-nav").replaceChildren(template.cloneNode(true));
  $("#desktop-nav").replaceChildren(template.cloneNode(true));
  $$("[data-screen]").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === activeScreen);
    button.addEventListener("click", () => navigate(button.dataset.screen));
  });
}

function navigate(screen) {
  activeScreen = screen;
  localStorage.setItem(PREF_SCREEN, screen);
  history.replaceState(null, "", `#${screen}`);
  render();
}

function setTitle(title) {
  $("#screen-title").textContent = title;
  $("#today-label").textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
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
    snacks: renderSnacks,
    photo: renderPhoto,
    recipes: renderRecipes,
    tips: renderTips,
    profile: renderProfile
  };
  (screens[activeScreen] || renderDashboard)();
}

function renderOnboarding(step = 1, draft = { ...defaultProfile }) {
  const screen = $("#screen");
  const goals = estimateGoals(draft);
  screen.innerHTML = `
    <article class="card hero-card">
      <p class="muted-label">Mode local/offline</p>
      <h1>Un plan de prise de poids adapté à ton quotidien.</h1>
      <p class="small">Pas d’email, pas de compte, pas de serveur obligatoire. Tout reste sur ce téléphone.</p>
    </article>
    <form id="onboarding-form" class="card" style="margin-top:14px">
      <p class="muted-label">Questionnaire de départ</p>
      <div class="form-grid">
        <label>Prénom local facultatif<input name="firstName" value="${esc(draft.firstName)}" placeholder="Ex. Lina"></label>
        <label>Sexe<select name="sex"><option value="female">Femme</option><option value="male">Homme</option><option value="other">Autre</option></select></label>
        <label>Âge<input name="age" type="number" min="16" max="90" value="${esc(draft.age)}" required></label>
        <label>Taille (cm)<input name="height" type="number" min="130" max="220" value="${esc(draft.height)}" required></label>
        <label>Poids actuel (kg)<input name="currentWeight" type="number" step=".1" min="30" max="250" value="${esc(draft.currentWeight)}" required></label>
        <label>Poids objectif (kg)<input name="targetWeight" type="number" step=".1" min="30" max="250" value="${esc(draft.targetWeight)}" required></label>
        <label>Délai souhaité (semaines)<input name="deadlineWeeks" type="number" min="4" max="104" value="${esc(draft.deadlineWeeks)}" required></label>
        <label>Activité physique<select name="activity"><option value="faible">Faible</option><option value="modérée">Modérée</option><option value="élevée">Élevée</option></select></label>
        <label>Nombre de repas par jour<input name="mealsPerDay" type="number" min="2" max="7" value="${esc(draft.mealsPerDay)}"></label>
        <label>Appétit<select name="appetite"><option value="faible">Faible</option><option value="moyen">Moyen</option><option value="fort">Fort</option></select></label>
        <label>Aliments aimés<input name="likedFoods" value="${esc(draft.likedFoods)}" placeholder="pâtes, œufs, avocat..."></label>
        <label>Aliments détestés<input name="dislikedFoods" value="${esc(draft.dislikedFoods)}" placeholder="thon, lait..."></label>
        <label>Allergies / intolérances<input name="allergies" value="${esc(draft.allergies)}" placeholder="lactose, fruits à coque..."></label>
        <label>Budget<select name="budget"><option value="serré">Serré</option><option value="moyen">Moyen</option><option value="confort">Confort</option></select></label>
        <label>Objectif<select name="objective"><option value="prise de poids">Prise de poids</option><option value="prise de muscle">Prise de muscle</option><option value="maintien">Maintien</option></select></label>
      </div>
      <div class="card" style="margin-top:16px;background:var(--surface-soft);box-shadow:none">
        <p class="muted-label">Objectifs générés</p>
        <div class="grid four">
          <div class="metric"><small>Calories</small><strong>${fmt(goals.calorieGoal)}</strong></div>
          <div class="metric"><small>Protéines</small><strong>${fmt(goals.proteinGoal)} g</strong></div>
          <div class="metric"><small>Eau</small><strong>${fmt(goals.waterGoal)} ml</strong></div>
          <div class="metric"><small>Rythme</small><strong>${esc(goals.paceAdvice)}</strong></div>
        </div>
        <p class="small" style="margin-top:12px">${goals.advice.map(esc).join(" ")}</p>
      </div>
      <button class="primary-button" style="width:100%;margin-top:16px" type="submit">Créer mon plan local</button>
    </form>`;
  const form = $("#onboarding-form");
  form.sex.value = draft.sex;
  form.activity.value = draft.activity;
  form.appetite.value = draft.appetite;
  form.budget.value = draft.budget;
  form.objective.value = draft.objective;
  form.addEventListener("input", () => {
    const next = formToProfile(form);
    renderOnboarding(step, next);
  });
  form.addEventListener("submit", saveProfileFromForm);
}

function formToProfile(form) {
  const data = new FormData(form);
  const base = {
    firstName: data.get("firstName"),
    sex: data.get("sex"),
    age: Number(data.get("age")),
    height: Number(data.get("height")),
    currentWeight: Number(data.get("currentWeight")),
    targetWeight: Number(data.get("targetWeight")),
    deadlineWeeks: Number(data.get("deadlineWeeks")),
    activity: data.get("activity"),
    mealsPerDay: Number(data.get("mealsPerDay")),
    appetite: data.get("appetite"),
    likedFoods: data.get("likedFoods"),
    dislikedFoods: data.get("dislikedFoods"),
    allergies: data.get("allergies"),
    budget: data.get("budget"),
    objective: data.get("objective")
  };
  return { ...base, ...estimateGoals(base) };
}

async function saveProfileFromForm(event) {
  event.preventDefault();
  const nextProfile = formToProfile(event.currentTarget);
  await putOne("settings", { id: "profile", value: nextProfile });
  await putOne("weights", { id: id(), date: today(), weight: nextProfile.currentWeight });
  await refreshState();
  activeScreen = "dashboard";
  toast("Plan local créé.");
  render();
}

function renderDashboard() {
  setTitle(`Bonjour ${profile.firstName ? esc(profile.firstName) : ""}`.trim() || "Bonjour");
  const day = todaysEntries();
  const total = macros(day);
  const caloriesLeft = Math.max(0, profile.calorieGoal - total.kcal);
  const progress = Math.min(100, (total.kcal / profile.calorieGoal) * 100);
  const proteinProgress = Math.min(100, (total.protein / profile.proteinGoal) * 100);
  const weightProgress = Math.min(100, Math.max(0, ((profile.currentWeight - weights[0]?.weight) / Math.max(.1, profile.targetWeight - weights[0]?.weight)) * 100));
  $("#screen").innerHTML = `
    <article class="card hero-card">
      <div class="row"><p class="muted-label">Aujourd’hui</p><strong>${fmt(progress)}%</strong></div>
      <div class="hero-number">${fmt(total.kcal)} <small>kcal</small></div>
      <p class="small">${fmt(caloriesLeft)} kcal restantes sur ${fmt(profile.calorieGoal)} kcal</p>
      <div class="bar"><span style="width:${progress}%"></span></div>
    </article>
    <div class="quick-actions">
      <button data-quick="journal">Ajouter un repas</button>
      <button data-quick="photo">Scanner / photo</button>
      <button data-quick="snacks">Collation rapide</button>
    </div>
    <div class="grid four">
      <div class="metric"><small>Protéines</small><strong>${fmt(total.protein,1)} g</strong><div class="bar dark"><span style="width:${proteinProgress}%"></span></div></div>
      <div class="metric"><small>Glucides</small><strong>${fmt(total.carbs,1)} g</strong></div>
      <div class="metric"><small>Lipides</small><strong>${fmt(total.fat,1)} g</strong></div>
      <div class="metric"><small>Eau</small><strong>${fmt(waterToday)} ml</strong></div>
    </div>
    <article class="card" style="margin-top:14px">
      <div class="row"><div><p class="muted-label">Poids actuel</p><h2>${fmt(profile.currentWeight,1)} kg</h2></div><div style="text-align:right"><p class="muted-label">Objectif</p><h2>${fmt(profile.targetWeight,1)} kg</h2></div></div>
      <div class="bar dark"><span style="width:${weightProgress}%"></span></div>
      ${bmiValue(profile) < 17.5 ? `<p class="warning" style="margin-top:12px">suivi médical recommandé en cas de maigreur importante</p>` : ""}
    </article>
    <article class="card" style="margin-top:14px">
      <div class="row"><h2>Eau</h2><span class="small">Objectif ${fmt(profile.waterGoal)} ml</span></div>
      <div class="water-buttons"><button data-water="250">+250 ml</button><button data-water="500">+500 ml</button><button data-water="-250">-250 ml</button></div>
    </article>`;
  $$("[data-quick]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.quick)));
  $$("[data-water]").forEach((button) => button.addEventListener("click", async () => {
    waterToday = Math.max(0, waterToday + Number(button.dataset.water));
    await putOne("water", { id: today(), date: today(), ml: waterToday });
    renderDashboard();
  }));
}

function bmiValue(data = profile) {
  return +(data.currentWeight / ((data.height / 100) ** 2)).toFixed(1);
}

function renderJournal() {
  setTitle("Journal alimentaire");
  const selectedDate = new URLSearchParams(location.search).get("date") || today();
  const dayEntries = entries.filter((entry) => entry.date === selectedDate);
  const total = macros(dayEntries);
  $("#screen").innerHTML = `
    <article class="card">
      <div class="row"><div><p class="muted-label">${dateHuman(selectedDate)}</p><h2>${fmt(total.kcal)} kcal</h2></div><div class="macro-line">P ${fmt(total.protein,1)} · G ${fmt(total.carbs,1)} · L ${fmt(total.fat,1)}</div></div>
    </article>
    <article class="card">
      <h2>Ajouter un aliment</h2>
      <div class="form-grid">
        <label>Repas<select id="meal-type">${MEALS.map((meal) => `<option>${meal}</option>`).join("")}</select></label>
        <label>Quantité (portions)<input id="portion-count" type="number" min=".1" step=".1" value="1"></label>
      </div>
      <div class="search-tools">
        <input id="food-search" placeholder="Rechercher : skyr, pâtes, avocat...">
        <div class="row"><button id="off-search" class="secondary-button">Open Food Facts</button><input id="barcode" placeholder="Code-barres" inputmode="numeric"></div>
      </div>
      <div id="food-results" class="food-list"></div>
    </article>
    <section class="section"><span>Par journée</span><h2>Repas</h2></section>
    <div class="meal-columns">${MEALS.map((meal) => mealColumn(meal, dayEntries.filter((entry) => entry.mealType === meal))).join("")}</div>
    <article class="card" style="margin-top:14px"><div class="row"><h2>Exports</h2><div><button id="export-json" class="secondary-button">JSON</button> <button id="export-csv" class="secondary-button">CSV</button></div></div></article>`;
  bindFoodSearch();
  $("#off-search").addEventListener("click", searchOpenFoodFacts);
  $("#barcode").addEventListener("change", searchBarcode);
  $("#export-json").addEventListener("click", exportJson);
  $("#export-csv").addEventListener("click", exportCsv);
  $$("[data-delete-entry]").forEach((button) => button.addEventListener("click", async () => {
    await deleteOne("entries", button.dataset.deleteEntry);
    await refreshState();
    renderJournal();
  }));
}

function mealColumn(meal, items) {
  const total = macros(items);
  return `<article class="card meal-card"><h3>${esc(meal)} <span>${fmt(total.kcal)} kcal</span></h3>${items.length ? items.map((entry) => `
    <div class="journal-entry"><div><b>${esc(entry.name)}</b><span class="macro-line">${esc(entry.quantity || "")} · ${fmt(entry.kcal)} kcal · P ${fmt(entry.protein,1)}</span></div><button data-delete-entry="${entry.id}">×</button></div>`).join("") : `<p class="empty">Aucune entrée.</p>`}</article>`;
}

function bindFoodSearch() {
  const input = $("#food-search");
  const results = $("#food-results");
  const renderResults = (list) => {
    results.innerHTML = list.slice(0, 12).map(foodRow).join("");
    $$("[data-add-food]", results).forEach((button) => button.addEventListener("click", () => addFoodById(button.dataset.addFood)));
    $$("[data-save-food]", results).forEach((button) => button.addEventListener("click", () => saveFoodById(button.dataset.saveFood)));
  };
  const update = () => {
    const query = input.value.trim().toLowerCase();
    const pool = [...foods, ...savedFoods];
    renderResults(pool.filter((food) => !query || food.name.toLowerCase().includes(query) || food.tags?.some((tag) => tag.includes(query))));
  };
  input.addEventListener("input", update);
  update();
}

function foodRow(food) {
  const source = food.source ? `<span class="tag">${esc(food.source)}</span>` : "";
  return `<div class="food-row"><div><b>${esc(food.name)}</b><span class="macro-line">${esc(food.portion)} · ${fmt(food.kcal)} kcal · P ${fmt(food.protein,1)} · G ${fmt(food.carbs,1)} · L ${fmt(food.fat,1)}</span><div class="tag-line">${source}${(food.tags || []).slice(0,4).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div></div><div><button class="primary-button" data-add-food="${esc(food.id)}">Ajouter</button>${food.source === "OFF" ? `<button class="secondary-button" data-save-food="${esc(food.id)}" style="margin-top:6px">Sauver</button>` : ""}</div></div>`;
}

async function addFoodById(foodId, mealType = $("#meal-type")?.value || "collations") {
  const food = [...foods, ...savedFoods].find((item) => item.id === foodId);
  if (!food) return;
  const portions = Math.max(.1, Number($("#portion-count")?.value || 1));
  await putOne("entries", {
    id: id(),
    date: today(),
    mealType,
    name: food.name,
    quantity: `${fmt(portions,1)} × ${food.portion}`,
    kcal: Math.round(food.kcal * portions),
    protein: +(food.protein * portions).toFixed(1),
    carbs: +(food.carbs * portions).toFixed(1),
    fat: +(food.fat * portions).toFixed(1),
    source: food.source || "local"
  });
  await refreshState();
  toast(`${food.name} ajouté.`);
  renderJournal();
}

async function saveFoodById(foodId) {
  const food = [...foods, ...savedFoods].find((item) => item.id === foodId);
  if (!food) return;
  await putOne("savedFoods", { ...food, source: "OFF sauvegardé" });
  await refreshState();
  toast("Produit sauvegardé hors ligne.");
}

async function searchOpenFoodFacts() {
  const query = $("#food-search").value.trim();
  if (!query) return toast("Tape un nom de produit.");
  if (!navigator.onLine) return toast("Hors ligne : recherche locale uniquement.");
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&countries_tags=france`;
    const response = await fetch(url);
    const data = await response.json();
    const offFoods = (data.products || []).map(offToFood).filter(Boolean);
    savedFoods = [...savedFoods.filter((food) => food.source !== "OFF"), ...offFoods];
    $("#food-results").innerHTML = offFoods.length ? offFoods.map(foodRow).join("") : `<p class="empty">Aucun résultat exploitable.</p>`;
    $$("[data-add-food]", $("#food-results")).forEach((button) => button.addEventListener("click", () => addFoodById(button.dataset.addFood)));
    $$("[data-save-food]", $("#food-results")).forEach((button) => button.addEventListener("click", () => saveFoodById(button.dataset.saveFood)));
  } catch {
    toast("Open Food Facts indisponible. La base locale reste utilisable.");
  }
}

async function searchBarcode() {
  const code = $("#barcode").value.trim();
  if (!code || !navigator.onLine) return;
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const data = await response.json();
    const food = offToFood(data.product);
    if (!food) return toast("Produit incomplet.");
    savedFoods = [...savedFoods.filter((item) => item.id !== food.id), food];
    $("#food-results").innerHTML = foodRow(food);
    $$("[data-add-food]", $("#food-results")).forEach((button) => button.addEventListener("click", () => addFoodById(button.dataset.addFood)));
    $$("[data-save-food]", $("#food-results")).forEach((button) => button.addEventListener("click", () => saveFoodById(button.dataset.saveFood)));
  } catch {
    toast("Code-barres non trouvé.");
  }
}

function offToFood(product) {
  const nutriments = product?.nutriments;
  if (!product?.product_name || !nutriments?.["energy-kcal_100g"]) return null;
  return {
    id: `off-${product.code || id()}`,
    name: product.product_name,
    portion: "100 g",
    kcal: Number(nutriments["energy-kcal_100g"] || 0),
    protein: Number(nutriments.proteins_100g || 0),
    carbs: Number(nutriments.carbohydrates_100g || 0),
    fat: Number(nutriments.fat_100g || 0),
    category: "Open Food Facts",
    tags: ["produit français", "sauvegardable"],
    source: "OFF"
  };
}

function renderSnacks() {
  setTitle("Collations rapides");
  $("#screen").innerHTML = `
    <section class="section"><span>Objectifs rapides</span><h2>Collations prise de masse</h2></section>
    <div class="grid">${quickSnacks.map((snack) => snackCard(snack)).join("")}</div>
    <section class="section"><span>Personnalisées</span><h2>Créer une collation</h2></section>
    <article class="card">${customSnackForm()}</article>
    <div class="grid" style="margin-top:12px">${customSnacks.length ? customSnacks.map((snack) => snackCard(snack, true)).join("") : `<p class="empty">Aucune collation personnalisée.</p>`}</div>`;
  $$("[data-add-snack]").forEach((button) => button.addEventListener("click", () => addSnack(button.dataset.addSnack)));
  $$("[data-delete-snack]").forEach((button) => button.addEventListener("click", async () => {
    await deleteOne("customSnacks", button.dataset.deleteSnack);
    if (editingSnackId === button.dataset.deleteSnack) editingSnackId = null;
    await refreshState();
    renderSnacks();
  }));
  $$("[data-edit-snack]").forEach((button) => button.addEventListener("click", () => {
    editingSnackId = button.dataset.editSnack;
    renderSnacks();
  }));
  $("#cancel-snack-edit")?.addEventListener("click", () => {
    editingSnackId = null;
    renderSnacks();
  });
  $("#custom-snack-form").addEventListener("submit", saveCustomSnack);
}

function snackCard(snack, custom = false) {
  return `<article class="card"><div class="row"><div><p class="muted-label">${custom ? "personnalisée" : `${snack.target} kcal`}</p><h3>${esc(snack.name)}</h3><p class="small">${esc(snack.items || snack.quantity || "")}</p></div><strong>${fmt(snack.kcal)} kcal</strong></div><p class="macro-line">P ${fmt(snack.protein,1)} · G ${fmt(snack.carbs,1)} · L ${fmt(snack.fat,1)}</p><div class="row" style="margin-top:12px"><button class="primary-button" data-add-snack="${esc(snack.id || snack.name)}">Ajouter aujourd’hui</button>${custom ? `<button class="secondary-button" data-edit-snack="${esc(snack.id)}">Modifier</button><button class="danger-button" data-delete-snack="${esc(snack.id)}">Supprimer</button>` : ""}</div></article>`;
}

async function addSnack(snackId) {
  const snack = [...quickSnacks, ...customSnacks].find((item) => (item.id || item.name) === snackId);
  if (!snack) return;
  await putOne("entries", { id: id(), date: today(), mealType: "collations", name: snack.name, quantity: snack.items || snack.quantity || "", kcal: snack.kcal, protein: snack.protein, carbs: snack.carbs, fat: snack.fat, source: "collation" });
  await refreshState();
  toast("Collation ajoutée.");
  renderSnacks();
}

function customSnackForm() {
  const snack = customSnacks.find((item) => item.id === editingSnackId) || {};
  const isEditing = Boolean(snack.id);
  return `<form id="custom-snack-form"><input name="id" type="hidden" value="${esc(snack.id || "")}"><div class="form-grid"><label>Nom<input name="name" value="${esc(snack.name || "")}" required></label><label>Quantité<input name="quantity" value="${esc(snack.quantity || "")}" required></label><label>Kcal<input name="kcal" type="number" value="${esc(snack.kcal || "")}" required></label><label>Protéines<input name="protein" type="number" step=".1" value="${esc(snack.protein || "")}" required></label><label>Glucides<input name="carbs" type="number" step=".1" value="${esc(snack.carbs || "")}" required></label><label>Lipides<input name="fat" type="number" step=".1" value="${esc(snack.fat || "")}" required></label></div><div class="row" style="margin-top:14px"><button class="primary-button">${isEditing ? "Modifier" : "Sauvegarder"}</button>${isEditing ? `<button id="cancel-snack-edit" class="secondary-button" type="button">Annuler</button>` : ""}</div></form>`;
}

async function saveCustomSnack(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await putOne("customSnacks", { id: data.id || id(), name: data.name, quantity: data.quantity, kcal: Number(data.kcal), protein: Number(data.protein), carbs: Number(data.carbs), fat: Number(data.fat) });
  editingSnackId = null;
  await refreshState();
  toast(data.id ? "Collation modifiée." : "Collation sauvegardée.");
  renderSnacks();
}

function renderPhoto() {
  setTitle("Photo assistée");
  const total = macros(composer);
  const consumed = { kcal: Math.round(total.kcal * photoState.percent / 100), protein: +(total.protein * photoState.percent / 100).toFixed(1), carbs: +(total.carbs * photoState.percent / 100).toFixed(1), fat: +(total.fat * photoState.percent / 100).toFixed(1) };
  $("#screen").innerHTML = `
    <article class="card"><p class="muted-label">Mode assisté</p><h2>Photo avant / après assiette</h2><p class="small">Estimation approximative. Corrige les aliments, les quantités et le pourcentage réellement mangé.</p></article>
    <div class="photo-grid" style="margin-top:12px">
      <article class="card"><label>Photo avant repas<input id="photo-before" type="file" accept="image/*" capture="environment"></label>${photoState.before ? `<img class="photo-preview" src="${photoState.before}" alt="Photo avant">` : ""}</article>
      <article class="card"><label>Photo après repas<input id="photo-after" type="file" accept="image/*" capture="environment"></label>${photoState.after ? `<img class="photo-preview" src="${photoState.after}" alt="Photo après">` : ""}</article>
    </div>
    <article class="card" style="margin-top:12px"><h2>Composer ce repas</h2><input id="photo-food-search" placeholder="Rechercher un aliment local"><div id="photo-food-results" class="food-list"></div><div class="journal-list" style="margin-top:12px">${composer.length ? composer.map((item, index) => `<div class="journal-row row"><div><b>${esc(item.name)}</b><span class="macro-line">${fmt(item.kcal)} kcal</span></div><button class="danger-button" data-remove-compose="${index}">×</button></div>`).join("") : `<p class="empty">Ajoute les aliments supposés du plat.</p>`}</div><label style="margin-top:12px">Pourcentage mangé<select id="percent-eaten"><option>25</option><option>50</option><option>75</option><option>100</option></select></label><p class="macro-line" style="margin-top:12px">Calories consommées estimées : ${fmt(consumed.kcal)} kcal · P ${fmt(consumed.protein,1)} · G ${fmt(consumed.carbs,1)} · L ${fmt(consumed.fat,1)}</p><button id="add-photo-meal" class="primary-button" style="width:100%;margin-top:12px">Ajouter au journal du jour</button></article>`;
  $("#percent-eaten").value = String(photoState.percent);
  $("#percent-eaten").addEventListener("change", (event) => { photoState.percent = Number(event.target.value); renderPhoto(); });
  $("#photo-before").addEventListener("change", (event) => readPhoto(event, "before"));
  $("#photo-after").addEventListener("change", (event) => readPhoto(event, "after"));
  bindPhotoSearch();
  $$("[data-remove-compose]").forEach((button) => button.addEventListener("click", () => { composer.splice(Number(button.dataset.removeCompose), 1); renderPhoto(); }));
  $("#add-photo-meal").addEventListener("click", async () => {
    if (!composer.length) return toast("Ajoute au moins un aliment.");
    await putOne("entries", { id: id(), date: today(), mealType: "déjeuner", name: "Repas photo assisté", quantity: `${photoState.percent}% mangé`, ...consumed, source: "photo assistée" });
    composer = [];
    photoState = { before: "", after: "", percent: 100 };
    await refreshState();
    toast("Repas ajouté.");
    navigate("journal");
  });
}

function readPhoto(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { photoState[key] = reader.result; renderPhoto(); };
  reader.readAsDataURL(file);
}

function bindPhotoSearch() {
  const input = $("#photo-food-search");
  const results = $("#photo-food-results");
  const update = () => {
    const query = input.value.toLowerCase();
    const list = foods.filter((food) => !query || food.name.toLowerCase().includes(query)).slice(0, 8);
    results.innerHTML = list.map((food) => `<div class="food-row"><div><b>${esc(food.name)}</b><span class="macro-line">${esc(food.portion)} · ${fmt(food.kcal)} kcal</span></div><button class="primary-button" data-compose="${esc(food.id)}">Ajouter</button></div>`).join("");
    $$("[data-compose]", results).forEach((button) => button.addEventListener("click", () => {
      const food = foods.find((item) => item.id === button.dataset.compose);
      composer.push(food);
      renderPhoto();
    }));
  };
  input.addEventListener("input", update);
  update();
}

function renderRecipes() {
  setTitle("Recettes");
  $("#screen").innerHTML = `<section class="section"><span>Hypercalorique</span><h2>Recettes simples</h2></section><div class="recipe-list">${recipes.map((recipe) => `<article class="card recipe-row"><div class="row"><div><p class="muted-label">${esc(recipe.category)} · ${esc(recipe.cost)}</p><h3>${esc(recipe.name)}</h3></div><strong>${fmt(recipe.kcal)} kcal</strong></div><p class="macro-line">P ${fmt(recipe.protein,1)} · G ${fmt(recipe.carbs,1)} · L ${fmt(recipe.fat,1)}</p><details><summary>Ingrédients et étapes</summary><p class="small"><b>Ingrédients :</b> ${recipe.ingredients.map(esc).join(", ")}</p><ol class="small">${recipe.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details><div class="row" style="margin-top:12px"><button class="primary-button" data-add-recipe="${recipe.id}">Ajouter au journal</button><button class="secondary-button" data-fav-recipe="${recipe.id}">${favorites.some((fav) => fav.id === recipe.id) ? "Favori ✓" : "Favori"}</button></div></article>`).join("")}</div>`;
  $$("[data-add-recipe]").forEach((button) => button.addEventListener("click", async () => {
    const recipe = recipes.find((item) => item.id === button.dataset.addRecipe);
    await putOne("entries", { id: id(), date: today(), mealType: "dîner", name: recipe.name, quantity: "1 portion", kcal: recipe.kcal, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat, source: "recette" });
    await refreshState();
    toast("Recette ajoutée.");
  }));
  $$("[data-fav-recipe]").forEach((button) => button.addEventListener("click", async () => {
    const recipe = recipes.find((item) => item.id === button.dataset.favRecipe);
    if (favorites.some((fav) => fav.id === recipe.id)) await deleteOne("favorites", recipe.id);
    else await putOne("favorites", { id: recipe.id, name: recipe.name });
    await refreshState();
    renderRecipes();
  }));
}

function renderTips() {
  setTitle("Astuces du jour");
  const dayTip = tips[new Date().getDate() % tips.length];
  $("#screen").innerHTML = `<article class="card hero-card"><p class="muted-label">${esc(dayTip.category)}</p><h1>${esc(dayTip.title)}</h1><p class="small">${esc(dayTip.body)}</p></article><section class="section"><span>Résultat rapide</span><h2>Cartes motivantes</h2></section><div class="tip-list">${tips.map((tip) => `<article class="card tip-row"><p class="muted-label">${esc(tip.category)}</p><h3>${esc(tip.title)}</h3><p class="small">${esc(tip.body)}</p></article>`).join("")}</div>`;
}

function renderProfile() {
  setTitle("Profil local");
  $("#screen").innerHTML = `<article class="card"><div class="row"><div><p class="muted-label">Aucun compte</p><h2>${esc(profile.firstName || "Profil local")}</h2></div><strong>IMC ${fmt(bmiValue(),1)}</strong></div><p class="small">${esc(profile.paceAdvice)} · ${fmt(profile.calorieGoal)} kcal · ${fmt(profile.proteinGoal)} g protéines · ${fmt(profile.waterGoal)} ml eau</p>${bmiValue() < 17.5 ? `<p class="warning">suivi médical recommandé en cas de maigreur importante</p>` : ""}</article><article class="card"><h2>Données locales</h2><div class="grid two"><button id="edit-profile" class="secondary-button">Modifier onboarding</button><button id="export-data" class="secondary-button">Exporter mes données</button><button id="delete-data" class="danger-button">Supprimer toutes mes données</button><button id="install-help" class="secondary-button">Installer l’app</button></div></article><article class="card"><h2>Sécurité</h2><p class="small">Les données restent dans IndexedDB sur cet appareil. Open Food Facts n’est appelé que lorsque tu lances volontairement une recherche en ligne.</p></article>`;
  $("#edit-profile").addEventListener("click", () => { profile = null; renderOnboarding(1, defaultProfile); });
  $("#export-data").addEventListener("click", exportJson);
  $("#delete-data").addEventListener("click", deleteAllData);
  $("#install-help").addEventListener("click", () => toast("Android : Chrome > Installer. iPhone : Safari > Partager > Sur l’écran d’accueil."));
}

async function exportJson() {
  const payload = { profile, entries, weights, savedFoods, customSnacks, favorites, exportedAt: new Date().toISOString() };
  download(`mass-plus-${today()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv() {
  const header = "date,repas,nom,quantite,kcal,proteines,glucides,lipides,source";
  const rows = entries.map((entry) => [entry.date, entry.mealType, entry.name, entry.quantity, entry.kcal, entry.protein, entry.carbs, entry.fat, entry.source].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
  download(`mass-plus-journal-${today()}.csv`, [header, ...rows].join("\n"), "text/csv");
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
  await Promise.all(["settings", "entries", "weights", "savedFoods", "customSnacks", "favorites", "water"].map(clearStore));
  localStorage.removeItem(PREF_SCREEN);
  await refreshState();
  activeScreen = "dashboard";
  toast("Données supprimées.");
  render();
}

async function init() {
  db = await openDb();
  [foods, recipes, tips] = await Promise.all([
    loadJson("./foods.fr.json"),
    loadJson("./recipes.fr.json"),
    loadJson("./tips.fr.json")
  ]);
  await refreshState();
  if (location.hash) activeScreen = location.hash.replace("#", "");
  $("#install-hint").addEventListener("click", () => toast("Android : Chrome > Installer. iPhone : Safari > Partager > Sur l’écran d’accueil."));
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => undefined));
  window.addEventListener("hashchange", () => {
    const next = location.hash.replace("#", "");
    if (NAV.some(([screen]) => screen === next)) {
      activeScreen = next;
      render();
    }
  });
  render();
}

init().catch((error) => {
  console.error(error);
  $("#screen").innerHTML = `<article class="card"><h2>Impossible d’ouvrir Mass+</h2><p class="small">Vérifie que le navigateur autorise IndexedDB.</p></article>`;
});
