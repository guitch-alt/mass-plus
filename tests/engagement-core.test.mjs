import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const Core = require("../engagement-core.js");
const coreSource = readFileSync(new URL("../engagement-core.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

const monday = "2026-07-13";
const tuesday = "2026-07-14";
const wednesday = "2026-07-15";
const saturday = "2026-07-18";

const first = Core.normalizeWeightEntry({ date: monday, weight: 60 });
assert.equal(first.weightKg, 60);
assert.equal(first.weight, 60);
assert.ok(first.id);

const weights = [
  { id: "w1", date: monday, weightKg: 60, createdAt: `${monday}T08:00:00.000Z` },
  { id: "w2", date: wednesday, weightKg: 60.4, createdAt: `${wednesday}T08:00:00.000Z` }
];
let summary = Core.weightSummary(weights, 65, wednesday);
assert.equal(summary.startWeight, 60);
assert.equal(summary.currentWeight, 60.4);
assert.ok(Math.abs(summary.deltaFromPrevious - 0.4) < 1e-9);
assert.equal(summary.average7, 60.2);
assert.ok(summary.goalProgress > 0 && summary.goalProgress < 100);

const edited = weights.map((item) => item.id === "w2" ? { ...item, weightKg: 60.6, weight: 60.6 } : item);
summary = Core.weightSummary(edited, 65, wednesday);
assert.ok(Math.abs(summary.deltaFromPrevious - 0.6) < 1e-9);
summary = Core.weightSummary(edited.filter((item) => item.id !== "w2"), 65, wednesday);
assert.equal(summary.currentWeight, 60);

assert.equal(Core.isWeighDay({ weighingFrequency: "daily" }, tuesday), true);
assert.equal(Core.isWeighDay({ weighingFrequency: "three", weighingDays: [1, 3, 6] }, monday), true);
assert.equal(Core.isWeighDay({ weighingFrequency: "three", weighingDays: [1, 3, 6] }, wednesday), true);
assert.equal(Core.isWeighDay({ weighingFrequency: "three", weighingDays: [1, 3, 6] }, saturday), true);
assert.equal(Core.isWeighDay({ weighingFrequency: "three", weighingDays: [1, 3, 6] }, tuesday), false);
assert.equal(Core.isWeighDay({ weighingFrequency: "weekly", weighingDays: [6] }, saturday), true);
assert.equal(Core.isWeighDay({ weighingFrequency: "weekly", weighingDays: [6] }, monday), false);

const profile = { weighingFrequency: "three", weighingDays: [1, 3, 6] };
assert.equal(Core.checkInState([], [], profile, monday).percent, 0);
assert.equal(Core.checkInState([{ date: monday }], [], profile, monday).completedCount, 1);
assert.equal(Core.checkInState([], [{ date: monday, weightKg: 60 }], profile, monday).completedCount, 1);
assert.equal(Core.checkInState([{ date: monday }], [{ date: monday, weightKg: 60 }], profile, monday).complete, true);
assert.equal(Core.checkInState([], [], profile, tuesday).requiredCount, 1);
assert.equal(Core.checkInState([{ date: tuesday }], [], profile, tuesday).complete, true);

const activities = Core.activityStats(
  [{ date: monday }, { date: wednesday }],
  [{ date: monday, weightKg: 60 }],
  { completedMissions: [{ date: tuesday, title: "Mission" }], eveningReviews: [] },
  profile,
  wednesday
);
assert.equal(activities.currentRun, 3);
assert.equal(activities.bestRun, 3);
assert.equal(activities.activeThisWeek, 3);

assert.match(appSource, /LEGACY_KEYS = \["mass-plus-mvp-v1", "mass-plus-state"\]/);
assert.match(appSource, /localStorageMigration/);
assert.match(appSource, /replace\("weights"/);
assert.match(appSource, /engagement: snapshot\.engagement/);
assert.match(appSource, /Reprendre mon dernier repas/);
assert.match(appSource, /Dicter mon repas/);
assert.match(appSource, /openWeightModal/);
assert.match(appSource, /data-edit-weight/);
assert.match(appSource, /data-delete-weight/);
assert.match(coreSource, /Pas grave\. On reprend aujourd’hui\./);
assert.doesNotMatch(`${appSource}\n${coreSource}`, /Série perdue|Tu n’as pas respecté ton objectif/);
assert.doesNotMatch(appSource, /supabase|firebase|stripe/i);

assert.match(styleSource, /input, select, textarea[\s\S]*font-size: 16px/);
assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(styleSource, /\.stories[\s\S]*grid-template-columns: repeat\(4/);
assert.match(indexSource, /engagement-core\.js/);
assert.match(appSource, /service-worker\.js\?v=1\.3\.0/);
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
assert.match(workerSource, /engagement-core\.js/);

console.log("Tests engagement Mass+ OK");
