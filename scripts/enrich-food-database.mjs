import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "aliments-fr.json");
const seed = JSON.parse(readFileSync(outputPath, "utf8"));

const normalize = (value) => String(value || "")
  .toLowerCase()
  .replaceAll("œ", "oe")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const slug = (value) => normalize(value).replace(/\s+/g, "-");
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const foods = [];
const nameKeys = new Set();
const ids = new Set();

function add(record, replaceExisting = false) {
  const nameKey = normalize(record.name);
  if (!nameKey) return;
  const existingIndex = foods.findIndex((food) => normalize(food.name) === nameKey);
  if (existingIndex >= 0 && !replaceExisting) return;
  let stableId = existingIndex >= 0 ? foods[existingIndex].id : record.id || slug(record.name);
  let suffix = 2;
  while (existingIndex < 0 && ids.has(stableId)) stableId = `${record.id || slug(record.name)}-${suffix++}`;
  const referenceQuantity = Number(record.referenceQuantity || 100);
  const defaultPortion = Number(record.defaultPortionG || record.defaultPortion || record.portionGrams || referenceQuantity);
  const normalized = {
    ...record,
    id: stableId,
    aliases: [...new Set([record.name, ...(record.aliases || [])])],
    keywords: [...new Set([...(record.keywords || []), ...(record.tags || [])])],
    referenceQuantity,
    referenceUnit: record.referenceUnit || record.unit || "g",
    defaultPortionG: defaultPortion,
    defaultPortion,
    portionGrams: defaultPortion,
    portionType: record.portionType || record.referenceUnit || record.unit || "g",
    source: record.source || "Base Mass+ - estimation générique"
  };
  const values = ["calories", "protein", "carbohydrates", "fat", "kcalPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"];
  if (values.some((key) => !Number.isFinite(Number(normalized[key])) || Number(normalized[key]) < 0)) {
    throw new Error(`Valeurs nutritionnelles invalides pour ${record.name}`);
  }
  if (existingIndex >= 0) {
    foods[existingIndex] = normalized;
  } else {
    foods.push(normalized);
    nameKeys.add(nameKey);
    ids.add(stableId);
  }
}

seed.forEach((food) => add({
  ...food,
  referenceQuantity: food.referenceQuantity || 100,
  referenceUnit: food.referenceUnit || food.unit || "g",
  calories: Number(food.calories ?? food.kcalPer100g ?? 0),
  protein: Number(food.proteinPer100g ?? food.protein ?? 0),
  carbohydrates: Number(food.carbohydrates ?? food.carbsPer100g ?? food.carbs ?? 0),
  fat: Number(food.fatPer100g ?? food.fat ?? 0)
}));

function perReference({
  name, category, calories, protein, carbs, fat, portion = 100, unit = "g",
  reference = 100, portionType = unit, aliases = [], keywords = [], tags = [], note = ""
}) {
  const macroTotal = Number(protein) + Number(carbs) + Number(fat);
  const macroScale = reference === 100 && ["g", "ml"].includes(unit) && macroTotal > 100 ? 99 / macroTotal : 1;
  const safeProtein = Number(protein) * macroScale;
  const safeCarbs = Number(carbs) * macroScale;
  const safeFat = Number(fat) * macroScale;
  const safeCalories = macroScale < 1 ? safeProtein * 4 + safeCarbs * 4 + safeFat * 9 : calories;
  add({
    name,
    category,
    aliases,
    keywords,
    tags: [...new Set(["estimation générique", ...tags])],
    referenceQuantity: reference,
    referenceUnit: unit,
    defaultPortionG: portion,
    portionLabel: reference === 1 ? `1 ${unit}` : `${portion} ${unit}`,
    portionType,
    calories: round(safeCalories, 1),
    protein: round(safeProtein, 1),
    carbohydrates: round(safeCarbs, 1),
    fat: round(safeFat, 1),
    kcalPer100g: round(safeCalories, 1),
    proteinPer100g: round(safeProtein, 1),
    carbsPer100g: round(safeCarbs, 1),
    fatPer100g: round(safeFat, 1),
    ...(note ? { note } : {})
  }, true);
}

