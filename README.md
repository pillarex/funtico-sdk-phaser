# Funtico Phaser SDK - Integration Guide

This guide describes the setup and usage of the Funtico Games SDK for games running on the **Phaser 3** engine (including web games and Telegram Mini Apps).

The SDK covers rooms and tournament management, special tournaments, the Hall of Fame leaderboard, and client-side session reconnection.

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
7. [Session Reconnection & Progress Saving](#7-session-reconnection--progress-saving)
8. [Complete Phaser 3 Scenes Example](#8-complete-phaser-3-scenes-example)

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
     ["start_game", "score_updated"] // Action logs used for anti-cheat validation
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
// -> "Bottle Flip Tournament — starts 2026-05-14T21:00:00Z, up to 40 entries"
// -> "50K TICO, Private Passes & More — entry fee 100"

// t.Id is the tournament identifier every other tournament method accepts.
const leaderboard = await this.funtico.sdk.GetTournamentLeaderboard(t.Id);

leaderboard.Players.forEach(p => console.log(`#${p.Place} ${p.UserName} — ${p.Score}`));
// -> "#1 Kepsert — 11675"

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

---

## 7. Session Reconnection & Progress Saving

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

## 8. Complete Phaser 3 Scenes Example

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
