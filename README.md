# Funtico Phaser SDK - Integration Guide

This guide describes the setup and usage of the Funtico Games SDK for games running on the **Phaser 3** engine (including web games and Telegram Mini Apps).

The SDK covers rooms and tournament management, special tournaments, practice results, the Hall of Fame leaderboard, Campaign Mode, and client-side session reconnection.

## 📖 Documentation

- **This guide** — installation and a task-oriented integration walkthrough. Start here.
- [Usage Guide](./USAGE.md) — complete reference for every public method and type: signatures, parameters, return values, and field-by-field descriptions of every model.

---

## 📋 Table of Contents

1. [Installation & Setup](#1-installation--setup)
2. [Initialization & Authentication](#2-initialization--authentication)
3. [User Profile & Balance](#3-user-profile--balance)
4. [Rooms API (Singleplayer Match Lifecycle)](#4-rooms-api-singleplayer-match-lifecycle)
5. [Special Tournaments](#5-special-tournaments)
6. [Hall of Fame](#6-hall-of-fame)
7. [Campaign Mode](#7-campaign-mode)
8. [Session Reconnection & Progress Saving](#8-session-reconnection--progress-saving)
9. [Complete Phaser 3 Scenes Example](#9-complete-phaser-3-scenes-example)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Installation & Setup

Copy the `FunticoPhaserSDK.ts` file into your project structure (e.g., `src/sdk/FunticoPhaserSDK.ts`).

You can use the SDK in two ways:
1. **As a Phaser 3 Global Plugin** (integrated into the Phaser Game lifecycle and event bus).
2. **As an ES6 Singleton module** (direct import of the `FunticoSDK` class).

### Option A: Registering as a Phaser 3 Plugin (Recommended)

Include the plugin in your Phaser Game configuration:

```typescript
import Phaser from 'phaser';
import { FunticoPhaserPlugin, FunticoEnvironment } from './sdk/FunticoPhaserSDK';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

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
        mapping: 'funtico' // Accessible in scenes via this.funtico
      }
    ]
  }
};

const game = new Phaser.Game(config);
```

### Option B: Using as a Singleton (No Plugin)

Import the singleton instance anywhere in your codebase:

```typescript
import { FunticoSDK } from './sdk/FunticoPhaserSDK';

const sdk = FunticoSDK.Instance;
```

---

## 2. Initialization & Authentication

Before invoking any API methods, you must initialize the SDK with your game credentials obtained from the Funtico Developer Portal.

```typescript
// Initializing inside BootScene
await this.funtico.init({
  env: FunticoEnvironment.STAGING, // STAGING or PROD
  publicGameKey: "your-public-key", // Public key, sent with every request
  privateGameKey: "your-private-key", // Secret key - never ship it in a public client build
  userToken: "token-from-funtico-platform", // Automatically authenticates the player on startup
  apiBaseUrl: "https://funtico-sdk-staging.azurewebsites.net", // Your Game API gateway endpoint (optional)
  funticoApiBaseUrl: "https://staging.api.funtico.com" // Funtico platform API (optional)
});
```

Both URL overrides are optional — `env` resolves each to the right default. Note they are **two different hosts**: `apiBaseUrl` is your game's Rooms API and takes the game JWT, while `funticoApiBaseUrl` is the Funtico platform itself and takes the player's platform token. The leaderboard reads player names and avatars from the latter.

> **Key validation:** `Initialize` checks both keys before sending any request and rejects with an `Error` whose message starts with `"Invalid FunticoConfig: "` when a key is missing or empty, has leading/trailing whitespace (a stray newline from a `.env` file), `privateGameKey` is shorter than 8 characters, or the two keys are identical or one contains the other (they were concatenated into one field). Pass **only** the secret key from the Developer Portal in `privateGameKey`. A rejected config changes nothing, and the message never echoes the key values.
>
> `this.funtico.init()` catches this like any other initialization error: it only logs `[FunticoPhaserPlugin] Initialization error: Error: Invalid FunticoConfig: ...` and still resolves. Call `FunticoSDK.Instance.Initialize(config)` directly inside `try/catch` if you want to handle it. See [USAGE.md](./USAGE.md#initialize) for the full rules.

---

## 3. User Profile & Balance

Once authenticated, user profiles and balances are cached locally to minimize redundant HTTP requests.

```typescript
// Fetch full profile from the server
const user = await this.funtico.refreshUserData(false); // false forces API fetch, bypassing cache

// Check player's affordability before joining a tournament
import { EntryFeeType } from './sdk/FunticoPhaserSDK';
const canAfford = this.funtico.sdk.CanAffordFromCache(EntryFeeType.Tico, 500);
```

---

## 4. Rooms API (Singleplayer Match Lifecycle)

### Fetching Rooms and Configs
```typescript
const tiers = await this.funtico.sdk.GetTiers();
const rooms = await this.funtico.sdk.GetRooms();       // singleplayer by default
const roomDetails = await this.funtico.sdk.GetRoom("room-guid");
const roomSettings = await this.funtico.sdk.GetRoomSettings("event-guid");

// Prize table for a room
const prizes = await this.funtico.sdk.GetPrizePoolDistribution("room-guid");

// Resolve a tier from an event id, using the list GetRooms already fetched
const tier = await this.funtico.sdk.GetTierByEventId("event-guid");
```

### Match Lifecycle
1. **JoinRoom**: Deducts the fee or ticket, registers participation, and starts the run.
   ```typescript
   // Omit the second argument to let the SDK spend a voucher only when the player has one
   const sessionData = await this.funtico.sdk.JoinRoom(roomGuid);

   // Or decide explicitly:
   // await this.funtico.sdk.JoinRoom(roomGuid, false); // never use a voucher
   ```
   > The run is live once `JoinRoom` resolves and the server-side timers are already ticking.
   > Load your level before calling it, not after.
2. **EndRoomSP**: Submits the player's final score.
   ```typescript
   // The SDK encrypts and signs the payload for you
   await this.funtico.sdk.EndRoomSP(
     sessionData.EventId,
     sessionData.SessionOrMatchId,
     score,
     user.UserId,
     "127.0.0.1",
     ["start_game", "score_updated"] // Optional gameplay event log
   );
   ```
3. **GetLeaderboard**: Reads the final standings and the player's own payout.
   ```typescript
   const board = await this.funtico.sdk.GetLeaderboard(
     sessionData.EventId,
     sessionData.SessionOrMatchId
   );

   // State is a LeadersState enum member, not a string
   if (board.IsPending) this.showCalculatingResults();

   // LeaderboardItems[].UserId is the platform id - match it against PlatformId
   const me = this.funtico.sdk.GetCachedUserData();
   const myRow = board.LeaderboardItems.find(i => i.UserId === me?.PlatformId);
   ```

---

## 5. Special Tournaments

Special tournaments are timed global competitive events featuring dedicated prize distributions and community leaderboards.

### Fetching Tournaments and Standings
```typescript
import { TournamentsFilterEnum } from './sdk/FunticoPhaserSDK';

// Get ongoing tournaments
const tournaments = await this.funtico.sdk.GetTournaments(1, 100, TournamentsFilterEnum.OnGoing);

const t = tournaments[0];
console.log(`${t.Name} — starts ${t.StartDate}, up to ${t.EntryLimit} entries`);
console.log(`${t.PrizePoolLabel} — entry fee ${t.EntryFee}`);
// -> "Example Tournament — starts 2026-01-01T12:00:00Z, up to 40 entries"
// -> "10K TICO & More — entry fee 100"

// t.Id is the tournament identifier every other tournament method accepts.
const leaderboard = await this.funtico.sdk.GetTournamentLeaderboard(t.Id);

leaderboard.Players.forEach(p => console.log(`#${p.Place} ${p.UserName} — ${p.Score}`));
// -> "#1 PlayerOne — 11675"

// Match players by FunticoId, which is a platform id.
const me = this.funtico.sdk.GetCachedUserData();
const myRow = leaderboard.Players.find(p => p.FunticoId === me?.PlatformId);
```

> **Note:** `TournamentViewModel.Id` is the identifier to pass to every other tournament method. The schedule fields are `StartDate` / `EndDate` and the attempt cap is `EntryLimit`. The leaderboard keeps each player's best score. See [USAGE.md](./USAGE.md) for the full field list.

### Joining and Entering Tournament
```typescript
// 1. Join — required before every EnterTournament. A scored attempt consumes the join,
//    so join again before each new attempt. A join that cannot go through rejects.
const successJoin = await this.funtico.sdk.JoinTournament(t.Id, "community-guid", "password");

// 2. Enter a tournament match (called before starting each individual attempt)
const enterData = await this.funtico.sdk.EnterTournament(t.Id);

// TournamentScoreUuid is the saveScoreId.
const saveScoreId = enterData.TournamentScoreUuid;
```

> **`TournamentScoreUuid` is the `saveScoreId`.** `EnterTournament` returns it, and it is the value to pass as `saveScoreId` to `ResultTournament_Client` / `ResultTournament_Server`.

### Submitting Results (Client-Side)
```typescript
// The SDK encrypts and signs the payload for you
await this.funtico.sdk.ResultTournament_Client(
  t.Id,
  saveScoreId,   // enterData.TournamentScoreUuid
  score,
  true, // isSuccess
  JSON.stringify({ kills: 12, levelCompleted: 4 }) // customData
);

// Resolves once the score is saved; a refused payload rejects.
console.log('Score submitted');
```

### Tournament History
```typescript
const history = await this.funtico.sdk.GetTournamentsHistory(1, 10);

// Meta.From/To are null on an empty page — a player with no history hits this branch.
if (history.Meta?.From == null) console.log('No tournament history yet.');

history.Entries.forEach(e =>
  console.log(`${e.TournamentName} — place #${e.LeaderboardPlace}, best ${e.BestScore}`)
);
```

---

## 6. Hall of Fame

The Hall of Fame is a persistent leaderboard that ranks players by their best single result, available as an all-time (`Global`) or current-month (`Monthly`) standing, optionally narrowed to one game mode.

### Fetching Rankings

```typescript
import { HallOfFamePeriodMode, HallOfFameGameModeFilter } from './sdk/FunticoPhaserSDK';

// All-time top 10, across every game mode
const global = await this.funtico.sdk.GetHallOfFame(HallOfFamePeriodMode.Global);

// Current month, Rooms only, second page
const monthly = await this.funtico.sdk.GetHallOfFame(
  HallOfFamePeriodMode.Monthly,
  2,  // page
  10, // limit
  HallOfFameGameModeFilter.Rooms
);

monthly.leaderboard.forEach(p => console.log(`#${p.rank} ${p.displayName} - ${p.totalPoints}`));

// The requesting player's own standing, even if they are not on this page.
// Null until they have at least one ranked result.
if (monthly.currentPlayer) {
  console.log(`Your rank: #${monthly.currentPlayer.rank} of ${monthly.totalPlayers}`);
}
```

> **Note:** Hall of Fame responses use **camelCase** field names (`displayName`, `totalPoints`), unlike the PascalCase used by the Rooms and Tournaments endpoints.

### Prize Distribution

```typescript
import { PrizeType } from './sdk/FunticoPhaserSDK';

const distribution = await this.funtico.sdk.GetHallOfFameDistribution();

distribution.items.forEach(item => {
  // Places 1-10 expose `place` only; grouped tiers also expose `endPlace` and `range` ("11-20")
  const label = item.range ?? `#${item.place}`;

  item.prizes.forEach(prize => {
    if (prize.type === PrizeType.Item) {
      console.log(`${label}: ${prize.Amount}x ${prize.Item?.name}`);
    } else if (prize.type === PrizeType.GppPerPlayer) {
      console.log(`${label}: ${prize.Value} TICO`);
    }
  });
});
```

> **Note:** Distribution prizes use the shared **`Prize`** union — the same one `GetPrizePoolDistribution` returns. Narrow on the lowercase `type`. The value fields are PascalCase (`Value`, `Amount`, `ItemId`, `PrizeId`, `Currency`) and the nested `Item` is lowercase (`id`/`image`/`name`). Item artwork is at `prize.Item.image`; load it with Phaser's own loader.

### Submitting a Practice Result

Practice runs need no room and no entry fee. Submit the score when the run ends; it is ranked under `HallOfFameGameModeFilter.Practice`.

```typescript
// Optional during the run: both are sent with the result
this.funtico.sdk.RecordEvent_Client(JSON.stringify({ type: 'wave_cleared', wave: 3 }));
this.funtico.sdk.RecordCollected_Client('chest_1');

try {
  // The SDK encrypts and signs the payload for you
  await this.funtico.sdk.CompletePractice(this.score);
} catch (err) {
  // The run, its events and its counts are kept: calling CompletePractice again resends the same run
  console.error('Failed to save the practice result:', err);
}
```

> **Note:** A delivered result clears the recorded events and counts. Pass `{ collected, gameEvents }` as the second argument to send your own instead. See [USAGE.md](./USAGE.md#completepractice) for the details.

---

## 7. Campaign Mode

Campaign Mode is a fixed ladder of authored levels the player works through in order: start an attempt, play, report your metrics, and the server grades the run into stars, grants rewards, and unlocks the next level.

> **Note:** Campaign responses are **PascalCase**, like most of the SDK (and unlike the camelCase Hall of Fame). Stars are computed **server-side** from the level's star rules — render them, never compute them. See [USAGE.md](./USAGE.md#campaign-methods) for the full reference.

### Step 1 — Check Availability
```typescript
// "No campaign" is data, not an error - gate the menu button on the flag
if (!(await this.funtico.sdk.IsCampaignAvailable())) {
  this.campaignButton.setVisible(false);
  return;
}
```

### Step 2 — Fetch Levels and Render the Level Select
```typescript
import { CampaignLevelStatus } from './sdk/FunticoPhaserSDK';

const campaign = await this.funtico.sdk.GetCampaignLevels();

// Campaign-wide progress: stars earned out of the total obtainable
this.progressText.setText(`${campaign.TotalStarsEarned} / ${campaign.MaxStars} ★`);

for (const level of campaign.Levels) {
  if (level.Status === CampaignLevelStatus.Locked) {
    // Locked levels arrive without config or star rules - render a lock icon and move on
    this.addLockedCard(level.Order, level.Name);
  } else {
    // Unlocked/Completed: show the best-star row (0-3) and make the card clickable
    this.addLevelCard(level.Order, level.Name, level.BestStars, () => this.play(level));
  }
}
```

### Step 3 — Parse the Level Config with Your Own Type
```typescript
// The schema is your game's - the config string is returned exactly as authored
interface MyLevelConfig {
  enemyWaves: number;
  timeLimitSeconds: number;
  tilemapKey: string;
}

const config = this.funtico.sdk.GetCampaignLevelConfig<MyLevelConfig>(level);
// Throws a clear Error if the level is still locked or the JSON is malformed
```

### Step 4 — Start the Attempt and Play
```typescript
const attempt = await this.funtico.sdk.StartCampaignLevel(level.Id);

// Optional: record gameplay events - they are folded into the completion payload
this.funtico.sdk.RecordEvent_Client('wave_1_cleared');

// Re-starting simply replaces the tracked attempt; quitting without finishing?
// this.funtico.sdk.AbandonCampaignAttempt(); // local-only, no server call
```

### Step 5 — Complete the Run and Show the Outcome
```typescript
// Metrics: flat map, 1-32 entries, finite numbers or booleans.
// Fractional numbers are ALLOWED (metrics are doubles) - unlike EndRoomSP's int score.
const result = await this.funtico.sdk.CompleteCampaignLevel({
  time: 47.35,          // fractional survives intact
  coins: 120,
  no_damage: true       // booleans are sent as 1/0
});

if (result.IsWin) {
  this.showStars(result.Stars);                       // graded server-side
  this.showRewards(result.Rewards, result.RewardsGranted);
  if (result.UnlockedLevelId) this.showUnlockBanner();
} else {
  this.showDefeat();    // losing is a normal 200 - IsWin false, Stars 0, not an error
}
```

Failures reject with a `CampaignError` whose `Code` is machine-readable — branch on it:

```typescript
import { CampaignError, CampaignErrorCode } from './sdk/FunticoPhaserSDK';

try {
  await this.funtico.sdk.StartCampaignLevel(level.Id);
} catch (error) {
  if (error instanceof CampaignError && error.Code === CampaignErrorCode.LevelLocked) {
    this.showToast('Finish the previous level first!');
  } else {
    throw error;
  }
}
```

### Step 6 — Listen for Progress Updates
```typescript
import { FunticoPhaserPlugin } from './sdk/FunticoPhaserSDK';

// The plugin wrappers emit CAMPAIGN_PROGRESS_UPDATED with what they fetched/received:
// refreshCampaign -> CampaignLevelsViewModel, completeCampaignLevel -> CampaignCompletionResult.
// Both carry TotalLevels/CompletedLevels/TotalStarsEarned/MaxStars.
this.game.events.on(FunticoPhaserPlugin.EVENTS.CAMPAIGN_PROGRESS_UPDATED, (progress: any) => {
  this.progressText.setText(`${progress.TotalStarsEarned} / ${progress.MaxStars} ★`);
});

await this.funtico.refreshCampaign();                       // fetch + broadcast
const result = await this.funtico.completeCampaignLevel({   // submit + broadcast
  time: 47.35,
  coins: 120
});
```

> A successful completion drops the SDK's cached level list automatically — call `GetCampaignLevels` (or `refreshCampaign`) afterwards to render the unlock cascade.

---

## 8. Session Reconnection & Progress Saving

If a player loses connection or reloads their page during a match, you can save their state to allow them to reconnect and resume the match.

### Checking for Unfinished Matches
```typescript
const unfinished = await this.funtico.sdk.UserHasUnfinishedSession_Client();

if (unfinished.SavedSessions.length > 0) {
  const session = unfinished.SavedSessions[0];
  console.log(`Unfinished match found! Reconnection time remaining: ${session.ReconnectTime} seconds.`);
}
```

### Creating and Updating Checkpoints
```typescript
// 1. Create a session checkpoint right after joining a room
const sessionState = { hp: 100, score: 0, level: 1 };
await this.funtico.sdk.CreateSession_Client(
  JSON.stringify(sessionState),
  GameTypeEnum.Rooms,
  roomData.EventId,
  roomData.SessionOrMatchId
);

// 2. Periodically update the progress during gameplay
const updatedState = { hp: 80, score: 1500, level: 2 };
await this.funtico.sdk.UpdateSession_Client(JSON.stringify(updatedState));

// 3. Record individual gameplay events (automatically attached to the final score request)
this.funtico.sdk.RecordEvent_Client("player_unlocked_chest");
```

### Restoring Game State
```typescript
const session = unfinished.SavedSessions[0];
// ReconnectToUnfinishedSession_Client automatically handles decryption
const decryptedStateJson = await this.funtico.sdk.ReconnectToUnfinishedSession_Client(session.Id);
const savedState = JSON.parse(decryptedStateJson);

console.log(`Session restored! Score: ${savedState.score}, HP: ${savedState.hp}`);
// Resume scene logic...
```

---

## 9. Complete Phaser 3 Scenes Example

### BootScene.ts (Initialization and Reconnect Scan)
```typescript
import Phaser from 'phaser';
import { FunticoEnvironment } from '../sdk/FunticoPhaserSDK';

export class BootScene extends Phaser.Scene {
  async create() {
    const platformToken = new URLSearchParams(window.location.search).get('token') || "test_token";

    await this.funtico.init({
      env: FunticoEnvironment.STAGING,
      publicGameKey: "your_public_key",
      privateGameKey: "your_private_secret_key",
      userToken: platformToken,
      apiBaseUrl: "https://funtico-sdk-staging.azurewebsites.net"
    });

    // Check for unfinished sessions
    const reconnectData = await this.funtico.sdk.UserHasUnfinishedSession_Client();
    if (reconnectData.SavedSessions.length > 0) {
      this.registry.set('reconnectSession', reconnectData.SavedSessions[0]);
      this.scene.start('GameScene', { isReconnect: true });
    } else {
      this.scene.start('MenuScene');
    }
  }
}
```

### GameScene.ts (Gameplay, Autosaving and Score Submission)
```typescript
import Phaser from 'phaser';
import { GameTypeEnum } from '../sdk/FunticoPhaserSDK';

export class GameScene extends Phaser.Scene {
  private score = 0;
  private isReconnect = false;

  init(data: any) {
    this.isReconnect = data.isReconnect || false;
  }

  async create() {
    let session;

    if (this.isReconnect) {
      const reconnectSession = this.registry.get('reconnectSession');
      const savedStateJson = await this.funtico.sdk.ReconnectToUnfinishedSession_Client(reconnectSession.Id);
      const savedState = JSON.parse(savedStateJson);
      
      this.score = savedState.score;
      session = { EventId: reconnectSession.SessionId, SessionOrMatchId: reconnectSession.SaveSessionId };
      this.registry.set('activeSession', session);
    } else {
      const room = this.registry.get('selectedRoom');

      session = await this.funtico.sdk.JoinRoom(room.Guid);
      this.registry.set('activeSession', session);

      // Create a reconnection checkpoint
      await this.funtico.sdk.CreateSession_Client(
        JSON.stringify({ score: this.score }),
        GameTypeEnum.Rooms,
        session.EventId,
        session.SessionOrMatchId
      );
    }

    // Auto-save session state every 10 seconds
    this.time.addEvent({
      delay: 10000,
      callback: this.autoSaveProgress,
      callbackScope: this,
      loop: true
    });
  }

  async autoSaveProgress() {
    await this.funtico.sdk.UpdateSession_Client(JSON.stringify({ score: this.score }));
    this.funtico.sdk.RecordEvent_Client(`score_at_time_${this.score}`);
  }

  async gameOver() {
    const session = this.registry.get('activeSession');
    const user = this.funtico.sdk.GetCachedUserData();

    // Ends room session with secure score submission
    await this.funtico.sdk.EndRoomSP(
      session.EventId,
      session.SessionOrMatchId,
      this.score,
      user!.UserId,
      "127.0.0.1"
    );

    this.scene.start('MenuScene');
  }
}
```

---

## 10. Troubleshooting

### `Invalid FunticoConfig: ...` at startup

`Initialize` rejected your config before sending any request; the rest of the message says which check failed and how to fix it. Through the plugin it appears only in the console, as `[FunticoPhaserPlugin] Initialization error: Error: Invalid FunticoConfig: ...`. The usual causes are the two keys concatenated into one field, the same key passed in both fields (for example the public key also used as `privateGameKey`), or a value read from a `.env` file that kept its trailing newline. Swapped keys are not detected here; they show up later as an authentication or request failure. See [USAGE.md](./USAGE.md#initialize) for every rule.

Because the plugin's `init()` swallows the rejection and still resolves, the SDK is left uninitialized, and the next calls fail with their own errors. `this.funtico.login()` / `Authentication`, `GetRoomPublic` and `GetCampaignAvailability` throw `TypeError: Cannot read properties of undefined (reading 'publicGameKey')`, and calls that need a JWT throw `SDK is not authenticated`. Either error means `Initialize` never succeeded (it was not called, or it rejected): look earlier in the console for the `[FunticoPhaserPlugin] Initialization error: ...` line.

### HTTP 500 `Padding is invalid and cannot be removed` on `/Rooms/end-room-sp`

Authentication, `JoinRoom` and the match itself work, but `EndRoomSP` fails with HTTP 500 and the message `Padding is invalid and cannot be removed`.

**Cause:** a wrong `privateGameKey`. The SDK encrypts and signs the score payload with `privateGameKey`; on this endpoint this error means the key is wrong. The typical case is `privateGameKey` set to the public key and the secret key concatenated (`publicKey + secretKey`). `ResultTournament_Client` fails the same way with a wrong key. `CompleteCampaignLevel` also uses `privateGameKey`, but a wrong key does not produce this 500 there: the call rejects with a `CampaignError` whose `Code` is `InvalidSignature` (or, rarely, `InvalidMetrics` with "Failed to decrypt result data."; see [`CampaignError`](./USAGE.md#campaignerror) in USAGE.md).

**Fix:** pass only the secret key from the Developer Portal in `privateGameKey`, and the public key alone in `publicGameKey`. The concatenated and identical-keys cases are caught at `Initialize` with an `Invalid FunticoConfig` error (see above), so if this 500 still appears, the private key is some other wrong value — for example the key of a different game or environment (staging vs prod).