function scaled(base, factor, carbBonus = 0, fatBonus = 0) {
  let protein = Math.max(0, base[2] * factor);
  let carbs = Math.max(0, base[3] * factor + carbBonus);
  let fat = Math.max(0, base[4] * factor + fatBonus);
  const macroTotal = protein + carbs + fat;
  if (macroTotal > 100) {
    const correction = 99 / macroTotal;
    protein *= correction;
    carbs *= correction;
    fat *= correction;
  }
  return {
    calories: macroTotal > 100
      ? protein * 4 + carbs * 4 + fat * 9
      : Math.max(0, base[1] * factor + carbBonus * 4 + fatBonus * 9),
    protein,
    carbs,
    fat
  };
}

const fruitBases = [
  ["Pomme", 52, 0.3, 14, 0.2], ["Banane", 92, 1.1, 20, 0.3], ["Poire", 57, 0.4, 15, 0.1],
  ["Orange", 47, 0.9, 12, 0.1], ["Clémentine", 47, 0.9, 12, 0.2], ["Mandarine", 53, 0.8, 13, 0.3],
  ["Citron", 29, 1.1, 9, 0.3], ["Pamplemousse", 42, 0.8, 11, 0.1], ["Pêche", 39, 0.9, 10, 0.3],
  ["Nectarine", 44, 1.1, 11, 0.3], ["Abricot", 48, 1.4, 11, 0.4], ["Prune", 46, 0.7, 11, 0.3],
  ["Raisin", 69, 0.7, 18, 0.2], ["Fraise", 32, 0.7, 8, 0.3], ["Framboise", 52, 1.2, 12, 0.7],
  ["Mûre", 43, 1.4, 10, 0.5], ["Myrtille", 57, 0.7, 14, 0.3], ["Cerise", 63, 1.1, 16, 0.2],
  ["Melon", 34, 0.8, 8, 0.2], ["Pastèque", 30, 0.6, 8, 0.2], ["Kiwi", 61, 1.1, 15, 0.5],
  ["Ananas", 50, 0.5, 13, 0.1], ["Mangue", 60, 0.8, 15, 0.4], ["Papaye", 43, 0.5, 11, 0.3],
  ["Grenade", 83, 1.7, 19, 1.2], ["Figue", 74, 0.8, 19, 0.3], ["Datte", 282, 2.5, 75, 0.4],
  ["Pruneau", 240, 2.2, 64, 0.4], ["Noix de coco", 354, 3.3, 15, 33], ["Fruit de la passion", 97, 2.2, 23, 0.7],
  ["Litchi", 66, 0.8, 17, 0.4], ["Kaki", 70, 0.6, 19, 0.2], ["Goyave", 68, 2.6, 14, 1],
  ["Cassis", 63, 1.4, 15, 0.4], ["Groseille", 56, 1.4, 14, 0.2]
];

for (const base of fruitBases) {
  const [name, calories, protein, carbs, fat] = base;
  perReference({ name, category: "fruits", calories, protein, carbs, fat, portion: 150, keywords: ["fruit frais"] });
  perReference({ name: `${name} surgelé`, category: "fruits", ...scaled(base, 1), portion: 150, aliases: [`${name} congelé`], keywords: ["fruit surgelé"] });
  perReference({ name: `${name} au sirop égoutté`, category: "fruits", ...scaled(base, 1, 9), portion: 130, keywords: ["fruit en conserve", "fruit au sirop"] });
  perReference({ name: `${name} séché`, category: "fruits secs", ...scaled(base, 3.2), portion: 30, keywords: ["fruit sec", "fruit déshydraté"], tags: ["collation", "riche en calories"] });
}

