# Funtico Phaser SDK - Usage Guide

Complete reference for every public method and type in the Funtico Phaser SDK.

For installation and a quick-start integration walkthrough, see [README.md](./README.md).

## Table of Contents

1. [Initialization & Authentication](#initialization--authentication)
2. [User Data Methods](#user-data-methods)
3. [Rooms & Tournament Methods](#rooms--tournament-methods)
4. [Special Tournaments Methods](#special-tournaments-methods)
5. [Hall of Fame Methods](#hall-of-fame-methods)
6. [Campaign Methods](#campaign-methods)
7. [Inventory Methods](#inventory-methods)
8. [Client Session Methods (Reconnection)](#client-session-methods-reconnection)
9. [Phaser Plugin Integration](#phaser-plugin-integration)
10. [Utilities & Types](#utilities--types)

---

## Initialization & Authentication

Every SDK call is made through a single shared `FunticoSDK` instance. A game boots by obtaining that instance (directly, or through the Phaser plugin's `this.funtico.sdk` mapping), calling `Initialize` once with its game keys, and letting the SDK exchange the player's platform token for a JWT that authorises every subsequent request.

---

### `FunticoConfig`

The configuration object passed to `Initialize`. It carries the environment selection, the two game keys issued by the Funtico Developer Portal, and optional overrides for the API endpoint and cache lifetime.

**Definition:**
```typescript
export interface FunticoConfig {
  env: FunticoEnvironment;
  privateGameKey: string;     // Secret key (obtained from dashboard)
  publicGameKey: string;      // X-User-Key (public key)
  userToken?: string;          // Initial user platform token
  apiBaseUrl?: string;         // Custom URL for your game's API
  funticoApiBaseUrl?: string;  // Custom URL for the Funtico platform API
  cacheTTL?: number;           // Cache lifetime in milliseconds (default: 30000ms)
}
```

**FunticoConfig Properties:**
- `env` (`FunticoEnvironment`) - Which Funtico backend the SDK talks to. Selects the default API base URL (see the `FunticoEnvironment` block below). Ignored for URL resolution when `apiBaseUrl` is supplied, but still stored on the config.
- `privateGameKey` (`string`) - Your game's secret key from the Funtico Developer Portal. Used to sign and encrypt payloads. Never ship it in a public client build. Pass the secret key alone — never concatenated with the public key; `Initialize` rejects that (see [`Initialize`](#initialize) → **Throws**).
- `publicGameKey` (`string`) - Your game's public key from the Funtico Developer Portal, sent with every request.
- `userToken` (`string`, optional) - The player's platform token issued by the Funtico platform (in a web/Telegram Mini App build this usually arrives as a query parameter). When present, `Initialize` authenticates with it automatically and pre-warms the caches. When omitted, `Initialize` only resolves the base URL and you must call `Authentication` yourself before any authenticated method.
- `apiBaseUrl` (`string`, optional) - Explicit base URL for the API gateway, without a trailing slash. When set, it **completely overrides** the environment-derived URL: `env` no longer decides where requests go. Use it to point the SDK at your own gateway, a regional deployment, or a local backend during development. Every SDK request is built as `${apiBaseUrl}/<Area>/<route>`, e.g. `${apiBaseUrl}/Rooms/get-rooms`.
- `funticoApiBaseUrl` (`string`, optional) - Explicit base URL for the Funtico **platform** API, without a trailing slash. This is a **different host** from `apiBaseUrl`: `apiBaseUrl` is your game's Rooms API and takes the game JWT, while this one is the platform itself and takes the player's platform token (`userToken`). `GetLeaderboard` calls it to resolve player names, avatars and borders. Like `apiBaseUrl`, when set it completely overrides the environment-derived URL; otherwise `env` selects it — `staging` → `https://staging.api.funtico.com`, `prod` → `https://api.funtico.com`.
- `cacheTTL` (`number`, optional) - Lifetime in milliseconds of the shared client-side cache backing `GetUserData`, `GetBalance`, `GetVouchers`, `GetCampaignAvailability` and `GetCampaignLevels`. While the cache is fresh, calls made with `useCache = true` return the stored copy with no network round-trip; once the window elapses, the next cached call refetches. Falsy values (including `0`) fall back to the default. Default: `30000` (30 seconds).

**Usage:**
```typescript
import { FunticoEnvironment, FunticoConfig } from './sdk/FunticoPhaserSDK';

const config: FunticoConfig = {
  env: FunticoEnvironment.STAGING,
  publicGameKey: 'your-public-key',
  privateGameKey: 'your-private-key',
  userToken: new URLSearchParams(window.location.search).get('token') ?? undefined,
  cacheTTL: 60000 // keep profile/balance/vouchers warm for a minute
};
```

---

### `FunticoEnvironment`

Selects which Funtico deployment `Initialize` targets when no `apiBaseUrl` override is given.

**Definition:**
```typescript
export enum FunticoEnvironment {
  STAGING = 'staging',
  PROD = 'prod'
}
```

**FunticoEnvironment Properties:**
- `STAGING` (`'staging'`) - Development and QA backend. Resolves to `https://funtico-sdk-staging.azurewebsites.net`. Use it while integrating: test accounts, test balances, and rooms/tournaments configured for QA live here.
- `PROD` (`'prod'`) - Live production backend serving real players. Resolves to `https://funtico-sdk.azurewebsites.net`. Real currency balances, real tickets, and real prize distribution.

**Usage:**
```typescript
import { FunticoEnvironment } from './sdk/FunticoPhaserSDK';

const env = import.meta.env.DEV
  ? FunticoEnvironment.STAGING
  : FunticoEnvironment.PROD;
```

---

### `FunticoSDK.Instance`

Static getter returning the process-wide singleton `FunticoSDK`. The constructor is private, so this is the only way to obtain the SDK directly; the first access lazily creates the instance and every later access returns the same object.

**Signature:**
```typescript
public static get Instance(): FunticoSDK
```

**Returns:** `FunticoSDK` - The shared SDK instance. It holds the configuration, the JWT obtained at authentication, the user/balance/voucher caches, and the active client and server session state — which is exactly why it must be a singleton: a second instance would not see the session your game already started.

**Usage:**
```typescript
import { FunticoSDK } from './sdk/FunticoPhaserSDK';

// Anywhere outside a Phaser Scene (services, stores, network layer)
const sdk = FunticoSDK.Instance;
const user = sdk.GetCachedUserData();

// The Phaser plugin wraps this very same instance:
// this.funtico.sdk === FunticoSDK.Instance
```

---

### `Initialize`

Configures the SDK and, when a `userToken` is supplied, signs the player in and pre-loads their profile, balance and vouchers. Call it once at boot before any other SDK method.

**Signature:**
```typescript
public async Initialize(config: FunticoConfig): Promise<void>
```

**Parameters:**
- `config` - The `FunticoConfig` object described above: environment, game keys, and optional platform token, API URL override and cache TTL.

**Returns:** `Promise<void>` - Resolves once the base URL is resolved and — if `config.userToken` was supplied — authentication has completed and the cache pre-warm has settled.

**What it does, in order:**
1. Validates the game keys in `config` (see **Throws** below). If any check fails, `Initialize` rejects right here: nothing is stored and no request is sent.
2. Stores `config` on the instance, so `publicGameKey`, `privateGameKey` and `cacheTTL` are available to every later call.
3. Resolves the API base URL: `config.apiBaseUrl` if provided, otherwise `https://funtico-sdk-staging.azurewebsites.net` for `FunticoEnvironment.STAGING` or `https://funtico-sdk.azurewebsites.net` for `FunticoEnvironment.PROD`.
4. Resolves the Funtico **platform** base URL separately: `config.funticoApiBaseUrl` if provided, otherwise `https://staging.api.funtico.com` for `STAGING` or `https://api.funtico.com` for `PROD`. This is the host `GetLeaderboard` reads player names and avatars from; it is not the same host as the one in step 3.
5. If `config.userToken` is set, awaits `Authentication(config.userToken)` to exchange the platform token for the game JWT.
6. Warms the caches by awaiting `Promise.allSettled([GetUserData(false), GetBalance(false), GetVouchers(false)])`. All three run concurrently with `useCache = false`, so they hit the network in parallel rather than in sequence. Because it is `allSettled` and not `all`, a failure in any one of the three does **not** reject `Initialize` — the other two still populate their caches, and the failed one simply leaves its cache empty until the next call. `GetCachedUserData()`, `GetCachedBalance()` and `GetCachedVouchers()` return `null` for whatever did not load.

If `config.userToken` is omitted, steps 5 and 6 are skipped entirely: the SDK is configured but unauthenticated, and authenticated methods will throw `"SDK is not authenticated. Call Initialize() or Authentication() first."` until `Authentication` is called. Authentication failure inside step 5 propagates out of `Initialize` as a rejected promise, so wrap the call in `try/catch` (the `FunticoPhaserPlugin.init` wrapper catches it for you and logs to the console).

**Throws:**

`Initialize` checks the game keys before it touches any state and rejects with a plain `Error` whose message starts with `"Invalid FunticoConfig: "` followed by the reason. Because the method is `async`, the error arrives as a rejected promise — catch it with `try/catch` around `await` (or `.catch()`). A call rejected by this validation leaves the SDK exactly as it was: an instance that was already initialized keeps its previous config, JWT and caches, and keeps working.

`Initialize` also rejects when `config.userToken` is supplied and the token exchange in step 5 fails (`Error("Funtico Authentication failed: <body>")`, or a fetch network error such as a `TypeError` when the API host is unreachable). Those failures happen **after** steps 2–4, so the new config and both base URLs are already stored while any previous JWT and caches are kept: the instance is left with the new config and the old token. Call `Initialize` or `Authentication` again before relying on it. Cache warm-up failures (step 6) never reject.

The config is rejected when:
- `config` is missing or not an object.
- `publicGameKey` is missing, not a string, or empty.
- `privateGameKey` is missing, not a string, or empty.
- Either key has leading or trailing whitespace. No issued key has any; it is almost always a stray newline/CR from a `.env` file or a copy-paste. In `privateGameKey` it would silently break every encrypted submission, so trim the value where you read it.
- `privateGameKey` is shorter than 8 characters. Such a key can never work with encrypted submissions.
- `privateGameKey` is identical to `publicGameKey`.
- One key contains the other (`privateGameKey` contains `publicGameKey`, or the reverse). This means the keys were concatenated or pasted into one field — for example `privateGameKey: publicKey + secretKey`. Such a config still signs in, but every encrypted submission is rejected — on `/Rooms/end-room-sp` this surfaces as HTTP 500 `"Padding is invalid and cannot be removed"`, after a whole match has been played. Pass only the secret key from the Developer Portal in `privateGameKey`, and the public key alone in `publicGameKey`.

These are the only checks. There are deliberately no format rules beyond them (no GUID shape, charset or exact-length checks): key formats differ between games, and a check must never reject a key the Developer Portal legitimately issued. The error messages never include the key values themselves — at most their lengths — so they are safe to forward to logs and error trackers.

**Usage:**
```typescript
// BootScene.ts — via the Phaser plugin
import Phaser from 'phaser';
import { FunticoEnvironment } from '../sdk/FunticoPhaserSDK';

export class BootScene extends Phaser.Scene {
  async create() {
    const platformToken = new URLSearchParams(window.location.search).get('token') ?? '';

    await this.funtico.sdk.Initialize({
      env: FunticoEnvironment.STAGING,
      publicGameKey: 'your-public-key',
      privateGameKey: 'your-private-key',
      userToken: platformToken
    });

    // Caches are warm — this is instant, no network call.
    const user = this.funtico.sdk.GetCachedUserData();
    console.log(`Welcome, ${user?.Name} (level ${user?.Level})`);

    this.scene.start('MenuScene');
  }
}
```

```typescript
// Server-side build — no player token, so no automatic authentication
await FunticoSDK.Instance.Initialize({
  env: FunticoEnvironment.PROD,
  publicGameKey: process.env.FUNTICO_PUBLIC_KEY!,
  privateGameKey: process.env.FUNTICO_PRIVATE_KEY!
});
```

---

### `Authentication`

Exchanges a Funtico platform token for the game's JWT and stores it on the SDK for all later authenticated requests. `Initialize` calls this for you when `config.userToken` is set; call it directly to sign in later or to swap in a refreshed platform token.

**Signature:**
```typescript
public async Authentication(platformToken: string): Promise<any>
```

**Parameters:**
- `platformToken` - The player's platform token issued by the Funtico platform. Sent as `{ "Token": platformToken }` in the body of `POST /Auth/funtico-auth`, alongside your `publicGameKey` in the `X-User-Key` header.

**Returns:** `Promise<any>` - The parsed JSON login response from the backend. Its `Token` field is captured internally as the JWT and afterwards returned by `getUserToken()`. Rejects with `Funtico Authentication failed: <body>` if the backend responds with a non-OK status (an invalid or expired platform token, or an unrecognised public key).

**Login response Properties:**
- `Token` (`string`) - The freshly minted game JWT. The SDK stores it and sends it as `Authorization: Bearer <token>` on every authenticated call, so you rarely need to read it off the response — use `getUserToken()` instead.
- `Id` (`number`) - The player's SDK-side identifier. This is the same value as `UserData.UserId`, and the one that `EndRoomSP` expects.
- `PlatformId` (`number`) - The player's Funtico platform identifier. Same value as `UserData.PlatformId`.

A successful `Authentication` also brings the player's game profile up to date with the Funtico platform (TICO balance, display name, country, avatar and ticket counts), and registers a player who has never played your game before.

**Usage:**
```typescript
// Re-authenticate after the host app hands the game a refreshed platform token
try {
  const login = await this.funtico.sdk.Authentication(newPlatformToken);
  console.log(`Signed in as platform user ${login.PlatformId}`);

  // The old caches predate the new session — force a refresh.
  await this.funtico.sdk.GetUserData(false);
  await this.funtico.sdk.GetBalance(false);
} catch (err) {
  console.error('Funtico sign-in failed:', err);
  this.scene.start('ErrorScene');
}
```

---

### `getPlatformToken`

Returns the platform token the SDK was configured with. Useful when your game needs to forward the player's platform identity to your own services.

**Signature:**
```typescript
public getPlatformToken(): string
```

**Returns:** `string` - The value of `FunticoConfig.userToken` supplied to `Initialize`, or an empty string if none was supplied.

**Usage:**
```typescript
const platformToken = this.funtico.sdk.getPlatformToken();

if (!platformToken) {
  console.warn('Running without a platform token — guest mode.');
}
```

---

### `getUserToken`

Returns the game JWT obtained at authentication. Doubles as the "am I signed in?" check, since it is empty until `Authentication` succeeds.

**Signature:**
```typescript
public getUserToken(): string
```

**Returns:** `string` - The JWT captured from the login response, or an empty string if the SDK has not authenticated yet. This is *not* the platform token: it is issued by the game backend, scoped to your game, and is what the SDK puts in the `Authorization: Bearer` header. Pass it to your own backend if that backend needs to validate the same session.

**Usage:**
```typescript
// Gate the menu on a real session
if (!this.funtico.sdk.getUserToken()) {
  this.scene.start('LoginScene');
  return;
}

// The Phaser plugin emits this token on its AUTHENTICATED event
this.game.events.on(FunticoPhaserPlugin.EVENTS.AUTHENTICATED, (jwt: string) => {
  console.log('Funtico session established:', jwt.slice(0, 12) + '…');
});
```

---

## User Data Methods

These methods expose the authenticated player's profile, balance, and vouchers. Most of them read through a shared in-memory cache so that UI code can poll them cheaply without hammering the API; `CanAfford` is the exception and deliberately bypasses it.

**Caching model.** The SDK keeps five separate cache slots (user data, balance, vouchers, campaign availability, campaign levels) and a single shared expiry timestamp, `cacheExpiresAt`. The window length comes from `FunticoConfig.cacheTTL` (milliseconds, default `30000`). The `useCache = true` overload of `GetUserData`, `GetBalance`, `GetVouchers`, `GetCampaignAvailability`, and `GetCampaignLevels` returns the cached value only when that slot has been filled **and** `Date.now()` is still below `cacheExpiresAt`; otherwise it performs a fresh request and refills the slot. Passing `useCache = false` always goes to the network and refreshes that slot.

The expiry timestamp is shared, and **any** of the five re-arms it when it fetches: a refresh of one slot extends the window that the others are checked against (a campaign fetch slides the window for the account slots too, and the reverse). So a slot can outlive its own TTL if a sibling keeps refreshing — e.g. `GetRooms` force-refreshes vouchers on every call, which also slides the window for a `GetUserData` copy that has not been refetched. Treat `cacheTTL` as "how long after the *last fetch of anything* the caches stay valid", not as a per-slot age limit. If you need a guaranteed-fresh value, pass `useCache = false` rather than relying on the window to have lapsed.

`Initialize()` pre-warms the three account slots (user data, balance, vouchers) with `useCache = false` when a `userToken` is supplied in the config, so cached getters are usually populated by the time the first scene runs. The campaign slots are filled on first use.

The `GetCachedX()` variants never touch the network and never inspect the expiry timestamp — they return whatever is currently in the slot, or `null` if nothing has been cached yet.

**EntryFeeType Properties:**
- `IC` (`1`) - In-game currency (Coins). Checked against `BalanceResponse.Coins`.
- `Tico` (`2`) - Premium platform currency (TICO / Diamonds). Checked against `BalanceResponse.Diamonds`.
- `SemifinalsTickets` (`3`) - Semi-final tickets. Checked against `BalanceResponse.SemiFinalTickets`.
- `FinalTickets` (`4`) - Final tickets. Checked against `BalanceResponse.FinalTickets`.
- `Free` (`5`) - Free room. The affordability check short-circuits to `true` for this type without reading any balance field.
- `InventoryItem` (`6`) - Entry requires a special inventory item. Not covered by the balance-based affordability check, which returns `false` for this type.
- `PrivateTickets` (`7`) - Private room tickets. Checked against `BalanceResponse.PrivateTickets`.

**RoomTier Properties:**
- `Contender` (`0`) - Entry-level tier.
- `Challenger` (`1`) - Mid tier.
- `Champion` (`2`) - Top tier.
- `Free` (`3`) - Free-entry tier. Note this is a *tier*, not a fee type: it is unrelated to `EntryFeeType.Free` (`5`), and a room's `IsFree` flag is derived from its ticket rather than from this tier. `EntryFeeUSDT` is `0` for it, since no tier band is defined.

---

### `GetUserData`

Gets the full player profile: display name, identifiers, progression, currency balances, and client preferences. Call this at boot to populate the profile HUD, and again with `useCache = false` whenever the profile may have changed server-side.

**Signature:**
```typescript
public async GetUserData(useCache = true): Promise<UserData>
```

**Parameters:**
- `useCache` - When `true`, returns the cached profile if one exists and the TTL window has not expired. When `false`, always issues a `GET /User/get-full-data` request and refreshes the cache and the shared TTL window. Default: `true`.

**Returns:** `Promise<UserData>` - The player's profile. Rejects if the SDK is not authenticated or the request fails.

**UserData Properties:**
- `Name` (`string`) - Player display name.
- `UserId` (`number`) - The player's SDK-side identifier. This is the value passed as `userId` to `EndRoomSP` and `ResultTournament_Server`.
- `PlatformId` (`number`) - The player's identifier on the Funtico platform. Match leaderboard rows against this value — `LeaderboardItemViewModel.UserId` and `TournamentPlayerViewModel.FunticoId` are platform ids.
- `Level` (`number`) - Current player level.
- `Rating` (`number`) - Current player rating.
- `Experience` (`number`) - Experience points accumulated at the current level.
- `ExperienceToLevel` (`number`) - Experience points needed to reach the next level.
- `Coins` (`number`) - In-game currency (IC) balance.
- `Diamonds` (`number`) - Premium platform currency (TICO) balance.
- `SemiFinalTickets` (`number`) - Number of semi-final tickets held.
- `FinalTickets` (`number`) - Number of final tickets held.
- `PrivateTickets` (`number`) - Number of private-room tickets held.
- `KYCVerified` (`boolean`) - Whether the player has passed platform KYC verification. Gate rooms whose `RequireKyc` is `true` on this flag.
- `SoundsValue` (`number`) - The player's stored sound-effects volume preference.
- `MusicValue` (`number`) - The player's stored music volume preference.

**Usage:**
```typescript
// Force a fresh profile fetch when entering the menu
const user = await this.funtico.sdk.GetUserData(false);

this.nameText.setText(user.Name);
this.levelText.setText(`Level ${user.Level}`);
this.xpBar.setProgress(user.Experience / user.ExperienceToLevel);

if (!user.KYCVerified) {
  this.kycBadge.setVisible(true);
}
```

---

### `GetCachedUserData`

Returns the profile already held in memory, with no network call and no TTL check. Use it in per-frame or per-tick UI code where an `await` would be wasteful.

**Signature:**
```typescript
public GetCachedUserData(): UserData | null
```

**Returns:** `UserData | null` - The cached profile, or `null` if `GetUserData` has never completed successfully in this session (for example when `Initialize()` was called without a `userToken`).

**Usage:**
```typescript
const user = this.funtico.sdk.GetCachedUserData();

if (user) {
  this.coinsText.setText(`${user.Coins}`);
  this.diamondsText.setText(`${user.Diamonds}`);
} else {
  // Nothing cached yet — fall back to an awaited fetch
  await this.funtico.sdk.GetUserData();
}
```

---

### `GetBalance`

Gets the player's spendable currencies and tickets. This is a lighter payload than `GetUserData` — call it after any transaction (joining a paid room, claiming a prize) to refresh the wallet display.

**Signature:**
```typescript
public async GetBalance(useCache = true): Promise<BalanceResponse>
```

**Parameters:**
- `useCache` - When `true`, returns the cached balance if one exists and the shared TTL window has not expired. When `false`, always issues a `GET /User/get-balance` request and refreshes the cached balance. Default: `true`.

**Returns:** `Promise<BalanceResponse>` - The player's current balance across every currency type. Rejects if the SDK is not authenticated or the request fails.

**BalanceResponse Properties:**
- `Coins` (`number`) - In-game currency (IC) balance. Required for `EntryFeeType.IC` rooms.
- `Diamonds` (`number`) - Premium platform currency (TICO) balance. Required for `EntryFeeType.Tico` rooms.
- `SemiFinalTickets` (`number`) - Semi-final tickets held. Required for `EntryFeeType.SemifinalsTickets` entries.
- `FinalTickets` (`number`) - Final tickets held. Required for `EntryFeeType.FinalTickets` entries.
- `PrivateTickets` (`number`) - Private-room tickets held. Required for `EntryFeeType.PrivateTickets` entries.
- `KYCVerified` (`boolean`) - Whether the player has passed platform KYC verification. Gate `RequireKyc` rooms on this flag.

**Usage:**
```typescript
// Refresh the wallet right after a match payout
const balance = await this.funtico.sdk.GetBalance(false);

this.coinsText.setText(`${balance.Coins}`);
this.ticoText.setText(`${balance.Diamonds}`);
this.ticketsText.setText(`${balance.FinalTickets} final / ${balance.SemiFinalTickets} semi`);
```

---

### `GetCachedBalance`

Returns the balance already held in memory, with no network call and no TTL check. Ideal for wallet widgets that redraw often.

**Signature:**
```typescript
public GetCachedBalance(): BalanceResponse | null
```

**Returns:** `BalanceResponse | null` - The cached balance, or `null` if no balance has been fetched yet in this session.

**Usage:**
```typescript
update() {
  const balance = this.funtico.sdk.GetCachedBalance();
  if (!balance) return;

  this.coinsText.setText(`${balance.Coins}`);
  this.ticoText.setText(`${balance.Diamonds}`);
}
```

---

### `GetVouchers`

Gets the vouchers the player owns. Vouchers grant free entry to rooms of a specific tier — pass `useVoucher = true` to `JoinRoom` to spend one.

**Signature:**
```typescript
public async GetVouchers(useCache = true): Promise<VoucherData[]>
```

**Parameters:**
- `useCache` - When `true`, returns the cached voucher list if one exists and the shared TTL window has not expired. When `false`, always issues a `GET /User/vouchers` request and refreshes the cached list. Default: `true`. Note that `GetRooms` and `GetRoom` call this with `false` internally, because joining a room spends a voucher and a stale count would misreport `UserCanJoinWithVoucher`.

**Returns:** `Promise<VoucherData[]>` - One entry per voucher type the player holds. Rejects if the SDK is not authenticated or the request fails. Only vouchers the player actually holds are returned, so a tier they hold none of is absent from the list rather than present with `Count: 0`.

**VoucherData Properties:**
- `ItemId` (`number`) - Platform item identifier for this voucher type.
- `ItemName` (`string`) - Display name of the voucher, e.g. for a rewards popup.
- `ItemImage` (`string`) - URL of the voucher artwork. Load it through Phaser's own loader; the SDK does not fetch images.
- `Tier` (`RoomTier`) - The room tier this voucher is associated with (`Contender`, `Challenger`, `Champion`, or `Free`). Whether a given room will actually accept a voucher is reported by that room's `UserCanJoinWithVoucher` flag.
- `Count` (`number`) - How many redeemable vouchers of this type the player currently holds.
- `PlayCount` (`number`) - Progress toward earning the next voucher of this type — the number of qualifying plays banked so far.
- `PlaysRequiredToActivate` (`number`) - How many qualifying plays are needed to earn one voucher. Render progress as `PlayCount` / `PlaysRequiredToActivate`.

**Usage:**
```typescript
import { RoomTier } from './sdk/FunticoPhaserSDK';

const vouchers = await this.funtico.sdk.GetVouchers();

vouchers.forEach(v => {
  console.log(`${v.ItemName}: ${v.Count} available`);
  console.log(`Next one in ${v.PlaysRequiredToActivate - v.PlayCount} plays`);
});

// Offer a free entry if the player holds a voucher for this room's tier
const championVoucher = vouchers.find(v => v.Tier === RoomTier.Champion && v.Count > 0);
if (championVoucher) {
  this.freeEntryButton.setVisible(true);
}
```

---

### `GetCachedVouchers`

Returns the voucher list already held in memory, with no network call and no TTL check.

**Signature:**
```typescript
public GetCachedVouchers(): VoucherData[] | null
```

**Returns:** `VoucherData[] | null` - The cached voucher list, or `null` if vouchers have never been fetched in this session. Note that `null` means "not cached", which is distinct from an empty array meaning "the player owns no vouchers".

**Usage:**
```typescript
const vouchers = this.funtico.sdk.GetCachedVouchers();

if (vouchers === null) {
  // Never fetched — kick off a load
  await this.funtico.sdk.GetVouchers();
} else if (vouchers.length === 0) {
  this.emptyStateText.setVisible(true);
} else {
  this.renderVoucherList(vouchers);
}
```

---

### `CanAfford`

Checks whether the player can pay a given entry fee, against a freshly fetched balance. Use this immediately before a `JoinRoom` call, where an out-of-date balance would cause a failed join.

**Signature:**
```typescript
public async CanAfford(type: EntryFeeType, amount: number): Promise<boolean>
```

**Parameters:**
- `type` - The currency or ticket type the entry fee is denominated in. See the `EntryFeeType` properties at the top of this section.
- `amount` - The required quantity of that currency or ticket. The check passes when the matching balance field is greater than or equal to this value.

**Returns:** `Promise<boolean>` - `true` if the player can cover the fee. Always `true` for `EntryFeeType.Free`, and always `false` for `EntryFeeType.InventoryItem`, which is not represented in `BalanceResponse`.

**Usage:**
```typescript
import { EntryFeeType } from './sdk/FunticoPhaserSDK';

// This calls GetBalance(false) internally — the balance is never stale
const canAfford = await this.funtico.sdk.CanAfford(EntryFeeType.Tico, room.EntryFee);

if (!canAfford && !room.UserCanJoinWithVoucher) {
  this.showTopUpDialog();
  return;
}

const session = await this.funtico.sdk.JoinRoom(room.Guid);
```

---

### `CanAffordFromCache`

Checks affordability against the cached balance, synchronously. Use it for instant UI feedback — greying out room cards the player cannot enter — and re-verify with `CanAfford` before actually joining.

**Signature:**
```typescript
public CanAffordFromCache(type: EntryFeeType, amount: number): boolean
```

**Parameters:**
- `type` - The currency or ticket type the entry fee is denominated in.
- `amount` - The required quantity of that currency or ticket.

**Returns:** `boolean` - `true` if the cached balance covers the fee. Returns `false` when no balance has been cached yet, so a `false` result may mean "cannot afford" or "balance unknown" — this short-circuit applies before the fee type is examined, so even `EntryFeeType.Free` returns `false` with an empty cache. Once a balance is cached, the result is `true` for `EntryFeeType.Free` and `false` for `EntryFeeType.InventoryItem`.

**Usage:**
```typescript
import { EntryFeeType } from './sdk/FunticoPhaserSDK';

// Synchronous — safe to call while building a list of room cards
rooms.forEach(room => {
  const affordable = this.funtico.sdk.CanAffordFromCache(EntryFeeType.Tico, room.EntryFee);
  const card = this.createRoomCard(room);
  card.setAlpha(affordable || room.UserCanJoinWithVoucher ? 1 : 0.5);
});
```

---

## Rooms & Tournament Methods

Rooms are the core Funtico competitive format: a player pays an entry fee (or spends a voucher), plays a single-player run, and is ranked against everyone else who played the same room. These methods cover the whole lifecycle — browsing tiers and rooms, joining, starting and ending a run, and reading results and history.

The typical singleplayer flow is `GetRooms` → `GetRoom` → `JoinRoom` → *(gameplay)* → `EndRoomSP` → `GetLeaderboard`.

**`JoinRoom` starts the run.** It reserves the seat and starts the session in one call.

### `GetTiers`

Gets all room tiers configured for the game. Call this when building a lobby that groups rooms by tier.

**Signature:**
```typescript
public async GetTiers(): Promise<TierViewModel[]>
```

**Returns:** `Promise<TierViewModel[]>` - The list of tiers, each describing its display name and the entry-fee band that rooms of that tier fall into.

**TierViewModel Properties:**
- `TierName` (`string`) - Display name of the tier as configured on the platform (for example "Contender").
- `Tier` (`RoomTier`) - The tier identifier: `RoomTier.Contender` (0), `RoomTier.Challenger` (1), `RoomTier.Champion` (2), `RoomTier.Free` (3). Use this to match rooms whose `Tier` field equals this value.
- `TierImage` (`string`) - URL of the tier icon. The SDK does not fetch images — pass it to Phaser's own loader.
- `EntryFeeLowerBound` (`number`) - Lowest entry fee any room in this tier may charge. Useful for rendering a "from X" label before rooms are loaded.
- `EntryFeeUpperBound` (`number`) - Highest entry fee any room in this tier may charge.
- `Hidden` (`boolean`) - When `true`, the tier is configured to be hidden from the lobby UI. Skip these when rendering the tier list.

**Usage:**
```typescript
const tiers = await this.funtico.sdk.GetTiers();

tiers
  .filter(tier => !tier.Hidden)
  .forEach(tier => {
    console.log(`${tier.TierName}: ${tier.EntryFeeLowerBound} - ${tier.EntryFeeUpperBound}`);
    // TierImage is a plain URL - queue it on Phaser's loader yourself
    this.load.image(`tier-${tier.Tier}`, tier.TierImage);
  });

this.load.start();
```

---

### `GetRooms`

Gets the list of rooms the player can currently join. This is the main lobby call.

**Signature:**
```typescript
public async GetRooms(roomType: number = 0, limit: number = 10): Promise<RoomViewModel[]>
```

**Parameters:**
- `roomType` - Room type filter sent to the backend as the `roomType` query value: `0` = singleplayer, `1` = multiplayer, `2` = external. Default: `0`.
- `limit` - Maximum number of rooms to return. Default: `10`.

**Returns:** `Promise<RoomViewModel[]>` - The available rooms, including entry requirements, prize pool, and whether this specific player may enter with a voucher.

`GetRooms` joins the room list with the player's vouchers and pre-paid entries, so `UserCanJoinWithVoucher` and `IsPrePaid` are resolved for the authenticated player. The voucher list is always fetched fresh, which also re-arms the shared cache window for the profile and balance slots (see the caching model under [User Data Methods](#user-data-methods)).

The room list is retained internally to serve `GetTierByEventId` without a second round-trip.

**RoomViewModel Properties:**
- `Guid` (`string`) - Unique room identifier. Pass it to `GetRoom` and `JoinRoom`.
- `Name` (`string`) - Room display name.
- `Description` (`string`, optional) - Longer room description configured on the platform, for a detail panel. Absent for a room with no description.
- `HasPassword` (`boolean`, optional) - `true` when the room is password-protected. Absent when the room config does not specify it, so treat a missing value as "unknown", not as `false`.
- `RoomSize` (`number`, optional) - How many players the room seats. Absent when the room config does not specify it. This is the same figure `GetPrizePoolDistribution` divides by for `TicoPerPlayer`.
- `Tier` (`RoomTier`) - Tier this room belongs to: `Contender` (0), `Challenger` (1), `Champion` (2), `Free` (3). A room whose config carries no tier reads as `Contender` here.
- `EntryFee` (`number`) - Entry fee amount, expressed in the room's own currency/ticket unit (not USDT). Check against the player's balance before joining. `0` when the ticket carries no currency amount.
- `EntryFeeUSDT` (`number`) - The same entry fee as an approximate USDT value, for display only. Derived from the tier and the room type, not from `EntryFee`: in-platform rooms map `Contender`/`Challenger`/`Champion` to `2`/`10`/`20`, external rooms to `2`/`4`/`8`, and any other tier (including `Free`) to `0`.
- `TotalPrize` (`number`) - Total prize pool currently accumulated for the room, net of the platform fee.
- `IsFree` (`boolean`) - `true` when the room charges no entry fee — that is, when its ticket has no type, an explicitly free type, or a zero/absent currency amount. When `true`, no balance check is needed.
- `RequireKyc` (`boolean`) - `true` when the player must be KYC-verified to enter. Compare with `UserData.KYCVerified` / `BalanceResponse.KYCVerified` before offering the room.
- `UserCanJoinWithVoucher` (`boolean`) - `true` when the authenticated player holds a voucher for this room's tier, has at least one of it, and has banked the plays needed to activate it — meaning `JoinRoom(guid, true)` will enter without spending currency. Always `false` from `GetRoomPublic`, which has no player to hold vouchers.
- `Voucher` (`VoucherData`, optional) - The voucher matching this room's tier. Present whenever the player holds one, **even if it is not yet activated** — so it can be present while `UserCanJoinWithVoucher` is `false`. Render progress from it; gate the free-entry button on `UserCanJoinWithVoucher`.
- `IsPrePaid` (`boolean`) - `true` when the player has already paid for an entry to this room that has not been consumed yet (see `GetPrePaid`), so joining will not charge again. Only `GetRooms` populates this; `GetRoom` and `GetRoomPublic` report `false`.

**VoucherData Properties:**
- `ItemId` (`number`) - Platform item identifier of the voucher.
- `ItemName` (`string`) - Voucher display name.
- `ItemImage` (`string`) - URL of the voucher artwork. Load it with Phaser's own loader.
- `Tier` (`RoomTier`) - Tier the voucher is valid for. Matched against the room's configured tier, so a room that declares no tier matches no voucher.
- `Count` (`number`) - How many vouchers of this kind the player currently holds.
- `PlayCount` (`number`) - Progress towards activating the next voucher — how many qualifying plays the player has accumulated.
- `PlaysRequiredToActivate` (`number`) - How many plays are needed to activate one voucher. Render progress as `PlayCount` / `PlaysRequiredToActivate`. A voucher counts as usable — and `UserCanJoinWithVoucher` turns `true` — only once `PlayCount >= PlaysRequiredToActivate` and `Count > 0`.

**Usage:**
```typescript
// Singleplayer rooms, first 20
const rooms = await this.funtico.sdk.GetRooms(0, 20);

const user = this.funtico.sdk.GetCachedUserData();

rooms.forEach(room => {
  if (room.RequireKyc && !user?.KYCVerified) return;

  const label = room.IsFree
    ? 'FREE'
    : room.UserCanJoinWithVoucher
      ? `Voucher (${room.Voucher?.Count} left)`
      : `${room.EntryFee}`;

  console.log(`${room.Name} [${label}] - prize pool ${room.TotalPrize}`);
});
```

---

### `GetRoom`

Gets a single room by id, with voucher eligibility resolved for the authenticated player. Call this right before showing a room detail popup so that voucher eligibility is up to date.

**Signature:**
```typescript
public async GetRoom(roomId: string): Promise<RoomViewModel>
```

**Parameters:**
- `roomId` - Room unique identifier (`RoomViewModel.Guid`).

**Returns:** `Promise<RoomViewModel>` - The room's details. Fields are the same as those returned by `GetRooms` — see the **RoomViewModel Properties** block above — with one exception: **`IsPrePaid` is always `false` here.** For the pre-paid flag, read it from the `GetRooms` list, or call `GetPrePaid` and match on `id` yourself.

Like `GetRooms`, this fetches the player's vouchers fresh before resolving `UserCanJoinWithVoucher`.

**Usage:**
```typescript
const room = await this.funtico.sdk.GetRoom(selectedGuid);

if (!room.IsFree && !room.UserCanJoinWithVoucher) {
  const canAfford = this.funtico.sdk.CanAffordFromCache(EntryFeeType.Tico, room.EntryFee);
  if (!canAfford) {
    this.showNotEnoughFunds(room.EntryFee);
    return;
  }
}

// Omitting useVoucher lets JoinRoom decide from UserCanJoinWithVoucher itself
const session = await this.funtico.sdk.JoinRoom(room.Guid);
```

---

### `GetRoomPublic`

Gets a room's details without an authenticated player. Use it for shared/deep-linked room previews shown before the player has logged in.

This is the only Rooms method that does not require an authenticated player — it identifies your game from the public key alone. Player-specific fields (`UserCanJoinWithVoucher`, `IsPrePaid`, `Voucher`) are therefore not personalised: they always report the unauthenticated defaults.

**Signature:**
```typescript
public async GetRoomPublic(id: string): Promise<RoomViewModel>
```

**Parameters:**
- `id` - Room unique identifier (`RoomViewModel.Guid`).

**Returns:** `Promise<RoomViewModel>` - The room's public details. Field meanings are the same as in the **RoomViewModel Properties** block above.

> **Note:** `GetRoomPublic` may fail (HTTP 400) for a room that the authenticated `GetRoom` returns normally. Treat the preview as best-effort: catch the rejection and fall back to `GetRoom` once the player has signed in.

**Usage:**
```typescript
// Landing scene: preview a room from a share link before the player signs in.
const roomId = new URLSearchParams(window.location.search).get('room');

if (roomId) {
  try {
    const room = await this.funtico.sdk.GetRoomPublic(roomId);
    this.showRoomPreview(room.Name, room.EntryFee, room.TotalPrize);
  } catch (err) {
    // Best-effort preview (see the note above) - load it with GetRoom after login instead.
    console.warn('Public room preview unavailable:', err);
  }
}
```

---

### `GetPrizePoolDistribution`

Gets a room's full prize table — what each place wins, plus the pool totals and the platform's cut. Use it to render a "prizes" panel on a room detail screen.

The SDK composes this model from the room config, so every figure below is a plain number on the returned object.

**Signature:**
```typescript
public async GetPrizePoolDistribution(roomGuid: string): Promise<PrizePoolDistributionViewModel>
```

**Parameters:**
- `roomGuid` - Room unique identifier (`RoomViewModel.Guid`). Fetched via `GET /Rooms/get-room`, so this needs an authenticated SDK.

**Returns:** `Promise<PrizePoolDistributionViewModel>` - The room's prize places and pool totals. Rejects if the room config cannot be fetched.

**PrizePoolDistributionViewModel Properties:**
- `PrizePlaces` (`PrizePlaceViewModel[]`) - One entry per place in the room's prize table, in the order the config declares them. Empty when the room distributes no prizes.
- `TotalTicoAccumulated` (`number`) - The room's total TICO stake — everything collected from entry fees, **before** the platform fee is taken out.
- `TicoSharedViaPlaces` (`number`) - The sum of the computable TICO value of every place's prizes, evaluated against the room's deposit stake. This is what the prize table actually pays out, so comparing it with `TotalTicoDistributedToPlayers` tells you whether the table fully allocates the pool.
- `TotalPlayers` (`number`) - How many players the room seats. Reads `1` when the room config declares no size.
- `TicoPerPlayer` (`number`) - `TotalTicoAccumulated` divided by `TotalPlayers`, **floored** to a whole number.
- `PlatformFeePercentage` (`number`) - The platform's cut as a whole-number **percentage** (e.g. `20` for 20%), not an absolute amount. `0` when the config declares none.
- `PlatformFee` (`number`) - The platform's cut as an **absolute** TICO amount, taken from the server's own computed totals rather than derived from the percentage.
- `TotalTicoDistributedToPlayers` (`number`) - `TotalTicoAccumulated` minus `PlatformFee` — the TICO actually available to players. This is the same figure as `RoomViewModel.TotalPrize`.

**PrizePlaceViewModel Properties:**
- `Place` (`number`) - The finishing place this entry rewards, 1-based. `0` when the config declares no place for the entry.
- `PlatformExp` (`number`) - Platform experience awarded at this place. `0` when the entry declares none.
- `PlatformExpKyc` (`number`) - Platform experience awarded at this place to a **KYC-verified** player, which is typically higher than `PlatformExp`. `0` when the entry declares none. Pick between the two on `UserData.KYCVerified`.
- `RewardFeeRatio` (`number`) - This place's TICO prize divided by the room's entry fee — the "win multiplier" for finishing here. `0` when the room is free, when the entry fee is absent, or when the place wins no computable TICO. Not rounded.
- `Prizes` (`Prize[]`) - Everything awarded at this place, as the `Prize` discriminated union documented under [Utilities & Types](#utilities--types). A place commonly carries several prizes at once (TICO plus an item, say). Narrow on the lowercase `type` field.

**Usage:**
```typescript
import { PrizeType, PrizeUtils } from './sdk/FunticoPhaserSDK';

const dist = await this.funtico.sdk.GetPrizePoolDistribution(room.Guid);

console.log(`Pool: ${dist.TotalTicoAccumulated} TICO`);
console.log(`Platform takes ${dist.PlatformFeePercentage}% (${dist.PlatformFee} TICO)`);
console.log(`Players share ${dist.TotalTicoDistributedToPlayers} TICO across ${dist.TotalPlayers} seats`);

const user = this.funtico.sdk.GetCachedUserData();

for (const place of dist.PrizePlaces) {
  const xp = user?.KYCVerified ? place.PlatformExpKyc : place.PlatformExp;
  console.log(`#${place.Place}: ${xp} XP, x${place.RewardFeeRatio.toFixed(2)} on the fee`);

  for (const prize of place.Prizes) {
    if (prize.type === PrizeType.Item || prize.type === PrizeType.Reward) {
      console.log(`  ${prize.Amount}x ${prize.Item?.name ?? 'item'}`);
    }
  }
}
```

---

### `GetTierByEventId`

Resolves a room's tier from its event id, without a dedicated request. Handy on a results or history screen where you hold an event id but not the room model.

Reads from the room list retained by the last `GetRooms` call. When no list has been fetched yet in this process, it fetches one first; when a list has been fetched, it is **not** refreshed, so a tier can only be found for a room that appeared in it.

**Signature:**
```typescript
public async GetTierByEventId(eventId: string, roomType: number = 0): Promise<RoomTier | null>
```

**Parameters:**
- `eventId` - The room/event identifier to resolve (`RoomViewModel.Guid` / `RoomSessionData.EventId`).
- `roomType` - Which list to populate **on a cache miss**, matching `GetRooms`' own parameter: `0` = singleplayer, `1` = multiplayer, `2` = external. Ignored when a room list has already been retained. Pass the type the event actually belongs to — a multiplayer event id looked up against a singleplayer fetch is not found and returns `null`. Default: `0`.

**Returns:** `Promise<RoomTier | null>` - The room's tier, or `null` when the retained list holds no room with that id **or** the room declares no tier. The two cases are not distinguishable from the return value alone. Unlike `RoomViewModel.Tier`, an untiered room reads `null` here rather than `Contender`.

**Usage:**
```typescript
// The lobby already called GetRooms, so this resolves from the retained list with no request
const tier = await this.funtico.sdk.GetTierByEventId(session.EventId);

if (tier !== null) {
  this.tierBadge.setTexture(`tier-${tier}`);
}

// Looking up a multiplayer event: pass the matching roomType so a cache miss fetches the right list
const mpTier = await this.funtico.sdk.GetTierByEventId(multiplayerEventId, 1);
```

---

### `GetRoomSettings`

Gets the custom game configuration attached to a room/event. Call it after joining, before building the gameplay scene, so the run uses the room's configured rules.

**Signature:**
```typescript
public async GetRoomSettings(eventId: string): Promise<any>
```

**Parameters:**
- `eventId` - Event/Room identifier — the `EventId` returned by `JoinRoom`, or a room's `Guid`.

**Returns:** `Promise<any>` - The settings payload exactly as the backend serves it. The shape is defined by your game's own configuration on the Funtico dashboard, which is why the SDK returns it untyped — cast it to your game's settings interface.

**Usage:**
```typescript
interface MyGameSettings {
  difficulty: string;
  timeLimitSeconds: number;
}

const settings = await this.funtico.sdk.GetRoomSettings(session.EventId) as MyGameSettings;

this.scene.start('GameScene', {
  difficulty: settings.difficulty,
  timeLimit: settings.timeLimitSeconds
});
```

---

### `GetPrePaid`

Gets the player's pre-paid room entries — entries that were already paid for but not yet played out. Call it at lobby load so you can offer "continue" instead of charging the player a second time.

**Signature:**
```typescript
public async GetPrePaid(): Promise<PrePaidRoomData[]>
```

**Returns:** `Promise<PrePaidRoomData[]>` - One entry per outstanding participation the player already holds. Empty when they have none. A room in this list is also flagged by `RoomViewModel.IsPrePaid` on the models `GetRooms` returns.

> **Casing note:** `PrePaidRoomData` is **snake_case**, unlike the PascalCase models around it. Read these fields exactly as documented.

**PrePaidRoomData Properties:**
- `id` (`string`) - The room/event identifier this paid entry belongs to. Matches a `RoomViewModel.Guid`, and is the field `GetRooms` matches on to set `IsPrePaid`.
- `attempts_left` (`number`) - How many paid entries into this room remain unplayed. Joining consumes one.
- `participation_id` (`string`) - Identifier of the participation record the payment created.
- `game_session_id` (`string | null`) - The already-started session for this entry, or `null` when the entry is paid for but no run has been started yet.
- `community_id` (`string | null`) - The community the entry was joined under, or `null` when it was not joined under one.
- `voucher_used` (`boolean`) - `true` when the entry was covered by a voucher rather than by currency.

**Usage:**
```typescript
const prePaid = await this.funtico.sdk.GetPrePaid();

if (prePaid.length > 0) {
  console.log(`You have ${prePaid.length} entries already paid for.`);
  this.showResumePrompt(prePaid);
}

// An entry with a started session is a run in progress, not a fresh one
for (const entry of prePaid) {
  const label = entry.game_session_id === null
    ? `${entry.attempts_left} attempt(s) ready to play`
    : 'run already in progress';
  console.log(`Room ${entry.id}: ${label}${entry.voucher_used ? ' (voucher)' : ''}`);
}
```

---

### `GetHistory`

Gets the authenticated player's paginated room history. Use it for a "my matches" screen.

**Signature:**
```typescript
public async GetHistory(page: number, filters?: string, limit = 10, cursor?: string): Promise<any>
```

**Parameters:**
- `page` - Page index, 1-based.
- `filters` - Optional match-type filter. Forwarded to the platform as the match-type filter, so the accepted values match the room types: `"singleplayer"`, `"multiplayer"`, `"external"`. URL-encoded by the SDK.
- `limit` - Number of entries per page. Default: `10`.
- `cursor` - Optional cursor for cursor-based pagination, taken from the previous response. URL-encoded by the SDK. Omit it for the first page.

**Returns:** `Promise<any>` - The rooms-history payload, returned untyped. It carries a data object holding the player's past game sessions (each with its score, its room/event id, its match id, and the timestamps for when it started, was scored, and had prizes distributed), the room configurations those sessions refer to, the related item and reward identifiers, plus a pagination cursor for fetching the next page.

**Usage:**
```typescript
// First page of singleplayer history
const history = await this.funtico.sdk.GetHistory(1, 'singleplayer', 10);

console.log(history);

// Next page, using the cursor the previous response handed back
if (history.Cursor) {
  const next = await this.funtico.sdk.GetHistory(2, 'singleplayer', 10, history.Cursor);
  console.log(next);
}
```

---

### `GetRoomHistoryDetails`

Gets the full detail of one historical game session. Call it when the player taps an entry in the history list.

**Signature:**
```typescript
public async GetRoomHistoryDetails(sessionId: string, withEvent = true): Promise<any>
```

**Parameters:**
- `sessionId` - Identifier of the game session to inspect, taken from an entry in the `GetHistory` payload.
- `withEvent` - When `true`, the response also includes the room/event configuration that the session was played in, so you can show the room name, tier, and prize structure alongside the result. Default: `true`.

**Returns:** `Promise<any>` - The session detail payload, returned untyped: the single game-session record (score, match id, timestamps, whether a voucher was used, the player's leader entry) and — when `withEvent` is `true` — the room configuration it belongs to.

**Usage:**
```typescript
const details = await this.funtico.sdk.GetRoomHistoryDetails(sessionId, true);
console.log(details);

// Skip the room config when you only need the score record
const scoreOnly = await this.funtico.sdk.GetRoomHistoryDetails(sessionId, false);
```

---

### `GetLeaderboard`

Gets the leaderboard and the player's own result for a room run. Call it after `EndRoomSP` to build the results screen, and poll it while results are still pending.

**Signature:**
```typescript
public async GetLeaderboard(eventId: string, sessionId: string, matchId?: string): Promise<RoomLeaderboardViewModel>
```

**Parameters:**
- `eventId` - Event/Room identifier (`RoomSessionData.EventId`).
- `sessionId` - Session or match identifier (`RoomSessionData.SessionOrMatchId`). Sent as the `session_or_match_id` query value.
- `matchId` - Optional match identifier, appended only when provided. Omit it for single-player runs.

**Returns:** `Promise<RoomLeaderboardViewModel>` - The ranked player list plus this player's placement and earnings.

Display names and avatars are resolved from the Funtico **platform** host (`funticoApiBaseUrl`), separately from the scores. That lookup degrades quietly: if it fails, every `PlayerName` reads `""` and `AvatarUrl` is absent, while places and scores still come back intact. Render a placeholder rather than an empty label.

**RoomLeaderboardViewModel Properties:**
- `State` (`LeadersState`) - Where the room's prize settlement currently stands, as a numeric enum member (see the **LeadersState Properties** block below). Compare it against the enum — `State === LeadersState.placed` — rather than against a string; it is not one. `LeadersState[view.State]` recovers the member name for logging.
- `IsPending` (`boolean`) - `true` while prizes are not settled yet — exactly `State === LeadersState.placed`. Keep polling and show a "calculating results" state.
- `ClosedUnsuccessfully` (`boolean`) - `true` when the room closed without a valid outcome (for example it failed to fill), which is the case that leads to entry fees being returned rather than prizes awarded. Exactly `State === LeadersState.returned || State === LeadersState.to_be_returned`.
- `RoomName` (`string`) - Display name of the room the run belongs to.
- `RoomTier` (`RoomTier`) - Tier of that room: `Contender` (0), `Challenger` (1), `Champion` (2), `Free` (3). A room whose config carries no tier reads as `Challenger` here, where `RoomViewModel.Tier` reads `Contender` — do not expect the two to agree for an untiered room.
- `IsFree` (`boolean`) - `true` when **this player's run** was a free entry — not a property of the room. If the seat was paid for with a voucher, the effective fee becomes the voucher item rather than the room's ticket, which flips this to `true` even for a paid room.
- `YourTicoEarnings` (`number`) - TICO the authenticated player won from this room, computed from the room's prize table for the place they finished in. `0` when they placed out of the prizes or are not on the board. Prizes the game itself grants (`GameManagedReward`) are excluded — see `PrizeUtils.calculatePrize`.
- `Multiplier` (`number`) - Payout multiplier: `YourTicoEarnings` divided by the fee actually paid. Render as `x{Multiplier}`. **`0` whenever the fee was not a currency amount** — a voucher-paid or free seat has nothing to divide by, so a `0` here means "not applicable", not "you won nothing". This is a raw quotient and is not rounded.
- `UserPlace` (`string`) - The player's finishing place, stringified — `"1"` for the winner. It is a plain number in a string, **not** an ordinal like `"1st"`; format it yourself. `"0"` when the player is not on the board at all (a spectator, or a run that was never scored), which is not a real place — check for it before displaying.
- `LeaderboardItems` (`LeaderboardItemViewModel[]`) - The ranked list of every player in the room, ordered by place. Always an array: it is empty, never `null`, when the board has no entries or the player is not on it.

**LeadersState Properties:**
- `placed` (`0`) - Scores are in and ranked, but prizes have not been settled. This is the state that drives `IsPending`.
- `distributed` (`1`) - Prizes have been paid out. The result is final.
- `to_be_returned` (`3`) - The room closed unsuccessfully and entry fees are queued to be refunded.
- `returned` (`4`) - Entry fees have been refunded.

There is no member `2`.

**LeaderboardItemViewModel Properties:**
- `Place` (`number`) - Rank in the room, 1-based (`1` is the winner).
- `PlayerName` (`string`) - The player's display name, resolved from the Funtico platform. `""` when the platform has no record for this id.
- `Score` (`number`) - The score they submitted for this room.
- `UserId` (`number`) - The player's **Funtico platform** identifier. Match it against `UserData.PlatformId` — not `UserData.UserId` — to find the local player's own row.
- `AvatarUrl` (`string`, optional) - URL of the player's avatar. Absent when the player has no avatar set, or when the platform name lookup failed. Load it with Phaser's own loader.

**Usage:**
```typescript
import { LeadersState } from './sdk/FunticoPhaserSDK';

const leaderboard = await this.funtico.sdk.GetLeaderboard(
  session.EventId,
  session.SessionOrMatchId
);

if (leaderboard.IsPending) {
  this.showCalculatingResults();
  return;
}

if (leaderboard.ClosedUnsuccessfully) {
  this.showRefundNotice(leaderboard.State === LeadersState.returned);
  return;
}

// UserPlace is "0" when the player is not on the board, and a bare number otherwise
if (leaderboard.UserPlace !== '0') {
  console.log(`${leaderboard.RoomName}: you placed #${leaderboard.UserPlace}`);
}

// Multiplier is 0 for a free or voucher-paid seat - suppress it rather than showing "x0"
const payout = leaderboard.Multiplier > 0
  ? `${leaderboard.YourTicoEarnings} TICO (x${leaderboard.Multiplier.toFixed(2)})`
  : `${leaderboard.YourTicoEarnings} TICO`;
console.log(`Earnings: ${payout}`);

// UserId here is the PLATFORM id - match it against PlatformId, not UserId
const me = this.funtico.sdk.GetCachedUserData();
leaderboard.LeaderboardItems.forEach(item => {
  const marker = item.UserId === me?.PlatformId ? ' <- you' : '';
  const name = item.PlayerName || `Player ${item.UserId}`;
  console.log(`${item.Place}. ${name} - ${item.Score}${marker}`);
});
```

---

### `JoinRoom`

Joins a room and returns the session to play it under: the backend validates and charges the entry fee (or consumes a voucher), then the run is started. Call it once the player has confirmed the room, before loading the gameplay scene.

**Signature:**
```typescript
public async JoinRoom(roomGuid: string, useVoucher?: boolean): Promise<RoomSessionData>
```

**Parameters:**
- `roomGuid` - Room unique identifier (`RoomViewModel.Guid`). Sent in the request body as `tournamentId`.
- `useVoucher` - Whether to spend a free-entry voucher instead of paying the entry fee. **Omit it** to let the SDK decide: it looks the room up and uses its `UserCanJoinWithVoucher`. Pass `true`/`false` only to override that decision — passing `true` when the player holds no activated voucher gets the join rejected. Omitting it costs one extra request; passing it explicitly skips that lookup.

**`JoinRoom` starts the run.** It is live by the time `JoinRoom` resolves and the run's clock is already running. Load your level before calling `JoinRoom`, not between `JoinRoom` and gameplay.

**Returns:** `Promise<RoomSessionData>` - The two identifiers that address this run. Keep both for the rest of the session lifecycle — every subsequent call (`EndRoomSP`, `GetLeaderboard`, `CreateSession_Client`) needs them.

**RoomSessionData Properties:**
- `EventId` (`string`) - The room/event identifier this run belongs to. Pass it as `eventId` everywhere downstream, and as `eventId` to `CreateSession_Client`.
- `SessionOrMatchId` (`string`) - The identifier of this specific run. Pass it as `sessionOrMatchId` downstream, and as `saveSessionId` to `CreateSession_Client`.

**Usage:**
```typescript
// Simplest form: JoinRoom looks the room up and spends a voucher if there is one to spend
const session = await this.funtico.sdk.JoinRoom(roomGuid);

this.registry.set('activeSession', session);

// Create a reconnection checkpoint straight away, so a reload does not lose the paid entry.
await this.funtico.sdk.CreateSession_Client(
  JSON.stringify({ score: 0 }),
  GameTypeEnum.Rooms,
  session.EventId,
  session.SessionOrMatchId
);

this.scene.start('GameScene');
```

```typescript
// Explicit form: you already hold the room, so skip JoinRoom's internal GetRoom lookup
const room = await this.funtico.sdk.GetRoom(roomGuid);

if (!room.IsFree && !room.UserCanJoinWithVoucher) {
  const canAfford = await this.funtico.sdk.CanAfford(EntryFeeType.Tico, room.EntryFee);
  if (!canAfford) return this.showTopUpDialog();
}

const session = await this.funtico.sdk.JoinRoom(room.Guid, room.UserCanJoinWithVoucher);
```

---

### `EndRoomSP`

Ends a room run and submits the player's score from the client, encrypted and signed. Call it once, when the run is over.

**Signature:**
```typescript
public async EndRoomSP(
  eventId: string,
  sessionOrMatchId: string,
  score: number,
  userId: number,
  ip = "127.0.0.1",
  gameEvents: string[] = []
): Promise<any>
```

**Parameters:**
- `eventId` - Event/Room identifier (`RoomSessionData.EventId`).
- `sessionOrMatchId` - Session identifier for this run (`RoomSessionData.SessionOrMatchId`).
- `score` - The player's final score for this run. Fractional values are truncated toward zero (e.g. `47.9` is submitted as `47`).
- `userId` - The player's SDK user identifier — `UserData.UserId` (not `PlatformId`).
- `ip` - The player's IP address, sent with the result. Default: `"127.0.0.1"`.
- `gameEvents` - Gameplay action log to submit alongside the score. When left empty, the SDK substitutes the events recorded during this session via `RecordEvent_Client`. Default: `[]`.

**Returns:** `Promise<any>` - The backend's response to the score submission, returned untyped.

The SDK encrypts and signs the payload for you — pass the plain `score` and never encrypt it yourself.

**Session auto-close:** on a successful response the SDK calls `CloseCurrentSession_Client()` for you, clearing the tracked client session ids and the recorded event log. You do not need to close the session manually, and any `UpdateSession_Client` call after this point will throw because no session is tracked any more.

**Usage:**
```typescript
async gameOver() {
  const session = this.registry.get('activeSession');
  const user = this.funtico.sdk.GetCachedUserData();

  // Events recorded during play are attached automatically
  this.funtico.sdk.RecordEvent_Client(`final_score_${this.score}`);

  await this.funtico.sdk.EndRoomSP(
    session.EventId,
    session.SessionOrMatchId,
    this.score,
    user!.UserId
  );

  // The client session is already closed here - go straight to results
  const leaderboard = await this.funtico.sdk.GetLeaderboard(
    session.EventId,
    session.SessionOrMatchId
  );

  this.scene.start('ResultsScene', { leaderboard });
}
```

**Important Notes:**
- The score is final — the run cannot be re-submitted after a successful call.
- `userId` must be the SDK user id (`UserData.UserId`), not `PlatformId`.

---

## Special Tournaments Methods

These methods provide access to the Funtico Special Tournaments system — timed competitive events with prize pools, leaderboards, and community groupings. All of them are `async` and **reject with an `Error`** when the underlying request fails, so wrap calls in `try/catch`.

The typical lifecycle is: `GetTournaments` → `JoinTournament` (once per tournament) → `EnterTournament` (once per attempt) → play → `ResultTournament_Client` or `ResultTournament_Server` → `GetTournamentLeaderboard`.

### `TournamentsFilterEnum`

String enum used to narrow `GetTournaments` to a single tournament status. The value is sent verbatim as the `filterEnum` query parameter.

**TournamentsFilterEnum Properties:**
- `OnGoing` (`'OnGoing'`) - Tournaments that have started and have not yet ended — the ones a player can enter and score in right now.
- `Upcoming` (`'Upcoming'`) - Tournaments that are announced but have not started yet. A player may be able to join (register) but cannot submit scores.
- `Finished` (`'Finished'`) - Tournaments whose end time has passed. Useful for showing final standings and prize results.

---

### `GetTournaments`

Gets available special tournaments with pagination and an optional status filter. Call this to build a tournament browser or lobby list.

**Signature:**
```typescript
public async GetTournaments(page = 1, perPage = 100, filter?: TournamentsFilterEnum): Promise<TournamentViewModel[]>
```

**Parameters:**
- `page` - Page number, 1-based. Default: `1`.
- `perPage` - Number of tournaments per page. Default: `100`.
- `filter` - Optional status filter (`OnGoing`, `Upcoming`, `Finished`). When omitted, the `filterEnum` query parameter is not sent and the server applies no status filter.

**Returns:** `Promise<TournamentViewModel[]>` - Array of tournaments on the requested page, each one carrying its identifier, schedule, entry requirements, and prize-pool labelling.

**TournamentViewModel Properties:**
- `Id` (`string`) - **The tournament identifier.** This is the value you pass as `tournamentId` to every other method in this section.
- `Guid` (`string`) - The same value as `Id`. Use whichever name reads better; they are always identical.
- `Plaftorfm_Guid` (`string`) - The same value as `Id` and `Guid`.
- `Name` (`string`) - Display name of the tournament, shown to players.
- `Description` (`string`, optional) - Longer descriptive text for the tournament, for a details panel.
- `EntryFee` (`number`, optional) - Amount charged to enter, expressed in the currency named by `EntryFeeType`.
- `EntryFeeType` (`EntryFeeType`, optional) - Which currency or ticket the `EntryFee` is denominated in (`IC`, `Tico`, `SemifinalsTickets`, `FinalTickets`, `Free`, `InventoryItem`, `PrivateTickets`). Feed this to `CanAffordFromCache` to gate the join button.
- `EntryFeeItemId` (`number | null`, optional) - Inventory item required to enter, when `EntryFeeType` is `InventoryItem`. `null` when the fee is not item-based.
- `EntryFeeItemName` (`string | null`, optional) - Display name of that inventory item, for the entry-requirement label.
- `EntryFeeItemImage` (`string | null`, optional) - URL of the item's artwork. Load it with Phaser's own loader; the SDK does not fetch it.
- `StartDate` (`string`, optional) - ISO-8601 timestamp of when the tournament opens for scoring.
- `EndDate` (`string | null`, optional) - ISO-8601 timestamp of when the tournament stops accepting scores. `null` for tournaments with no scheduled end.
- `LeftSeconds` (`number`, optional) - Seconds remaining until the tournament ends, as computed by the server at response time. Convenient for a countdown without trusting the client clock; re-fetch to resynchronise.
- `PlayerLimit` (`number | null`, optional) - Maximum number of distinct players who may join. `null` when the tournament is uncapped.
- `EntryLimit` (`number`, optional) - Maximum number of scoring attempts a player may spend in this tournament.
- `HavePassword` (`boolean | null`, optional) - Whether the tournament is password-protected. When `true`, `JoinTournament` requires the `password` argument.
- `PrizePoolLabel` (`string`, optional) - Pre-formatted, human-readable prize-pool summary for display, e.g. `"10K TICO & More"`. Render it verbatim; it is not machine-parseable. For the structured table, call `GetPrizes`.
- `GuaranteedPrizePoolUsd` (`number`, optional) - Guaranteed prize-pool value in USD.
- `Gpp` (`number | null`, optional) - Guaranteed prize pool as a raw number. `null` when the tournament advertises no guarantee.
- `GppLabel` (`string | null`, optional) - Pre-formatted display label for `Gpp`. `null` when there is nothing to show.
- `ScoreMode` (`string`, optional) - How a player's ranked score is chosen from their attempts (for example, best attempt versus accumulated). Sent as a plain string; the SDK declares no enum for it, so treat unknown values as display-only.
- `ScoreType` (`string`, optional) - What the score represents (for example, points versus time). Also a plain string with no SDK-side enum — do not switch on it without a fallback.
- `IsKycRequired` (`boolean`, optional) - Whether the player must be KYC-verified to take part. Check against `UserData.KYCVerified` before offering the join button.
- `Settings` (`string | null`, optional) - Opaque per-tournament configuration supplied by the platform as a raw string. The SDK neither parses nor interprets it; `null` when unset.
- `PracticeStartTime` (`string | null`, optional) - ISO-8601 start of the practice window, when the tournament has one. `null` otherwise.
- `PracticeEndTime` (`string | null`, optional) - ISO-8601 end of the practice window. `null` otherwise.
- `MinPlayerLevel` (`number`, optional) - Lowest platform level allowed to enter. Compare against `UserData.Level`.
- `MaxPlayerLevel` (`number`, optional) - Highest platform level allowed to enter, for bracketed tournaments.
- `SpecialTournamentsType` (`number`, optional) - Numeric category discriminator assigned by the platform. The SDK declares no enum for the values.

**Usage:**
```typescript
import { TournamentsFilterEnum } from '../sdk/FunticoPhaserSDK';

// First page of live tournaments
const ongoing = await this.funtico.sdk.GetTournaments(1, 20, TournamentsFilterEnum.OnGoing);

ongoing.forEach(t => {
  console.log(`${t.Name} — starts ${t.StartDate}, up to ${t.EntryLimit} entries`);
  console.log(`  ${t.PrizePoolLabel} — entry fee ${t.EntryFee}`);
  // -> "Sample Tournament — starts 2030-01-01T12:00:00Z, up to 40 entries"
  // -> "  10K TICO & More — entry fee 100"
});

// `Id` is the identifier every other tournament method accepts.
const first = ongoing[0];
console.log(first.Id);    // "00000000-0000-0000-0000-000000000000"
console.log(first.Guid);  // same value
```

---

### `GetTournamentDetailsLight`

Gets the current metadata for a single tournament without the leaderboard player list. Use it to refresh one tournament card cheaply, for example after a join.

**Signature:**
```typescript
public async GetTournamentDetailsLight(tournamentId: string): Promise<TournamentViewModel>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`, equivalently `.Guid`).

**Returns:** `Promise<TournamentViewModel>` - The same shape returned by `GetTournaments`, for a single tournament. See the **TournamentViewModel Properties** block under `GetTournaments`.

**Usage:**
```typescript
const details = await this.funtico.sdk.GetTournamentDetailsLight(tournamentId);

console.log(`${details.Name}: ${details.StartDate} → ${details.EndDate}`);
console.log(`Ends in ${details.LeftSeconds}s`);

// A join that cannot go through rejects — handle it with try/catch.
try {
  await this.funtico.sdk.JoinTournament(details.Id);
} catch (err) {
  console.log('Not joinable (already joined, full, or unaffordable):', err);
}
```

---

### `GetTournamentLeaderboard`

Gets the full standings for a tournament, including every ranked player and the current user's own entry. Call this after submitting a result, or to render a live standings screen.

**Signature:**
```typescript
public async GetTournamentLeaderboard(tournamentId: string): Promise<TournamentLeaderboardViewModel>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).

**Returns:** `Promise<TournamentLeaderboardViewModel>` - The tournament's metadata plus the ranked player list and the authenticated user's placement.

**TournamentLeaderboardViewModel Properties:**

Extends `TournamentViewModel` — every field listed under `GetTournaments` is present here too — and adds:
- `Players` (`TournamentPlayerViewModel[]`) - The ranked players on the leaderboard, ordered by `Place`.
- `CurrentPlayer` (`TournamentPlayerViewModel`, optional) - The authenticated user's own leaderboard entry, returned even when the user does not appear in `Players`. Absent when the user has no scored attempt yet.
- `TotalPlayers` (`number`, optional) - Total number of participants across the whole leaderboard, not just the returned `Players` slice. Use it for "rank X of Y" text.

**TournamentPlayerViewModel Properties:**

The tournament leaderboard keeps each player's **best** score across their attempts.
- `Place` (`number`) - The player's rank on the leaderboard, 1-based (`1` is first place).
- `Points` (`number`) - The player's ranked score for this tournament.
- `Score` (`number`) - The same value as `Points`.
- `Name` (`string`) - The player's display name.
- `UserName` (`string`) - The same value as `Name`.
- `FunticoId` (`number`) - The player's identifier on the Funtico platform. **This is the field to match against `UserData.PlatformId`** when you need to find the local player in the list.
- `UserId` (`string`) - A GUID string. Use `FunticoId` for identity checks.
- `AvatarUrl` (`string`, optional) - URL of the player's avatar, flattened from `user_avatar.url`. Load it with Phaser's own loader; the SDK does not fetch it. Absent when the player has no avatar.
- `user_avatar` (`object`, optional) - The avatar object: `url` (`string`), plus optional `type`, `name` and `description` (each `string | null`).
- `user_border` (`object`, optional) - The player's profile-border artwork, same shape as `user_avatar`: `url` plus optional `type`, `name`, `description`. Read `user_border.url` directly.
- `TimesPlayed` (`number`, optional) - How many scoring attempts the player has spent in this tournament.
- `BestTime` (`number`, optional) - The player's best time, for tournaments ranked on time rather than points. Meaningless for point-ranked tournaments — check `ScoreType` on the tournament before showing it.
- `PlatformAvatar` (`string | null`, optional) - Avatar URL sourced from the platform profile, distinct from the tournament-scoped `user_avatar`. `null` when unset.
- `Community` (`string | null`, optional) - The community the player represents in this tournament, when they joined under one. `null` otherwise.

**Usage:**
```typescript
const leaderboard = await this.funtico.sdk.GetTournamentLeaderboard(tournamentId);

if (leaderboard.CurrentPlayer) {
  console.log(`You: #${leaderboard.CurrentPlayer.Place} of ${leaderboard.TotalPlayers} — ${leaderboard.CurrentPlayer.Score}`);
}

leaderboard.Players.forEach(p => {
  console.log(`#${p.Place} ${p.UserName} — ${p.Score}`);
  // -> "#1 PlayerOne — 12345"
});

// Identity checks go through FunticoId, matched against PlatformId.
const me = this.funtico.sdk.GetCachedUserData();
const mine = leaderboard.Players.find(p => p.FunticoId === me?.PlatformId);

// The leaderboard also carries the tournament's own metadata.
console.log(`${leaderboard.Name} — ${leaderboard.PrizePoolLabel}`);
```

---

### `GetTournamentCommunities`

Gets the community groups a player can be assigned to inside a tournament. Call this before `JoinTournament` if you want to let the player pick a community to represent.

**Signature:**
```typescript
public async GetTournamentCommunities(tournamentId: string): Promise<TournamentCommunityViewModel[]>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).

**Returns:** `Promise<TournamentCommunityViewModel[]>` - Array of communities available in this tournament. Empty when the tournament has no community grouping.

**TournamentCommunityViewModel Properties:**
- `Uuid` (`string`) - The community's unique identifier. This is the value to pass as `communityId` to `JoinTournament`.
- `Name` (`string`) - Community display name, e.g. the guild or team name shown in the picker.
- `Description` (`string`) - Longer descriptive text for the community.
- `MembersCount` (`number`) - How many players are currently in this community.

**Usage:**
```typescript
const communities = await this.funtico.sdk.GetTournamentCommunities(tournamentId);

communities.forEach(c => console.log(`${c.Name} — ${c.MembersCount} members`));

// Player picks one, then joins under it
if (communities.length > 0) {
  await this.funtico.sdk.JoinTournament(tournamentId, communities[0].Uuid);
}
```

---

### `JoinTournament`

Registers the authenticated player in a tournament. It does not start a game session — it is what makes the *next* `EnterTournament` legal.

**Call `JoinTournament` before every `EnterTournament`.** Each scored attempt consumes the registration, so join again before each new attempt. The sequence is `JoinTournament` → `EnterTournament` → *(gameplay)* → `ResultTournament_Client`, once per attempt — not one join followed by many enters.

**Signature:**
```typescript
public async JoinTournament(tournamentId: string, communityId?: string, password?: string): Promise<boolean>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).
- `communityId` - Optional community UUID (`TournamentCommunityViewModel.Uuid`) to join under. When omitted, the `communityId` query parameter is not sent.
- `password` - Optional password for password-protected tournaments. URL-encoded by the SDK before it is sent.

**Returns:** `Promise<boolean>` - `true` when the player was registered. The call rejects with an `Error` if the request fails (wrong password, tournament full, entry fee unaffordable).

**Usage:**
```typescript
try {
  // Open tournament
  await this.funtico.sdk.JoinTournament(tournamentId);

  // Under a community
  await this.funtico.sdk.JoinTournament(tournamentId, communityUuid);

  // Password-protected
  await this.funtico.sdk.JoinTournament(tournamentId, undefined, 'secret123');
} catch (err) {
  console.error('Could not join tournament:', err);
}
```

```typescript
// One attempt = one join. Re-join before every entry, including the second and later ones.
async function playAttempt(tournamentId: string, score: number) {
  const sdk = FunticoSDK.Instance;

  await sdk.JoinTournament(tournamentId);              // mandatory, every time
  const enter = await sdk.EnterTournament(tournamentId);

  await sdk.ResultTournament_Client(tournamentId, enter.TournamentScoreUuid, score, true);
  // The next attempt needs a fresh JoinTournament before its EnterTournament.
}
```

---

### `EnterTournament`

Opens a scoring attempt and returns the identifier needed to submit its result. Call this immediately before gameplay starts, once per attempt, and always after a fresh `JoinTournament`.

> ### `TournamentScoreUuid` is the `saveScoreId`
>
> `TournamentScoreUuid` is the value to pass as the `saveScoreId` argument of `ResultTournament_Client` / `ResultTournament_Server`. Keep it for the whole run and submit with `enter.TournamentScoreUuid`.

**Signature:**
```typescript
public async EnterTournament(tournamentId: string): Promise<TournamentEnterData>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`). The player must have joined it already, with a join that has not yet been spent by a scored attempt.

**Returns:** `Promise<TournamentEnterData>` - The entry record for this attempt.

**TournamentEnterData Properties:**
- `TournamentScoreUuid` (`string`) - **The `saveScoreId`.** Identifier of the tournament score record this attempt will be written to. Keep it for the whole run and pass it as the `saveScoreId` argument of `ResultTournament_Client` / `ResultTournament_Server`. It must be the value from the matching `EnterTournament` call.
- `LocalTournamentUUID` (`string`) - An internal identifier for the attempt. Game code does not need it.

**Usage:**
```typescript
const enter = await this.funtico.sdk.EnterTournament(tournamentId);

const saveScoreId = enter.TournamentScoreUuid;

this.registry.set('saveScoreId', saveScoreId);
this.scene.start('GameScene', { tournamentId, saveScoreId });
```

```typescript
// The full path: join, enter, score, read the board back.
const sdk = FunticoSDK.Instance;

await sdk.JoinTournament(t.Id);
const enter = await sdk.EnterTournament(t.Id);

await sdk.ResultTournament_Client(t.Id, enter.TournamentScoreUuid, 9999, true);

const board = await sdk.GetTournamentLeaderboard(t.Id);
const me = board.CurrentPlayer;
console.log(`Points ${me?.Points}, place ${me?.Place}`); // -> "Points 9999, place 1"
```

---

### `GetPrizes`

Gets the prize table configured for a tournament. Use it to render a "what you can win" panel next to the leaderboard.

**Signature:**
```typescript
public async GetPrizes(tournamentId: string): Promise<TournamentPrizesViewModel>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).

**Returns:** `Promise<TournamentPrizesViewModel>` - An object wrapping the prize table. Note this is an **object with a `Prizes` array**, not a bare array. `Prizes` is empty when the tournament has no prize table configured.

**TournamentPrizesViewModel Properties:**
- `Prizes` (`TournamentPrizePlaceViewModel[]`) - One entry per place, or per range of places, in the prize table.

**TournamentPrizePlaceViewModel Properties:**
- `Uuid` (`string`) - Identifier of this prize-table entry on the platform.
- `Name` (`string`) - Human-readable label for the range, e.g. `"1st place"`.
- `Type` (`string`) - The kind of placement rule this entry represents, e.g. `"specific_place"` for a single ranked place.
- `From` (`number`) - First leaderboard place covered by this entry, inclusive.
- `To` (`number`) - Last leaderboard place covered by this entry, inclusive. Equal to `From` for a single place; greater for a range such as places 11–20.
- `Prizes` (`TournamentPrizeItemViewModel[]`) - Everything a player finishing in this range receives.

**TournamentPrizeItemViewModel Properties:**
- `Name` (`string`) - Prize display name, e.g. `"USDT"`.
- `Description` (`string | null`) - Longer descriptive text for the prize.
- `ImageUrl` (`string`) - URL of the prize artwork. Load it with Phaser's loader.
- `Amount` (`number`) - How many units of the prize this entry grants.
- `Value_usd` (`number | null`) - Indicative worth in USD, for display. `null` when the platform did not supply one.

**Usage:**
```typescript
const prizes = await this.funtico.sdk.GetPrizes(tournamentId);

if (prizes.Prizes.length === 0) {
  console.log('No prize table for this tournament.');
}

prizes.Prizes.forEach(tier => {
  const range = tier.From === tier.To ? `#${tier.From}` : `#${tier.From}-${tier.To}`;
  const rewards = tier.Prizes.map(p => `${p.Amount} ${p.Name}`).join(', ');
  console.log(`${range} (${tier.Name}): ${rewards}`);
  // -> "#1 (1st place): 100 USDT"
});

// Prize artwork
prizes.Prizes.forEach(tier =>
  tier.Prizes.forEach(p => this.load.image(`prize_${p.Name}`, p.ImageUrl))
);
this.load.start();
```

> **Note:** this method returns its own prize shape and does **not** use the `Prize` union documented under [Utilities & Types](#utilities--types), which is what `GetPrizePoolDistribution` and `GetHallOfFameDistribution` return. `PrizeUtils.calculatePrize` does not accept these objects.

---

### `GetTournamentsHistory`

Gets a paginated history of the tournaments the authenticated player has taken part in, with their placement and awarded prizes. Use it for a "my tournaments" screen.

**Signature:**
```typescript
public async GetTournamentsHistory(page = 1, perPage = 10): Promise<TournamentHistoryViewModel>
```

**Parameters:**
- `page` - Page number, 1-based. Default: `1`.
- `perPage` - Entries per page; sent as the `per_page` query parameter. Default: `10`.

**Returns:** `Promise<TournamentHistoryViewModel>` - One page of history entries plus the pagination metadata needed to walk the rest.

**TournamentHistoryViewModel Properties:**
- `Entries` (`TournamentHistoryEntry[]`) - The history entries on this page, one per tournament the player participated in.
- `Meta` (`object`, optional) - Pagination metadata for the request:
  - `CurrentPage` (`number`) - The page that was returned — echoes the `page` argument.
  - `LastPage` (`number`) - Index of the final page. Keep requesting while `CurrentPage < LastPage`.
  - `PerPage` (`number`) - Entries per page the server actually applied.
  - `Total` (`number`) - Total number of history entries across all pages.
  - `From` (`number | null`, optional) - 1-based index of the first entry on this page within the full result set. **`null` when the page is empty**, including an account with no history at all.
  - `To` (`number | null`, optional) - 1-based index of the last entry on this page. `null` under the same conditions as `From`.

**TournamentHistoryEntry Properties:**
- `TournamentName` (`string`) - Display name of the tournament as it was at the time.
- `TournamentUuid` (`string`) - The tournament's UUID — the same identifier as `TournamentViewModel.Id`. Pass it back to `GetTournamentDetailsLight` or `GetTournamentLeaderboard` to reopen the tournament.
- `StartsAt` (`string`, optional) - ISO-8601 timestamp of when the tournament started.
- `EndsAt` (`string`, optional) - ISO-8601 timestamp of when the tournament ended.
- `ScoredAt` (`string`, optional) - ISO-8601 timestamp of the player's last scored attempt. Absent if they joined but never scored.
- `IsFinished` (`boolean`) - Whether the tournament itself has concluded. Placement and prizes are only final once this is `true`.
- `BestScore` (`number`, optional) - The player's best score across all their attempts in this tournament — the score they were ranked on.
- `LeaderboardPlace` (`number`, optional) - The player's rank on the final leaderboard, 1-based.
- `EntriesCount` (`number`, optional) - How many entries (attempts) the player used.
- `MaxEntries` (`number`, optional) - The entry cap that applied to them.
- `GameId` (`number`, optional) - Identifier of the Funtico platform game the tournament belonged to. Useful when one client hosts several games.
- `MapId` (`number`, optional) - Identifier of the map/mode variant the tournament ran on.
- `Prizes` (`TournamentHistoryPrize[]`, optional) - Prizes awarded to the player for this tournament. Absent or empty when they placed outside the prize tiers.

**TournamentHistoryPrize Properties:**
- `Name` (`string`) - Prize display name.
- `Amount` (`number`) - How many units of the prize were awarded.
- `ImageUrl` (`string`, optional) - URL of the prize artwork.
- `IsRedeemed` (`boolean`) - Whether the player has already claimed this prize. `false` means it is still pending collection — a good hook for a "claim" badge.

**Usage:**
```typescript
const history = await this.funtico.sdk.GetTournamentsHistory(1, 10);

console.log(`Page ${history.Meta?.CurrentPage} of ${history.Meta?.LastPage} (${history.Meta?.Total} total)`);

// From/To are null on an empty page — a player with no history hits this branch.
if (history.Meta?.From == null) {
  console.log('No tournament history yet.');
} else {
  console.log(`Showing entries ${history.Meta.From}–${history.Meta.To}`);
}

history.Entries.forEach(entry => {
  console.log(`${entry.TournamentName} — place #${entry.LeaderboardPlace}, best ${entry.BestScore}`);

  entry.Prizes?.forEach(prize => {
    console.log(`  ${prize.Amount}x ${prize.Name} — ${prize.IsRedeemed ? 'redeemed' : 'pending'}`);
  });
});

// Walk to the next page
if (history.Meta && history.Meta.CurrentPage < history.Meta.LastPage) {
  const next = await this.funtico.sdk.GetTournamentsHistory(history.Meta.CurrentPage + 1, 10);
}
```

---

### `ResultTournament_Server`

Submits a tournament attempt's result from a trusted server. It authenticates as your game rather than as one player, so only call it from server-side code where the private game key is safe.

**Signature:**
```typescript
public async ResultTournament_Server(
  tournamentId: string,
  saveScoreId: string,
  score: number,
  userId: number,
  isSuccess: boolean,
  ip = "0.0.0.0"
): Promise<TournamentResultViewModel>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).
- `saveScoreId` - The attempt identifier from `EnterTournament`: **`TournamentEnterData.TournamentScoreUuid`**.
- `score` - The player's final score for this attempt. Sent as-is (unlike `ResultTournament_Client`, the SDK does not truncate it), so pass an integer.
- `userId` - The player's identifier in the SDK system (`UserData.UserId`). Unlike the client method, the server call cannot infer the player from a JWT, so you must name them explicitly.
- `isSuccess` - Whether the attempt completed properly. Pass `false` for an abandoned or invalidated run — the score is then discarded rather than ranked, and the attempt is closed out.
- `ip` - The player's IP address, sent with the result. Default: `"0.0.0.0"`. Leave it at the default when you do not know the player's address.

**Returns:** `Promise<TournamentResultViewModel>` - The server's confirmation of the submitted result.

**TournamentResultViewModel Properties:**
- `Score` (`number`, optional) - Echo of the `score` you submitted. When `isSuccess` is `false` no score is recorded, but this field still returns the submitted value.
- `Time` (`number`, optional) - Declared as the attempt duration in seconds.
- `XpReceive` (`number`, optional) - Declared as the experience points awarded for the attempt.
- `IcReceive` (`number`, optional) - Declared as the in-game currency (`EntryFeeType.IC`, i.e. Coins) awarded for the attempt.

> **Note:** only `Score` is populated. `Time`, `XpReceive` and `IcReceive` are always `0`; do not rely on them as awarded XP or currency.

**Usage:**
```typescript
// Dedicated server code — never ship the private game key to a browser build
const result = await FunticoSDK.Instance.ResultTournament_Server(
  tournamentId,
  saveScoreId,
  finalScore,
  player.sdkUserId,
  true,
  player.ipAddress
);

console.log(`Recorded ${result.Score}`); // Time/XpReceive/IcReceive are always 0 today
```

---

### `ResultTournament_Client`

Submits a tournament attempt's result from a browser build. The SDK encrypts and signs the payload for you. Use this in games that have no dedicated server.

**Signature:**
```typescript
public async ResultTournament_Client(
  tournamentId: string,
  saveScoreId: string,
  score: number,
  isSuccess: boolean,
  customData = ""
): Promise<boolean>
```

**Parameters:**
- `tournamentId` - Tournament UUID (`TournamentViewModel.Id`).
- `saveScoreId` - The attempt identifier from `EnterTournament`: **`TournamentEnterData.TournamentScoreUuid`**. It must be the value from the `EnterTournament` call that opened this attempt.
- `score` - The player's final score for this attempt. Fractional values are truncated toward zero (e.g. `47.9` is submitted as `47`).
- `isSuccess` - Whether the attempt completed properly. Pass `false` for an abandoned run; the score is then discarded rather than ranked.
- `customData` - Optional extra game data, as a string (serialize your own JSON). It is encrypted along with the score. Default: `""`.

**Returns:** Resolves once the score has been saved. Rejects with an `Error` if the server refuses the payload, so branch on `try`/`catch` rather than on the resolved value.

**Usage:**
```typescript
async submitTournamentResult(tournamentId: string, saveScoreId: string) {
  try {
    // Events logged via RecordEvent_Client are attached to the payload automatically
    this.funtico.sdk.RecordEvent_Client('boss_defeated');

    await this.funtico.sdk.ResultTournament_Client(
      tournamentId,
      saveScoreId,       // enter.TournamentScoreUuid
      this.score,
      true,
      JSON.stringify({ kills: 12, levelReached: 4 })
    );

    // The score is saved by the time this line runs.
    const leaderboard = await this.funtico.sdk.GetTournamentLeaderboard(tournamentId);
    this.scene.start('ResultsScene', { leaderboard });
  } catch (err) {
    console.error('Failed to submit tournament result:', err);
  }
}
```

**Important Notes:**
- Only use in client builds — the server path is `ResultTournament_Server`.
- The SDK encrypts and signs the payload for you; do not encrypt `customData` yourself.
- Events recorded via `RecordEvent_Client` are attached to the payload automatically as `GameEvents`.
- On success the SDK clears local client-session tracking via `CloseCurrentSession_Client()`.
- Scoring an attempt spends the player's tournament registration: call `JoinTournament` again before the next `EnterTournament`.

---

## Hall of Fame Methods

The Hall of Fame is the platform-wide ranking built from every scored run a player has submitted — through Special Tournaments, Rooms, or Practice. Games typically use it to render an all-time or monthly leaderboard screen and the prize table that goes with it.

> **Casing note:** Hall of Fame responses are **camelCase** (`leaderboard`, `totalPoints`, `currentPlayer`), unlike the PascalCase Rooms and Tournaments responses. Read these fields exactly as documented below.

---

### `GetHallOfFame`

Fetches one page of the Hall of Fame ranking, optionally narrowed to a single game mode. Call this when the player opens the leaderboard screen, and again on every page change or filter change.

**Signature:**
```typescript
public async GetHallOfFame(
  mode: HallOfFamePeriodMode,
  page = 1,
  limit = 10,
  gameMode: HallOfFameGameModeFilter = HallOfFameGameModeFilter.All
): Promise<HallOfFameResponse>
```

**Parameters:**
- `mode` - Ranking period. `HallOfFamePeriodMode.Global` ranks all-time results; `HallOfFamePeriodMode.Monthly` ranks only the current calendar month (UTC). Any other value throws before a request is made.
- `page` - 1-based page index. Page `1` is the top of the leaderboard. Default: `1`.
- `limit` - Number of entries per page. Default: `10`.
- `gameMode` - Restricts the ranking to a single game mode. `HallOfFameGameModeFilter.All` applies no filter — the SDK omits the `gameMode` query parameter entirely rather than sending a value for it. Default: `HallOfFameGameModeFilter.All`.

**HallOfFamePeriodMode Values:**
- `Global` (`0`) - All-time ranking across every result ever recorded. Maps to the `/HallOfFame/global` endpoint.
- `Monthly` (`1`) - Ranking limited to the current calendar month in UTC. Maps to the `/HallOfFame/monthly` endpoint.

**HallOfFameGameModeFilter Values:** (use this enum in game code)
- `All` (`0`) - No filter; ranks across every mode. The `gameMode` query parameter is not sent at all for this value.
- `SpecialTournament` (`1`) - Only results scored in Special Tournaments.
- `Rooms` (`2`) - Only results scored in Rooms matches.
- `Practice` (`3`) - Only results scored in Practice runs.

**HallOfFameGameMode Values:** (wire-level detail — prefer `HallOfFameGameModeFilter` in game code)
- `SpecialTournament` (`0`) - Special Tournaments.
- `Rooms` (`1`) - Rooms.
- `Practice` (`2`) - Practice.

The SDK translates `HallOfFameGameModeFilter` onto these values internally, so game code should pass `HallOfFameGameModeFilter`.

**Returns:** `Promise<HallOfFameResponse>` - One page of ranked players, the total player count for the current filter, the echoed pagination values, and the calling player's own entry when they have a ranked result. Rejects with an error if the request fails.

**HallOfFameResponse Properties:**
- `leaderboard` (`HallOfFamePlayerEntry[]`) - The requested page of ranked players, ordered best-first. Its length is at most `limit`, and the last page may be shorter.
- `currentPlayer` (`HallOfFamePlayerEntry | null`, optional) - The calling player's own entry, resolved against the same period and game mode filter, with their true global `rank` regardless of which page was requested. It is `null` until the player has at least one ranked result under the active filter — always guard before reading it.
- `totalPlayers` (`number`) - Total number of ranked players matching the current period and game mode filter. Divide by `limit` to compute the page count.
- `page` (`number`) - The 1-based page index this response represents (echoes the request).
- `limit` (`number`) - The entries-per-page value this response was built with (echoes the request).

**HallOfFamePlayerEntry Properties:**
- `userId` (`number`) - The player's SDK user ID (the same identifier as `UserId` in user data).
- `funticoId` (`number`) - The player's Funtico platform user ID (the same identifier as `PlatformId` / `FunticoUserId`).
- `displayName` (`string`) - The player's public display name. Reads `"Unknown"` when no profile record can be resolved.
- `avatarUrl` (`string | null`, optional) - URL of the player's avatar image, or `null` if they have none.
- `avatarType` (`string | null`, optional) - The kind of avatar the player has equipped, which tells you how to render `avatarUrl`. `null` if unset.
- `avatarBorder` (`string | null`, optional) - The avatar border the player has equipped, or `null` if none.
- `borderType` (`string | null`, optional) - The category of the equipped avatar border, used together with `avatarBorder` to render the frame. `null` if unset.
- `country` (`string | null`, optional) - The player's country code, for flag display. `null` if not provided.
- `rank` (`number`) - The player's 1-based position in the ranking under the active period and game mode filter.
- `totalPoints` (`number`) - **The player's best single score, not a sum.** The ranking uses the maximum score across the player's runs, so a player with one excellent run outranks a player with many mediocre ones. Label this in UI accordingly ("Best score", not "Total").
- `gamesPlayed` (`number`) - How many ranked runs the player has recorded under the active filter. This is a count of results, and it does not feed into `totalPoints`.
- `playedAt` (`string | null`, optional) - ISO-8601 timestamp of the run that produced `totalPoints` — i.e. when the best score was set, not when the player last played. `null` if no timestamp is available.

Nullable fields on this entry are sent as explicit `null` rather than omitted, which is why they are typed `| null`.

**Usage:**
```typescript
import { HallOfFamePeriodMode, HallOfFameGameModeFilter } from './sdk/FunticoPhaserSDK';

// All-time leaderboard, first page, defaults for page/limit/gameMode
const global = await this.funtico.sdk.GetHallOfFame(HallOfFamePeriodMode.Global);

console.log(`Ranked players: ${global.totalPlayers}`);
for (const entry of global.leaderboard) {
  console.log(`#${entry.rank} ${entry.displayName} — best score ${entry.totalPoints} (${entry.gamesPlayed} games)`);
}

// This month's Rooms-only leaderboard, page 2, 20 per page
const monthly = await this.funtico.sdk.GetHallOfFame(
  HallOfFamePeriodMode.Monthly,
  2,
  20,
  HallOfFameGameModeFilter.Rooms
);

// currentPlayer is null until the player has a ranked result under this filter
if (monthly.currentPlayer) {
  this.yourRankText.setText(`You: #${monthly.currentPlayer.rank} — ${monthly.currentPlayer.totalPoints}`);
} else {
  this.yourRankText.setText('Play a ranked game to enter the Hall of Fame');
}

// Paging
const pageCount = Math.ceil(monthly.totalPlayers / monthly.limit);
const hasNextPage = monthly.page < pageCount;
```

---

### `GetHallOfFameDistribution`

Fetches the Hall of Fame prize distribution table — which places win what. Call this when rendering the "Prizes" panel next to the leaderboard; it takes no parameters and is not affected by the period or game mode filter.

**Signature:**
```typescript
public async GetHallOfFameDistribution(): Promise<HOFDistributionResponse>
```

**Returns:** `Promise<HOFDistributionResponse>` - The prize table as a list of tiers, each covering either one individual place or a grouped range of places. Rejects with an error if the request fails.

**HOFDistributionResponse Properties:**
- `items` (`HOFDistributionItem[]`) - The prize tiers, ordered from the top place downward.

**HOFDistributionItem Properties:**
- `place` (`number`) - The place this tier applies to, or the **first** place of a grouped range. 1-based.
- `endPlace` (`number`, optional) - The last place of a grouped range. **Absent for the individual places 1-10, present for the grouped 11-20 and 21-50 tiers.** When present, every place from `place` through `endPlace` inclusive receives the same prizes.
- `range` (`string`, optional) - A ready-to-display label for a grouped range, e.g. `"11-20"`. Absent for individual places 1-10 — for those, render `place` yourself. Present exactly when `endPlace` is.
- `prizes` (`Prize[]`) - Everything awarded at this tier, as the shared `Prize` discriminated union documented under [Utilities & Types](#utilities--types). A tier commonly carries several prizes at once (for example TICO plus two different item stacks). Narrow on the lowercase `type` field.

> This table typically carries `GppPerPlayer` and `Item` prizes, but the union is not narrowed to those two: handle the `type` values your game cares about and ignore the rest.

**Usage:**
```typescript
import { PrizeType } from './sdk/FunticoPhaserSDK';

const distribution = await this.funtico.sdk.GetHallOfFameDistribution();

for (const item of distribution.items) {
  // range/endPlace exist only for the grouped tiers (11-20, 21-50)
  const label = item.range ?? `${item.place}`;

  for (const prize of item.prizes) {
    if (prize.type === PrizeType.GppPerPlayer) {
      console.log(`Place ${label}: ${prize.Value} TICO`);
    } else if (prize.type === PrizeType.Item) {
      const name = prize.Item?.name ?? `item #${prize.ItemId}`;
      console.log(`Place ${label}: ${prize.Amount}x ${name}`);

      if (prize.Item) {
        this.load.image(`hof-item-${prize.Item.id}`, prize.Item.image);
      }
    }
  }
}
this.load.start();

// Find the tier that covers a given place
const placeOf = (place: number) =>
  distribution.items.find(i => place >= i.place && place <= (i.endPlace ?? i.place));
```

---

## Campaign Methods

Campaign Mode is a fixed ladder of authored levels the player works through in order. Each level is played in its own **attempt**, scored by a flat set of **metrics** the game reports, and graded server-side into **stars** that gate rewards and unlock the next level. These methods cover the whole loop — checking that a campaign exists, listing levels with the player's progress, starting an attempt, and submitting the finished run.

The typical flow is `IsCampaignAvailable` → `GetCampaignLevels` → `StartCampaignLevel` → *(gameplay)* → `CompleteCampaignLevel` → `GetCampaignLevels` again for the unlock cascade.

> **Casing note:** Campaign responses are **PascalCase** (`IsAvailable`, `BestStars`, `Rewards`), like most of the SDK — and unlike the camelCase Hall of Fame responses documented above.

**Stars are computed server-side.** The client reports metrics; the backend evaluates the level's star rules against them and answers with the stars earned. Render `StarRules` as UI ("finish under 60s for 2 stars"), but never compute stars yourself and never try to submit them — nothing the client sends can claim a star directly.

**The metrics contract.** `CompleteCampaignLevel` takes a flat `name -> value` map (`CampaignMetrics`): 1-32 entries, each name 1-64 characters, each value a **finite number or a boolean**. Booleans are normalized to `1`/`0` for the wire. **Fractional numbers are allowed** — `time: 47.35` survives intact, unlike `EndRoomSP`'s `score`, which the SDK truncates to an integer before sending. Violations throw a `CampaignError` with `Code: InvalidMetrics` client-side, before anything is encrypted or sent.

**Failure model.** Campaign methods reject with a `CampaignError` carrying a machine-readable `Code` (see the [`CampaignError`](#campaignerror) block at the end of this section) — branch on the code, never on message text. Two outcomes are deliberately *not* errors: a game without a campaign reports `IsAvailable: false` as plain data, and a **lost run resolves normally** with `IsWin: false, Stars: 0`.

**Cache invalidation.** `GetCampaignAvailability` and `GetCampaignLevels` share the SDK-wide cache window (`FunticoConfig.cacheTTL` — see the caching model under [User Data Methods](#user-data-methods)). A successful `CompleteCampaignLevel` drops the cached level list automatically, because completion can unlock the next level server-side — the next `GetCampaignLevels(true)` refetches instead of serving a list where that level still reads `Locked`. It also updates the cached availability's `LevelCount`/`MaxStars` from the completion's own totals.

---

### `GetCampaignAvailability`

Checks whether the game has a campaign configured, and its headline numbers, without fetching the full level list. Call it when building the main menu to decide whether to show the campaign entry at all.

This is the one Campaign method that **works before authentication** — no player sign-in is needed and only the game key is required, so even a pre-login menu can gate its campaign button on it. The JWT is attached when one exists, but its absence does not throw, unlike every other Campaign method.

**Signature:**
```typescript
public async GetCampaignAvailability(useCache = true): Promise<CampaignAvailabilityViewModel>
```

**Parameters:**
- `useCache` - When `true`, returns the cached copy if one exists and the shared TTL window has not expired. When `false`, always issues a `GET /Campaign/availability` request and refreshes the cache. Default: `true`.

**Returns:** `Promise<CampaignAvailabilityViewModel>` - The campaign's headline numbers. **"No campaign" is data, not an error:** the endpoint answers `200` with `IsAvailable: false` for a game without one, so this only rejects on a real failure (network, server error).

**CampaignAvailabilityViewModel Properties:**
- `IsAvailable` (`boolean`) - Whether the game currently has an active campaign. Gate the campaign menu button on this flag.
- `LevelCount` (`number`) - How many levels the campaign holds.
- `MaxStars` (`number`) - The maximum stars obtainable across the whole campaign. Render campaign-wide progress as `TotalStarsEarned` / `MaxStars` once the level list is loaded.

**Usage:**
```typescript
const availability = await this.funtico.sdk.GetCampaignAvailability();

this.campaignButton.setVisible(availability.IsAvailable);
if (availability.IsAvailable) {
  this.campaignLabel.setText(`Campaign — ${availability.LevelCount} levels`);
}
```

---

### `GetCachedCampaignAvailability`

Returns the availability already held in memory, with no network call and no TTL check.

**Signature:**
```typescript
public GetCachedCampaignAvailability(): CampaignAvailabilityViewModel | null
```

**Returns:** `CampaignAvailabilityViewModel | null` - The cached availability, or `null` if `GetCampaignAvailability` has never completed in this session.

**Usage:**
```typescript
const availability = this.funtico.sdk.GetCachedCampaignAvailability();
this.campaignButton.setVisible(availability?.IsAvailable ?? false);
```

---

### `IsCampaignAvailable`

Convenience shorthand for `(await GetCampaignAvailability(useCache)).IsAvailable`.

**Signature:**
```typescript
public async IsCampaignAvailable(useCache = true): Promise<boolean>
```

**Parameters:**
- `useCache` - Forwarded to `GetCampaignAvailability`. Default: `true`.

**Returns:** `Promise<boolean>` - Whether the game currently has an active campaign.

**Usage:**
```typescript
if (await this.funtico.sdk.IsCampaignAvailable()) {
  this.scene.start('CampaignMapScene');
}
```

---

### `GetCampaignLevels`

Fetches the campaign level list with the player's progress folded in. This is the level-select call.

**Signature:**
```typescript
public async GetCampaignLevels(useCache = true): Promise<CampaignLevelsViewModel>
```

**Parameters:**
- `useCache` - When `true`, returns the cached copy if one exists and the shared TTL window has not expired. When `false`, always issues a `GET /Campaign/levels` request and refreshes the cache. Note that a successful `CompleteCampaignLevel` drops this cache, so the first `GetCampaignLevels(true)` after a completion refetches regardless. Default: `true`.

**Returns:** `Promise<CampaignLevelsViewModel>` - The full campaign: progress counters plus one entry per level. Always a `200` on the wire — an empty campaign comes back as `IsAvailable: false` with `Levels: []` — so a rejection here is a real failure, not "no campaign".

**CampaignLevelsViewModel Properties:**
- `IsAvailable` (`boolean`) - Whether the campaign is active. `false` comes with an empty `Levels` array.
- `TotalLevels` (`number`) - How many levels the campaign holds.
- `CompletedLevels` (`number`) - How many of them this player has completed.
- `TotalStarsEarned` (`number`) - The player's stars summed across every level's best result.
- `MaxStars` (`number`) - The maximum stars obtainable across the whole campaign. Render overall progress as `TotalStarsEarned` / `MaxStars`.
- `Levels` (`CampaignLevelViewModel[]`) - Every level, in campaign order.

**CampaignLevelViewModel Properties:**
- `Id` (`string`) - The level's identifier. Pass it to `StartCampaignLevel`.
- `Order` (`number`) - The level's position in the ladder.
- `Name` (`string`) - Display name.
- `Description` (`string | null`, optional) - Longer display description, or `null` when none is configured.
- `Status` (`CampaignLevelStatus`) - `Locked` (0), `Unlocked` (1) or `Completed` (2). Drives the lock icon; only an `Unlocked` or `Completed` level can be started.
- `BestStars` (`number`) - The most stars the player has earned on this level. `0` until they win it. Drives the star row on the level card.
- `BestMetrics` (`Record<string, number> | null`) - The metrics of the player's best run, or `null` when they have none. Use it for "your best: 47.3s" labels.
- `LevelConfigJson` (`string | null`) - Your game's own level configuration as an opaque JSON string — the SDK renames the wire's `LevelJsonData` onto this. **`null` while the level is `Locked`** (the server withholds it), non-null once unlocked. Parse it with `GetCampaignLevelConfig<T>()`.
- `StarRules` (`CampaignStarRules | null`) - The level's star thresholds, parsed for you from the wire's JSON string. `null` while the level is `Locked`, and `null` again when the stored rules do not parse — one level's bad rules never reject the whole list. **For display only** — stars are computed server-side.
- `MinDurationSeconds` (`number`) - The server's minimum plausible clear time. A completion submitted faster than this is rejected with `CompletionTooFast`.
- `ConfigVersion` (`number`) - Version of the level's configuration. `StartCampaignLevel` echoes the version the attempt was started against.
- `Rewards` (`CampaignRewardViewModel[]`) - What completing the level can grant, gated per-reward by `RequiredStars`. Empty when the level grants nothing.
- `CompletedAt` (`string | null`, optional) - ISO-8601 timestamp of the player's first completion, or `null` while the level is uncompleted.

**CampaignLevelStatus Values:**
- `Locked` (`0`) - Not reachable yet; config and star rules are withheld.
- `Unlocked` (`1`) - Playable, not yet completed.
- `Completed` (`2`) - Won at least once; still replayable to improve `BestStars`.

**CampaignStarRules Properties:**
- `Win` (`CampaignStarRuleCondition[]`) - The conditions a run must meet to count as a win at all.
- `Stars` (`CampaignStarTier[]`) - One tier per star: `Star` (`number`) plus its `Conditions`.

**CampaignStarRuleCondition Properties:**
- `Metric` (`string`) - The metric name the condition reads.
- `Op` (`string`) - The comparison operator, e.g. `">="`.
- `Value` (`number`) - The threshold.

**CampaignRewardViewModel Properties:**
- `Type` (`string`) - What kind of reward this is, as the backend names it.
- `Amount` (`number`) - How many/how much is granted.
- `ItemId` (`number | null`, optional) - The platform item granted, when the reward is an item.
- `RequiredStars` (`number`) - Minimum stars the completing run must earn for this reward to be granted.
- `Name` (`string | null`, optional) - Display name, when configured.
- `ImageUrl` (`string | null`, optional) - Artwork URL, when configured. Load it with Phaser's own loader.

**Usage:**
```typescript
import { CampaignLevelStatus } from './sdk/FunticoPhaserSDK';

const campaign = await this.funtico.sdk.GetCampaignLevels();

if (!campaign.IsAvailable) {
  this.scene.start('MenuScene');
  return;
}

this.progressText.setText(`${campaign.TotalStarsEarned} / ${campaign.MaxStars} ★`);

for (const level of campaign.Levels) {
  const card = this.createLevelCard(level.Order, level.Name);

  if (level.Status === CampaignLevelStatus.Locked) {
    card.showLockIcon();          // config and star rules are withheld while locked
  } else {
    card.showStars(level.BestStars);
    card.onClick(() => this.enterLevel(level));
  }
}
```

---

### `GetCachedCampaignLevels`

Returns the level list already held in memory, with no network call and no TTL check. Note that a successful `CompleteCampaignLevel` clears this cache, so right after a completion it returns `null` until `GetCampaignLevels` runs again.

**Signature:**
```typescript
public GetCachedCampaignLevels(): CampaignLevelsViewModel | null
```

**Returns:** `CampaignLevelsViewModel | null` - The cached campaign, or `null` if none is cached.

**Usage:**
```typescript
const campaign = this.funtico.sdk.GetCachedCampaignLevels()
  ?? await this.funtico.sdk.GetCampaignLevels();
```

---

### `GetCampaignLevelConfig`

Parses a level's opaque config JSON into your game's own type. The schema is **your game's** — the platform stores the string untouched and the SDK never inspects it, so define your own interface and pass it as `T`.

**Signature:**
```typescript
public GetCampaignLevelConfig<T = unknown>(level: CampaignLevelViewModel): T
```

**Parameters:**
- `level` - The level whose `LevelConfigJson` to parse, from `GetCampaignLevels`.

**Returns:** `T` - The parsed config, cast to your type. Synchronous — no request is made. Throws a plain `Error` (not a `CampaignError`) when the level is still `Locked` (`LevelConfigJson` is `null` — the server withholds it until unlock) or when the stored string is not valid JSON.

**Usage:**
```typescript
// The schema is your game's — define your own interface.
interface MyLevelConfig {
  enemyWaves: number;
  timeLimitSeconds: number;
  tilemapKey: string;
}

const config = this.funtico.sdk.GetCampaignLevelConfig<MyLevelConfig>(level);

this.scene.start('CampaignGameScene', {
  levelId: level.Id,
  waves: config.enemyWaves,
  timeLimit: config.timeLimitSeconds
});
```

---

### `StartCampaignLevel`

Starts an attempt at a level and tracks it as the active attempt. Call it right before gameplay begins — the attempt's `StartedAt` is what `CompletionTooFast` is measured against.

**Signature:**
```typescript
public async StartCampaignLevel(levelId: string): Promise<CampaignAttemptData>
```

**Parameters:**
- `levelId` - The level's identifier (`CampaignLevelViewModel.Id`). Sent as the `levelId` query value of `POST /Campaign/start-level`.

**Returns:** `Promise<CampaignAttemptData>` - The started attempt. The SDK stores it internally, so `CompleteCampaignLevel` can be called without threading it through your scenes. Rejects with a `CampaignError` — `LevelLocked` when the level is not reachable yet, `LevelNotFound` for an unknown id, `CampaignNotAvailable` when the game has no active campaign.

**Re-starting replaces the tracked attempt.** Calling `StartCampaignLevel` again — for the same level or another — simply makes the new attempt the tracked one; the server abandons the old attempt, and there is nothing to clean up client-side.

**CampaignAttemptData Properties:**
- `AttemptId` (`string`) - The attempt's identifier.
- `LevelId` (`string`) - The level this attempt belongs to (echoes the request).
- `ConfigVersion` (`number`) - The level-config version this attempt was started against. If it differs from the `ConfigVersion` you rendered, the level changed under you — refetch before playing.
- `StartedAt` (`string`) - ISO-8601 timestamp of when the server started the attempt.

**Usage:**
```typescript
import { CampaignError, CampaignErrorCode } from './sdk/FunticoPhaserSDK';

try {
  const attempt = await this.funtico.sdk.StartCampaignLevel(level.Id);
  console.log(`Attempt ${attempt.AttemptId} started at ${attempt.StartedAt}`);
  this.scene.start('CampaignGameScene', { level });
} catch (error) {
  if (error instanceof CampaignError && error.Code === CampaignErrorCode.LevelLocked) {
    this.showToast('Complete the previous level first!');
  } else {
    throw error;
  }
}
```

---

### `GetActiveCampaignAttempt`

Returns the attempt `StartCampaignLevel` is currently tracking, synchronously and without a request.

**Signature:**
```typescript
public GetActiveCampaignAttempt(): CampaignAttemptData | null
```

**Returns:** `CampaignAttemptData | null` - The tracked attempt, or `null` when none is in flight — before any `StartCampaignLevel`, after a successful `CompleteCampaignLevel`, after `AbandonCampaignAttempt`, or after a completion failed with `AttemptNotFound` or `CompletionTooFast`.

**Usage:**
```typescript
const attempt = this.funtico.sdk.GetActiveCampaignAttempt();
if (attempt) {
  console.log(`A run of level ${attempt.LevelId} is still in flight`);
}
```

---

### `AbandonCampaignAttempt`

Clears the tracked attempt **locally** — no server call is made. There is no abandon endpoint; the server-side attempt simply lapses, or is replaced by the next `StartCampaignLevel`. Call it when the player quits a run without finishing, so a stale attempt cannot be submitted later by mistake.

**Signature:**
```typescript
public AbandonCampaignAttempt(): void
```

**Usage:**
```typescript
onQuitToMenu() {
  this.funtico.sdk.AbandonCampaignAttempt();
  this.scene.start('CampaignMapScene');
}
```

---

### `CompleteCampaignLevel`

Ends a campaign run: validates and normalizes the metrics, encrypts and signs the payload, submits it, and returns the server's graded outcome. Call it once, when the run is over — **whether the player won or lost**.

**Signature:**
```typescript
public async CompleteCampaignLevel(metrics: CampaignMetrics, attempt?: CampaignAttemptData): Promise<CampaignCompletionResult>
```

**Parameters:**
- `metrics` - Flat `name -> value` map of the run's results (`CampaignMetrics`). 1-32 entries; names 1-64 characters; values finite numbers or booleans. Booleans are sent as `1`/`0`; **fractional numbers pass through untruncated** (unlike `EndRoomSP`'s `score`, which the SDK truncates to an integer before sending). A violation throws `CampaignError` with `Code: InvalidMetrics` before anything is sent.
- `attempt` - Optional attempt to submit against, e.g. one you persisted yourself across a reload. Omit it to use the attempt tracked by `StartCampaignLevel`. With neither, the method throws `CampaignError` with `Code: NoActiveAttempt` before any I/O. Completing an explicitly passed attempt never clobbers a **different** attempt the SDK is tracking — tracking is cleared only when it is the same attempt.

**Returns:** `Promise<CampaignCompletionResult>` - The graded outcome. **A loss is a normal resolution** — `IsWin: false, Stars: 0` on a `200` — so render the defeat screen from this same object; only validation and state failures reject.

The SDK encrypts and signs the payload for you with your `privateGameKey` — pass plain metrics and never encrypt anything yourself. Events recorded via `RecordEvent_Client` are folded into the encrypted payload automatically.

**Attempt handling on failure:** the tracked attempt is kept only for retryable failures — network errors and `Unknown` — so the game may retry the same submission after a blip. It is cleared for `AttemptNotFound` **and** `CompletionTooFast`: in both cases the server-side attempt is dead (unknown, or abandoned by the too-fast rejection itself), so a retry can never succeed and a fresh `StartCampaignLevel` is needed.

**On success:** the tracked attempt is consumed, the recorded `RecordEvent_Client` log is cleared (the events were delivered in this submission — the client session itself is untouched), the cached level list is dropped (the unlock cascade is server business — refetch `GetCampaignLevels` to render it), and the cached availability's counts are refreshed from the result.

**CampaignCompletionResult Properties:**
- `IsWin` (`boolean`) - Whether the run met the level's win conditions. `false` is a lost run, not an error.
- `Stars` (`number`) - Stars this run earned, computed server-side from the level's star rules. `0` on a loss.
- `BestStars` (`number`) - The player's best star count on this level after this run.
- `IsNewBest` (`boolean`) - Whether this run improved on the previous best.
- `LevelCompletedFirstTime` (`boolean`) - `true` only on the first-ever win of this level. Use it to gate one-time celebration UI.
- `UnlockedLevelId` (`string | null`) - The level this completion unlocked, or `null` when nothing new unlocked.
- `Rewards` (`CampaignRewardViewModel[]`) - The rewards this completion granted (or would grant), same shape as on the level model.
- `RewardsGranted` (`boolean`) - Whether the rewards in `Rewards` were actually paid out by this completion.
- `TotalLevels` / `CompletedLevels` / `TotalStarsEarned` / `MaxStars` (`number`) - The campaign-wide progress counters, updated for this completion — the same fields `GetCampaignLevels` reports, so a progress HUD can rebind from either.

**Usage:**
```typescript
import { CampaignError, CampaignErrorCode } from './sdk/FunticoPhaserSDK';

async onRunFinished(timeSeconds: number, coins: number, died: boolean) {
  try {
    const result = await this.funtico.sdk.CompleteCampaignLevel({
      time: timeSeconds,     // fractional values are fine
      coins: coins,
      no_damage: !died       // booleans become 1/0 on the wire
    });

    if (result.IsWin) {
      this.showVictory(result.Stars, result.Rewards, result.IsNewBest);
      if (result.UnlockedLevelId) this.showUnlockBanner(result.UnlockedLevelId);
    } else {
      this.showDefeat(); // a loss resolves normally - IsWin false, Stars 0
    }

    // The level cache was dropped - refetch to render the unlock cascade
    await this.funtico.sdk.GetCampaignLevels();
  } catch (error) {
    if (error instanceof CampaignError && error.Code === CampaignErrorCode.AttemptNotFound) {
      // The attempt lapsed server-side; tracking is already cleared - start over
      this.scene.start('CampaignMapScene');
    } else {
      throw error;
    }
  }
}
```

---

### `CampaignError`

The error every Campaign method rejects with, carrying a machine-readable `Code` alongside the human-readable `message`. Branch on `Code` — never on message text, which is free to change.

**Signature:**
```typescript
export class CampaignError extends Error {
  public readonly Code: CampaignErrorCode;
  constructor(code: CampaignErrorCode, message: string)
}
```

**CampaignErrorCode Values:**
- `CampaignNotAvailable` - The game has no active campaign to serve this request.
- `LevelLocked` - The level exists but is not reachable yet — the player must complete the one before it.
- `LevelNotFound` - No level with the given id.
- `NoActiveAttempt` - **Client-side only.** `CompleteCampaignLevel` was called with no attempt tracked and none passed; nothing was sent.
- `AttemptNotFound` - The server no longer knows the attempt (lapsed or already consumed). The SDK clears its tracked attempt on this code — start a new attempt.
- `InvalidSignature` - The encrypted payload failed server-side verification. Almost always a wrong `privateGameKey`.
- `InvalidMetrics` - The metrics violate the contract. Thrown client-side before any I/O when the SDK can see the violation itself; the same code arrives from the server for violations only it can detect.
- `CompletionTooFast` - The run finished faster than the level's `MinDurationSeconds` allows. The server abandons the attempt when rejecting it, so the SDK clears its tracked attempt on this code too — start a new attempt.
- `Unknown` - The response carried no recognisable code (an unparsable body, or an identifier newer than this SDK).

`instanceof CampaignError` is reliable — the constructor restores the prototype chain explicitly — and `error.name` is `'CampaignError'`.

**Usage:**
```typescript
import { CampaignError, CampaignErrorCode } from './sdk/FunticoPhaserSDK';

try {
  await this.funtico.sdk.StartCampaignLevel(level.Id);
} catch (error) {
  if (error instanceof CampaignError) {
    switch (error.Code) {
      case CampaignErrorCode.LevelLocked:
        this.showToast('Finish the previous level to unlock this one.');
        break;
      case CampaignErrorCode.CampaignNotAvailable:
        this.scene.start('MenuScene');
        break;
      default:
        console.error(`Campaign failure [${error.Code}]:`, error.message);
    }
  } else {
    throw error; // not a campaign failure - unauthenticated SDK, programming error, ...
  }
}
```

---

## Inventory Methods

The player's items on the Funtico platform: what they own, how many copies, and what each item means to your game. Items are defined in the Funtico item catalog, where each item can carry **properties** — a JSON object whose game-specific part belongs to your game (for example which module a blueprint unlocks).

These methods are **read-only.** Items are granted by the platform (prizes, rewards) and by server-side flows, never from the game client.

> **Casing note:** Inventory responses are **PascalCase** (`Items`, `GameItemId`, `Count`).

**Failure model.** Inventory methods reject with an `InventoryError` carrying a machine-readable `Code` — branch on the code, never on message text. `ReloginRequired` means the player's Funtico session belongs to another game or has expired: sign the player in to this game again.

---

### `GetInventory`

Fetches the items the player owns.

**Signature:**
```typescript
public async GetInventory(useCache = true, includeOtherItems = false): Promise<InventoryResponse>
```

**Parameters:**
- `useCache` - When `true`, returns the cached copy if one exists and the shared TTL window has not expired. Default: `true`.
- `includeOtherItems` - When `false`, only items that belong to this game are returned. When `true`, platform-wide items the player holds (tickets, vouchers, capsules) are included too. The two scopes are cached separately. Default: `false`.

**Returns:** `Promise<InventoryResponse>` with `Items: InventoryItem[]`.

**InventoryItem Properties:**
- `ItemId` (`number`) - Funtico catalog id of the item — the same id prizes and entry fees refer to.
- `GameItemId` (`string | null`) - Your game's own key for the item, as set in the item catalog.
- `Name`, `Description`, `ImageUrl` - Display data from the catalog.
- `Count` (`number`) - How many copies the player holds.
- `UserItemIds` (`number[]`) - Ids of the individual copies.
- `IsConsumable`, `IsInfinity`, `IsSellable` (`boolean`) - Catalog flags.
- `IsGameItem` (`boolean`) - `true` when the item belongs to this game.
- `Rarity` (`string | null`) - Rarity name from the catalog.
- `PropertiesJson` (`string | null`) - The item's properties as a JSON object string. Parse with `GetInventoryItemProperties`.
- `BaseStatsJson` (`string | null`) - Base stats of an infinity item, as configured in the catalog.
- `Copies` (`InventoryItemCopy[]`) - Per-copy stats of an infinity item (`UserItemId`, `StatsJson`, `"[]"` while a copy has none); empty for other items.

**Usage:**
```typescript
const inventory = await this.funtico.sdk.GetInventory();

for (const item of inventory.Items) {
  this.addInventorySlot(item.Name, item.ImageUrl, item.Count);
}
```

---

### `GetCachedInventory`

Returns the inventory already held in memory — no network call, no TTL check. `null` until `GetInventory` has run for that scope.

**Signature:**
```typescript
public GetCachedInventory(includeOtherItems = false): InventoryResponse | null
```

---

### `FindInventoryItem`

Finds an owned item by your game's own item key.

**Signature:**
```typescript
public FindInventoryItem(inventory: InventoryResponse, gameItemId: string): InventoryItem | null
```

**Usage:**
```typescript
const inventory = await this.funtico.sdk.GetInventory();
const shards = this.funtico.sdk.FindInventoryItem(inventory, 'sg_shard_missile_hornet')?.Count ?? 0;
```

---

### `GetInventoryItemProperties`

Parses an item's `PropertiesJson` into your game's own type. Returns `null` when the item has no properties; throws a plain `Error` when the stored string is not valid JSON.

**Signature:**
```typescript
public GetInventoryItemProperties<T = unknown>(item: InventoryItem): T | null
```

**Usage:**
```typescript
interface ShardProperties {
  game: { type: 'blueprint_shard'; partId: string; forgeNeed: number };
}

const props = this.funtico.sdk.GetInventoryItemProperties<ShardProperties>(item);
if (props?.game.type === 'blueprint_shard') {
  this.showForgeProgress(props.game.partId, item.Count, props.game.forgeNeed);
}
```

---

### `InventoryError`

The error every Inventory method rejects with.

**InventoryErrorCode Values:**
- `NotLinked` - The player is not linked to a Funtico account.
- `ReloginRequired` - The player's Funtico session belongs to another game or has expired. Sign the player in to this game again.
- `PlatformUnavailable` - The Funtico platform did not answer. Try again later.
- `Unknown` - The response carried no recognisable code.

**Usage:**
```typescript
import { InventoryError, InventoryErrorCode } from './sdk/FunticoPhaserSDK';

try {
  await this.funtico.sdk.GetInventory(false);
} catch (error) {
  if (error instanceof InventoryError && error.Code === InventoryErrorCode.ReloginRequired) {
    this.scene.start('LoginScene');
  } else {
    throw error;
  }
}
```

---

## Client Session Methods (Reconnection)

Use these methods in **client builds** (browser / Telegram Mini App) to make a match survivable across a page reload, a dropped connection, or a browser crash. A client session is a small encrypted blob of your own game state stored server-side alongside the room/tournament identifiers, so that a returning player can be dropped back exactly where they left off.

**The reconnection flow, end to end:**

1. **Detect** — at boot, call `UserHasUnfinishedSession_Client()`. It returns every session the player started but never finished, each with a `ReconnectTime` budget in seconds.
2. **Reconnect** — pick a session and pass its `Id` to `ReconnectToUnfinishedSession_Client(id)`. This tells the backend the player is coming back.
3. **Decrypt** — the same call transparently decrypts the stored `Data` blob and hands you back your original plaintext JSON string. You never call `CryptoHelper` yourself.
4. **Resume** — `JSON.parse` the returned string to rebuild your game state, and rebuild the room identifiers from the session itself: `EventId` comes from `SessionId`, and `SessionOrMatchId` comes from `SaveSessionId`. The SDK re-arms its internal session tracking at this point, so `UpdateSession_Client` and `RecordEvent_Client` work immediately without re-creating anything.

**Encryption:**

Your state never travels or rests in plaintext — `CreateSession_Client` and `UpdateSession_Client` encrypt and sign it for you, and `ReconnectToUnfinishedSession_Client` decrypts it on the way back. The SDK must have the player's user data cached before any of these calls; otherwise they throw `"User data is not loaded. Cannot derive session encryption key."` (`Initialize` pre-loads it for you when a `userToken` is supplied.)

**How checkpoints are saved:**

Call `CreateSession_Client` once, immediately after `JoinRoom` / `EnterTournament` and *before* gameplay starts — that way a player who never even finishes loading the scene can still reconnect. Then call `UpdateSession_Client` at your own checkpoints (a Phaser timer every few seconds, level transitions, or after each significant move). Each update overwrites the stored blob wholesale; there is no merge, so always pass a complete state snapshot. The reconnect window is 15 minutes from the moment the session was created — `ReconnectTime` is what remains of it. Once it lapses, the session can no longer be resumed; a `Tournament` session that lapses is additionally auto-finalised with no score.

---

### `UserHasUnfinishedSession_Client`

Retrieves every game session the current player started but has not finished. Call this at game startup, before showing the main menu, to decide whether to offer the player a "resume match" prompt.

**Signature:**
```typescript
public async UserHasUnfinishedSession_Client(): Promise<UnfinishedSessionsResponse>
```

**Returns:** `Promise<UnfinishedSessionsResponse>` - A wrapper containing the list of resumable sessions. The list is empty when the player has nothing to resume. A player may have more than one entry — for example, an abandoned single-player room and an in-progress multiplayer match — so either let the player choose or pick one deliberately.

**UnfinishedSessionsResponse Properties:**
- `SavedSessions` (`SavedSessionResponse[]`) - Every session the player can still return to. Sessions whose reconnect window has already lapsed are not listed, so anything present here is genuinely resumable.

**SavedSessionResponse Properties:**
- `Id` (`string`) - The session record's own unique identifier (a GUID). This is the handle you pass to `ReconnectToUnfinishedSession_Client` — it is *not* the room or match id.
- `SessionId` (`string`) - The event/room identifier the session belongs to. This is the value you originally passed as `eventId`, and it is what you feed back into `EndRoomSP`, `GetLeaderboard`, etc. as `RoomSessionData.EventId`.
- `SaveSessionId` (`string`) - The match/session identifier for the specific play attempt — the value originally passed as `saveSessionId`, equivalent to `RoomSessionData.SessionOrMatchId` (or a tournament's `TournamentEnterData.TournamentScoreUuid`).
- `GameType` (`number`) - Which mode the session belongs to, as the numeric value of `GameTypeEnum` (e.g. `4` for Rooms). Use it to route the player to the correct scene on resume.
- `ReconnectTime` (`number`) - Seconds left in the reconnect window, counted down from a 15-minute budget that starts when the session was created. Show it as a countdown on your resume prompt.
- `Data` (`string`) - The stored game state. To read it, call `ReconnectToUnfinishedSession_Client`, which returns the decrypted state.

**Usage:**
```typescript
export class BootScene extends Phaser.Scene {
  async create() {
    const unfinished = await this.funtico.sdk.UserHasUnfinishedSession_Client();

    if (unfinished.SavedSessions.length === 0) {
      this.scene.start('MenuScene');
      return;
    }

    const session = unfinished.SavedSessions[0];
    console.log(`Unfinished match in room ${session.SessionId}`);
    console.log(`You have ${Math.floor(session.ReconnectTime)}s left to resume`);

    this.registry.set('reconnectSession', session);
    this.scene.start('ResumePromptScene');
  }
}
```

---

### `ReconnectToUnfinishedSession_Client`

Reconnects to one specific unfinished session and returns the decrypted game state that was stored with it. Call this once the player has confirmed they want to resume.

**Signature:**
```typescript
public async ReconnectToUnfinishedSession_Client(id: string): Promise<string>
```

**Parameters:**
- `id` - The session record identifier, taken from `SavedSessionResponse.Id` in the `UserHasUnfinishedSession_Client` response. Passing a room or match id here will not work.

**Returns:** `Promise<string>` - The original plaintext JSON string you last stored via `CreateSession_Client` or `UpdateSession_Client`. Decryption happens inside the SDK, so you receive exactly the string you passed in and can `JSON.parse` it directly.

**Usage:**
```typescript
export class GameScene extends Phaser.Scene {
  private score = 0;

  async create() {
    const reconnectSession = this.registry.get('reconnectSession');

    // Decryption is handled internally - this is your original JSON back.
    const stateJson = await this.funtico.sdk.ReconnectToUnfinishedSession_Client(reconnectSession.Id);
    const savedState = JSON.parse(stateJson);

    this.score = savedState.score;
    this.player.setHealth(savedState.hp);

    // Rebuild the room identifiers straight from the saved session.
    this.registry.set('activeSession', {
      EventId: reconnectSession.SessionId,
      SessionOrMatchId: reconnectSession.SaveSessionId
    });

    // Session tracking is already re-armed - UpdateSession_Client works right away.
    await this.funtico.sdk.UpdateSession_Client(JSON.stringify(savedState));
  }
}
```

**Important Notes:**
- The SDK re-arms its internal session tracking from the response, so `UpdateSession_Client`, `RecordEvent_Client`, and the auto-close inside `EndRoomSP` all work afterwards without calling `CreateSession_Client` again.
- The recorded event list is cleared on reconnect — events logged before the disconnect are not restored, and `GetCurrentSessionEvents_Client` starts empty again for the resumed run.
- Requires cached user data. `Initialize` pre-loads it when you pass a `userToken`.

---

### `CreateSession_Client`

Creates a new server-side session and stores an encrypted snapshot of your game state in it. Call it right after joining a room or entering a tournament and before gameplay begins, so that even a player who fails to load the scene can still reconnect.

**Signature:**
```typescript
public async CreateSession_Client(
  json: string,
  gameType: GameTypeEnum,
  eventId: string,
  saveSessionId: string
): Promise<SavedSessionResponse>
```

**Parameters:**
- `json` - Your game state serialized to a JSON string. The SDK encrypts it before it leaves the client; pass plain JSON, never pre-encrypted data. Its shape is entirely yours — the backend stores it opaquely.
- `gameType` - Which mode this session belongs to. See the `GameTypeEnum` values below; use `GameTypeEnum.Rooms` for a standard room match and `GameTypeEnum.Tournament` for a special tournament attempt.
- `eventId` - The event/room identifier — `RoomSessionData.EventId` from `JoinRoom`.
- `saveSessionId` - The match/session identifier for this attempt — `RoomSessionData.SessionOrMatchId` from `JoinRoom`, or `TournamentEnterData.TournamentScoreUuid` from `EnterTournament`.

**Returns:** Resolves to an object carrying `Id` and `SessionId`. `Id` is the handle a later reconnect will use, though you normally do not need to store it: the SDK tracks the active session internally for `UpdateSession_Client`.

**GameTypeEnum Values:**
- `Indirect_PVP = 0` - Asynchronous player-versus-player, where opponents play the same challenge at different times.
- `Direct_PVP = 1` - Real-time player-versus-player.
- `Tournament = 3` - A special tournament attempt. If a session of this type expires unresumed, the backend finalises the attempt with no score rather than leaving it dangling.
- `Rooms = 4` - A standard room/lobby match — the usual value for the `JoinRoom` → `EndRoomSP` flow.
- `Practice = 5` - Practice/training mode with no entry fee or prizes.
- `MultiplayerPvp = 6` - Real-time server-authoritative multiplayer, driven by a dedicated server rather than by the client.

**Returned Object Properties:**
- `Id` (`string`) - The new session record's unique identifier (a GUID), used later as the `id` argument to `ReconnectToUnfinishedSession_Client`.
- `SessionId` (`string`) - The event/room identifier this session was created against — echoes the `eventId` you passed in.

The `gameType` and `saveSessionId` you passed in are not echoed back; read them from your own variables. `ReconnectTime` is reported by `UserHasUnfinishedSession_Client`.

**Usage:**
```typescript
import { GameTypeEnum } from '../sdk/FunticoPhaserSDK';

export class GameScene extends Phaser.Scene {
  async create() {
    const room = this.registry.get('selectedRoom');

    const session = await this.funtico.sdk.JoinRoom(room.Guid);
    this.registry.set('activeSession', session);

    // Checkpoint the initial state immediately, so a failed scene load still
    // leaves the player something to reconnect to.
    const initialState = { score: 0, hp: 100, level: 1, seed: this.rngSeed };

    const saved = await this.funtico.sdk.CreateSession_Client(
      JSON.stringify(initialState),
      GameTypeEnum.Rooms,
      session.EventId,
      session.SessionOrMatchId
    );

    console.log(`Reconnection armed. Session record: ${saved.Id}`);
  }
}
```

**Important Notes:**
- Encryption is automatic — do not encrypt `json` yourself.
- Requires cached user data. `Initialize` pre-loads it when you pass a `userToken`.
- Creating a session resets the recorded event list, so `RecordEvent_Client` starts from a clean slate for the new match.

---

### `UpdateSession_Client`

Overwrites the active session's stored state with a fresh snapshot. Call it at your checkpoints — on a timer, at level transitions, or after each meaningful game action — so a reconnecting player loses as little progress as possible.

**Signature:**
```typescript
public async UpdateSession_Client(json: string): Promise<boolean>
```

**Parameters:**
- `json` - The complete current game state as a JSON string. The stored blob is replaced wholesale rather than merged, so send a full snapshot, not a delta. The SDK encrypts it before sending.

**Returns:** `Promise<boolean>` - `true` when the checkpoint was stored.

**Usage:**
```typescript
export class GameScene extends Phaser.Scene {
  private score = 0;
  private level = 1;

  async create() {
    // ... JoinRoom + CreateSession_Client ...

    // Autosave a checkpoint every 10 seconds.
    this.time.addEvent({
      delay: 10000,
      loop: true,
      callbackScope: this,
      callback: () => this.autoSaveProgress()
    });
  }

  async autoSaveProgress() {
    const snapshot = { score: this.score, hp: this.player.health, level: this.level };
    const saved = await this.funtico.sdk.UpdateSession_Client(JSON.stringify(snapshot));

    if (saved) {
      console.log('Checkpoint stored');
    }
  }
}
```

**Important Notes:**
- Throws `"No active client session found to update. Create or Reconnect first."` when no session is being tracked — call `CreateSession_Client` or `ReconnectToUnfinishedSession_Client` first.
- Safe to call repeatedly throughout the match; each call replaces the previous checkpoint.

---

### `CloseCurrentSession_Client`

Clears the SDK's local client-session tracking — the active session record, the room/match identifiers, and the recorded event list. Games rarely call this directly, because the SDK already calls it for you when a match is finalised.

**Signature:**
```typescript
public CloseCurrentSession_Client(): void
```

**Usage:**
```typescript
// Called automatically at the end of EndRoomSP and ResultTournament_Client.
await this.funtico.sdk.EndRoomSP(session.EventId, session.SessionOrMatchId, this.score, user.UserId);
// Local session tracking is now cleared; GetCurrentSessionEvents_Client() returns [].

// Call it yourself only to abandon local tracking without submitting a result,
// e.g. when tearing a scene down after the player backs out.
this.funtico.sdk.CloseCurrentSession_Client();
```

**Important Notes:**
- Synchronous and purely local — it makes no network call and does not delete the session on the backend.
- Invoked automatically by `EndRoomSP` and `ResultTournament_Client` once the score has been accepted.
- After it runs, `UpdateSession_Client` will throw until a new session is created or reconnected.

---

### `RecordEvent_Client`

Appends a gameplay event to the current session's event log. Record the actions that describe how a score came about; the log is submitted together with the result.

**Signature:**
```typescript
public RecordEvent_Client(eventInfo: string): void
```

**Parameters:**
- `eventInfo` - The event as a string. A JSON string is the useful form, since it lets you carry a type, payload, and timestamp, but any string is accepted and stored verbatim.

**Usage:**
```typescript
export class GameScene extends Phaser.Scene {
  onPowerUpUsed(powerUpName: string) {
    this.funtico.sdk.RecordEvent_Client(JSON.stringify({
      type: 'powerup_used',
      powerup: powerUpName,
      score: this.score,
      timestamp: Date.now()
    }));
  }

  onChestOpened(chestId: number) {
    this.funtico.sdk.RecordEvent_Client(JSON.stringify({
      type: 'chest_opened',
      chestId,
      timestamp: Date.now()
    }));
  }
}
```

**Important Notes:**
- Synchronous and local — events are buffered in memory and only leave the client when the match is finalised.
- The buffer is attached automatically as `GameEvents` when you call `ResultTournament_Client`, and by `EndRoomSP` whenever you leave its `gameEvents` argument empty.
- The buffer is reset by `CreateSession_Client`, `ReconnectToUnfinishedSession_Client`, and `CloseCurrentSession_Client`.

---

### `RecordCollected_Client`

Counts an item the player collected during the current run, such as a chest. The game only reports what was collected; what the player receives for it is set up on the platform.

**Signature:**
```typescript
public RecordCollected_Client(key: string, count = 1): void
```

**Parameters:**
- `key` - The reward key agreed for your game, for example `chest_1`. Other keys earn nothing.
- `count` - How many to add. Default: `1`.

**Usage:**
```typescript
export class GameScene extends Phaser.Scene {
  onChestCollected() {
    this.funtico.sdk.RecordCollected_Client('chest_1');
  }
}
```

**Important Notes:**
- Synchronous and local. The counts leave the client with the result of `EndRoomSP` or `ResultTournament_Client`, including when the run was lost (`isSuccess: false`).
- Each key has a limit per run. Agree it together with the key, so that a normal run cannot exceed it.
- `CreateSession_Client`, `ReconnectToUnfinishedSession_Client`, and `CloseCurrentSession_Client` reset the counts. To keep them across a reconnect, store them in your session state and record them again with `count` after resuming.
- A failed `EndRoomSP` or `ResultTournament_Client` keeps the counts, so a retry still sends them. `CompletePractice` and `CompleteCampaignLevel` do not send them: do not record anything in those modes.
- An invalid call (empty key, or a count that is not a positive integer) logs an error and is ignored.

---

### `GetCurrentSessionCollected_Client`

Returns a copy of what the current run has collected so far, by reward key. Useful for a counter on the HUD or the results screen, and for saving the counts in your session state.

**Signature:**
```typescript
public GetCurrentSessionCollected_Client(): Record<string, number>
```

---

### `GetCurrentSessionEvents_Client`

Returns everything recorded so far in the current session via `RecordEvent_Client`. Useful for debugging your event stream, or for inspecting or filtering the log before passing it explicitly to `EndRoomSP`.

**Signature:**
```typescript
public GetCurrentSessionEvents_Client(): string[]
```

**Returns:** `string[]` - A copy of the recorded event strings, in the order they were recorded. Empty when nothing has been recorded yet, or after the session was closed or reconnected. Mutating the returned array does not affect the SDK's internal buffer.

**Usage:**
```typescript
const events = this.funtico.sdk.GetCurrentSessionEvents_Client();
console.log(`Recorded ${events.length} events this run`);

events.forEach(raw => {
  const parsed = JSON.parse(raw);
  console.log(`${parsed.type} @ ${parsed.timestamp}`);
});

// Optionally hand a curated log to EndRoomSP instead of letting it use the buffer.
const user = this.funtico.sdk.GetCachedUserData()!;
await this.funtico.sdk.EndRoomSP(
  session.EventId,
  session.SessionOrMatchId,
  this.score,
  user.UserId,
  '127.0.0.1',
  events
);
```

---

## Phaser Plugin Integration

`FunticoPhaserPlugin` is a thin Phaser 3 wrapper around the `FunticoSDK` singleton. It extends `Phaser.Plugins.BasePlugin`, exposes the underlying SDK through its public `sdk` property, and re-broadcasts the most important SDK state changes on the Phaser game event bus so any Scene can react to them without polling.

Register it as a **global plugin** in your Phaser game config with the mapping `funtico`. Phaser then injects the plugin instance into every Scene as `this.funtico`, and the full SDK surface is reachable at `this.funtico.sdk`:

```typescript
import Phaser from 'phaser';
import { FunticoPhaserPlugin } from './sdk/FunticoPhaserSDK';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: [BootScene, MenuScene, GameScene],
  plugins: {
    global: [
      {
        key: 'FunticoSDK',
        plugin: FunticoPhaserPlugin,
        start: true,
        mapping: 'funtico' // Scenes access the plugin via this.funtico, the SDK via this.funtico.sdk
      }
    ]
  }
};

const game = new Phaser.Game(config);
```

All plugin events are emitted on `this.game.events` (the global `Phaser.Events.EventEmitter` owned by the `Phaser.Game` instance), **not** on the Scene's own emitter. Subscribe from any Scene with `this.game.events.on(...)`:

```typescript
import { FunticoPhaserPlugin } from '../sdk/FunticoPhaserSDK';

export class MenuScene extends Phaser.Scene {
  create() {
    this.game.events.on(FunticoPhaserPlugin.EVENTS.BALANCE_UPDATED, this.onBalance, this);

    // Global emitters outlive Scenes - always unsubscribe on shutdown
    this.events.once('shutdown', () => {
      this.game.events.off(FunticoPhaserPlugin.EVENTS.BALANCE_UPDATED, this.onBalance, this);
    });
  }

  private onBalance(balance: BalanceResponse) {
    this.coinsText.setText(`${balance.Coins}`);
  }
}
```

---

### `constructor`

Created by Phaser's `PluginManager` when the plugin is registered — you never call it directly. It stores `FunticoSDK.Instance` in the public `sdk` property, so the plugin and any direct `FunticoSDK.Instance` usage elsewhere in your codebase share the exact same SDK state (JWT, caches, tracked sessions).

**Signature:**
```typescript
constructor(pluginManager: Phaser.Plugins.PluginManager)
```

**Parameters:**
- `pluginManager` - Phaser's plugin manager, passed in automatically by the engine when it instantiates the plugin from the game config.

**Public Properties:**
- `sdk` (`FunticoSDK`) - The `FunticoSDK` singleton. Every SDK method not wrapped by the plugin (rooms, tournaments, Hall of Fame, sessions) is called through this property.
- `EVENTS` (`static readonly`) - Map of Phaser event keys emitted by the plugin. See the `EVENTS` block below.

**Usage:**
```typescript
// Inside any Scene, after registering the plugin with mapping: 'funtico'
export class BootScene extends Phaser.Scene {
  create() {
    // The plugin wrapper
    console.log(this.funtico);

    // The SDK itself - full method surface
    console.log(this.funtico.sdk === FunticoSDK.Instance); // true
  }
}
```

---

### `init`

Initializes the SDK inside the Phaser lifecycle and announces the result on the game event bus. Call this once from your boot Scene before any other Funtico call.

**Signature:**
```typescript
public async init(config: FunticoConfig): Promise<void>
```

**Parameters:**
- `config` - SDK configuration object. See the properties block below.

**Returns:** `Promise<void>` - Resolves once initialization has finished (or once a failure has been caught and logged).

**FunticoConfig Properties:**
- `env` (`FunticoEnvironment`) - Target environment: `FunticoEnvironment.STAGING` (`'staging'`) or `FunticoEnvironment.PROD` (`'prod'`). Selects the default API host when `apiBaseUrl` is not supplied.
- `privateGameKey` (`string`) - Your game's secret key from the Funtico Developer Portal. Used to sign and encrypt payloads. Never ship it in a public client build.
- `publicGameKey` (`string`) - Your game's public key from the Funtico Developer Portal, sent with every request.
- `userToken` (`string`, optional) - The player's Funtico platform token. When present, `Initialize` immediately authenticates the player and pre-loads user data, balance and vouchers, so cached getters work right after `init` resolves. Omit it to initialize the SDK unauthenticated and call `login()` later.
- `apiBaseUrl` (`string`, optional) - Overrides the environment-derived API host. Point this at your game's own API gateway if you proxy Funtico requests. Default: `https://funtico-sdk-staging.azurewebsites.net` for `STAGING`, `https://funtico-sdk.azurewebsites.net` for `PROD`.
- `cacheTTL` (`number`, optional) - Lifetime of the user-data / balance / voucher / campaign cache, in milliseconds. Once expired, calls with `useCache = true` hit the network again. Default: `30000`.

**Emits:**
- `EVENTS.INITIALIZED` - Always, once `sdk.Initialize(config)` resolves.
- `EVENTS.AUTHENTICATED` - Additionally, if a JWT is present after initialization (i.e. `config.userToken` was supplied and the token exchange succeeded). Payload: the JWT string.

**Usage:**
```typescript
import Phaser from 'phaser';
import { FunticoEnvironment, FunticoPhaserPlugin } from '../sdk/FunticoPhaserSDK';

export class BootScene extends Phaser.Scene {
  async create() {
    this.game.events.once(FunticoPhaserPlugin.EVENTS.INITIALIZED, () => {
      console.log('Funtico SDK ready');
    });

    const platformToken = new URLSearchParams(window.location.search).get('token') ?? '';

    await this.funtico.init({
      env: FunticoEnvironment.STAGING,
      publicGameKey: 'your-public-key',
      privateGameKey: 'your-private-key',
      userToken: platformToken,
      cacheTTL: 30000
    });

    // If init failed, no JWT was stored and this returns an empty string
    if (!this.funtico.sdk.getUserToken()) {
      this.scene.start('ErrorScene');
      return;
    }

    this.scene.start('MenuScene');
  }
}
```

**Important Notes:**
- `init()` **catches and logs initialization errors instead of throwing.** Any failure inside `sdk.Initialize(config)` is swallowed and written to the console as `[FunticoPhaserPlugin] Initialization error: ...`, and the returned promise still resolves. `await this.funtico.init(...)` therefore never rejects, and a `try/catch` around it will not fire.
- This includes config validation. An invalid config (see [`Initialize`](#initialize) → **Throws**) shows up only as the console error `[FunticoPhaserPlugin] Initialization error: Error: Invalid FunticoConfig: ...`, while `init()` still resolves and `EVENTS.INITIALIZED` is not emitted. If you need to catch it — for example to show a configuration error instead of failing silently — call `FunticoSDK.Instance.Initialize(config)` directly inside `try/catch`.
- After a swallowed failure the SDK stays uninitialized, so the next calls fail with their own, less helpful errors: `login()` (`Authentication`), `GetRoomPublic` and `GetCampaignAvailability` throw `TypeError: Cannot read properties of undefined (reading 'publicGameKey')`, and calls that need a JWT throw `"SDK is not authenticated..."`. If you see either, look earlier in the console for the `[FunticoPhaserPlugin] Initialization error` line.
- Because failures are silent, do not treat a resolved `init()` as proof of success. Detect failure either by listening for `EVENTS.INITIALIZED` (never emitted if `Initialize` threw) or by checking `this.funtico.sdk.getUserToken()` for a non-empty JWT afterwards.
- The unwrapped `FunticoSDK.Instance.Initialize(config)` **does** throw. Use it directly if you want to handle initialization errors yourself.

---

### `login`

Exchanges a Funtico platform token for the game's JWT and announces the new authentication state to all Scenes. Use it when the player was not authenticated at `init()` time, or when a token needs refreshing mid-session.

**Signature:**
```typescript
public async login(platformToken: string): Promise<any>
```

**Parameters:**
- `platformToken` - The player's Funtico platform token, as issued by the Funtico platform (for example from the launch URL query string). This is the platform-side token, not the SDK's JWT.

**Returns:** `Promise<any>` - The raw JSON body returned by `POST /Auth/funtico-auth`. The SDK reads its `Token` field and stores it as the JWT used for all subsequent authenticated requests; retrieve that value at any time via `sdk.getUserToken()`.

**Emits:**
- `EVENTS.AUTHENTICATED` - After a successful exchange. Payload: the JWT string (`sdk.getUserToken()`).

**Usage:**
```typescript
import { FunticoPhaserPlugin } from '../sdk/FunticoPhaserSDK';

export class LoginScene extends Phaser.Scene {
  create() {
    this.game.events.on(FunticoPhaserPlugin.EVENTS.AUTHENTICATED, (jwt: string) => {
      console.log('Authenticated, JWT length:', jwt.length);
      this.scene.start('MenuScene');
    });
  }

  async signIn(platformToken: string) {
    try {
      await this.funtico.login(platformToken);
    } catch (error) {
      // Unlike init(), login() propagates failures
      console.error('Funtico login failed', error);
    }
  }
}
```

**Important Notes:**
- Unlike `init()`, `login()` does **not** swallow errors — a failed token exchange rejects the promise, so wrap it in `try/catch`.
- `login()` only authenticates; it does not pre-load user data, balance or vouchers the way `init()` with a `userToken` does. Follow it with `refreshUserData()` / `refreshBalance()` to populate the caches.

---

### `refreshUserData`

Fetches the player's full profile and broadcasts it, so HUD Scenes can rebind without each one making its own request.

**Signature:**
```typescript
public async refreshUserData(useCache = false): Promise<UserData>
```

**Parameters:**
- `useCache` - When `true`, returns the cached profile if it exists and the cache has not passed `cacheTTL`; when `false`, always hits `GET /User/get-full-data`. Note the plugin's default differs from `sdk.GetUserData`, which defaults to `true`. Default: `false`.

**Returns:** `Promise<UserData>` - The player's profile data. The same object is passed as the payload of `EVENTS.USER_DATA_UPDATED`.

**UserData Properties:**
- `Name` (`string`) - The player's display name / username.
- `UserId` (`number`) - The player's SDK-side identifier. This is the value passed as `userId` to `EndRoomSP` and `ResultTournament_Server`.
- `PlatformId` (`number`) - The player's identifier on the Funtico platform. Match leaderboard rows against this value.
- `Level` (`number`) - The player's current level.
- `Rating` (`number`) - The player's rating.
- `Experience` (`number`) - Current experience points at the current level.
- `ExperienceToLevel` (`number`) - Experience required to reach the next level.
- `Coins` (`number`) - In-game currency (IC) balance. Matched against `EntryFeeType.IC`.
- `Diamonds` (`number`) - Premium platform currency (TICO) balance. Matched against `EntryFeeType.Tico`.
- `SemiFinalTickets` (`number`) - Number of semi-final tickets held. Matched against `EntryFeeType.SemifinalsTickets`.
- `FinalTickets` (`number`) - Number of final tickets held. Matched against `EntryFeeType.FinalTickets`.
- `PrivateTickets` (`number`) - Number of private-room tickets held. Matched against `EntryFeeType.PrivateTickets`.
- `KYCVerified` (`boolean`) - Whether the player has completed KYC verification. Rooms with `RequireKyc = true` can only be entered when this is `true`.
- `SoundsValue` (`number`) - The player's stored sound-effects volume preference, so it can be carried across games.
- `MusicValue` (`number`) - The player's stored music volume preference.

**Emits:**
- `EVENTS.USER_DATA_UPDATED` - After the fetch resolves. Payload: the `UserData` object.

**Usage:**
```typescript
export class MenuScene extends Phaser.Scene {
  async create() {
    // Force a fresh fetch and broadcast it to every listening Scene
    const user = await this.funtico.refreshUserData();

    this.add.text(16, 16, `${user.Name}  Lv.${user.Level}`);
    this.add.text(16, 40, `XP ${user.Experience}/${user.ExperienceToLevel}`);

    if (!user.KYCVerified) {
      this.add.text(16, 64, 'KYC required for Champion rooms');
    }
  }
}
```

---

### `refreshBalance`

Fetches the player's currency and ticket balance and broadcasts it. Call it after any action that can change the balance — joining a paid room, finishing a match, claiming a prize — to keep every currency HUD in sync.

**Signature:**
```typescript
public async refreshBalance(useCache = false): Promise<BalanceResponse>
```

**Parameters:**
- `useCache` - When `true`, returns the cached balance if one exists and the cache has not passed `cacheTTL`; when `false`, always hits `GET /User/get-balance`. Note the plugin's default differs from `sdk.GetBalance`, which defaults to `true`. Default: `false`.

**Returns:** `Promise<BalanceResponse>` - The player's balance. The same object is passed as the payload of `EVENTS.BALANCE_UPDATED`.

**BalanceResponse Properties:**
- `Coins` (`number`) - In-game currency (IC) balance.
- `Diamonds` (`number`) - Premium platform currency (TICO) balance.
- `SemiFinalTickets` (`number`) - Number of semi-final tickets held.
- `FinalTickets` (`number`) - Number of final tickets held.
- `PrivateTickets` (`number`) - Number of private-room tickets held.
- `KYCVerified` (`boolean`) - Whether the player has completed KYC verification. Included here so a currency HUD can gate KYC-restricted rooms without also fetching the full profile.

**Emits:**
- `EVENTS.BALANCE_UPDATED` - After the fetch resolves. Payload: the `BalanceResponse` object.

**Usage:**
```typescript
import { FunticoPhaserPlugin } from '../sdk/FunticoPhaserSDK';

export class HudScene extends Phaser.Scene {
  private coinsText!: Phaser.GameObjects.Text;

  create() {
    this.coinsText = this.add.text(16, 16, '');

    const onBalance = (balance: BalanceResponse) => {
      this.coinsText.setText(`${balance.Coins} IC | ${balance.Diamonds} TICO`);
    };

    this.game.events.on(FunticoPhaserPlugin.EVENTS.BALANCE_UPDATED, onBalance);
    this.events.once('shutdown', () => {
      this.game.events.off(FunticoPhaserPlugin.EVENTS.BALANCE_UPDATED, onBalance);
    });

    void this.funtico.refreshBalance();
  }

  async onMatchFinished() {
    // Prize payouts land server-side - bypass the cache to show the real number
    await this.funtico.refreshBalance(false);
  }
}
```

---

### `refreshCampaign`

Fetches the campaign level list and broadcasts it, so a level-select or progress Scene can rebind without owning the request. Mirrors `refreshBalance`: the SDK call plus an event.

**Signature:**
```typescript
public async refreshCampaign(useCache = false): Promise<CampaignLevelsViewModel>
```

**Parameters:**
- `useCache` - Forwarded to `sdk.GetCampaignLevels`. Note the plugin's default differs from the SDK method, which defaults to `true`. Default: `false`.

**Returns:** `Promise<CampaignLevelsViewModel>` - The campaign level list. The same object is passed as the payload of `EVENTS.CAMPAIGN_PROGRESS_UPDATED`. Rejects like `GetCampaignLevels` does (with a `CampaignError`); nothing is emitted on failure.

**Emits:**
- `EVENTS.CAMPAIGN_PROGRESS_UPDATED` - After the fetch resolves. Payload: the `CampaignLevelsViewModel` object.

**Usage:**
```typescript
export class CampaignMapScene extends Phaser.Scene {
  async create() {
    // Force a fresh fetch and broadcast it to every listening Scene
    const campaign = await this.funtico.refreshCampaign();
    this.renderLevelSelect(campaign.Levels);
  }
}
```

---

### `completeCampaignLevel`

Submits a finished campaign run through the SDK and broadcasts the graded outcome, so result popups and progress HUDs in other Scenes update without being called directly.

**Signature:**
```typescript
public async completeCampaignLevel(metrics: CampaignMetrics): Promise<CampaignCompletionResult>
```

**Parameters:**
- `metrics` - The run's metrics, forwarded to `sdk.CompleteCampaignLevel`. Same contract: 1-32 entries, names 1-64 chars, finite numbers or booleans, fractional values allowed. The submission runs against the attempt tracked by `StartCampaignLevel` — the plugin wrapper has no `attempt` parameter, so call `sdk.CompleteCampaignLevel(metrics, attempt)` directly when you need to pass one explicitly.

**Returns:** `Promise<CampaignCompletionResult>` - The graded outcome (a loss resolves normally with `IsWin: false`). The same object is passed as the payload of `EVENTS.CAMPAIGN_PROGRESS_UPDATED`. Rejects like `CompleteCampaignLevel` does; nothing is emitted on failure.

**Emits:**
- `EVENTS.CAMPAIGN_PROGRESS_UPDATED` - After a successful submission. Payload: the `CampaignCompletionResult` object.

**Usage:**
```typescript
export class CampaignGameScene extends Phaser.Scene {
  async onRunFinished() {
    const result = await this.funtico.completeCampaignLevel({
      time: this.elapsedSeconds,
      coins: this.coins,
      no_damage: !this.tookDamage
    });

    this.scene.start('CampaignResultScene', { result });
  }
}
```

---

### `refreshInventory`

Fetches the player's inventory and broadcasts it, so an inventory Scene can rebind without owning the request.

**Signature:**
```typescript
public async refreshInventory(useCache = false, includeOtherItems = false): Promise<InventoryResponse>
```

**Returns:** `Promise<InventoryResponse>` - The same object is passed as the payload of `EVENTS.INVENTORY_UPDATED`. Rejects like `GetInventory` does (with an `InventoryError`); nothing is emitted on failure.

**Emits:**
- `EVENTS.INVENTORY_UPDATED` - After the fetch resolves. Payload: the `InventoryResponse` object.

---

### `EVENTS`

Static map of the Phaser event keys the plugin emits. Reference these constants instead of hard-coding the raw strings — the constants are part of the SDK's public surface, the string values are an implementation detail.

**Signature:**
```typescript
public static readonly EVENTS = {
  INITIALIZED: 'funtico_initialized',
  AUTHENTICATED: 'funtico_authenticated',
  USER_DATA_UPDATED: 'funtico_user_updated',
  BALANCE_UPDATED: 'funtico_balance_updated',
  CAMPAIGN_PROGRESS_UPDATED: 'funtico_campaign_progress_updated',
  INVENTORY_UPDATED: 'funtico_inventory_updated'
}
```

**EVENTS Properties:**
- `INITIALIZED` (`'funtico_initialized'`) - Emitted by `init()` once `sdk.Initialize(config)` resolves successfully. **Payload:** none — the listener receives no arguments. Not emitted when initialization throws, which makes it the reliable success signal for the otherwise silent `init()`.
- `AUTHENTICATED` (`'funtico_authenticated'`) - Emitted whenever a JWT has been obtained: by `init()` when `config.userToken` produced a token, and by `login()` after every successful token exchange. **Payload:** `token: string` — the SDK's JWT (`sdk.getUserToken()`), i.e. the game-side token sent in the `Authorization: Bearer` header, not the Funtico platform token. May fire more than once per session if you re-authenticate.
- `USER_DATA_UPDATED` (`'funtico_user_updated'`) - Emitted by `refreshUserData()` after the profile has been retrieved. **Payload:** `data: UserData` — the same object the method returns (see the `UserData` properties above). Only the plugin wrapper emits it; calling `sdk.GetUserData()` directly fires nothing.
- `BALANCE_UPDATED` (`'funtico_balance_updated'`) - Emitted by `refreshBalance()` after the balance has been retrieved. **Payload:** `balance: BalanceResponse` — the same object the method returns (see the `BalanceResponse` properties above). Only the plugin wrapper emits it; calling `sdk.GetBalance()` directly fires nothing.
- `CAMPAIGN_PROGRESS_UPDATED` (`'funtico_campaign_progress_updated'`) - Emitted by both campaign wrappers, with **different payloads**: `refreshCampaign()` emits the `CampaignLevelsViewModel` it fetched, `completeCampaignLevel()` emits the `CampaignCompletionResult` it received. Both carry the shared `CampaignProgressSummary` counters (`TotalLevels`, `CompletedLevels`, `TotalStarsEarned`, `MaxStars`), so a progress HUD can bind to those fields and handle either payload; check for a distinguishing field (e.g. `'Levels' in payload`) before reading anything payload-specific. Only the plugin wrappers emit it; calling `sdk.GetCampaignLevels()` or `sdk.CompleteCampaignLevel()` directly fires nothing.
- `INVENTORY_UPDATED` (`'funtico_inventory_updated'`) - Emitted by `refreshInventory()` after the inventory has been retrieved. **Payload:** the `InventoryResponse` object. Calling `sdk.GetInventory()` directly fires nothing.

**Usage:**
```typescript
import Phaser from 'phaser';
import {
  FunticoPhaserPlugin,
  UserData,
  BalanceResponse
} from '../sdk/FunticoPhaserSDK';

export class ProfileScene extends Phaser.Scene {
  create() {
    const E = FunticoPhaserPlugin.EVENTS;

    this.game.events.on(E.INITIALIZED, () => {
      console.log('SDK initialized');
    });

    this.game.events.on(E.AUTHENTICATED, (token: string) => {
      console.log('JWT received:', token.slice(0, 8) + '...');
    });

    this.game.events.on(E.USER_DATA_UPDATED, (data: UserData) => {
      this.nameText.setText(data.Name);
      this.levelText.setText(`Level ${data.Level}`);
    });

    this.game.events.on(E.BALANCE_UPDATED, (balance: BalanceResponse) => {
      this.coinsText.setText(`${balance.Coins}`);
      this.ticoText.setText(`${balance.Diamonds}`);
    });

    this.events.once('shutdown', () => {
      this.game.events.off(E.INITIALIZED);
      this.game.events.off(E.AUTHENTICATED);
      this.game.events.off(E.USER_DATA_UPDATED);
      this.game.events.off(E.BALANCE_UPDATED);
    });
  }
}
```

**Important Notes:**
- Events fire on `game.events`, which lives for the entire lifetime of the `Phaser.Game`. Listeners registered in a Scene's `create()` are **not** removed automatically when that Scene shuts down — remove them on `'shutdown'` or you will accumulate duplicate handlers on every Scene restart.
- `INITIALIZED` and the first `AUTHENTICATED` are typically emitted during the boot Scene, before other Scenes exist. Use `game.events.once(...)` from the boot Scene, or check `sdk.getUserToken()` / `sdk.GetCachedUserData()` directly in Scenes that start later.
- Only the plugin wrapper methods emit events. Direct `this.funtico.sdk.*` calls never touch the event bus, so a Scene that refreshes data through the SDK directly must update its own UI.

---

## Utilities & Types

These are static helper classes exported alongside `FunticoSDK`. They are not part of the SDK instance surface — call them directly off the class (`CryptoHelper.encrypt(...)`, `PrizeUtils.calculatePrize(...)`).

---

### `CryptoHelper.encrypt`

Encrypts a plaintext string and returns the ciphertext as Base64. The SDK calls this internally for every payload that needs it; games rarely need it.

**Signature:**
```typescript
public static async encrypt(plainText: string, keyStr: string): Promise<string>
```

**Parameters:**
- `plainText` - The string to encrypt. Typically a `JSON.stringify`-ed payload object.
- `keyStr` - The key material.

**Returns:** `Promise<string>` - The ciphertext as a Base64 string.

**Usage:**
```typescript
import { CryptoHelper } from './sdk/FunticoPhaserSDK';

const encrypted = await CryptoHelper.encrypt(JSON.stringify({ Score: 1200 }), encryptionKey);
console.log(encrypted); // "k3Jd8f...=="
```

---

### `CryptoHelper.decrypt`

Decrypts a Base64 ciphertext back into a plaintext string — the inverse of `CryptoHelper.encrypt`. The SDK calls this internally; games rarely need it, since `ReconnectToUnfinishedSession_Client` already returns the decrypted session state.

**Signature:**
```typescript
public static async decrypt(encryptedBase64: string, keyStr: string): Promise<string>
```

**Parameters:**
- `encryptedBase64` - The Base64 ciphertext to decrypt.
- `keyStr` - The key material. It must match the key used to encrypt.

**Returns:** `Promise<string>` - The decrypted plaintext. Parse it with `JSON.parse` if the original payload was an object.

**Important Notes:**
- Rejects on a wrong key or corrupted ciphertext. Wrap the call in `try/catch`.

**Usage:**
```typescript
import { CryptoHelper } from './sdk/FunticoPhaserSDK';

try {
  const json = await CryptoHelper.decrypt(payload.Data, decryptionKey);
  const state = JSON.parse(json);
  this.restoreFrom(state);
} catch (e) {
  console.error('Could not decrypt session state', e);
}
```

---

### `CryptoHelper.hmacSha256`

Signs a message and returns the signature as a lowercase hex string. The SDK calls this internally to sign the payloads it sends; games rarely need it.

**Signature:**
```typescript
public static async hmacSha256(message: string, keyStr: string): Promise<string>
```

**Parameters:**
- `message` - The string to sign.
- `keyStr` - The signing key.

**Returns:** `Promise<string>` - The 64-character lowercase hex signature.

**Usage:**
```typescript
import { CryptoHelper } from './sdk/FunticoPhaserSDK';

const encrypted = await CryptoHelper.encrypt(JSON.stringify(payload), encryptionKey);
const hash = await CryptoHelper.hmacSha256(encrypted, signingKey);

await fetch('/my-game-server/submit', {
  method: 'POST',
  body: JSON.stringify({ EncryptedData: encrypted, Hash: hash })
});
```

---

### `PrizeUtils.calculatePrize`

Computes the total TICO value of a room's **automated** prizes for a given deposit stake pool. Use it to render a "prize value" figure from any `Prize[]` the SDK hands you.

The SDK calls this internally to produce `PrizePlaceViewModel.RewardFeeRatio`, `PrizePoolDistributionViewModel.TicoSharedViaPlaces` and `RoomLeaderboardViewModel.YourTicoEarnings`, so reach for it directly only when you are valuing a prize list yourself.

**Signature:**
```typescript
public static calculatePrize(prizes: Prize[], depositStake: number): number
```

**Parameters:**
- `prizes` - The list of prizes to evaluate — `PrizePlaceViewModel.Prizes` from `GetPrizePoolDistribution`, or `HOFDistributionItem.prizes` from `GetHallOfFameDistribution`. A falsy value (`null`/`undefined`) yields `0` rather than throwing. **Not** `GetPrizes`, which returns a different shape entirely (see its own section).
- `depositStake` - The total deposit stake pool that percentage-based prizes are shares of. Only read by the `GppPoolShare` and `DepositStakePoolShare` branches. `GetPrizePoolDistribution` sources this from the room config's own computed deposit stake.

**Returns:** `number` - The summed prize value. Only these prize types contribute:
- `GppPoolShare` and `DepositStakePoolShare` — add `Math.floor((Percentage * depositStake) / 100)`, and only when `Percentage` is neither `undefined` nor `null`.
- `DepositStakePerPlayer` and `GppPerPlayer` — add the prize's `Value` as-is.

Every other type (`Item`, `Reward`, `External`, `Placeholder`, `GameManagedReward`) contributes `0`. `Item`, `Reward`, `External` and `Placeholder` are physical/item prizes with no computable TICO value. `GameManagedReward` is excluded for a different reason: it is granted by the game itself rather than paid out of the deposit stake, so counting it would overstate what the platform actually pays. Both cases mean the same thing for your UI — present those prizes separately rather than as part of the TICO figure.

**PrizeType Properties:**

A string enum whose value equals its name on the wire.
- `Item` (`'Item'`) - A platform inventory item awarded automatically. Carries `ItemId` and `Amount`.
- `DepositStakePoolShare` (`'DepositStakePoolShare'`) - A percentage share of the pool built from players' deposit stakes.
- `DepositStakePerPlayer` (`'DepositStakePerPlayer'`) - A flat deposit-stake payout granted per player, not a share of a pool.
- `GppPoolShare` (`'GppPoolShare'`) - A percentage share of the Guaranteed Prize Pool.
- `GppPerPlayer` (`'GppPerPlayer'`) - A flat GPP payout granted per player.
- `External` (`'External'`) - A manually fulfilled prize awarded outside the platform (NFT, physical goods, partner reward). Modelled by `ManualPrize`.
- `Placeholder` (`'Placeholder'`) - A manually configured display-only prize entry, used to show a prize that is not yet finalised. Also modelled by `ManualPrize`.
- `Reward` (`'Reward'`) - An automated platform reward referenced by `PrizeId`.
- `GameManagedReward` (`'GameManagedReward'`) - A reward whose distribution the game itself manages. Shaped like a GPP prize, but **not** counted by `calculatePrize` (it contributes `0`): the game grants it, so it is not paid from the deposit stake. Read its `Value` yourself if you want to show it.

**Prize Properties:**

`Prize` is a discriminated union — narrow it on the `type` field to reach the variant-specific fields:
```typescript
export type Prize =
  | ManualPrize
  | ItemAutomatedPrize
  | RewardAutomatedPrize
  | DepositStakeAutomatedPrize
  | GppAutomatedPrize;
```

It is returned by `GetPrizePoolDistribution` (as `PrizePlaceViewModel.Prizes`) and by `GetHallOfFameDistribution` (as `HOFDistributionItem.prizes`) — one union models both.

Note the field names: a lowercase `type` discriminator, PascalCase value fields (`Amount`, `ItemId`, `PrizeId`, `Value`, `Currency`, `Percentage`, `Name`, `ImageUrl`, `ValueUsd`), and a lowercase nested `Item` (`id` / `image` / `name`). Read them exactly as documented below.

**BasePrize Properties:**

The common base every prize interface extends.
- `type` (`PrizeType`) - The discriminator identifying which prize variant this object is. Each derived interface narrows it to the specific members it covers.

**ManualPrize Properties:** (extends `BasePrize`; `type` is `PrizeType.External | PrizeType.Placeholder`)
- `type` (`PrizeType.External | PrizeType.Placeholder`) - Narrowed discriminator. Both manual kinds share this one shape.
- `Id` (`number`) - Identifier of the manual prize record on the platform.
- `ValueUsd` (`number`, optional) - Declared USD worth of the prize, used for display. Optional because manual prizes need not be valued.
- `ImageUrl` (`string`) - URL of the prize artwork. Load it with Phaser's own loader; the SDK does not fetch images.
- `Name` (`string`) - Display name of the prize.
- `Description` (`string`) - Longer human-readable description shown in prize detail UI.
- `Chain` (`string`) - Blockchain the prize lives on, for on-chain prizes (e.g. an NFT).
- `ContractAddress` (`string`) - Address of the token contract backing the prize.
- `ExplorerUrl` (`string`) - Block-explorer link for the prize, for players who want to verify it on-chain.
- `WalletAddress` (`string`) - Wallet the prize is held in or will be sent from.
- `TokenId` (`number`, optional) - The specific token id within the contract. Optional — absent for non-NFT and placeholder prizes.

**PrizeWithAmountAndItem Properties:** (extends `BasePrize`)

The shared shape for automated prizes that grant a quantity of something. Not used directly — `ItemAutomatedPrize` and `RewardAutomatedPrize` extend it.
- `Amount` (`number`) - How many units of the item/reward are granted.
- `Item` (`PlatformItemPrize`, optional) - The expanded platform item this prize resolves to. Absent when the response only carries the id. See `PlatformItemPrize` below.

**ItemAutomatedPrize Properties:** (extends `PrizeWithAmountAndItem`)
- `type` (`PrizeType.Item`) - Narrowed discriminator.
- `ItemId` (`number`) - Id of the platform inventory item to grant.
- `Amount` (`number`) - Quantity of that item granted. Inherited from `PrizeWithAmountAndItem`.
- `Item` (`PlatformItemPrize`, optional) - Expanded item details for display. Inherited from `PrizeWithAmountAndItem`.

**RewardAutomatedPrize Properties:** (extends `PrizeWithAmountAndItem`)
- `type` (`PrizeType.Reward`) - Narrowed discriminator.
- `PrizeId` (`number`) - Id of the platform reward definition to grant.
- `Amount` (`number`) - Quantity of that reward granted. Inherited from `PrizeWithAmountAndItem`.
- `Item` (`PlatformItemPrize`, optional) - Expanded item details for display, when the reward maps to an inventory item. Inherited from `PrizeWithAmountAndItem`.

**DepositStakeAutomatedPrize Properties:** (extends `BasePrize`)
- `type` (`PrizeType.DepositStakePoolShare | PrizeType.DepositStakePerPlayer`) - Narrowed discriminator. It decides which of `Percentage` and `Value` `calculatePrize` reads: pool-share uses `Percentage`, per-player uses `Value`.
- `Currency` (`number`) - Numeric platform currency code the `Value` is denominated in.
- `Value` (`number`) - The flat payout amount. Counted directly by `calculatePrize` for `DepositStakePerPlayer`.
- `Percentage` (`number`, optional) - Whole-number percent of the deposit stake pool this prize takes. Optional — `calculatePrize` skips the prize entirely when it is `undefined` or `null`.

**GppAutomatedPrize Properties:** (extends `BasePrize`)
- `type` (`PrizeType.GppPoolShare | PrizeType.GppPerPlayer | PrizeType.GameManagedReward`) - Narrowed discriminator. `GppPoolShare` is evaluated from `Percentage`; `GppPerPlayer` is counted by `Value`; `GameManagedReward` is not counted at all. The three share one interface because they share a shape, not because they are valued alike. Treat `Percentage` as absent for `GameManagedReward`.
- `Currency` (`number`) - Numeric platform currency code the `Value` is denominated in.
- `Value` (`number`) - The flat payout amount. Counted directly by `calculatePrize` for `GppPerPlayer` only; for `GameManagedReward` it is informational.
- `Percentage` (`number`, optional) - Whole-number percent of the Guaranteed Prize Pool. Optional — `calculatePrize` skips the prize entirely when it is `undefined` or `null`.

**PlatformItemPrize Properties:**

The expanded platform item attached to item-bearing prizes. Its fields are lowercase.
- `id` (`number`) - Platform id of the item. Matches the parent's `ItemId` / `PrizeId`.
- `image` (`string`) - URL of the item artwork. Feed it to Phaser's loader yourself.
- `name` (`string`) - Display name of the item, e.g. `"Gift Box"`.

**Usage:**
```typescript
import { PrizeType, PrizeUtils, Prize } from './sdk/FunticoPhaserSDK';

const dist = await this.funtico.sdk.GetPrizePoolDistribution(room.Guid);
const firstPlace: Prize[] = dist.PrizePlaces[0]?.Prizes ?? [];

// Total TICO value of the automated prizes for a 50,000 deposit stake pool
const total = PrizeUtils.calculatePrize(firstPlace, 50000);
this.prizeLabel.setText(`1st place: ${total} TICO`);

// Narrow the union to render the non-computable prizes separately.
for (const prize of firstPlace) {
  switch (prize.type) {
    case PrizeType.Item:
      console.log(`${prize.Amount}x item #${prize.ItemId} (${prize.Item?.name ?? 'unknown'})`);
      break;
    case PrizeType.Reward:
      console.log(`${prize.Amount}x reward #${prize.PrizeId}`);
      break;
    case PrizeType.External:
    case PrizeType.Placeholder:
      console.log(`${prize.Name} — $${prize.ValueUsd ?? 0} — ${prize.ImageUrl}`);
      break;
    case PrizeType.GppPoolShare:
    case PrizeType.DepositStakePoolShare:
      console.log(`${prize.Percentage}% of the pool`);
      break;
    case PrizeType.GppPerPlayer:
    case PrizeType.DepositStakePerPlayer:
      console.log(`${prize.Value} per player`);
      break;
    case PrizeType.GameManagedReward:
      // Shares GppAutomatedPrize's shape, but calculatePrize scores it 0 - the game grants it
      console.log(`${prize.Value} granted by the game (not counted in the TICO total)`);
      break;
  }
}
```
