"use strict";

(function exposeMassPlusCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MassPlusCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMassPlusCore() {
  const DEFAULT_WEIGH_DAYS = [1, 3, 6];

  function localDateKey(date = new Date()) {
    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateKey, offset) {
    const [year, month, day] = String(dateKey || localDateKey()).split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    date.setDate(date.getDate() + offset);
    return localDateKey(date);
  }

  function dayOfWeek(dateKey) {
    return new Date(`${dateKey}T12:00:00`).getDay();
  }

  function normalizeWeightEntry(item = {}) {
    const value = Number(item.weightKg ?? item.weight ?? 0);
    const date = item.date || localDateKey(item.createdAt ? new Date(item.createdAt) : new Date());
    return {
      id: item.id || date,
      date,
      weightKg: value,
      weight: value,
      createdAt: item.createdAt || `${date}T12:00:00.000Z`,
      updatedAt: item.updatedAt || item.createdAt || `${date}T12:00:00.000Z`
    };
  }

  function sortedWeights(entries = []) {
    return entries
      .map(normalizeWeightEntry)
      .filter((item) => Number.isFinite(item.weightKg) && item.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }

  function averageWeight(entries = [], days = 7, referenceDate = localDateKey()) {
    const start = addDays(referenceDate, -(Math.max(1, days) - 1));
    const values = sortedWeights(entries)
      .filter((item) => item.date >= start && item.date <= referenceDate)
      .map((item) => item.weightKg);
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function weightSummary(entries = [], targetWeight = 0, referenceDate = localDateKey()) {
    const sorted = sortedWeights(entries).filter((item) => item.date <= referenceDate);
    const first = sorted[0] || null;
    const current = sorted.at(-1) || null;
    const previous = sorted.length > 1 ? sorted.at(-2) : null;
    const average7 = averageWeight(sorted, 7, referenceDate);
    const average30 = averageWeight(sorted, 30, referenceDate);
    const previous7End = addDays(referenceDate, -7);
    const previousAverage7 = averageWeight(sorted, 7, previous7End);
    const target = Number(targetWeight || 0);
    const totalGoalDistance = first && target ? Math.abs(target - first.weightKg) : 0;
    const completedDistance = first && current ? Math.abs(current.weightKg - first.weightKg) : 0;
    return {
      first,
      current,
      previous,
      startWeight: first?.weightKg || 0,
      currentWeight: current?.weightKg || 0,
      targetWeight: target,
      deltaFromPrevious: current && previous ? current.weightKg - previous.weightKg : 0,
      totalDifference: current && first ? current.weightKg - first.weightKg : 0,
      average7,
      average30,
      previousAverage7,
      trend7: average7 && previousAverage7 ? average7 - previousAverage7 : 0,
      goalProgress: totalGoalDistance ? Math.max(0, Math.min(100, completedDistance / totalGoalDistance * 100)) : 0
    };
  }

  function weighingFrequency(profile = {}) {
    return ["daily", "three", "weekly"].includes(profile.weighingFrequency)
      ? profile.weighingFrequency
      : "three";
  }

  function weighingDays(profile = {}) {
    const days = Array.isArray(profile.weighingDays)
      ? profile.weighingDays.map(Number).filter((day) => day >= 0 && day <= 6)
      : [];
    if (weighingFrequency(profile) === "daily") return [0, 1, 2, 3, 4, 5, 6];
    if (weighingFrequency(profile) === "weekly") return [days[0] ?? 6];
    return days.length ? [...new Set(days)] : DEFAULT_WEIGH_DAYS;
  }

  function isWeighDay(profile = {}, dateKey = localDateKey()) {
    return weighingDays(profile).includes(dayOfWeek(dateKey));
  }

  function checkInState(entries = [], weights = [], profile = {}, dateKey = localDateKey()) {
    const weightRequired = isWeighDay(profile, dateKey);
    const mealDone = entries.some((entry) => entry.date === dateKey);
    const weightDone = sortedWeights(weights).some((entry) => entry.date === dateKey);
    const requiredCount = weightRequired ? 2 : 1;
    const completedCount = Number(mealDone) + Number(weightRequired && weightDone);
    return {
      date: dateKey,
      weightRequired,
      weightDone,
      mealDone,
      requiredCount,
      completedCount,
      complete: completedCount === requiredCount,
      percent: Math.round(completedCount / requiredCount * 100)
    };
  }

  function activeDateSet(entries = [], weights = [], engagement = {}, profile = {}) {
    const dates = new Set(entries.map((entry) => entry.date).filter(Boolean));
    sortedWeights(weights).forEach((entry) => {
      if (isWeighDay(profile, entry.date)) dates.add(entry.date);
    });
    (engagement.completedMissions || []).forEach((item) => dates.add(item.date || item));
    (engagement.eveningReviews || []).forEach((item) => dates.add(item.date || item));
    return dates;
  }

  function longestRun(dateKeys = []) {
    const sorted = [...new Set(dateKeys)].sort();
    let best = 0;
    let run = 0;
    let previous = "";
    sorted.forEach((date) => {
      run = previous && addDays(previous, 1) === date ? run + 1 : 1;
      best = Math.max(best, run);
      previous = date;
    });
    return best;
  }

  function activityStats(entries = [], weights = [], engagement = {}, profile = {}, referenceDate = localDateKey()) {
    const dates = activeDateSet(entries, weights, engagement, profile);
    const ordered = [...dates].filter((date) => date <= referenceDate).sort();
    const lastActive = ordered.at(-1) || "";
    const canContinue = lastActive === referenceDate || lastActive === addDays(referenceDate, -1);
    let currentRun = 0;
    if (canContinue) {
      let cursor = lastActive;
      while (dates.has(cursor)) {
        currentRun += 1;
        cursor = addDays(cursor, -1);
      }
    }
    const weekday = dayOfWeek(referenceDate);
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const weekStart = addDays(referenceDate, mondayOffset);
    const activeThisWeek = ordered.filter((date) => date >= weekStart && date <= referenceDate).length;
    const weeks = new Set(ordered.map((date) => {
      const day = dayOfWeek(date);
      return addDays(date, day === 0 ? -6 : 1 - day);
    }));
    return {
      currentRun,
      bestRun: longestRun(ordered),
      activeThisWeek,
      trackedWeeks: weeks.size,
      lastActive,
      resumeMessage: lastActive && !canContinue ? "Pas grave. On reprend aujourd’hui." : ""
    };
  }

  function weekRange(referenceDate = localDateKey(), offsetWeeks = 0) {
    const shifted = addDays(referenceDate, offsetWeeks * 7);
    const weekday = dayOfWeek(shifted);
    const start = addDays(shifted, weekday === 0 ? -6 : 1 - weekday);
    return { start, end: addDays(start, 6) };
  }

  function weeklySummary(entries = [], weights = [], engagement = {}, profile = {}, referenceDate = localDateKey()) {
    const range = weekRange(referenceDate);
    const weekEntries = entries.filter((entry) => entry.date >= range.start && entry.date <= range.end);
    const daysWithEntries = new Set(weekEntries.map((entry) => entry.date));
    const dailyCalories = [...daysWithEntries].map((date) =>
      weekEntries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + Number(entry.kcal || 0), 0)
    );
    const activity = activeDateSet(entries, weights, engagement, profile);
    const activeDays = [...activity].filter((date) => date >= range.start && date <= range.end).length;
    const weekWeights = sortedWeights(weights).filter((item) => item.date >= range.start && item.date <= range.end);
    const weightEvolution = weekWeights.length > 1 ? weekWeights.at(-1).weightKg - weekWeights[0].weightKg : 0;
    const missions = (engagement.completedMissions || []).filter((item) => {
      const date = item.date || item;
      return date >= range.start && date <= range.end;
    });
    const missionCounts = missions.reduce((counts, item) => {
      const key = item.title || item.mission || "Mission quotidienne";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const topMission = Object.entries(missionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Aucune mission validée";
    return {
      ...range,
      activeDays,
      mealEntries: weekEntries.length,
      recordedMeals: new Set(weekEntries.map((entry) => `${entry.date}:${entry.meal}`)).size,
      averageCalories: dailyCalories.length ? dailyCalories.reduce((sum, value) => sum + value, 0) / dailyCalories.length : 0,
      weightEvolution,
      topMission
    };
  }

  return {
    DEFAULT_WEIGH_DAYS,
    localDateKey,
    addDays,
    dayOfWeek,
    normalizeWeightEntry,
    sortedWeights,
    averageWeight,
    weightSummary,
    weighingFrequency,
    weighingDays,
    isWeighDay,
    checkInState,
    activeDateSet,
    activityStats,
    weekRange,
    weeklySummary
  };
});