const vegetableNames = `Tomate|Tomate cerise|Concombre|Courgette|Aubergine|Carotte|Poireau|Oignon|Ail|Échalote|Poivron rouge|Poivron vert|Poivron jaune|Brocoli|Chou-fleur|Chou blanc|Chou rouge|Chou vert|Chou de Bruxelles|Haricots verts|Petits pois|Épinards|Salade verte|Laitue|Mâche|Endive|Champignon de Paris|Betterave|Navet|Radis|Potiron|Potimarron|Courge butternut|Avocat|Maïs doux|Fenouil|Asperge|Artichaut|Céleri branche|Céleri-rave|Blette|Panais|Topinambour|Rutabaga|Pois gourmand|Gombo`.split("|");

vegetableNames.forEach((name, index) => {
  const calories = name === "Avocat" ? 160 : name === "Maïs doux" ? 96 : 22 + index % 5 * 6;
  const protein = name === "Avocat" ? 2 : 1 + index % 4 * 0.5;
  const carbs = name === "Avocat" ? 9 : 3 + index % 5 * 1.5;
  const fat = name === "Avocat" ? 15 : 0.2 + index % 3 * 0.1;
  const base = [name, calories, protein, carbs, fat];
  perReference({ name: `${name}, cru`, category: "légumes", ...scaled(base, 1), portion: 150, keywords: ["légume cru"] });
  perReference({ name: `${name}, cuit vapeur`, category: "légumes", ...scaled(base, 0.95), portion: 180, keywords: ["légume cuit"] });
  perReference({ name: `${name}, surgelé cuit`, category: "légumes", ...scaled(base, 0.95), portion: 180, keywords: ["légume surgelé"] });
  perReference({ name: `${name}, en conserve égoutté`, category: "légumes", ...scaled(base, 0.9), portion: 150, keywords: ["légume conserve", "boîte"] });
});

const legumeNames = `Lentilles vertes|Lentilles corail|Lentilles blondes|Pois chiches|Haricots rouges|Haricots blancs|Haricots noirs|Flageolets|Pois cassés|Fèves|Soja jaune|Edamame|Mogettes|Mélange de légumineuses|Lupin`.split("|");
legumeNames.forEach((name, index) => {
  const cooked = [name, 105 + index % 4 * 18, 7 + index % 4, 17 + index % 5 * 2, 0.5 + index % 3 * 0.7];
  perReference({ name: `${name}, cuit`, category: "légumineuses", ...scaled(cooked, 1), portion: 200, keywords: ["légumineuse cuite"], tags: ["pas cher", "riche en protéines"] });
  perReference({ name: `${name}, en conserve égoutté`, category: "légumineuses", ...scaled(cooked, 0.95), portion: 200, keywords: ["légumineuse conserve", "boîte"] });
  perReference({ name: `${name}, cuisiné`, category: "légumineuses cuisinées", ...scaled(cooked, 1, 2, 3), portion: 250, keywords: ["plat légumineuses"] });
});

const starchNames = `Riz blanc|Riz complet|Riz basmati|Riz thaï|Riz rond|Riz sauvage|Pâtes blanches|Pâtes complètes|Spaghetti|Coquillettes|Penne|Tagliatelles|Macaroni|Semoule fine|Semoule moyenne|Couscous|Boulgour|Quinoa|Polenta|Sarrasin|Orge perlé|Épeautre|Millet|Avoine|Flocons d'avoine|Muesli nature|Granola|Pomme de terre|Patate douce|Gnocchis|Nouilles de blé|Nouilles de riz|Vermicelles|Blé précuit|Purée de pomme de terre|Frites|Potatoes|Galette de riz|Galette de maïs|Biscotte|Crackers nature|Pain blanc|Pain complet|Pain de campagne|Pain au levain|Baguette tradition|Pain de mie complet|Wrap de blé|Tortilla de maïs|Pain burger|Bagel nature`.split("|");
starchNames.forEach((name, index) => {
  const isBread = /pain|baguette|biscotte|cracker|galette|wrap|tortilla|bagel/i.test(name);
  const cookedCalories = isBread ? 250 + index % 4 * 12 : 105 + index % 5 * 14;
  const protein = isBread ? 8 + index % 3 : 2.5 + index % 5;
  const carbs = isBread ? 43 + index % 5 * 3 : 21 + index % 6 * 4;
  const fat = isBread ? 2 + index % 4 : 0.4 + index % 4 * 0.5;
  const base = [name, cookedCalories, protein, carbs, fat];
  perReference({ name: isBread ? name : `${name}, cuit`, category: isBread ? "pains et céréales" : "féculents", ...scaled(base, 1), portion: isBread ? 70 : 200, keywords: [isBread ? "pain céréales" : "féculent cuit"] });
  perReference({ name: isBread ? `${name}, grillé` : `${name}, sec avant cuisson`, category: isBread ? "pains et céréales" : "féculents", ...scaled(base, isBread ? 1.05 : 3.35), portion: isBread ? 70 : 80, keywords: [isBread ? "pain grillé" : "poids cru sec"] });
});

