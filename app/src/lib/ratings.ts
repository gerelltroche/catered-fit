export interface MealRating {
  mealId: number;
  rating: number; // 1-5
  mealName: string;
  ratedAt: string; // ISO date
}

const STORAGE_KEY = "cf_meal_ratings";

function readStore(): Record<number, MealRating> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<number, MealRating>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getRatings(): Record<number, MealRating> {
  return readStore();
}

export function getRating(mealId: number): number | null {
  const store = readStore();
  return store[mealId]?.rating ?? null;
}

export function setRating(mealId: number, rating: number, mealName: string) {
  const store = readStore();
  store[mealId] = {
    mealId,
    rating,
    mealName,
    ratedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function removeRating(mealId: number) {
  const store = readStore();
  delete store[mealId];
  writeStore(store);
}
