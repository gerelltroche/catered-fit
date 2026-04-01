import type { ScheduleDay, MealSelection, MenuItem, MealSubmission } from "./types";

const API_BASE = "https://phoenix.cateredfit.com";
const APP_VERSION = 6;

export interface AuthResponse {
  token: string;
}

export interface AuthError {
  error: string;
}

export interface UserInfo {
  id: number;
  portionId: number;
}

export class ApiClient {
  token: string | null = null;
  userInfo: UserInfo | null = null;

  constructor(token?: string) {
    this.token = token ?? null;
  }

  private refreshPromise: Promise<boolean> | null = null;
  private loggedCacheEndpoints = new Set<string>();

  private logCacheHeaders(path: string, res: Response) {
    const pattern = path
      .replace(/\/\d{4}-\d{2}-\d{2}/g, "/{date}")
      .replace(/\/\d+/g, "/{id}");
    if (this.loggedCacheEndpoints.has(pattern)) return;
    this.loggedCacheEndpoints.add(pattern);

    const headers: Record<string, string> = {};
    for (const key of [
      "cache-control",
      "etag",
      "last-modified",
      "expires",
      "vary",
      "age",
      "pragma",
    ]) {
      const val = res.headers.get(key);
      if (val) headers[key] = val;
    }
    console.log(
      `[Cache] ${pattern}:`,
      Object.keys(headers).length > 0
        ? headers
        : "No cache headers found"
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && this.token) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.token}`;
        const retry = await fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retry.ok) {
          throw new Error(`API error: ${retry.status}`);
        }
        this.logCacheHeaders(path, retry);
        return retry.json();
      }
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as AuthError).error || `API error: ${res.status}`
      );
    }

    this.logCacheHeaders(path, res);
    return res.json();
  }

  async login(email: string, password: string): Promise<string> {
    const data = await this.request<AuthResponse>(
      "POST",
      "/member/authenticate",
      { email, password, version: APP_VERSION }
    );
    this.token = data.token;
    return data.token;
  }

  private async refreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/member/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.token) {
        this.token = data.token;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getUser() {
    const data = await this.request<{ user: Record<string, unknown> }>("GET", "/member/user");
    const user = data.user;
    const profile = user.profile as Record<string, unknown> | undefined;
    this.userInfo = {
      id: user.id as number,
      portionId: (profile?.portion_id as number) ?? 1,
    };
    return data;
  }

  async getUserDetails() {
    return this.request("GET", "/member/user_details");
  }

  async getSchedule(start: string, end: string) {
    return this.request<ScheduleDay[]>("GET", `/member/schedule/${start}/${end}`);
  }

  async getMealSelection(date: string) {
    return this.request<MealSelection[]>("GET", `/member/meal_selection/${date}?version=2`);
  }

  async getMenu(date: string, productId: number, userId: number) {
    return this.request<MenuItem[]>("POST", "/member/getMenu", {
      date,
      product_id: productId,
      user_id: userId,
      version: 2,
    });
  }

  async selectMeals(
    productId: number,
    date: string,
    meals: MealSubmission[],
    isAdditional = false
  ) {
    return this.request("POST", "/member/select_meals", {
      product_id: productId,
      date,
      meals,
      is_additional_meal: isAdditional,
    });
  }

  async stopDay(date: string) {
    return this.request("POST", "/member/stop_day", { date });
  }

  async addDay(date: string) {
    return this.request("POST", "/member/add_day", { date });
  }

  async getOrders() {
    return this.request("GET", "/member/orders");
  }

  async getPaymentMethod() {
    return this.request("GET", "/member/payment_method");
  }

  async getCfBucks() {
    return this.request("GET", "/member/getCfBucks");
  }
}