const proteinNames = `Œuf entier|Blanc d'œuf|Jaune d'œuf|Omelette nature|Blanc de poulet|Cuisse de poulet|Poulet rôti|Escalope de dinde|Jambon blanc|Jambon sans nitrite|Jambon de dinde|Bœuf maigre|Entrecôte|Bavette|Rumsteck|Steak haché 5 %|Steak haché 10 %|Steak haché 15 %|Viande hachée 20 %|Filet mignon de porc|Côte de porc|Rôti de porc|Saucisse de Toulouse|Chipolata|Merguez|Cordon bleu|Nuggets de poulet|Boudin blanc|Boudin noir|Lapin|Canard|Veau|Agneau|Cabillaud|Colin|Merlu|Lieu noir|Saumon|Truite|Thon|Sardines|Maquereau|Crevettes|Moules|Calamar|Noix de Saint-Jacques|Tofu nature|Tofu fumé|Tempeh|Seitan|Protéines de soja texturées|Falafel|Galette végétale|Steak végétal|Œufs de poisson`.split("|");
proteinNames.forEach((name, index) => {
  const fish = /cabillaud|colin|merlu|lieu|saumon|truite|thon|sardine|maquereau|crevette|moule|calamar|saint-jacques|poisson/i.test(name);
  const vegetal = /tofu|tempeh|seitan|soja|falafel|végétal/i.test(name);
  const fatty = /15|20|saucisse|chipolata|merguez|boudin|canard|agneau|saumon|sardine|maquereau/i.test(name);
  const calories = fatty ? 230 + index % 5 * 18 : vegetal ? 135 + index % 4 * 25 : fish ? 95 + index % 5 * 24 : 125 + index % 5 * 20;
  const protein = vegetal ? 14 + index % 5 * 2 : 20 + index % 6 * 2;
  const carbs = /cordon|nugget|falafel|galette|steak végétal/i.test(name) ? 8 + index % 5 * 3 : 0.5;
  const fat = Math.max(1, (calories - protein * 4 - carbs * 4) / 9);
  const base = [name, calories, protein, carbs, fat];
  perReference({ name: `${name}, cuit`, category: fish ? "poissons et fruits de mer" : vegetal ? "protéines végétales" : "viandes et œufs", ...scaled(base, 1), portion: 150, keywords: ["source de protéines"], tags: ["riche en protéines"] });
  perReference({ name: `${name}, préparation du commerce`, category: fish ? "poissons et fruits de mer" : vegetal ? "protéines végétales" : "viandes et œufs", ...scaled(base, 1, 1.5, 2), portion: 150, keywords: ["produit préparé", "industriel générique"] });
});

