import { writeFileSync, mkdirSync } from "node:fs";

const slug = (value) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/œ/g, "oe")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const tags = {
  gain: "prise de masse",
  snack: "collation",
  cold: "repas froid",
  cheap: "pas cher",
  kcal: "riche en calories",
  protein: "riche en protéines",
  fast: "rapide",
  breakfast: "petit-déjeuner",
  family: "repas famille"
};

const baseFoods = [
  ["Œufs", ["oeuf", "oeufs", "œuf", "œufs", "oeu"], "protéines", "2 œufs", 120, 174, 15.6, 1.2, 12, [tags.gain, tags.cheap, tags.protein]],
  ["Œuf dur", ["oeuf dur", "œuf dur", "oeufs durs"], "protéines", "1 œuf", 60, 87, 7.8, 0.6, 6, [tags.snack, tags.cheap, tags.protein]],
  ["Lait entier", ["lait", "lait entier", "brique lait"], "laitages", "250 ml", 250, 160, 8.3, 12, 9, [tags.snack, tags.kcal, tags.cheap]],
  ["Lait demi-écrémé", ["lait demi", "lait demi ecreme", "demi écrémé"], "laitages", "250 ml", 250, 115, 8, 12, 4, [tags.snack, tags.cheap]],
  ["Yaourt nature", ["yaourt", "yogourt"], "laitages", "1 pot", 125, 78, 5, 6, 4, [tags.snack, tags.cheap]],
  ["Yaourt grec", ["grec", "yaourt grec"], "laitages", "150 g", 180, 140, 7, 6, 10, [tags.snack, tags.kcal]],
  ["Skyr nature", ["skyr", "skir"], "laitages", "150 g", 150, 90, 16.5, 6, 0.3, [tags.snack, tags.protein]],
  ["Fromage blanc", ["fromage blanc", "fb"], "laitages", "200 g", 200, 152, 16, 8, 6, [tags.snack, tags.cheap, tags.protein]],
  ["Compote pomme", ["compote", "pomme compote"], "fruits", "1 gourde", 100, 72, 0.2, 17, 0, [tags.snack, tags.fast]],
  ["Banane", ["banane", "banana"], "fruits", "1 banane", 120, 110, 1.3, 26, 0.4, [tags.snack, tags.cheap, tags.fast]],
  ["Pomme", ["pomme"], "fruits", "1 pomme", 150, 78, 0.4, 18, 0.3, [tags.snack, tags.cheap]],
  ["Pain", ["pain blanc", "baguette", "pain tradition"], "féculents", "80 g", 80, 216, 7, 45, 1.2, [tags.cheap, tags.fast]],
  ["Pain complet", ["pain complet"], "féculents", "80 g", 80, 198, 8, 38, 2.3, [tags.cheap, tags.fast]],
  ["Pain au levain", ["levain", "pain levain"], "féculents", "90 g", 90, 230, 8, 46, 2, [tags.gain, tags.fast]],
  ["Pain de mie", ["pain mie", "pain de mie"], "féculents", "2 tranches", 70, 185, 6, 34, 3, [tags.fast, tags.snack]],
  ["Brioche", ["brioche", "tranche brioche"], "féculents", "2 tranches", 70, 250, 6, 36, 9, [tags.kcal, tags.snack]],
  ["Beurre demi-sel", ["beurre", "beurre sale", "demi sel"], "matières grasses", "10 g", 10, 75, 0.1, 0.1, 8.2, [tags.kcal, tags.fast]],
  ["Beurre doux", ["beurre doux"], "matières grasses", "10 g", 10, 75, 0.1, 0.1, 8.2, [tags.kcal, tags.fast]],
  ["Huile d’olive", ["huile olive", "huile d olive", "olive"], "matières grasses", "1 c. à soupe", 10, 90, 0, 0, 10, [tags.kcal, tags.fast]],
  ["Beurre de cacahuète", ["beurre cacahuete", "cacahuete", "peanut butter"], "matières grasses", "20 g", 20, 118, 5, 3, 10, [tags.kcal, tags.snack, tags.protein]],
  ["Pâtes cuites", ["pate", "pates", "pâtes", "pasta"], "féculents", "250 g", 250, 390, 13, 78, 2, [tags.gain, tags.cheap, tags.family]],
  ["Riz cuit", ["riz", "riz blanc"], "féculents", "250 g", 250, 325, 6.5, 72, 0.8, [tags.gain, tags.cheap]],
  ["Semoule cuite", ["semoule", "couscous"], "féculents", "250 g", 250, 280, 9, 58, 1, [tags.cheap, tags.fast]],
  ["Pommes de terre", ["patate", "pomme de terre", "pommes terre"], "féculents", "250 g", 250, 215, 5, 48, 0.3, [tags.cheap, tags.family]],
  ["Flocons d’avoine", ["avoine", "flocon avoine", "flocons"], "féculents", "60 g", 60, 235, 8, 36, 4.5, [tags.breakfast, tags.cheap, tags.kcal]],
  ["Muesli", ["muesli", "cereales muesli"], "féculents", "70 g", 70, 280, 7, 45, 8, [tags.breakfast, tags.snack, tags.kcal]],
  ["Barre de céréales", ["barre", "barre cereales"], "collations", "1 barre", 35, 145, 3, 22, 5, [tags.snack, tags.fast]],
  ["Chocolat noir", ["chocolat", "chocolat noir"], "collations", "30 g", 30, 170, 2.4, 14, 12, [tags.snack, tags.kcal]],
  ["Fruits secs", ["raisins secs", "abricots secs", "fruits seches"], "collations", "40 g", 40, 130, 1, 30, 0.5, [tags.snack, tags.kcal, tags.fast]],
  ["Noix", ["noix", "cerneaux"], "oléagineux", "30 g", 30, 205, 4.5, 3, 20, [tags.snack, tags.kcal]],
  ["Amandes", ["amande", "amandes"], "oléagineux", "30 g", 30, 190, 6, 5, 16, [tags.snack, tags.kcal, tags.protein]],
  ["Noix de cajou", ["cajou", "noix cajou"], "oléagineux", "30 g", 30, 174, 5.5, 9, 13, [tags.snack, tags.kcal]],
  ["Avocat", ["avocat"], "légumes", "1 avocat", 150, 240, 3, 12, 22, [tags.kcal, tags.cold]],
  ["Lentilles cuites", ["lentille", "lentilles"], "légumineuses", "220 g", 220, 255, 18, 35, 2, [tags.cheap, tags.protein]],
  ["Pois chiches", ["pois chiche", "pois chiches"], "légumineuses", "220 g", 220, 330, 18, 45, 7, [tags.cheap, tags.kcal]],
  ["Haricots rouges", ["haricot rouge", "haricots rouges"], "légumineuses", "220 g", 220, 280, 18, 42, 2, [tags.cheap, tags.protein]],
  ["Steak haché 5 %", ["steak", "steak hache", "boeuf hache"], "viandes", "125 g", 125, 194, 26, 0, 10, [tags.protein, tags.family]],
  ["Bœuf", ["boeuf", "bœuf", "viande rouge"], "viandes", "150 g", 150, 300, 39, 0, 15, [tags.protein, tags.gain]],
  ["Poulet", ["poulet", "blanc poulet"], "viandes", "150 g", 150, 248, 46.5, 0, 5.4, [tags.protein, tags.cold]],
  ["Dinde", ["dinde", "escalope dinde"], "viandes", "150 g", 150, 203, 43.5, 0, 2.6, [tags.protein, tags.cold]],
  ["Jambon blanc", ["jambon", "jambon blanc"], "viandes", "2 tranches", 90, 120, 19, 1, 4, [tags.cold, tags.fast, tags.protein]],
  ["Thon au naturel", ["thon", "thon naturel"], "poissons", "120 g égoutté", 120, 145, 31, 0, 1.5, [tags.cold, tags.protein]],
  ["Sardines", ["sardine", "sardines"], "poissons", "100 g", 100, 220, 24, 0, 14, [tags.kcal, tags.protein]],
  ["Saumon", ["saumon", "pave saumon"], "poissons", "150 g", 150, 315, 33, 0, 20, [tags.kcal, tags.protein]],
  ["Emmental", ["emmental", "fromage rape"], "fromages", "40 g", 40, 150, 11, 0, 12, [tags.kcal, tags.protein]],
  ["Comté", ["comte", "comté"], "fromages", "40 g", 40, 165, 10.5, 0, 13, [tags.kcal, tags.protein]],
  ["Mozzarella", ["mozza", "mozzarella"], "fromages", "80 g", 80, 200, 14, 2, 15, [tags.kcal]],
  ["Crème fraîche", ["creme", "crème fraîche", "creme fraiche"], "matières grasses", "30 g", 30, 90, 0.7, 1, 9, [tags.kcal, tags.fast]],
  ["Miel", ["miel"], "sucres", "20 g", 20, 62, 0, 16, 0, [tags.snack, tags.fast]],
  ["Confiture", ["confiture"], "sucres", "25 g", 25, 65, 0, 16, 0, [tags.snack, tags.fast]],
  ["Houmous", ["houmous", "hummus"], "tartinables", "80 g", 80, 250, 6, 15, 18, [tags.cold, tags.kcal]],
  ["Mayonnaise", ["mayo", "mayonnaise"], "sauces", "15 g", 15, 105, 0, 0.5, 11, [tags.kcal, tags.fast]]
];

