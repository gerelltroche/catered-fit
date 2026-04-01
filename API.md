# Catered Fit API Documentation

Reverse-engineered from the member portal at `https://member.cateredfit.com/`.

## Overview

| Detail | Value |
|---|---|
| **API Base URL** | `https://phoenix.cateredfit.com` |
| **Backend** | Laravel (PHP) behind Cloudflare |
| **Auth** | JWT Bearer tokens (`tymon/jwt-auth`) |
| **CORS** | `access-control-allow-origin: *` (fully open) |
| **Image CDN** | `https://cateredfit-images.s3.amazonaws.com/` |
| **App Version** | `6` (sent as `version` param during login) |

### Other Environments

| Environment | API URL | Site URL |
|---|---|---|
| Staging | `https://cutoff.on-forge.com` | `https://azkaban.cateredfit.com` |
| Dev | `http://phoenix.test` | `http://azkaban.test` |

---

## Authentication

### Login

```
POST /member/authenticate
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "version": 6
}
```

**Success Response:**
```json
{ "token": "<JWT_TOKEN>" }
```

**Error Response:**
```json
{ "error": "Email or Password Incorrect" }
```

The token is then sent on all subsequent requests:
```
Authorization: Bearer <JWT_TOKEN>
```

### Token Refresh

When a `401` is received, the token can be refreshed:

```
POST /member/refresh
Authorization: Bearer <CURRENT_TOKEN>
```

Returns a new token in the response body.

> **Note:** The original app has a bug sending `"Beared "` instead of `"Bearer "` on the refresh call. Use `"Bearer "` correctly.

### Token Errors

A `400` response containing `"token_invalid"` or `"token_not_provided"` means the session is dead — re-authenticate.

### Logout

Client-side only. Clear `token`, `token_date`, `order`, and `user` from storage.

### Password Reset

```
POST /member/forgot_password
{ "email": "user@example.com" }

GET  /member/forgot_password_token_validate/<token>

POST /member/reset_password
{ "password": "newpass", "email": "user@example.com", "token": "<reset_token>" }
```

---

## Endpoints

### User & Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/user` | Get current user info |
| GET | `/member/user_details` | Get detailed user info |
| GET | `/member/profiles` | Get user profiles |
| POST | `/member/changePassword` | Change password |
| POST | `/member/changeAddress` | Change delivery address |
| GET | `/member/getRequestChangeAddress/<id>` | Load address change request |
| GET | `/member/getStates` | Get US states list |
| POST | `/member/communicationStatus` | Change communication preferences |
| POST | `/member/changeAutoRenew` | Toggle auto-renew |

### Schedule & Meals

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/schedule/<start>/<end>` | Get meal schedule for date range |
| GET | `/member/meal_day/<date>` | Check a specific meal day |
| GET | `/member/meal_selection/<date>?version=2` | Get meal selections for a date |
| POST | `/member/getMenu` | Get menu. Body: `{date, product_id, user_id, version: 2}` |
| POST | `/member/select_meals` | Select meals. Body: `{product_id, date, meals, is_additional_meal}` |
| POST | `/member/meals/delete` | Remove a meal. Body: `{user, date, meal_id, portion_id, quantity, is_additional_meal}` |
| POST | `/member/meals/delete_multi` | Remove meals by portion. Body: `{user, date, meal_id, portions, is_additional_meal}` |
| POST | `/member/stop_day` | Cancel a delivery day. Body: `{date}` |
| POST | `/member/add_day` | Add a delivery day. Body: `{date}` |
| GET | `/member/skip_week` | Get vacation/skip days |
| POST | `/member/skip_week` | Skip a week |

### Orders & Products

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/orders` | Get order history |
| GET | `/order/products_available` | Get available products/plans **(no auth)** |
| GET | `/order/ingredients_available` | Get available ingredients |
| GET | `/order/settings` | Get order settings (portions, referrals) **(no auth)** |
| GET | `/order/preferences_available` | Get available preferences |
| POST | `/order/complete` | Process/complete an order |
| POST | `/order/contact` | Submit contact form |
| GET | `/order/get_promo_info/<code>/<product>` | Get promo code info |
| POST | `/order/getShippingMeals` | Get shipping meal options |
| GET | `/order/getDeliveryFeeShipping/<id>` | Get shipping delivery fee |

### Payment

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/payment_method` | Get default payment method |
| GET | `/member/getAllPaymentMethods` | Get all payment methods |
| POST | `/member/makeDefaultPayment` | Set default payment method |
| POST | `/member/addPayment` | Add payment method |
| POST | `/member/deletePayment` | Delete payment method |

### Exclusions & Ingredients

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/view_exclusions` | View current exclusions |
| GET | `/member/check_exclusion/<id>` | Check specific exclusion |
| POST | `/member/exclusionAddRemove` | Add/remove exclusion. Body: `{action, ingredient_id}` |
| GET | `/member/getAllIngredients` | Get all ingredients |
| GET | `/member/needsBag` | Check if bag needed |

### Rewards & Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/member/getCfBucks` | Get CF Bucks balance |
| POST | `/member/getRewardsInformation` | Get rewards info |
| POST | `/member/reviewMeal` | Submit meal review |
| GET | `/member/getusernotification/<id>` | Get user notifications |
| GET | `/member/getSurveyCancellation` | Get cancellation survey |
| POST | `/member/saveSurveyCancellation` | Save cancellation survey |

---

## Original App Tech Stack (for reference)

The existing member portal is built with:

- **Vue.js 2.x** (v2.6.12 / 2.7.14) + **Framework7** v3.6.2
- **Vuex** (modules: `auth`, `user`, `schedule`, `notifications`)
- **Axios** v0.21.4 for HTTP
- **Cordova** wrapper for native iOS/Android
- **OneSignal** push notifications (app ID: `c9035d9d-cf32-4377-93a1-2fedaf279f52`)
- Single 4.4MB JS bundle
- Hash-based routing (`#!/`)

---

## LocalStorage Keys (original app)

| Key | Description |
|---|---|
| `token` | JWT auth token |
| `token_date` | When token was last set/refreshed |
| `user` | JSON with email |
| `userInfo` / `lastUserInfo` | Cached user info |
| `order` / `current_order` | Current order data |
| `products` | Cached products |
| `ingredients` | Cached ingredients |
| `orderTime` | Order timestamp |
| `userNotifications` | Cached notifications |