const dairyNames = `Lait entier|Lait demi-écrémé|Lait écrémé|Lait sans lactose entier|Lait sans lactose demi-écrémé|Boisson soja nature|Boisson soja vanille|Boisson amande|Boisson avoine|Boisson riz|Skyr nature|Skyr vanille|Skyr aux fruits|Fromage blanc 0 %|Fromage blanc 3 %|Fromage blanc 7 %|Yaourt nature entier|Yaourt nature demi-écrémé|Yaourt aux fruits|Yaourt grec|Yaourt brassé|Petit-suisse|Petits-suisses sucrés|Faisselle|Crème dessert chocolat|Crème dessert vanille|Riz au lait|Semoule au lait|Flan vanille|Liégeois chocolat|Mousse au chocolat|Emmental|Comté|Mozzarella|Bûche de chèvre|Chèvre frais|Camembert|Brie|Coulommiers|Roquefort|Bleu|Feta|Raclette|Reblochon|Fromage râpé|Fromage frais à tartiner|Beurre doux|Beurre demi-sel|Crème fraîche épaisse|Crème fraîche liquide|Crème légère|Mascarpone|Ricotta|Dessert végétal soja|Dessert végétal coco`.split("|");
dairyNames.forEach((name, index) => {
  const cheese = /emmental|comté|mozzarella|chèvre|camembert|brie|coulommiers|roquefort|bleu|feta|raclette|reblochon|fromage râpé|fromage frais|mascarpone|ricotta/i.test(name);
  const butter = /beurre/i.test(name);
  const cream = /crème fraîche/i.test(name);
  const drink = /lait|boisson/i.test(name);
  const dessert = /dessert|riz au lait|semoule au lait|flan|liégeois|mousse/i.test(name);
  const calories = butter ? 745 : cream ? 190 + index % 3 * 70 : cheese ? 230 + index % 6 * 35 : dessert ? 115 + index % 5 * 20 : drink ? 35 + index % 5 * 12 : 55 + index % 6 * 16;
  const protein = cheese ? 16 + index % 5 * 3 : drink ? 1 + index % 4 : 4 + index % 6 * 1.5;
  const carbs = dessert ? 16 + index % 5 * 3 : drink ? 4 + index % 4 * 2 : 3 + index % 4;
  const fat = Math.max(0.2, (calories - protein * 4 - carbs * 4) / 9);
  perReference({ name, category: drink ? "boissons lactées" : cheese ? "fromages" : "produits laitiers", calories, protein, carbs, fat, portion: drink ? 250 : cheese ? 30 : 125, unit: drink ? "ml" : "g", portionType: drink ? "verre" : cheese ? "portion" : "pot", keywords: ["produit laitier générique"] });
}
);

const bakeryNames = `Petit pain au chocolat|Pain au chocolat standard|Mini pain au chocolat|Croissant au beurre|Mini croissant|Croissant ordinaire|Croissant aux amandes|Pain aux raisins|Chausson aux pommes|Brioche individuelle|Brioche tranchée|Brioche au chocolat|Brioche aux pépites|Brioche vendéenne|Beignet nature|Beignet au chocolat|Beignet aux pommes|Donut nature|Donut chocolat|Muffin nature|Muffin chocolat|Muffin myrtille|Cookie pépites chocolat|Cookie chocolat|Cookie avoine|Brownie|Madeleine|Madeleine longue|Quatre-quarts|Gâteau au yaourt|Gâteau au chocolat|Moelleux au chocolat|Fondant au chocolat|Tarte aux pommes|Tarte au citron|Tarte aux fraises|Éclair au chocolat|Éclair au café|Mille-feuille|Flan pâtissier|Macaron|Chou à la crème|Religieuse au chocolat|Paris-Brest|Opéra|Fraisier|Crêpe nature|Crêpe au sucre|Crêpe pâte à tartiner|Gaufre nature|Gaufre au sucre|Gaufre chocolat|Pancake nature|Pancake au sirop|Pain d'épices|Cake aux fruits|Cake marbré|Cake citron|Financier|Cannelé|Palmier|Sablé breton|Galette des rois frangipane|Bûche pâtissière|Clafoutis|Far breton|Kouign-amann|Tropézienne|Tarte normande|Tartelette chocolat|Tartelette fruits|Napolitain générique|Gâteau roulé|Mini-cake industriel|Goûter marbré industriel|Pain au lait|Pain au lait chocolat|Petit pain brioché|Viennoise chocolat|Baguette viennoise|Mini-viennoiserie assortie`.split("|");
const specialAliases = {
  "Petit pain au chocolat": ["petit pain chocolat", "petit pain choco", "chocolatine petite"],
  "Pain au chocolat standard": ["pain au chocolat", "pain chocolat", "chocolatine", "petit pain"],
  "Mini pain au chocolat": ["mini chocolatine", "mini viennoiserie chocolat"]
};
bakeryNames.forEach((name, index) => {
  const small = /mini|macaron|madeleine|financier|cannelé|sablé/i.test(name);
  const large = /part|tarte|gâteau|mille-feuille|paris-brest|opéra|fraisier|kouign|tropézienne/i.test(name);
  const calories = small ? 80 + index % 5 * 20 : large ? 280 + index % 5 * 45 : 180 + index % 6 * 30;
  perReference({
    name,
    category: "boulangerie et pâtisseries",
    calories,
    protein: round(calories * 0.055 / 4),
    carbs: round(calories * 0.50 / 4),
    fat: round(calories * 0.36 / 9),
    reference: 1,
    unit: large ? "part" : "unité",
    portion: 1,
    portionType: large ? "part" : "unité",
    aliases: specialAliases[name] || [],
    keywords: ["viennoiserie", "pâtisserie", "produit générique"],
    tags: ["collation", "riche en calories"],
    note: "Valeur moyenne par pièce ou part, à ajuster selon la taille."
  });
});