const dishes = [
  ["Carbonnade flamande", ["carbonnade", "carbonade", "boeuf biere", "plat flamand"], "plat préparé", "1 assiette", 350, 620, 38, 45, 28, [tags.family, tags.gain], "Estimation moyenne, à ajuster selon portion"],
  ["Pâtes bolognaise", ["bolognaise", "pates bolo", "pâtes bolo"], "plat préparé", "1 assiette", 420, 760, 38, 96, 24, [tags.family, tags.gain]],
  ["Riz poulet", ["riz poulet", "poulet riz"], "plat préparé", "1 assiette", 420, 650, 44, 82, 15, [tags.fast, tags.protein]],
  ["Sandwich jambon beurre", ["jambon beurre", "sandwich jambon", "baguette jambon beurre"], "sandwich", "1 sandwich", 220, 560, 22, 70, 20, [tags.cold, tags.fast, tags.kcal]],
  ["Croque-monsieur", ["croque", "croque monsieur"], "plat rapide", "1 croque", 220, 520, 25, 38, 30, [tags.fast, tags.kcal]],
  ["Omelette", ["omelette", "omelette fromage"], "plat rapide", "1 assiette", 250, 430, 28, 4, 32, [tags.fast, tags.protein]],
  ["Bowl riz thon avocat", ["bowl thon", "riz thon avocat"], "repas froid", "1 bol", 430, 820, 43, 88, 32, [tags.cold, tags.kcal, tags.protein]],
  ["Salade lentilles œufs", ["salade lentilles oeufs", "lentilles oeuf"], "repas froid", "1 bol", 360, 560, 32, 55, 22, [tags.cold, tags.cheap, tags.protein]],
  ["Semoule thon huile d’olive", ["semoule thon", "thon semoule"], "repas rapide", "1 assiette", 380, 700, 42, 72, 24, [tags.fast, tags.cheap, tags.gain]],
  ["Wrap poulet avocat", ["wrap", "wrap poulet"], "repas froid", "1 wrap", 260, 610, 36, 54, 28, [tags.cold, tags.fast]],
  ["Quiche lorraine", ["quiche", "quiche lorraine"], "plat famille", "1 part", 180, 520, 18, 32, 36, [tags.family, tags.kcal]],
  ["Gratin dauphinois", ["gratin", "gratin dauphinois"], "plat famille", "1 assiette", 300, 540, 13, 45, 34, [tags.family, tags.kcal]],
  ["Hachis parmentier", ["hachis", "parmentier"], "plat famille", "1 assiette", 380, 650, 34, 58, 30, [tags.family, tags.gain]],
  ["Lasagnes bolognaise", ["lasagne", "lasagnes"], "plat famille", "1 part", 380, 780, 42, 74, 34, [tags.family, tags.gain]],
  ["Couscous poulet pois chiches", ["couscous", "couscous poulet"], "plat famille", "1 assiette", 450, 780, 45, 95, 22, [tags.family, tags.gain]],
  ["Chili con carne", ["chili", "haricots boeuf"], "plat famille", "1 bol", 420, 690, 42, 70, 24, [tags.family, tags.protein]],
  ["Dahl lentilles riz", ["dahl", "dal", "lentilles riz"], "plat rapide", "1 bol", 420, 680, 24, 95, 22, [tags.cheap, tags.fast]],
  ["Salade pâtes thon maïs", ["salade pates", "pates thon mais"], "repas froid", "1 boîte", 380, 690, 38, 82, 22, [tags.cold, tags.fast]],
  ["Burrito riz haricots", ["burrito", "riz haricots"], "repas rapide", "1 burrito", 320, 720, 28, 90, 25, [tags.fast, tags.cheap]],
  ["Tartines avocat œufs", ["tartine avocat", "avocat oeuf"], "petit-déjeuner", "2 tartines", 260, 610, 25, 48, 34, [tags.breakfast, tags.kcal]],
  ["Porridge banane beurre cacahuète", ["porridge", "avoine banane"], "petit-déjeuner", "1 bol", 380, 650, 24, 82, 24, [tags.breakfast, tags.kcal]],
  ["Smoothie lait banane avoine", ["smoothie", "shake", "lait banane avoine"], "collation", "1 grand verre", 500, 620, 22, 90, 18, [tags.snack, tags.kcal]],
  ["Skyr avoine miel", ["skyr avoine", "skyr miel"], "collation", "1 bol", 330, 520, 33, 74, 10, [tags.snack, tags.protein]],
  ["Fromage blanc muesli", ["fb muesli", "fromage blanc muesli"], "collation", "1 bol", 320, 470, 24, 55, 16, [tags.snack, tags.fast]],
  ["Pain beurre confiture", ["tartine beurre confiture"], "petit-déjeuner", "2 tartines", 120, 390, 7, 54, 16, [tags.breakfast, tags.fast]],
  ["Pain beurre cacahuète banane", ["tartine cacahuete banane"], "collation", "2 tartines", 220, 610, 20, 74, 26, [tags.snack, tags.kcal]],
  ["Sandwich thon mayonnaise", ["sandwich thon", "thon mayo"], "repas froid", "1 sandwich", 230, 610, 34, 62, 24, [tags.cold, tags.fast]],
  ["Sandwich poulet emmental", ["sandwich poulet", "poulet emmental"], "repas froid", "1 sandwich", 240, 640, 42, 58, 26, [tags.cold, tags.protein]],
  ["Pâtes pesto poulet", ["pates pesto", "pesto poulet"], "plat rapide", "1 assiette", 420, 850, 44, 86, 34, [tags.fast, tags.gain]],
  ["Riz saumon avocat", ["riz saumon", "saumon avocat"], "repas froid", "1 bol", 430, 850, 42, 78, 40, [tags.cold, tags.kcal]],
  ["Pommes de terre sardines", ["patates sardines"], "repas rapide", "1 assiette", 360, 610, 32, 52, 28, [tags.fast, tags.protein]],
  ["Galettes lentilles riz", ["galette lentille", "lentilles galette"], "plat rapide", "1 assiette", 340, 560, 24, 74, 18, [tags.cheap]],
  ["Raclette simple", ["raclette"], "plat famille", "1 assiette", 450, 920, 38, 55, 58, [tags.family, tags.kcal]],
  ["Tartiflette", ["tartiflette"], "plat famille", "1 assiette", 420, 860, 34, 62, 52, [tags.family, tags.kcal]],
  ["Poulet curry riz", ["curry poulet", "poulet curry"], "plat famille", "1 assiette", 430, 780, 46, 86, 26, [tags.family, tags.gain]],
  ["Riz au lait", ["riz lait", "dessert riz"], "collation", "1 bol", 250, 330, 10, 56, 8, [tags.snack, tags.cheap]],
  ["Crêpes beurre sucre", ["crepe", "crêpe"], "collation", "2 crêpes", 180, 420, 10, 58, 16, [tags.snack, tags.kcal]],
  ["Pizza jambon fromage", ["pizza", "pizza jambon"], "plat rapide", "1/2 pizza", 250, 680, 30, 76, 28, [tags.fast, tags.kcal]],
  ["Taboulé pois chiches", ["taboule", "taboulé"], "repas froid", "1 bol", 350, 580, 18, 82, 18, [tags.cold, tags.cheap]],
  ["Salade riz œufs thon", ["salade riz", "riz oeuf thon"], "repas froid", "1 boîte", 390, 720, 42, 80, 24, [tags.cold, tags.protein]]
];

