"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import type { ScheduleDay, MealSelection, MenuItem } from "@/lib/types";
import { getMacrosForPortion, menuItemToSubmission } from "@/lib/types";
import { getRatings } from "@/lib/ratings";

const IMAGE_CDN = "https://cateredfit-images.s3.amazonaws.com";

const MEAL_TYPE_LABELS: Record<number, string> = {
  1: "Breakfast",
  2: "Lunch",
  3: "Dinner",
};

const TEMP_LABELS: Record<string, string> = {
  hot: "Hot",
  cold: "Cold",
  warm: "Warm",
};

interface MealEditDrawerProps {
  open: boolean;
  onClose: () => void;
  date: string;
  schedule: ScheduleDay;
  currentMeals: MealSelection[];
  onSaved: () => void;
  preloadedMenu?: MenuItem[];
}

export default function MealEditDrawer({
  open,
  onClose,
  date,
  schedule,
  currentMeals,
  onSaved,
  preloadedMenu,
}: MealEditDrawerProps) {
  const { api } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Filters (sets for multi-select)
  const [filterMealTypes, setFilterMealTypes] = useState<Set<number>>(new Set());
  const [filterPreferences, setFilterPreferences] = useState<Set<string>>(new Set());
  const [filterTemps, setFilterTemps] = useState<Set<string>>(new Set());
  const [sortByRating, setSortByRating] = useState(false);
  const [mealRatings, setMealRatings] = useState<Record<number, number>>({});

  const portionId = api.userInfo?.portionId ?? 3;
  const maxMeals = schedule.quantity;
  const totalSelected = Object.values(selections).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!open) return;
    setError("");
    setFilterMealTypes(new Set());
    setFilterPreferences(new Set());
    setFilterTemps(new Set());
    setSortByRating(false);

    // Load ratings from storage
    const stored = getRatings();
    const rMap: Record<number, number> = {};
    for (const [id, r] of Object.entries(stored)) {
      rMap[Number(id)] = r.rating;
    }
    setMealRatings(rMap);

    const initSelections = () => {
      const counts: Record<number, number> = {};
      for (const meal of currentMeals) {
        counts[meal.id] = (counts[meal.id] || 0) + 1;
      }
      setSelections(counts);
    };

    // Use preloaded menu if available
    if (preloadedMenu && preloadedMenu.length > 0) {
      setMenuItems(preloadedMenu);
      initSelections();
      return;
    }

    setLoading(true);
    const userId = api.userInfo?.id;
    if (!userId) {
      setError("User info not loaded");
      setLoading(false);
      return;
    }

    api
      .getMenu(date, schedule.main_product, userId)
      .then((items) => {
        setMenuItems(items);
        initSelections();
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load menu");
      })
      .finally(() => setLoading(false));
  }, [open, date, schedule.main_product, api, currentMeals, preloadedMenu]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Derive available filter options from menu data
  // Split comma-separated tags into individual values
  const filterOptions = useMemo(() => {
    const mealTypes = new Set<number>();
    const preferences = new Set<string>();
    const temps = new Set<string>();
    for (const item of menuItems) {
      mealTypes.add(item.meal_type_id);
      for (const tag of item.tags) {
        tag.split(",").forEach((t) => {
          const trimmed = t.trim();
          if (trimmed) preferences.add(trimmed);
        });
      }
      if (item.macros.tempeture) temps.add(item.macros.tempeture);
    }
    return {
      mealTypes: Array.from(mealTypes).sort(),
      preferences: Array.from(preferences).sort(),
      temps: Array.from(temps),
    };
  }, [menuItems]);

  const updateSelection = useCallback(
    (mealId: number, delta: number) => {
      setSelections((prev) => {
        const current = prev[mealId] || 0;
        const next = Math.max(0, current + delta);
        if (next === 0) {
          const { [mealId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [mealId]: next };
      });
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      const originalCounts: Record<number, number> = {};
      for (const meal of currentMeals) {
        originalCounts[meal.id] = (originalCounts[meal.id] || 0) + 1;
      }

      const submissions = Object.entries(selections)
        .filter(([, count]) => count > 0)
        .map(([idStr, count]) => {
          const id = Number(idStr);
          const item = menuItems.find((m) => m.id === id)!;
          return menuItemToSubmission(
            item,
            portionId,
            count,
            originalCounts[id] || 0
          );
        });

      await api.selectMeals(schedule.main_product, date, submissions);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Filter + split: selected items on top, rest below
  const filteredItems = useMemo(() => {
    let items = menuItems;

    if (filterMealTypes.size > 0) {
      items = items.filter((i) => filterMealTypes.has(i.meal_type_id));
    }
    if (filterPreferences.size > 0) {
      items = items.filter((i) =>
        i.tags.some((tag) =>
          tag.split(",").some((t) => filterPreferences.has(t.trim()))
        )
      );
    }
    if (filterTemps.size > 0) {
      items = items.filter((i) => filterTemps.has(i.macros.tempeture));
    }
    if (sortByRating) {
      items = [...items].sort(
        (a, b) => (mealRatings[b.id] || 0) - (mealRatings[a.id] || 0)
      );
    }
    return items;
  }, [menuItems, filterMealTypes, filterPreferences, filterTemps, selections, sortByRating, mealRatings]);

  const selectedItems = filteredItems.filter((i) => (selections[i.id] || 0) > 0);
  const unselectedItems = filteredItems.filter((i) => !(selections[i.id] || 0));

  const hasActiveFilters = filterMealTypes.size > 0 || filterPreferences.size > 0 || filterTemps.size > 0 || sortByRating;

  if (!open) return null;

  function renderCard(item: MenuItem) {
    const qty = selections[item.id] || 0;
    const macros = getMacrosForPortion(item.macros, portionId);
    const imgSrc = item.image_url
      ? `${IMAGE_CDN}/${item.image_url}`
      : null;

    return (
      <div
        key={item.id}
        className={`group rounded-xl border overflow-hidden transition-all ${
          qty > 0
            ? "border-green-500/50 bg-green-500/5 ring-1 ring-green-500/20"
            : "border-gray-800 bg-gray-900 hover:border-gray-700"
        }`}
      >
        {/* Image */}
        <div className="relative aspect-square bg-gray-800 overflow-hidden">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={item.name}
              className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs font-black text-gray-600">
              ?
            </div>
          )}

          {/* Tags overlay */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
                item.macros.tempeture === "hot"
                  ? "bg-orange-500/80 text-white"
                  : item.macros.tempeture === "cold"
                    ? "bg-cyan-500/80 text-white"
                    : "bg-gray-500/80 text-white"
              }`}
            >
              {TEMP_LABELS[item.macros.tempeture] || item.macros.tempeture}
            </span>
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Quantity badge */}
          {qty > 0 && (
            <div className="absolute top-2 right-2 rounded-full bg-green-600 h-7 w-7 flex items-center justify-center text-xs font-bold text-white shadow-lg">
              {qty}
            </div>
          )}
        </div>

        <div className="p-3">
          {/* Name */}
          <p className="text-xs font-medium text-white leading-snug mb-2 line-clamp-2 min-h-[2.5rem]">
            {item.description || item.name}
          </p>

          {/* Macros + Rating */}
          <div className="flex items-center gap-2 text-[10px] mb-3">
            <span className="text-gray-400">{macros.cal} cal</span>
            <span className="text-blue-400">{macros.pro}P</span>
            <span className="text-amber-400">{macros.carbs}C</span>
            <span className="text-rose-400">{macros.fat}F</span>
            {mealRatings[item.id] ? (
              <span className="flex items-center gap-0.5 ml-auto">
                {Array.from({ length: 5 }, (_, i) => (
                  <svg
                    key={i}
                    className={`h-2.5 w-2.5 ${
                      i < mealRatings[item.id] ? "text-yellow-400" : "text-gray-700"
                    }`}
                    fill={i < mealRatings[item.id] ? "currentColor" : "none"}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                ))}
              </span>
            ) : (
              <span className="ml-auto text-gray-600 italic">Not tried yet</span>
            )}
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSelection(item.id, -1)}
              disabled={qty === 0}
              className="h-8 flex-1 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
            >
              -
            </button>
            <span
              className={`w-8 text-center text-sm font-bold ${
                qty > 0 ? "text-green-400" : "text-gray-600"
              }`}
            >
              {qty}
            </span>
            <button
              onClick={() => updateSelection(item.id, 1)}
              disabled={totalSelected >= maxMeals}
              className="h-8 flex-1 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="rounded-lg p-2 -ml-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-white">Edit Meals</h2>
              <p className="text-sm text-gray-400">
                {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                {" \u00b7 "}
                {schedule.main_product_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                <span
                  className={`font-bold ${
                    totalSelected === maxMeals ? "text-green-400" : "text-white"
                  }`}
                >
                  {totalSelected}
                </span>
                /{maxMeals}
              </span>
              <div className="w-24 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    totalSelected === maxMeals ? "bg-green-500" : "bg-gray-600"
                  }`}
                  style={{
                    width: `${Math.min(100, (totalSelected / maxMeals) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={totalSelected !== maxMeals || saving}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Selections"}
            </button>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      {menuItems.length > 0 && (
        <div className="shrink-0 border-b border-gray-800/50 px-6 py-3">
          <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Meal Type */}
            {filterOptions.mealTypes.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mr-0.5">Meal</span>
                {filterOptions.mealTypes.map((typeId) => (
                  <button
                    key={`type-${typeId}`}
                    onClick={() =>
                      setFilterMealTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(typeId)) next.delete(typeId);
                        else next.add(typeId);
                        return next;
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      filterMealTypes.has(typeId)
                        ? "bg-green-600 text-white"
                        : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                    }`}
                  >
                    {MEAL_TYPE_LABELS[typeId] || `Type ${typeId}`}
                  </button>
                ))}
              </div>
            )}

            {/* Preference */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mr-0.5">Diet</span>
              {filterOptions.preferences.map((pref) => (
                <button
                  key={`pref-${pref}`}
                  onClick={() =>
                    setFilterPreferences((prev) => {
                      const next = new Set(prev);
                      if (next.has(pref)) next.delete(pref);
                      else next.add(pref);
                      return next;
                    })
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterPreferences.has(pref)
                      ? "bg-green-600 text-white"
                      : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  {pref}
                </button>
              ))}
            </div>

            {/* Temperature */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mr-0.5">Temp</span>
              {filterOptions.temps.map((temp) => (
                <button
                  key={`temp-${temp}`}
                  onClick={() =>
                    setFilterTemps((prev) => {
                      const next = new Set(prev);
                      if (next.has(temp)) next.delete(temp);
                      else next.add(temp);
                      return next;
                    })
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterTemps.has(temp)
                      ? "bg-green-600 text-white"
                      : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  {TEMP_LABELS[temp] || temp}
                </button>
              ))}
            </div>

            {/* Sort by Rating */}
            {Object.keys(mealRatings).length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mr-0.5">Sort</span>
                <button
                  onClick={() => setSortByRating((prev) => !prev)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    sortByRating
                      ? "bg-yellow-500 text-black"
                      : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  Rating
                </button>
              </div>
            )}

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilterMealTypes(new Set());
                  setFilterPreferences(new Set());
                  setFilterTemps(new Set());
                  setSortByRating(false);
                }}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sticky selected strip */}
      {selectedItems.length > 0 && !loading && (
        <div className="shrink-0 border-b border-gray-800/50 bg-gray-950/95 backdrop-blur-sm px-6 py-3">
          <div className="mx-auto max-w-6xl space-y-2">
            <span className="text-[10px] font-medium text-green-400 uppercase tracking-wider">
              Your Picks ({totalSelected}/{maxMeals})
            </span>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {selectedItems.map((item) => {
                const qty = selections[item.id] || 0;
                const imgSrc = item.image_url
                  ? `${IMAGE_CDN}/${item.image_url}`
                  : null;
                return (
                  <div
                    key={`pick-${item.id}`}
                    className="shrink-0 w-32 rounded-xl border border-green-500/30 bg-green-500/5 overflow-hidden"
                  >
                    {/* Image with +/- overlays */}
                    <div className="relative aspect-square bg-gray-800">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={item.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs font-black text-gray-600">?</div>
                      )}
                      {/* Qty badge */}
                      <div className="absolute top-1.5 right-1.5 rounded-full bg-green-600 h-6 w-6 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                        {qty}
                      </div>
                      {/* +/- buttons */}
                      <div className="absolute bottom-0 inset-x-0 flex">
                        <button
                          onClick={() => updateSelection(item.id, -1)}
                          className="flex-1 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors py-1.5 text-sm font-bold border-r border-white/10"
                        >
                          -
                        </button>
                        <button
                          onClick={() => updateSelection(item.id, 1)}
                          disabled={totalSelected >= maxMeals}
                          className="flex-1 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors py-1.5 text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {/* Name */}
                    <p className="px-2 py-1.5 text-[10px] font-medium text-white leading-tight line-clamp-2">
                      {item.description || item.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
            </div>
          ) : error && menuItems.length === 0 ? (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
              {error}
            </div>
          ) : (
            <div className="space-y-8">
              {error && (
                <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
                  {error}
                </div>
              )}

              {/* All meals grid (selected still highlighted inline) */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {hasActiveFilters ? `Meals (${filteredItems.length})` : "All Meals"}
                </h3>
                {filteredItems.length > 0 ? (
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {filteredItems.map(renderCard)}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm py-8 text-center">
                    No meals match your filters
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