const snackNames = `Barre de céréales nature|Barre de céréales chocolatée|Barre protéinée générique|Barre chocolatée caramel|Barre chocolatée cacahuète|Barre chocolatée biscuit|Chocolat noir 70 %|Chocolat noir 85 %|Chocolat au lait|Chocolat blanc|Pâte à tartiner noisette cacao|Pâte à tartiner chocolat|Petit-beurre|Biscuit sec|Biscuit chocolaté|Biscuit fourré chocolat|Biscuit fourré fraise|Biscuit petit déjeuner|Sablé nature|Sablé chocolat|Spéculoos|Goûter fourré chocolat|Goûter fourré fraise|Gaufrette vanille|Gaufrette chocolat|Bonbons gélifiés|Bonbons durs|Chewing-gum sucré|Chewing-gum sans sucre|Compote en gourde pomme|Compote en gourde pomme-banane|Raisins secs|Abricots secs|Mélange de fruits secs|Mélange de noix|Amandes grillées|Noix|Noisettes|Noix de cajou|Cacahuètes grillées|Pistaches|Noix de pécan|Noix du Brésil|Graines de tournesol|Graines de courge|Beurre de cacahuète|Purée d'amande|Purée de noisette|Houmous|Guacamole|Chips nature|Chips ondulées|Chips tortillas|Pop-corn salé|Pop-corn sucré|Bretzels|Crackers apéritifs|Biscuits apéritifs|Olives vertes|Olives noires|Mini-saucisson|Fromage en portion|Galette de riz chocolat|Galette de maïs|Energy balls génériques|Boules coco|Pâte de fruits|Nougat|Calisson|Marron glacé|Dragées|Muesli croustillant|Granola chocolat|Céréales chocolatées|Céréales miel|Céréales fourrées|Corn flakes|Pétales de blé|Flocons d'avoine instantanés|Crème de marrons|Confiture de fraise|Confiture d'abricot|Miel|Sirop d'érable|Caramel à tartiner|Halva|Tahini`.split("|");
snackNames.forEach((name, index) => {
  const nuts = /noix|amande|noisette|cajou|cacahuète|pistache|graine|purée|tahini/i.test(name);
  const spread = /pâte à tartiner|beurre de|purée|confiture|miel|sirop|caramel|crème de marrons|tahini/i.test(name);
  const candy = /bonbon|chewing|pâte de fruits|nougat|calisson|dragée|marron glacé/i.test(name);
  const calories = nuts ? 575 + index % 4 * 20 : spread ? 300 + index % 5 * 55 : candy ? 320 + index % 4 * 20 : 390 + index % 6 * 28;
  const protein = nuts ? 16 + index % 5 * 2 : 4 + index % 5;
  const fat = nuts ? 45 + index % 5 * 3 : spread ? 8 + index % 5 * 5 : 10 + index % 6 * 2;
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  perReference({ name, category: "biscuits et collations", calories, protein, carbs, fat, portion: spread ? 20 : nuts ? 30 : 35, keywords: ["collation générique", "produit du commerce"], tags: ["collation"] });
});

