"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  startOfWeek,
  addDays,
  formatDate,
  formatMonthYear,
  isToday,
  getWeekDays,
} from "@/lib/dates";
import type { ScheduleDay, MealSelection, MenuItem } from "@/lib/types";
import { getMacrosForPortion } from "@/lib/types";
import { getRatings, setRating as saveRating, removeRating } from "@/lib/ratings";
import MealEditDrawer from "./meal-edit-drawer";

const IMAGE_CDN = "https://cateredfit-images.s3.amazonaws.com";

function mealImageUrl(mealId: number): string {
  return `${IMAGE_CDN}/meal-${mealId}.png`;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  delivered: { label: "Delivered", color: "text-green-400" },
  user_selected: { label: "Selected", color: "text-blue-400" },
  future_selection: { label: "Upcoming", color: "text-yellow-400" },
  stopped: { label: "Skipped", color: "text-red-400" },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MealImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    const text = "MYSTERY MEAL LOL \u00a0\u00b7\u00a0 ";
    const row = (text).repeat(10);
    return (
      <div className="h-full w-full overflow-hidden bg-gray-800 relative">
        <div className="absolute inset-0 flex flex-col justify-center -rotate-45 scale-[2] origin-center">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="whitespace-nowrap text-[10px] font-black text-gray-600/60 tracking-widest leading-6"
              style={{ marginLeft: `${(i % 3) * -40}px` }}
            >
              {row}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300"
      onError={() => setFailed(true)}
    />
  );
}