const combos = [
  ["Lait + banane", "collation", "1 verre + 1 banane", 370, 12, 62, 9],
  ["Banane + skyr", "collation", "1 bol", 200, 18, 32, 1],
  ["Pain complet + beurre de cacahuète", "collation", "2 tartines", 430, 18, 45, 21],
  ["Sandwich jambon emmental", "repas froid", "1 sandwich", 620, 34, 62, 26],
  ["Œufs durs + pain", "collation", "2 œufs + pain", 390, 23, 36, 18],
  ["Fromage blanc + miel", "collation", "1 bol", 260, 18, 34, 6],
  ["Avocat + pain", "collation", "1 assiette", 470, 11, 48, 26],
  ["Poignée noix amandes cajou", "collation", "40 g", 250, 8, 8, 22],
  ["Lait chocolaté + brioche", "collation", "1 goûter", 520, 16, 72, 19],
  ["Yaourt grec + fruits secs", "collation", "1 bol", 420, 15, 40, 22],
  ["Muesli + lait entier", "petit-déjeuner", "1 bol", 440, 15, 62, 15],
  ["Pain de mie beurre miel", "petit-déjeuner", "2 tartines", 360, 7, 48, 16],
  ["Omelette fromage pain", "repas rapide", "1 assiette", 620, 35, 38, 36],
  ["Riz thon huile olive", "repas rapide", "1 assiette", 650, 39, 72, 22],
  ["Pâtes fromage crème", "repas rapide", "1 assiette", 760, 25, 86, 34],
  ["Semoule pois chiches huile", "repas rapide", "1 bol", 660, 22, 86, 24],
  ["Lentilles œufs huile olive", "repas rapide", "1 bol", 610, 34, 48, 30],
  ["Haricots rouges riz avocat", "repas rapide", "1 bol", 760, 25, 96, 30],
  ["Poulet pâtes huile olive", "repas rapide", "1 assiette", 820, 55, 82, 24],
  ["Bœuf pommes de terre beurre", "repas famille", "1 assiette", 790, 44, 56, 42],
  ["Thon pain mayo", "repas froid", "1 sandwich", 580, 34, 52, 26],
  ["Saumon riz huile olive", "repas rapide", "1 assiette", 800, 39, 76, 35],
  ["Sardines pain avocat", "repas froid", "1 assiette", 660, 34, 45, 38],
  ["Skyr avoine beurre cacahuète", "collation", "1 bol", 650, 38, 72, 22],
  ["Shake lait avoine cacahuète", "collation", "1 grand verre", 780, 28, 94, 30],
  ["Compote barre céréales lait", "collation", "1 goûter", 380, 11, 62, 10],
  ["Croissant + lait entier", "petit-déjeuner", "1 petit-déj", 430, 11, 48, 22],
  ["Baguette beurre jambon", "repas froid", "1 sandwich", 620, 24, 70, 26],
  ["Riz poulet avocat huile", "repas rapide", "1 bol", 860, 50, 82, 36],
  ["Pâtes thon crème", "repas rapide", "1 assiette", 780, 44, 82, 30],
  ["Pain levain comté noix", "collation", "1 assiette", 610, 22, 46, 38],
  ["Fromage blanc muesli banane", "petit-déjeuner", "1 bol", 560, 26, 82, 14],
  ["Yaourt compote muesli", "collation", "1 bol", 430, 14, 68, 12],
  ["Omelette pommes de terre", "plat rapide", "1 assiette", 620, 28, 44, 36],
  ["Riz lentilles huile olive", "plat rapide", "1 bol", 700, 24, 100, 20],
  ["Pois chiches thon avocat", "repas froid", "1 bol", 760, 45, 46, 43],
  ["Pain beurre chocolat noir", "collation", "1 goûter", 510, 9, 58, 27],
  ["Lait fruits secs amandes", "collation", "1 goûter", 520, 17, 44, 31],
  ["Pâtes jambon emmental", "plat rapide", "1 assiette", 780, 38, 88, 30],
  ["Semoule poulet pois chiches", "plat rapide", "1 assiette", 760, 52, 88, 18],
  ["Bowl quinoa poulet avocat", "repas froid", "1 bol", 720, 44, 68, 30],
  ["Salade pommes de terre thon", "repas froid", "1 boîte", 640, 36, 58, 28],
  ["Tartines houmous avocat", "collation", "2 tartines", 560, 16, 52, 32],
  ["Pâtes sardines tomate", "plat rapide", "1 assiette", 790, 40, 86, 30],
  ["Riz œufs sauce soja", "plat rapide", "1 assiette", 660, 25, 88, 22],
  ["Sandwich omelette fromage", "repas froid", "1 sandwich", 650, 31, 58, 34],
  ["Bol semoule lait miel", "petit-déjeuner", "1 bol", 520, 16, 86, 12],
  ["Gâteau de riz lait entier", "collation", "1 portion", 430, 12, 72, 10],
  ["Pancakes avoine banane", "petit-déjeuner", "3 pancakes", 610, 22, 88, 18],
  ["Bagel saumon fromage frais", "repas froid", "1 bagel", 690, 34, 62, 32],
  ["Riz dinde crème", "plat rapide", "1 assiette", 760, 48, 82, 26],
  ["Pâtes poulet mozzarella", "plat rapide", "1 assiette", 840, 52, 84, 32],
  ["Lentilles saumon avocat", "repas froid", "1 bol", 780, 44, 48, 42],
  ["Toast beurre miel banane", "collation", "2 toasts", 540, 10, 78, 22],
  ["Fromage blanc noix miel", "collation", "1 bol", 520, 24, 35, 32],
  ["Muesli chocolat lait entier", "petit-déjeuner", "1 bol", 590, 17, 76, 24],
  ["Wrap haricots rouges avocat", "repas froid", "1 wrap", 700, 24, 78, 32],
  ["Croque thon emmental", "plat rapide", "1 croque", 610, 36, 38, 34],
  ["Pomme de terre crème jambon", "plat rapide", "1 assiette", 680, 28, 58, 36],
  ["Riz au lait banane", "collation", "1 bol", 470, 12, 82, 10],
  ["Pain perdu lait entier", "petit-déjeuner", "2 tranches", 560, 18, 68, 24],
  ["Bowl pâtes pois chiches feta", "repas froid", "1 bol", 780, 30, 88, 32],
  ["Purée beurre steak", "repas famille", "1 assiette", 820, 40, 64, 42],
  ["Gnocchis crème emmental", "plat rapide", "1 assiette", 760, 24, 92, 32]
].map(([name, category, portionLabel, kcal, protein, carbs, fat]) => [
  name,
  [name.toLowerCase(), name.toLowerCase().replace(/\+/g, " ")],
  category,
  portionLabel,
  300,
  kcal,
  protein,
  carbs,
  fat,
  [category.includes("collation") ? tags.snack : tags.fast, tags.gain],
  "Repère pratique, à ajuster selon portion réelle"
]);