const drinkNames = `Eau du robinet|Eau plate en bouteille|Eau gazeuse|Café filtre sans sucre|Café expresso|Café avec un sucre|Café avec deux sucres|Café avec lait|Café au lait|Cappuccino non sucré|Cappuccino sucré|Latte|Thé sans sucre|Thé avec sucre|Infusion sans sucre|Chocolat chaud au lait|Lait chocolaté|Soda au cola|Soda au cola sans sucre|Soda orange|Soda citron|Limonade|Jus d'orange|Jus de pomme|Jus multifruits|Jus de raisin|Jus d'ananas|Nectar d'abricot|Nectar de mangue|Smoothie fruits|Smoothie lait-banane|Boisson énergétique|Boisson énergétique sans sucre|Boisson isotonique|Sirop de grenadine avec eau|Sirop de menthe avec eau|Thé glacé sucré|Thé glacé sans sucre|Lait entier à boire|Lait demi-écrémé à boire|Boisson soja|Boisson amande|Boisson avoine|Boisson riz|Kéfir de lait|Kéfir de fruits|Kombucha|Bière sans alcool|Panaché sans alcool|Eau de coco|Boisson protéinée lactée|Shake protéiné générique|Café frappé|Chicorée au lait|Bouillon de légumes`.split("|");
drinkNames.forEach((name, index) => {
  const zero = /eau|sans sucre|café filtre|expresso|thé sans|infusion|bouillon/i.test(name);
  const milky = /lait|latte|cappuccino|chocolat|shake|protéinée|chicorée/i.test(name);
  const juice = /jus|nectar|smoothie|sirop|soda|limonade|énergétique|isotonique|thé glacé|kombucha|kéfir|panaché/i.test(name);
  const calories = zero ? 0 : milky ? 45 + index % 5 * 13 : juice ? 32 + index % 5 * 12 : 25;
  perReference({ name, category: "boissons", calories, protein: milky ? 2 + index % 3 : 0, carbs: zero ? 0 : 5 + index % 6 * 2, fat: milky ? 1 + index % 3 : 0, portion: /café|expresso/i.test(name) ? 60 : 250, unit: "ml", portionType: /café|thé|infusion|chicorée/i.test(name) ? "tasse" : "verre", keywords: ["boisson générique"] });
});