export default function SchedulePage() {
  const { isLoggedIn, isLoading, api, logout } = useAuth();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [scheduleByDate, setScheduleByDate] = useState<
    Record<string, ScheduleDay>
  >({});
  const [mealsByDate, setMealsByDate] = useState<
    Record<string, MealSelection[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [menusByDate, setMenusByDate] = useState<
    Record<string, MenuItem[]>
  >({});
  const [mealRatings, setMealRatings] = useState<Record<number, number>>(() => {
    const stored = getRatings();
    const map: Record<number, number> = {};
    for (const [id, r] of Object.entries(stored)) map[Number(id)] = r.rating;
    return map;
  });
  const prefetchedWeeks = useRef(new Set<string>());
  const scheduleByDateRef = useRef(scheduleByDate);
  scheduleByDateRef.current = scheduleByDate;

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.push("/login");
  }, [isLoading, isLoggedIn, router]);

  const loadWeekData = useCallback(
    async (targetStart: Date) => {
      const start = formatDate(targetStart);
      const end = formatDate(addDays(targetStart, 13));

      const data = await api.getSchedule(start, end);
      const indexed: Record<string, ScheduleDay> = {};
      for (const day of data) {
        indexed[day.day] = day;
      }
      setScheduleByDate((prev) => ({ ...prev, ...indexed }));

      const weekDates = getWeekDays(targetStart).map(formatDate);
      const daysWithMeals = weekDates.filter(
        (d) => indexed[d]?.delivery && indexed[d].status !== "stopped"
      );

      const meals: Record<string, MealSelection[]> = {};
      await Promise.all(
        daysWithMeals.map(async (dateStr) => {
          try {
            const mealData = await api.getMealSelection(dateStr);
            if (Array.isArray(mealData)) {
              meals[dateStr] = mealData;
            }
          } catch {
            // Day might not have meal selections yet
          }
        })
      );
      setMealsByDate((prev) => ({ ...prev, ...meals }));

      // Preload menus for editable days
      const editableDays = weekDates.filter(
        (d) =>
          indexed[d] &&
          (indexed[d].status === "future_selection" ||
            indexed[d].status === "user_selected")
      );
      const userId = api.userInfo?.id;
      if (userId) {
        const menus: Record<string, MenuItem[]> = {};
        await Promise.all(
          editableDays.map(async (dateStr) => {
            try {
              menus[dateStr] = await api.getMenu(
                dateStr,
                indexed[dateStr].main_product,
                userId
              );
            } catch {
              // Menu might not be available yet
            }
          })
        );
        setMenusByDate((prev) => ({ ...prev, ...menus }));
      }

      return { indexed, weekDates };
    },
    [api]
  );

  const fetchWeek = useCallback(async () => {
    if (!isLoggedIn) return;

    const weekKey = formatDate(weekStart);
    const weekDates = getWeekDays(weekStart).map(formatDate);

    // If already prefetched, use cached data and just set selected date
    if (prefetchedWeeks.current.has(weekKey)) {
      const schedule = scheduleByDateRef.current;
      const todayStr = formatDate(new Date());
      if (weekDates.includes(todayStr) && schedule[todayStr]) {
        setSelectedDate(todayStr);
      } else {
        const firstDelivery = weekDates.find((d) => schedule[d]?.delivery);
        setSelectedDate(firstDelivery ?? null);
      }
      return;
    }

    setLoading(true);
    try {
      const { indexed, weekDates: wd } = await loadWeekData(weekStart);
      prefetchedWeeks.current.add(weekKey);

      const todayStr = formatDate(new Date());
      if (wd.includes(todayStr) && indexed[todayStr]) {
        setSelectedDate(todayStr);
      } else {
        const firstDelivery = wd.find((d) => indexed[d]?.delivery);
        setSelectedDate(firstDelivery ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, loadWeekData, weekStart]);

  const prefetchWeek = useCallback(
    (direction: number) => {
      const targetStart = addDays(weekStart, direction * 7);
      const key = formatDate(targetStart);
      if (prefetchedWeeks.current.has(key) || !isLoggedIn) return;
      prefetchedWeeks.current.add(key);
      loadWeekData(targetStart).catch(() => {
        prefetchedWeeks.current.delete(key);
      });
    },
    [weekStart, isLoggedIn, loadWeekData]
  );

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  const handleRate = useCallback((mealId: number, star: number, mealName: string) => {
    const current = mealRatings[mealId] || 0;
    if (star === current) {
      removeRating(mealId);
      setMealRatings((prev) => { const next = { ...prev }; delete next[mealId]; return next; });
    } else {
      saveRating(mealId, star, mealName);
      setMealRatings((prev) => ({ ...prev, [mealId]: star }));
    }
  }, [mealRatings]);

  const prevWeek = () => setWeekStart((w) => addDays(w, -7));
  const nextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => {
    setWeekStart(startOfWeek(new Date()));
    setSelectedDate(formatDate(new Date()));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  const days = getWeekDays(weekStart);
  const selectedDaySchedule = selectedDate
    ? scheduleByDate[selectedDate]
    : null;
  const selectedDayMeals = selectedDate ? mealsByDate[selectedDate] : null;

  // Deduplicate meals by meal ID and count quantities
  const groupedMeals = selectedDayMeals
    ? Object.values(
        selectedDayMeals.reduce(
          (acc, meal) => {
            if (acc[meal.id]) {
              acc[meal.id].qty += 1;
            } else {
              acc[meal.id] = { meal, qty: 1 };
            }
            return acc;
          },
          {} as Record<number, { meal: MealSelection; qty: number }>
        )
      )
    : [];

  // Daily totals
  const dailyTotals = selectedDayMeals?.reduce(
    (acc, meal) => {
      const m = getMacrosForPortion(meal.macros, meal.portion_id);
      acc.cal += m.cal;
      acc.pro += m.pro;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      return acc;
    },
    { cal: 0, pro: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Catered Fit</h1>
          <div className="flex items-center gap-4">
            {Object.entries(scheduleByDate).some(
              ([date, d]) =>
                d.status === "delivered" &&
                mealsByDate[date]?.some((m) => !mealRatings[m.id])
            ) && (
              <button
                onClick={() => router.push("/rate")}
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                Rate Meals
              </button>
            )}
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">
              {formatMonthYear(weekStart)}
            </h2>
            <button
              onClick={goToday}
              className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Today
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={prevWeek}
              onMouseEnter={() => prefetchWeek(-1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextWeek}
              onMouseEnter={() => prefetchWeek(1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
          </div>
        ) : (
          <>
            {/* Day Selector Strip */}
            <div className="grid grid-cols-7 gap-1.5 mb-6">
              {days.map((day) => {
                const dateStr = formatDate(day);
                const today = isToday(day);
                const sched = scheduleByDate[dateStr];
                const isSelected = selectedDate === dateStr;
                const isDelivery = sched?.delivery;
                const isWeekend = !sched;
                const statusInfo = sched
                  ? STATUS_LABELS[sched.status]
                  : null;

                return (
                  <button
                    key={dateStr}
                    onClick={() => !isWeekend && setSelectedDate(dateStr)}
                    disabled={isWeekend}
                    className={`rounded-xl p-3 text-center transition-all ${
                      isSelected
                        ? "bg-green-600/20 border-2 border-green-500 ring-1 ring-green-500/30"
                        : isWeekend
                          ? "bg-gray-900/30 border border-gray-800/30 cursor-default"
                          : "bg-gray-900 border border-gray-800 hover:border-gray-600 cursor-pointer"
                    }`}
                  >
                    <div
                      className={`text-xs font-medium mb-1 ${
                        today ? "text-green-400" : isWeekend ? "text-gray-700" : "text-gray-500"
                      }`}
                    >
                      {DAY_NAMES[day.getDay()]}
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        isSelected
                          ? "text-green-400"
                          : today
                            ? "text-white"
                            : isWeekend
                              ? "text-gray-700"
                              : "text-gray-200"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    {isDelivery && statusInfo && (
                      <div className={`text-[10px] mt-1 ${statusInfo.color}`}>
                        {statusInfo.label}
                      </div>
                    )}
                    {isWeekend && (
                      <div className="text-[10px] mt-1 text-gray-700">Off</div>
                    )}
                    {today && (
                      <div className="mx-auto mt-1 h-1 w-1 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Detail */}
            {selectedDate && selectedDaySchedule && (
              <div className="space-y-4">
                {/* Day Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="text-white font-semibold">
                        {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { weekday: "long", month: "long", day: "numeric" }
                        )}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {selectedDaySchedule.main_product_name}
                        {selectedDaySchedule.others.length > 0 &&
                          ` + ${selectedDaySchedule.others.map((o) => o.product_name).join(", ")}`}
                      </p>
                    </div>
                    {(selectedDaySchedule.status === "user_selected" ||
                      selectedDaySchedule.status === "future_selection") && (
                      <button
                        onClick={() => setEditingDate(selectedDate)}
                        className="rounded-lg bg-green-600/20 border border-green-500/30 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-600/30 transition-colors"
                      >
                        Edit Meals
                      </button>
                    )}
                  </div>
                  {dailyTotals && (
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-white font-bold">
                          {dailyTotals.cal}
                        </div>
                        <div className="text-gray-500 text-xs">cal</div>
                      </div>
                      <div className="text-center">
                        <div className="text-blue-400 font-bold">
                          {dailyTotals.pro}g
                        </div>
                        <div className="text-gray-500 text-xs">protein</div>
                      </div>
                      <div className="text-center">
                        <div className="text-amber-400 font-bold">
                          {dailyTotals.carbs}g
                        </div>
                        <div className="text-gray-500 text-xs">carbs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-rose-400 font-bold">
                          {dailyTotals.fat}g
                        </div>
                        <div className="text-gray-500 text-xs">fat</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Meal Cards */}
                {groupedMeals.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupedMeals.map(({ meal, qty }) => {
                      const macros = getMacrosForPortion(
                        meal.macros,
                        meal.portion_id
                      );
                      return (
                        <div
                          key={meal.meal_selection_id}
                          className="group flex flex-col rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-700 transition-colors"
                        >
                          {/* Meal Image */}
                          <div className="relative aspect-square bg-gray-800 overflow-hidden">
                            <MealImage
                              src={mealImageUrl(meal.id)}
                              alt={meal.name}
                            />
                            {/* Overlay badges */}
                            <div className="absolute top-2 left-2 flex gap-1.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
                                  meal.macros.tempeture === "hot"
                                    ? "bg-orange-500/80 text-white"
                                    : "bg-cyan-500/80 text-white"
                                }`}
                              >
                                {meal.macros.tempeture === "hot"
                                  ? "Hot"
                                  : "Cold"}
                              </span>
                              {meal.preferences.map((pref) => (
                                <span
                                  key={pref}
                                  className="rounded-md bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-gray-200"
                                >
                                  {pref}
                                </span>
                              ))}
                            </div>
                            {qty > 1 && (
                              <span className="absolute top-2 right-2 rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-lg">
                                x{qty}
                              </span>
                            )}
                          </div>

                          <div className="p-4 flex flex-col flex-1">
                            {/* Meal Name */}
                            <h4 className="text-sm font-medium text-white leading-snug">
                              {meal.name}
                            </h4>

                            <div className="mt-auto pt-3">
                              {/* Rating */}
                              <div className="flex items-center gap-0.5 mb-2">
                                {Array.from({ length: 5 }, (_, i) => {
                                  const r = mealRatings[meal.id] || 0;
                                  const filled = i < r;
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => handleRate(meal.id, i + 1, meal.name)}
                                      className="p-0 transition-transform hover:scale-125"
                                    >
                                      <svg
                                        className={`h-3.5 w-3.5 ${
                                          filled ? "text-yellow-400" : "text-gray-700"
                                        }`}
                                        fill={filled ? "currentColor" : "none"}
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
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Macros Bar */}
                              <div className="grid grid-cols-4 gap-2 rounded-lg bg-gray-800/50 p-2.5">
                                <div className="text-center">
                                  <div className="text-xs font-bold text-white">
                                    {macros.cal}
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    cal
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs font-bold text-blue-400">
                                    {macros.pro}g
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    protein
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs font-bold text-amber-400">
                                    {macros.carbs}g
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    carbs
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs font-bold text-rose-400">
                                    {macros.fat}g
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    fat
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : selectedDaySchedule.status === "future_selection" ? (
                  <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
                    <p className="text-gray-400">
                      Meals not yet selected for this day
                    </p>
                    <p className="text-sm text-gray-600 mt-1 mb-4">
                      {selectedDaySchedule.quantity} meals available to pick
                    </p>
                    <button
                      onClick={() => setEditingDate(selectedDate)}
                      className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
                    >
                      Choose Meals
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
                    <p className="text-gray-500">No meal data available</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Meal Edit Drawer */}
      {editingDate && scheduleByDate[editingDate] && (
        <MealEditDrawer
          open={!!editingDate}
          onClose={() => setEditingDate(null)}
          date={editingDate}
          schedule={scheduleByDate[editingDate]}
          currentMeals={mealsByDate[editingDate] || []}
          preloadedMenu={menusByDate[editingDate]}
          onSaved={() => {
            setEditingDate(null);
            prefetchedWeeks.current.delete(formatDate(weekStart));
            fetchWeek();
          }}
        />
      )}
    </div>
  );
}