function foodRecord(row) {
  const [name, aliases, category, portionLabel, portionGrams, kcal, protein, carbs, fat, tagList, note] = row;
  return {
    id: slug(name),
    name,
    aliases: [...new Set([name, ...aliases])],
    category,
    portionLabel,
    portionGrams,
    kcal,
    protein,
    carbs,
    fat,
    tags: tagList,
    ...(note ? { note } : {})
  };
}

let foods = [...baseFoods, ...dishes, ...combos].map(foodRecord);
const seen = new Map();
foods = foods.filter((food) => {
  if (seen.has(food.id)) return false;
  seen.set(food.id, true);
  return true;
});

const recipesBase = [
  "Porridge banane cacahuète", "Smoothie lait avoine", "Tartines avocat œufs", "Skyr avoine miel", "Pain beurre confiture",
  "Omelette emmental pain", "Riz thon avocat", "Pâtes bolognaise rapide", "Semoule thon huile", "Wrap poulet avocat",
  "Salade pâtes thon", "Bowl lentilles œufs", "Poulet curry riz", "Chili con carne", "Dahl lentilles riz",
  "Sandwich jambon beurre", "Croque-monsieur", "Riz saumon avocat", "Pâtes pesto poulet", "Couscous poulet pois chiches",
  "Hachis parmentier", "Lasagnes simples", "Quiche salade", "Tartiflette express", "Gratin pommes de terre thon",
  "Pain cacahuète banane", "Fromage blanc muesli", "Lait fruits secs", "Riz au lait enrichi", "Crêpes beurre miel",
  "Burrito riz haricots", "Pois chiches avocat thon", "Sardines pain beurre", "Pâtes crème jambon", "Riz poulet huile olive",
  "Semoule pois chiches", "Salade riz œufs thon", "Pommes de terre bœuf", "Omelette pommes de terre", "Pizza maison jambon",
  "Taboulé pois chiches", "Pain levain comté noix", "Yaourt grec muesli", "Shake banane cacao", "Riz lentilles huile",
  "Wrap thon mayonnaise", "Bowl haricots rouges avocat", "Croque avocat œufs", "Pâtes saumon crème", "Sandwich poulet emmental",
  "Brioche lait chocolaté", "Bol avoine chocolat noir"
];