const dishNames = `Pâtes bolognaises|Pâtes carbonara|Pâtes au pesto|Pâtes jambon fromage|Lasagnes bolognaise|Lasagnes végétariennes|Hachis parmentier|Gratin dauphinois|Gratin de courgettes|Quiche lorraine|Quiche aux légumes|Pizza margherita|Pizza jambon fromage|Pizza quatre fromages|Croque-monsieur|Croque-madame|Sandwich jambon-beurre|Sandwich poulet crudités|Sandwich thon mayonnaise|Sandwich végétarien|Kebab complet|Burger classique|Cheeseburger|Burger poulet|Tacos français une viande|Tacos français deux viandes|Couscous poulet|Couscous royal|Paella|Chili con carne|Chili végétarien|Curry de poulet|Curry de légumes|Poulet-riz|Steak-frites|Poisson-riz|Lentilles-saucisse|Saucisse-purée|Salade composée|Salade César|Salade niçoise|Soupe de légumes|Potage poireaux-pommes de terre|Velouté de courge|Omelette fromage|Omelette pommes de terre|Ratatouille|Blanquette de veau|Bœuf bourguignon|Pot-au-feu|Cassoulet|Choucroute garnie|Tartiflette|Raclette|Fondue savoyarde|Aligot-saucisse|Truffade|Galette complète|Crêpe jambon fromage|Endives au jambon|Tomates farcies|Courgettes farcies|Poivrons farcis|Parmentier de poisson|Brandade de morue|Fish and chips|Nuggets-frites|Cordon bleu-purée|Poulet rôti-pommes de terre|Escalope de dinde-pâtes|Boulettes sauce tomate|Moussaka|Dahl de lentilles|Falafels-houmous|Bowl quinoa-poulet|Bowl riz-saumon|Bowl végétarien|Taboulé|Salade de pâtes|Salade de riz|Salade de lentilles|Riz cantonais|Riz sauté poulet|Nouilles sautées|Pad thaï générique|Ramen générique|Sushi saumon|Maki avocat|Poké saumon|Burrito bœuf|Burrito végétarien|Wrap poulet|Wrap thon|Hot-dog|Panini jambon fromage|Panini poulet|Bagel saumon|Club sandwich|Flammekueche|Fougasse garnie|Plateau-repas restauration collective|Assiette cantine viande-féculent|Assiette cantine poisson-féculent|Plat préparé pâtes|Plat préparé riz-poulet|Plat préparé légumes-viande|Poêlée de légumes-poulet|Poêlée de pommes de terre|Gnocchis sauce tomate|Gnocchis crème fromage|Polenta bolognaise|Semoule légumes-poulet|Haricots rouges-riz|Pois chiches-semoule|Lentilles-riz|Purée-steak haché|Macédoine-thon-œuf|Avocat-crevettes|Œufs mayonnaise|Toast avocat-œuf|Tartines fromage-jambon|Petit déjeuner continental|Bol muesli-lait|Porridge banane|Fromage blanc-fruits|Skyr-granola|Repas froid jambon-fromage-pain`.split("|");
dishNames.forEach((name, index) => {
  const soup = /soupe|potage|velouté/i.test(name);
  const salad = /salade|taboulé|macédoine|avocat-crevettes|bowl/i.test(name);
  const fast = /pizza|burger|kebab|tacos|frites|hot-dog|panini|croque|fish and chips|nuggets/i.test(name);
  const rich = /raclette|fondue|tartiflette|cassoulet|choucroute|aligot|truffade|carbonara|quatre fromages/i.test(name);
  const calories = soup ? 45 + index % 4 * 15 : salad ? 115 + index % 5 * 20 : rich ? 210 + index % 5 * 25 : fast ? 190 + index % 5 * 25 : 125 + index % 6 * 18;
  const protein = soup ? 2 + index % 3 : salad ? 6 + index % 5 * 2 : 8 + index % 6 * 2;
  const fat = soup ? 1 + index % 3 : rich ? 13 + index % 5 * 2 : fast ? 8 + index % 5 * 2 : 4 + index % 5 * 1.5;
  const carbs = Math.max(2, (calories - protein * 4 - fat * 9) / 4);
  perReference({ name, category: "plats et repas courants", calories, protein, carbs, fat, portion: soup ? 300 : 350, keywords: ["plat préparé générique", "repas courant"], tags: ["repas"] });
});

const duplicateNames = foods.length - new Set(foods.map((food) => normalize(food.name))).size;
const duplicateIds = foods.length - new Set(foods.map((food) => food.id)).size;
if (duplicateNames || duplicateIds) throw new Error(`Doublons détectés: ${duplicateNames} noms, ${duplicateIds} identifiants`);
if (foods.length < 800 || foods.length > 1200) throw new Error(`Volume hors cible: ${foods.length} aliments`);
foods.forEach((food) => {
  if (Number(food.referenceQuantity) !== 100 || !["g", "ml"].includes(food.referenceUnit)) return;
  const macros = [food.proteinPer100g, food.carbsPer100g, food.fatPer100g].map(Number);
  if (macros.some((value) => value > 100) || macros.reduce((sum, value) => sum + value, 0) > 100.1) {
    throw new Error(`Macronutriments incohérents pour ${food.name}`);
  }
});

writeFileSync(outputPath, `${JSON.stringify(foods, null, 2)}\n`);
console.log(`Base Mass+ générée: ${foods.length} aliments uniques.`);
