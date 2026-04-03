"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  startOfWeek,
  addDays,
  formatDate,
} from "@/lib/dates";
import type { MealSelection, MealMacros } from "@/lib/types";
import { getMacrosForPortion } from "@/lib/types";
import { getRatings, setRating } from "@/lib/ratings";

const IMAGE_CDN = "https://cateredfit-images.s3.amazonaws.com";

function mealImageUrl(mealId: number): string {
  return `${IMAGE_CDN}/meal-${mealId}.png`;
}

const MEAL_TYPE_LABELS: Record<number, string> = {
  1: "Breakfast",
  2: "Lunch",
  3: "Dinner",
};

interface DeliveredMeal {
  id: number;
  name: string;
  mealType: number;
  portionId: number;
  macros: MealMacros;
  preferences: string[];
  lastDelivered: string;
}

const REACTIONS: Record<number, string[]> = {
  1: ["Yikes, noted!", "We'll steer clear of that one.", "Sorry about that one!"],
  2: ["Not your fave, got it.", "Meh, fair enough.", "We can do better!"],
  3: ["Middle of the road!", "Solid, not spectacular.", "A decent pick."],
  4: ["Nice, you liked it!", "A tasty choice!", "Good stuff!"],
  5: ["An absolute banger!", "Chef's kiss!", "Top tier meal!"],
};

function getReaction(rating: number): string {
  const options = REACTIONS[rating] || REACTIONS[3];
  return options[Math.floor(Math.random() * options.length)];
}

function MealImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-800 text-xs font-black text-gray-600">
        ?
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function PeekCard({ meal }: { meal: DeliveredMeal }) {
  const macros = getMacrosForPortion(meal.macros, meal.portionId);
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden shadow-lg w-full">
      <div className="relative aspect-square bg-gray-800 overflow-hidden">
        <MealImage src={mealImageUrl(meal.id)} alt={meal.name} />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-sm ${
              meal.macros.tempeture === "hot"
                ? "bg-orange-500/80 text-white"
                : "bg-cyan-500/80 text-white"
            }`}
          >
            {meal.macros.tempeture === "hot" ? "Hot" : "Cold"}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-[11px] font-medium text-gray-400 leading-snug line-clamp-2 mb-2">
          {meal.name}
        </p>
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-gray-500">{macros.cal} cal</span>
          <span className="text-blue-400/60">{macros.pro}P</span>
          <span className="text-amber-400/60">{macros.carbs}C</span>
          <span className="text-rose-400/60">{macros.fat}F</span>
        </div>
      </div>
    </div>
  );
}

export default function RatePage() {
  const { isLoggedIn, isLoading, api } = useAuth();
  const router = useRouter();
  const [meals, setMeals] = useState<DeliveredMeal[]>([]);
  const [ratedIds, setRatedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [animState, setAnimState] = useState<"idle" | "flyout" | "message" | "entering">("idle");
  const [exitDirection, setExitDirection] = useState<"left" | "right">("left");
  const [totalRated, setTotalRated] = useState(0);
  const [enterKey, setEnterKey] = useState(0);
  const reactionTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.push("/login");
  }, [isLoading, isLoggedIn, router]);

  const loadDeliveredMeals = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);

    try {
      const today = new Date();
      const fourWeeksAgo = addDays(startOfWeek(today), -28);
      const start = formatDate(fourWeeksAgo);
      const end = formatDate(today);

      const schedule = await api.getSchedule(start, end);
      const deliveredDays = schedule.filter(
        (d) => d.delivery && d.status === "delivered"
      );

      const allMeals: MealSelection[] = [];
      await Promise.all(
        deliveredDays.map(async (day) => {
          try {
            const dayMeals = await api.getMealSelection(day.day);
            if (Array.isArray(dayMeals)) {
              for (const m of dayMeals) {
                (m as MealSelection & { _day: string })._day = day.day;
              }
              allMeals.push(...dayMeals);
            }
          } catch {
            // Some days might not have data
          }
        })
      );

      const mealMap = new Map<number, DeliveredMeal>();
      for (const m of allMeals) {
        const day = (m as MealSelection & { _day: string })._day;
        const existing = mealMap.get(m.id);
        if (!existing || day > existing.lastDelivered) {
          mealMap.set(m.id, {
            id: m.id,
            name: m.name,
            mealType: m.meal_type,
            portionId: m.portion_id,
            macros: m.macros,
            preferences: m.preferences,
            lastDelivered: day,
          });
        }
      }

      const stored = getRatings();
      const alreadyRated = new Set<number>();
      for (const key of Object.keys(stored)) {
        alreadyRated.add(Number(key));
      }
      setRatedIds(alreadyRated);
      setTotalRated(alreadyRated.size);

      const allDelivered = Array.from(mealMap.values());
      const unrated = allDelivered
        .filter((m) => !alreadyRated.has(m.id))
        .sort((a, b) => b.lastDelivered.localeCompare(a.lastDelivered));
      const rated = allDelivered
        .filter((m) => alreadyRated.has(m.id))
        .sort((a, b) => b.lastDelivered.localeCompare(a.lastDelivered));

      setMeals([...unrated, ...rated]);
    } catch (err) {
      console.error("Failed to load delivered meals:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, api]);

  useEffect(() => {
    loadDeliveredMeals();
  }, [loadDeliveredMeals]);

  useEffect(() => {
    return () => {
      if (reactionTimeout.current) clearTimeout(reactionTimeout.current);
    };
  }, []);

  const unratedMeals = meals.filter((m) => !ratedIds.has(m.id));
  const currentMeal = unratedMeals[0];
  const peekLeft = unratedMeals[1] ?? null;
  const peekRight = unratedMeals[2] ?? null;

  const handleRate = useCallback(
    (rating: number) => {
      if (!currentMeal || animState !== "idle") return;

      setSelectedRating(rating);
      setRating(currentMeal.id, rating, currentMeal.name);
      setReaction(getReaction(rating));

      // Phase 1: Card flies out (350ms)
      setAnimState("flyout");

      reactionTimeout.current = setTimeout(() => {
        // Phase 2: Reaction message shows (1400ms to read)
        setAnimState("message");

        reactionTimeout.current = setTimeout(() => {
          // Phase 3: Data shifts, new card enters (450ms)
          setRatedIds((prev) => new Set(prev).add(currentMeal.id));
          setTotalRated((prev) => prev + 1);
          setSelectedRating(0);
          setHoverStar(0);
          setReaction(null);
          setAnimState("entering");
          setEnterKey((prev) => prev + 1);

          reactionTimeout.current = setTimeout(() => {
            setAnimState("idle");
            setExitDirection((prev) => (prev === "left" ? "right" : "left"));
          }, 450);
        }, 1400);
      }, 350);
    },
    [currentMeal, animState]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  const allDone = !loading && meals.length > 0 && unratedMeals.length === 0;
  const macros = currentMeal
    ? getMacrosForPortion(currentMeal.macros, currentMeal.portionId)
    : null;

  // Flyout direction = where the card exits; enter = opposite side
  const flyoutDir = exitDirection;
  const enterDir = exitDirection === "left" ? "right" : "left";

  function getMainCardStyle(): React.CSSProperties {
    if (animState === "flyout") {
      return { animation: `flyout-${flyoutDir} 350ms cubic-bezier(0.55, 0, 1, 0.45) forwards` };
    }
    if (animState === "message") {
      return { opacity: 0, visibility: "hidden" };
    }
    if (animState === "entering") {
      return { animation: `enter-from-${enterDir} 450ms cubic-bezier(0.16, 1, 0.3, 1) forwards` };
    }
    return {};
  }

  function getPeekStyle(side: "left" | "right"): React.CSSProperties {
    const rotate = side === "left" ? "-3deg" : "3deg";
    if (animState === "flyout") {
      return { opacity: 0, transform: `rotate(${rotate})`, transition: "opacity 300ms ease-out" };
    }
    if (animState === "message") {
      return { opacity: 0, transform: `rotate(${rotate})` };
    }
    if (animState === "entering") {
      // Stagger: peek on same side as entering card comes in later
      const delay = side === enterDir ? "150ms" : "75ms";
      return { animation: `peek-in-${side} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${delay} both` };
    }
    return { opacity: 0.4, transform: `rotate(${rotate})`, transition: "opacity 300ms" };
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/schedule")}
              className="rounded-lg p-2 -ml-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">Rate Your Meals</h1>
          </div>
          <div className="text-sm text-gray-400">
            {totalRated} / {meals.length} rated
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {meals.length > 0 && (
        <div className="h-1 bg-gray-900">
          <div
            className="h-full bg-green-500 transition-all duration-500 ease-out"
            style={{ width: `${(totalRated / meals.length) * 100}%` }}
          />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
        {loading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
        ) : meals.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center max-w-md">
            <p className="text-gray-400">No delivered meals found</p>
            <p className="text-sm text-gray-600 mt-1">
              Meals from the past 4 weeks will appear here after delivery
            </p>
          </div>
        ) : allDone ? (
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">
              {totalRated >= 10 ? "🏆" : "🎉"}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              All caught up!
            </h2>
            <p className="text-gray-400 mb-6">
              You&apos;ve rated all {totalRated} meals. Your ratings will help you
              pick favorites when choosing future meals.
            </p>
            <button
              onClick={() => router.push("/schedule")}
              className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
            >
              Back to Schedule
            </button>
          </div>
        ) : currentMeal && macros ? (
          <div className="w-full max-w-lg">
            {/* Remaining count */}
            <p className="text-center text-sm text-gray-500 mb-6">
              {unratedMeals.length} meal{unratedMeals.length !== 1 ? "s" : ""} left to rate
            </p>

            {/* Keyframe animations */}
            <style>{`
              @keyframes flyout-left {
                0% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
                100% { transform: translateX(-150%) rotate(-15deg) scale(0.8); opacity: 0; }
              }
              @keyframes flyout-right {
                0% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
                100% { transform: translateX(150%) rotate(15deg) scale(0.8); opacity: 0; }
              }
              @keyframes enter-from-left {
                0% { transform: translateX(-70%) rotate(-4deg) scale(0.75); opacity: 0; }
                35% { opacity: 1; }
                100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
              }
              @keyframes enter-from-right {
                0% { transform: translateX(70%) rotate(4deg) scale(0.75); opacity: 0; }
                35% { opacity: 1; }
                100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
              }
              @keyframes peek-in-left {
                0% { transform: translateX(-120%) rotate(-6deg) scale(0.8); opacity: 0; }
                100% { transform: translateX(0) rotate(-3deg) scale(1); opacity: 0.4; }
              }
              @keyframes peek-in-right {
                0% { transform: translateX(120%) rotate(6deg) scale(0.8); opacity: 0; }
                100% { transform: translateX(0) rotate(3deg) scale(1); opacity: 0.4; }
              }
              @keyframes reaction-pop {
                0% { opacity: 0; transform: scale(0.7) translateY(12px); }
                50% { transform: scale(1.05) translateY(-2px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>

            {/* Card stack */}
            <div className="relative flex items-start justify-center">
              {/* Left peek card */}
              <div
                key={`peek-l-${enterKey}`}
                className="absolute left-0 top-6 w-[30%] pointer-events-none"
                style={getPeekStyle("left")}
              >
                {peekLeft ? (
                  <PeekCard meal={peekLeft} />
                ) : (
                  <div className="rounded-2xl border border-gray-800/50 bg-gray-900/50 aspect-[3/4]" />
                )}
              </div>

              {/* Right peek card */}
              <div
                key={`peek-r-${enterKey}`}
                className="absolute right-0 top-6 w-[30%] pointer-events-none"
                style={getPeekStyle("right")}
              >
                {peekRight ? (
                  <PeekCard meal={peekRight} />
                ) : (
                  <div className="rounded-2xl border border-gray-800/50 bg-gray-900/50 aspect-[3/4]" />
                )}
              </div>

              {/* Reaction message overlay */}
              {animState === "message" && reaction && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <p
                    className={`text-2xl font-bold drop-shadow-lg ${
                      selectedRating >= 4
                        ? "text-green-400"
                        : selectedRating >= 3
                          ? "text-yellow-400"
                          : "text-orange-400"
                    }`}
                    style={{ animation: "reaction-pop 450ms cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
                  >
                    {reaction}
                  </p>
                </div>
              )}

              {/* Main card */}
              <div
                key={enterKey}
                className="relative z-10 w-[70%]"
                style={getMainCardStyle()}
              >
                <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden shadow-2xl shadow-black/50">
                  {/* Image */}
                  <div className="relative aspect-square bg-gray-800 overflow-hidden">
                    <MealImage
                      src={mealImageUrl(currentMeal.id)}
                      alt={currentMeal.name}
                    />
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-xs font-semibold backdrop-blur-sm ${
                          currentMeal.macros.tempeture === "hot"
                            ? "bg-orange-500/80 text-white"
                            : "bg-cyan-500/80 text-white"
                        }`}
                      >
                        {currentMeal.macros.tempeture === "hot" ? "Hot" : "Cold"}
                      </span>
                      {currentMeal.preferences.map((pref) => (
                        <span
                          key={pref}
                          className="rounded-lg bg-black/60 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-gray-200"
                        >
                          {pref}
                        </span>
                      ))}
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="rounded-lg bg-black/60 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-gray-300">
                        {MEAL_TYPE_LABELS[currentMeal.mealType] || "Meal"}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h2 className="text-base font-semibold text-white leading-snug mb-1">
                      {currentMeal.name}
                    </h2>

                    <p className="text-xs text-gray-500 mb-3">
                      Delivered{" "}
                      {new Date(
                        currentMeal.lastDelivered + "T12:00:00"
                      ).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>

                    <div className="grid grid-cols-4 gap-2 rounded-lg bg-gray-800/50 p-2.5 mb-5">
                      <div className="text-center">
                        <div className="text-sm font-bold text-white">{macros.cal}</div>
                        <div className="text-[10px] text-gray-500">cal</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-blue-400">{macros.pro}g</div>
                        <div className="text-[10px] text-gray-500">protein</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-amber-400">{macros.carbs}g</div>
                        <div className="text-[10px] text-gray-500">carbs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-rose-400">{macros.fat}g</div>
                        <div className="text-[10px] text-gray-500">fat</div>
                      </div>
                    </div>

                    <p className="text-center text-sm text-gray-400 mb-3">
                      How was this one?
                    </p>

                    {/* Stars */}
                    <div
                      className="flex justify-center gap-1.5"
                      onMouseLeave={() => setHoverStar(0)}
                    >
                      {[1, 2, 3, 4, 5].map((star) => {
                        const filled = star <= (hoverStar || selectedRating);
                        return (
                          <button
                            key={star}
                            onClick={() => handleRate(star)}
                            onMouseEnter={() =>
                              animState === "idle" ? setHoverStar(star) : undefined
                            }
                            disabled={animState !== "idle"}
                            className="p-1 transition-transform hover:scale-125 disabled:cursor-default"
                          >
                            <svg
                              className={`h-9 w-9 transition-colors ${
                                filled ? "text-yellow-400" : "text-gray-600"
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

                    {/* Spacer for consistent card height */}
                    <div className="h-8 mt-3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Skip button - fixed height container to prevent layout shift */}
            <div className="h-10 flex items-center justify-center mt-4">
              <button
                onClick={() => {
                  if (animState !== "idle" || !currentMeal) return;
                  setMeals((prev) => {
                    const idx = prev.findIndex((m) => m.id === currentMeal.id);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    const [skipped] = next.splice(idx, 1);
                    next.push(skipped);
                    return next;
                  });
                }}
                className={`text-sm text-gray-500 hover:text-gray-300 transition-colors ${
                  animState !== "idle" ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
              >
                Skip for now
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