const recipeTypes = ["petit-déjeuner", "repas froid", "repas rapide", "repas famille", "collation"];
const recipes = recipesBase.map((name, index) => {
  const type = recipeTypes[index % recipeTypes.length];
  const kcal = 420 + (index % 9) * 55 + (type === "repas famille" ? 170 : 0);
  const protein = 18 + (index % 7) * 4 + (type.includes("repas") ? 8 : 0);
  const carbs = 45 + (index % 8) * 8;
  const fat = 12 + (index % 6) * 5;
  return {
    id: slug(name),
    name,
    type,
    category: type,
    budget: ["€", "€€", "€€€"][index % 3],
    kcal,
    protein,
    carbs,
    fat,
    ingredients: [
      "1 base féculent ou pain",
      "1 source de protéines",
      "1 ajout calorique simple",
      "sel, poivre, assaisonnement"
    ],
    steps: [
      "Préparer la base en avance si possible.",
      "Ajouter la source de protéines.",
      "Enrichir avec huile, fromage, beurre de cacahuète ou avocat selon la recette.",
      "Servir une portion confortable et ajuster dans Mass+."
    ],
    tags: [type, tags.gain, index % 2 ? tags.fast : tags.cheap]
  };
});

const tipTexts = [
  ["astuce calorique", "Ajoute 1 cuillère d’huile d’olive", "Dans les pâtes, le riz ou les légumes, c’est environ +90 kcal sans beaucoup plus de volume."],
  ["organisation", "Prépare 2 œufs durs d’avance", "Ils sauvent un goûter ou complètent un repas froid en deux minutes."],
  ["rythme", "Ne saute pas le goûter", "Même petit, il protège la moyenne calorique de la journée."],
  ["appétit bas", "Bois une partie des calories", "Lait, smoothie ou shake maison passent souvent mieux qu’un gros repas."],
  ["collation", "Ajoute beurre de cacahuète", "Une cuillère dans une tartine, un bol ou un smoothie augmente vite l’apport."],
  ["courses", "Garde une base toujours prête", "Riz, pâtes, œufs, thon, skyr, bananes et huile d’olive couvrent beaucoup de situations."],
  ["petit budget", "Mise sur lentilles et pois chiches", "Ils apportent énergie, protéines et fibres pour peu cher."],
  ["repas froid", "Prépare une salade riz-thon", "Elle se garde bien et s’enrichit facilement avec avocat ou huile d’olive."],
  ["matin", "Ajoute l’avoine au petit-déjeuner", "60 g de flocons dans lait ou skyr changent vite la journée."],
  ["soir", "Ajoute du fromage râpé", "Sur pâtes, riz ou omelette, c’est simple et dense."],
  ["routine", "Crée ton petit-déjeuner favori", "Un favori évite de recalculer chaque matin."],
  ["photo", "Photographie les repas répétitifs", "La photo aide à se souvenir des portions sans chercher la perfection."],
  ["progression", "Regarde la moyenne, pas un seul jour", "La prise de poids se pilote sur plusieurs jours."],
  ["appétit", "Fractionne en petites prises", "Quatre moments moyens peuvent être plus faciles que deux gros repas."],
  ["liquide", "500 ml de lait dans la journée", "Deux verres répartis ajoutent une base calorique régulière."],
  ["rapide", "Pain + avocat + œufs", "Un repas express, dense, facile à refaire."],
  ["courses", "Achète des collations visibles", "Barres, fruits secs et skyr à portée de main limitent les oublis."],
  ["famille", "Enrichis ton assiette familiale", "Ajoute huile, fromage ou pain sans changer le repas des autres."],
  ["froid", "Garde du thon au placard", "Il transforme riz, pâtes ou pain en repas complet."],
  ["goûter", "Prévois le goûter la veille", "Ce qui est prêt demande moins d’effort quand l’appétit baisse."],
  ["objectif", "Vise simple avant parfait", "Un ajout quotidien régulier vaut mieux qu’un plan trop compliqué."],
  ["densité", "Choisis des aliments denses", "Noix, avocat, huile, fromage et cacahuète montent vite les calories."],
  ["préparation", "Double la portion de féculents", "Un reste de riz ou pâtes sert de base au repas suivant."],
  ["collation", "Skyr + avoine + miel", "Simple, protéiné, rapide, et facile à augmenter."],
  ["petit budget", "Œufs + pain + huile", "Un trio économique pour compléter une journée basse."],
  ["repas froid", "Sandwich maison enrichi", "Pain, jambon, fromage, beurre ou avocat : efficace sans cuisson."],
  ["sans faim", "Commence par quelques bouchées", "L’objectif est de lancer le repas, pas de forcer brutalement."],
  ["week-end", "Prépare deux repas types", "Les favoris Mass+ les rendront ajoutables en un clic."],
  ["suivi", "Pèse-toi dans les mêmes conditions", "Même moment, même contexte, moins de bruit dans la courbe."],
  ["confiance", "Répète ce qui marche", "Un repas efficace mérite de devenir un favori."]
];

const tips = tipTexts.map(([category, title, body], index) => ({ id: `tip-${index + 1}`, category, title, body }));

mkdirSync("data", { recursive: true });
writeFileSync("data/aliments-fr.json", `${JSON.stringify(foods, null, 2)}\n`);
writeFileSync("data/recettes-fr.json", `${JSON.stringify(recipes, null, 2)}\n`);
writeFileSync("data/astuces-fr.json", `${JSON.stringify(tips, null, 2)}\n`);
writeFileSync("foods.fr.json", `${JSON.stringify(foods, null, 2)}\n`);
writeFileSync("recipes.fr.json", `${JSON.stringify(recipes, null, 2)}\n`);
writeFileSync("tips.fr.json", `${JSON.stringify(tips, null, 2)}\n`);

console.log(`foods=${foods.length} recipes=${recipes.length} tips=${tips.length}`);
