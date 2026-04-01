export interface ScheduleDay {
  day: string;
  delivery: boolean;
  status: "delivered" | "user_selected" | "future_selection" | "stopped" | string;
  term: number;
  main_product: number;
  main_product_name: string;
  details: string;
  quantity: number;
  temp?: boolean;
  others: {
    term: number;
    product_id: number;
    product_name: string;
    quantity: number;
    selectable: boolean;
  }[];
}

export interface MealMacros {
  id: number;
  meal_id: number;
  tempeture: "hot" | "cold";
  // Women's
  w_cal: number;
  w_pro: number;
  w_carbs: number;
  w_fat: number;
  // Regular (Men's)
  m_cal: number;
  m_pro: number;
  m_carbs: number;
  m_fat: number;
  // Athlete
  a_cal: number;
  a_pro: number;
  a_carbs: number;
  a_fat: number;
}

export interface MealSelection {
  id: number;
  name: string;
  selection_type: string; // "meal_1", "meal_2", etc.
  selected_by: "user" | "system" | string;
  product_id: number;
  product_sku: string;
  portion_id: number; // 1=Women's, 2=Regular, 3=Athlete
  meal_type: number;
  macros: MealMacros;
  review: unknown;
  meal_selection_id: number;
  preferences: string[];
}

export interface MenuItem {
  id: number;
  name: string;
  image_url: string | null;
  description: string;
  description2: string;
  product_id: number;
  meal_type_id: number; // 1=breakfast, 2=lunch, 3=dinner
  preference_name: string;
  state: string;
  show_image: boolean;
  tags: string[];
  macros: MealMacros;
  ingredients: number[];
}

export interface MealSubmission {
  id: number;
  image_url: string | null;
  product_id: number;
  meal_type_id: number;
  preference_name: string;
  menuName: string;
  portion_id: number;
  selectionCount: number;
  originalSelectionCount: number;
  athlete: number;
  men: number;
  women: number;
  show_image: boolean;
  visible: boolean;
}

export function menuItemToSubmission(
  item: MenuItem,
  portionId: number,
  selectionCount: number,
  originalSelectionCount: number
): MealSubmission {
  return {
    id: item.id,
    image_url: item.image_url,
    product_id: item.product_id,
    meal_type_id: item.meal_type_id,
    preference_name: item.preference_name,
    menuName: item.name,
    portion_id: portionId,
    selectionCount,
    originalSelectionCount,
    athlete: portionId === 3 ? 1 : 0,
    men: portionId === 2 ? 1 : 0,
    women: portionId === 1 ? 1 : 0,
    show_image: item.show_image,
    visible: true,
  };
}

export type PortionSize = "w" | "m" | "a";

export function getMacrosForPortion(macros: MealMacros, portionId: number) {
  // 1=Women's, 2=Regular, 3=Athlete
  const prefix: PortionSize = portionId === 3 ? "a" : portionId === 2 ? "m" : "w";
  return {
    cal: macros[`${prefix}_cal`],
    pro: macros[`${prefix}_pro`],
    carbs: macros[`${prefix}_carbs`],
    fat: macros[`${prefix}_fat`],
  };
}
