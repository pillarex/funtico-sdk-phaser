import Phaser from 'phaser';

/**
 * Environments supported by the Funtico SDK.
 */
export enum FunticoEnvironment {
  STAGING = 'staging',
  PROD = 'prod'
}

/**
 * Currency/Entry Fee Types matching Funtico platform definitions.
 */
export enum EntryFeeType {
  IC = 1,                 // In-game currency (Coins)
  Tico = 2,               // Premium platform currency (TICO/Diamonds)
  SemifinalsTickets = 3,  // Semi-final tickets
  FinalTickets = 4,       // Final tickets
  Free = 5,               // Free room
  InventoryItem = 6,      // Requires special inventory item
  PrivateTickets = 7      // Private room tickets
}

/**
 * Room Tier Enumeration.
 */
export enum RoomTier {
  Contender = 0,
  Challenger = 1,
  Champion = 2
}

/**
 * Status filter for special tournaments.
 */
export enum TournamentsFilterEnum {
  OnGoing = 'OnGoing',
  Upcoming = 'Upcoming',
  Finished = 'Finished'
}

/**
 * Game Type Enumeration for Reconnection and Sessions.
 */
export enum GameTypeEnum {
  Indirect_PVP = 0,
  Direct_PVP = 1,
  Tournament = 3,
  Rooms = 4,
  Practice = 5,
  MultiplayerPvp = 6
}

/**
 * Player gameplay presence status on dedicated server.
 */
export enum UserGameStatus {
  Leave = 0,
  InGame = 1,
  Finished = 2
}

/**
 * Hall of Fame ranking period.
 */
export enum HallOfFamePeriodMode {
  Global = 0,
  Monthly = 1
}

/**
 * Game mode filter for Hall of Fame rankings. Use this in game code.
 */
export enum HallOfFameGameModeFilter {
  All = 0,                 // No filter - ranks across every mode
  SpecialTournament = 1,
  Rooms = 2,
  Practice = 3
}

/**
 * Backend `gameMode` query values for the /HallOfFame endpoints.
 * Deliberately offset by one from HallOfFameGameModeFilter, which has no `All` equivalent.
 * Wire-level detail - prefer HallOfFameGameModeFilter.
 */
export enum HallOfFameGameMode {
  SpecialTournament = 0,
  Rooms = 1,
  Practice = 2
}

/**
 * Prize types mapped directly to the Funtico backend enum.
 */
export enum PrizeType {
  Item = 'Item',
  DepositStakePoolShare = 'DepositStakePoolShare',
  DepositStakePerPlayer = 'DepositStakePerPlayer',
  GppPoolShare = 'GppPoolShare',
  GppPerPlayer = 'GppPerPlayer',
  External = 'External',
  Placeholder = 'Placeholder',
  Reward = 'Reward',
  GameManagedReward = 'GameManagedReward'
}

/**
 * Platform Item Prize structure.
 */
export interface PlatformItemPrize {
  id: number;
  image: string;
  name: string;
}

/**
 * Base type for Funtico Prizes.
 */
export interface BasePrize {
  type: PrizeType;
}

/**
 * Manual Prize (External or Placeholder).
 */
export interface ManualPrize extends BasePrize {
  type: PrizeType.External | PrizeType.Placeholder;
  id: number;
  value_usd?: number;
  image_url: string;
  name: string;
  description: string;
  chain: string;
  contract_address: string;
  explorer_url: string;
  wallet_address: string;
  token_id?: number;
}

/**
 * Automated prize containing an item and amount.
 */
export interface PrizeWithAmountAndItem extends BasePrize {
  amount: number;
  item?: PlatformItemPrize;
}

/**
 * Automated Item Prize.
 */
export interface ItemAutomatedPrize extends PrizeWithAmountAndItem {
  type: PrizeType.Item;
  item_id: number;
}

/**
 * Automated Reward Prize.
 */
export interface RewardAutomatedPrize extends PrizeWithAmountAndItem {
  type: PrizeType.Reward;
  prize_id: number;
}

/**
 * Automated Stake Pool or Per-Player Deposit Prize.
 */
export interface DepositStakeAutomatedPrize extends BasePrize {
  type: PrizeType.DepositStakePoolShare | PrizeType.DepositStakePerPlayer;
  currency: number;
  value: number;
  percentage?: number;
}

/**
 * GPP Pool Share or Per-Player Prize.
 */
export interface GppAutomatedPrize extends BasePrize {
  type: PrizeType.GppPoolShare | PrizeType.GppPerPlayer | PrizeType.GameManagedReward;
  currency: number;
  value: number;
  percentage?: number;
}

/**
 * Discriminated union of all Funtico Prize variations.
 */
export type Prize = 
  | ManualPrize 
  | ItemAutomatedPrize 
  | RewardAutomatedPrize 
  | DepositStakeAutomatedPrize 
  | GppAutomatedPrize;

/**
 * Port of C# PrizeUtils to JS/TS.
 */
export class PrizeUtils {
  /**
   * Calculates the calculated value of automated prizes based on the tournament deposit stake.
   */
  public static calculatePrize(prizes: Prize[], depositStake: number): number {
    if (!prizes) return 0;

    let prizeValue = 0;
    for (const prize of prizes) {
      switch (prize.type) {
        case PrizeType.GppPoolShare: {
          const gpp = prize as GppAutomatedPrize;
          if (gpp.percentage !== undefined && gpp.percentage !== null) {
            prizeValue += Math.floor((gpp.percentage * depositStake) / 100);
          }
          break;
        }
        case PrizeType.DepositStakePoolShare: {
          const dsp = prize as DepositStakeAutomatedPrize;
          if (dsp.percentage !== undefined && dsp.percentage !== null) {
            prizeValue += Math.floor((dsp.percentage * depositStake) / 100);
          }
          break;
        }
        case PrizeType.DepositStakePerPlayer: {
          const dsp = prize as DepositStakeAutomatedPrize;
          prizeValue += dsp.value;
          break;
        }
        case PrizeType.GppPerPlayer:
        case PrizeType.GameManagedReward: {
          const gpp = prize as GppAutomatedPrize;
          prizeValue += gpp.value;
          break;
        }
      }
    }

    return prizeValue;
  }
}

/**
 * SDK Configuration interface.
 */
export interface FunticoConfig {
  env: FunticoEnvironment;
  privateGameKey: string;     // Secret key (obtained from dashboard)
  publicGameKey: string;      // X-User-Key (public key)
  userToken?: string;          // Initial user platform token
  apiBaseUrl?: string;         // Custom URL for your game's API
  cacheTTL?: number;           // Cache lifetime in milliseconds (default: 30000ms)
}

/**
 * Detailed User Profile Data.
 */
export interface UserData {
  Name: string;
  UserId: number;
  PlatformId: number;
  Level: number;
  Rating: number;
  Experience: number;
  ExperienceToLevel: number;
  Coins: number;
  Diamonds: number;
  SemiFinalTickets: number;
  FinalTickets: number;
  PrivateTickets: number;
  KYCVerified: boolean;
  SoundsValue: number;
  MusicValue: number;
}

/**
 * User Balance Information.
 */
export interface BalanceResponse {
  Coins: number;
  Diamonds: number;
  SemiFinalTickets: number;
  FinalTickets: number;
  PrivateTickets: number;
  KYCVerified: boolean;
}

/**
 * Voucher Data representing free entries.
 */
export interface VoucherData {
  ItemId: number;
  ItemName: string;
  ItemImage: string;
  Tier: RoomTier;
  Count: number;
  PlayCount: number;
  PlaysRequiredToActivate: number;
}

/**
 * Tournament Tier Details.
 */
export interface TierViewModel {
  TierName: string;
  Tier: RoomTier;
  EntryFeeLowerBound: number;
  EntryFeeUpperBound: number;
  Hidden: boolean;
}

/**
 * Tournament Room Details.
 */
export interface RoomViewModel {
  Guid: string;
  Name: string;
  Tier: RoomTier;
  EntryFee: number;
  EntryFeeUSDT: number;
  TotalPrize: number;
  IsFree: boolean;
  RequireKyc: boolean;
  UserCanJoinWithVoucher: boolean;
  Voucher?: VoucherData;
  IsPrePaid: boolean;
}

/**
 * Data returned when joining a room.
 */
export interface RoomSessionData {
  EventId: string;
  SessionOrMatchId: string;
}

/**
 * Leaderboard Item representation.
 */
export interface LeaderboardItemViewModel {
  Place: number;
  PlayerName: string;
  Score: number;
  UserId: number;
  AvatarUrl?: string;
}

/**
 * Room Leaderboard ViewModel.
 */
export interface RoomLeaderboardViewModel {
  State: string;
  IsPending: boolean;
  ClosedUnsuccessfully: boolean;
  RoomName: string;
  RoomTier: RoomTier;
  IsFree: boolean;
  YourTicoEarnings: number;
  Multiplier: number;
  UserPlace: string;
  LeaderboardItems: LeaderboardItemViewModel[];
}

/**
 * Special Tournament ViewModel.
 */
export interface TournamentViewModel {
  Id: string;
  Name: string;
  GameId?: number;
  MapId?: number;
  StartsAt?: string;
  EndsAt?: string;
  MaxEntries?: number;
  EntriesCount?: number;
  EntryFee?: number;
  EntryFeeType?: EntryFeeType;
  IsJoined: boolean;
}

/**
 * Special Tournament Leaderboard Player.
 */
export interface TournamentPlayerViewModel {
  UserId: number;
  UserName: string;
  Score: number;
  Place: number;
  AvatarUrl?: string;
}

/**
 * Special Tournament Leaderboard.
 */
export interface TournamentLeaderboardViewModel extends TournamentViewModel {
  Players: TournamentPlayerViewModel[];
  CurrentPlayer?: TournamentPlayerViewModel;
  TotalPlayers?: number;
}

/**
 * Community Group within a Tournament.
 */
export interface TournamentCommunityViewModel {
  Uuid: string;
  Name: string;
  Description: string;
  MembersCount: number;
}

/**
 * Special Tournament Enter Response.
 */
export interface TournamentEnterData {
  LocalTournamentUuid: string;
}

/**
 * Special Tournament Result confirmation.
 */
export interface TournamentResultViewModel {
  Score?: number;
  Time?: number;
  XpReceive?: number;
  IcReceive?: number;
}

/**
 * Historical Tournament entry data.
 */
export interface TournamentHistoryPrize {
  Name: string;
  Amount: number;
  ImageUrl?: string;
  IsRedeemed: boolean;
}

export interface TournamentHistoryEntry {
  TournamentName: string;
  TournamentUuid: string;
  StartsAt?: string;
  EndsAt?: string;
  ScoredAt?: string;
  IsFinished: boolean;
  BestScore?: number;
  LeaderboardPlace?: number;
  EntriesCount?: number;
  MaxEntries?: number;
  Prizes?: TournamentHistoryPrize[];
}

export interface TournamentHistoryViewModel {
  Entries: TournamentHistoryEntry[];
  Meta?: {
    CurrentPage: number;
    LastPage: number;
    PerPage: number;
    Total: number;
  };
}

/**
 * Unfinished session details.
 */
export interface SavedSessionResponse {
  Id: string;
  SessionId: string;      // Event/Room ID
  SaveSessionId: string;  // Match/Session ID
  GameType: number;
  ReconnectTime: number;
  Data: string;           // Encrypted JSON state
  Hash: string;           // HMAC signature
}

export interface UnfinishedSessionsResponse {
  SavedSessions: SavedSessionResponse[];
}

/**
 * Server User representation for Dedicated Server match registration.
 */
export interface ServerUserData {
  JoinKey: string;
  FunticoUserId: number;  // Platform user ID
  SdkUserId: number;      // Database user ID
  UserStatus: UserGameStatus;
}

/**
 * Hall of Fame leaderboard entry.
 *
 * Fields are camelCase, unlike the rest of this SDK: the /HallOfFame DTOs declare explicit
 * lowercase [JsonProperty] names, which win over the PascalCase resolver the other endpoints use.
 * Do not "fix" these to PascalCase for consistency - every field would silently read undefined.
 * Nullable fields are sent as explicit null rather than omitted, hence `| null`.
 */
export interface HallOfFamePlayerEntry {
  userId: number;
  funticoId: number;
  displayName: string;
  avatarUrl?: string | null;
  avatarType?: string | null;
  avatarBorder?: string | null;
  country?: string | null;
  rank: number;
  totalPoints: number;      // The player's best single score, not a sum
  gamesPlayed: number;
  playedAt?: string | null; // ISO-8601 timestamp of the ranked run
  borderType?: string | null;
}

/**
 * Paginated Hall of Fame ranking response.
 */
export interface HallOfFameResponse {
  leaderboard: HallOfFamePlayerEntry[];
  currentPlayer?: HallOfFamePlayerEntry | null;  // null when the player has no ranked results
  totalPlayers: number;
  page: number;
  limit: number;
}

/**
 * GPP (TICO) prize inside a Hall of Fame distribution tier.
 *
 * The mixed casing is real: the backend PrizeConverter hardcodes a lowercase `type` but writes
 * every other field via reflection on the C# property name, ignoring [JsonProperty]. This shape
 * therefore differs from the `Prize` union above, which models a different endpoint's contract.
 */
export interface HOFGppPrize {
  type: PrizeType.GppPerPlayer;
  Currency: number;
  Value: number;
  Percentage?: number;  // The converter omits null fields entirely
}

/**
 * Platform item prize inside a Hall of Fame distribution tier.
 * The nested `Item` keeps lowercase fields - it is serialized by its own [JsonProperty]
 * attributes rather than by the PrizeConverter.
 */
export interface HOFItemPrize {
  type: PrizeType.Item;
  ItemId: number;
  Amount: number;
  Item?: PlatformItemPrize;
}

/**
 * Prize variations returned by /HallOfFame/distribution.
 */
export type HOFPrize = HOFGppPrize | HOFItemPrize;

/**
 * A single place (1-10) or a grouped place range (11-20, 21-50) in the distribution.
 */
export interface HOFDistributionItem {
  place: number;
  endPlace?: number;  // Absent for individual places 1-10
  range?: string;     // Absent for individual places 1-10; e.g. "11-20"
  prizes: HOFPrize[];
}

/**
 * Hall of Fame prize distribution table.
 */
export interface HOFDistributionResponse {
  items: HOFDistributionItem[];
}

/**
 * Cryptography helper class leveraging the browser Web Crypto API.
 * Ensures complete compatibility with C# AESNonDynamic and HashUtils.
 */
export class CryptoHelper {
  private static formatKey(key: string): string {
    if (key.length > 16) {
      return key.substring(0, 16);
    } else if (key.length < 16) {
      return key.padEnd(16, key[0] || '0');
    }
    return key;
  }

  /**
   * Encrypts plaintext using AES-128-CBC with PKCS7 padding and a static IV.
   * Mirrors C# AESNonDynamic.Encrypt.
   */
  public static async encrypt(plainText: string, keyStr: string): Promise<string> {
    const formattedKey = this.formatKey(keyStr);
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(formattedKey);
    const ivBytes = encoder.encode("1234567890123456"); // Static 16-byte IV
    const plainBytes = encoder.encode(plainText);

    const cryptoProvider = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const cryptoKey = await cryptoProvider.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-CBC", length: 128 },
      false,
      ["encrypt"]
    );

    const encryptedBuffer = await cryptoProvider.subtle.encrypt(
      { name: "AES-CBC", iv: ivBytes },
      cryptoKey,
      plainBytes
    );

    // Convert array buffer to base64
    const encryptedBytes = new Uint8Array(encryptedBuffer);
    let binary = "";
    for (let i = 0; i < encryptedBytes.byteLength; i++) {
      binary += String.fromCharCode(encryptedBytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Decrypts ciphertext using AES-128-CBC with PKCS7 padding and a static IV.
   * Mirrors C# AESNonDynamic.Decrypt.
   */
  public static async decrypt(encryptedBase64: string, keyStr: string): Promise<string> {
    const formattedKey = this.formatKey(keyStr);
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(formattedKey);
    const ivBytes = encoder.encode("1234567890123456");
    
    // Decode base64 to binary string then to Uint8Array
    const binaryStr = atob(encryptedBase64);
    const cipherBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      cipherBytes[i] = binaryStr.charCodeAt(i);
    }

    const cryptoProvider = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const cryptoKey = await cryptoProvider.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-CBC", length: 128 },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await cryptoProvider.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes },
      cryptoKey,
      cipherBytes
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * Computes HMAC-SHA256 signature represented as a hex string.
   * Mirrors C# HashUtils.HashString.
   */
  public static async hmacSha256(message: string, keyStr: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(keyStr);
    const messageBytes = encoder.encode(message);

    const cryptoProvider = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const key = await cryptoProvider.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );

    const signature = await cryptoProvider.subtle.sign(
      "HMAC",
      key,
      messageBytes
    );

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

/**
 * Funtico SDK - Core Service Facade.
 * Implements 100% of Unity SDK features.
 */
export class FunticoSDK {
  private static _instance: FunticoSDK | null = null;

  private config!: FunticoConfig;
  private jwtToken: string | null = null;
  private apiUri: string = "";

  // Caching mechanism
  private cachedUserData: UserData | null = null;
  private cachedBalance: BalanceResponse | null = null;
  private cachedVouchers: VoucherData[] | null = null;
  private cacheExpiresAt: number = 0;

  // Local client session storage (for reconnection and logging events)
  private activeClientSessionDbId: string | null = null;
  private activeClientSessionId: string | null = null; // Stored eventId
  private currentClientSessionId: string | null = null; // Stored saveSessionId
  private currentClientSessionEvents: string[] = [];

  // Dedicated server session tracking
  private activeServerSessionId: string | null = null;
  private activeServerSessionEvents: Map<number, string[]> = new Map(); // platformUserId -> eventLogs[]

  private constructor() {}

  public static get Instance(): FunticoSDK {
    if (!this._instance) {
      this._instance = new FunticoSDK();
    }
    return this._instance;
  }

  /**
   * Initializes the Funtico SDK.
   * Automatically performs user authentication if token is provided.
   */
  public async Initialize(config: FunticoConfig): Promise<void> {
    this.config = config;
    
    if (config.apiBaseUrl) {
      this.apiUri = config.apiBaseUrl;
    } else {
      this.apiUri = config.env === FunticoEnvironment.STAGING 
        ? "https://funtico-sdk-staging.azurewebsites.net"
        : "https://funtico-sdk.azurewebsites.net";
    }

    if (config.userToken) {
      await this.Authentication(config.userToken);
      await Promise.allSettled([
        this.GetUserData(false),
        this.GetBalance(false),
        this.GetVouchers(false)
      ]);
    }
  }

  /**
   * Exchanges platform token for the game's JWT token.
   */
  public async Authentication(platformToken: string): Promise<any> {
    const response = await fetch(`${this.apiUri}/Auth/funtico-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Key": this.config.publicGameKey
      },
      body: JSON.stringify({ Token: platformToken })
    });

    if (!response.ok) {
      throw new Error(`Funtico Authentication failed: ${await response.text()}`);
    }

    const data = await response.json();
    this.jwtToken = data.Token;
    return data;
  }

  public getPlatformToken(): string {
    return this.config.userToken || "";
  }

  public getUserToken(): string {
    return this.jwtToken || "";
  }

  private getAuthHeaders(includeContentType = true): HeadersInit {
    if (!this.jwtToken) {
      throw new Error("SDK is not authenticated. Call Initialize() or Authentication() first.");
    }
    const headers: Record<string, string> = {
      "X-User-Key": this.config.publicGameKey,
      "Authorization": `Bearer ${this.jwtToken}`
    };
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  private getServerHeaders(): HeadersInit {
    // Dedicated servers use the server secret key header
    return {
      "Content-Type": "application/json",
      "X-Server-Key": this.config.privateGameKey
    };
  }

  /**
   * Calculates the session encryption key matching C# GetEncryptionKey(userId) logic.
   * Encryption key = userGuidStr (first 8 chars of userId Guid) + privateKeyPart (last 8 chars of privateGameKey)
   */
  private getSessionEncryptionKey(): string {
    const userId = this.cachedUserData?.UserId;
    if (userId === undefined) {
      throw new Error("User data is not loaded. Cannot derive session encryption key.");
    }
    // C# IntToGuid interprets bytes in Little Endian, returning userId as hex padded to 8 chars
    const userGuidStr = userId.toString(16).padStart(8, '0');
    // C# key.Substring(key.Length - 8)
    const privateKey = this.config.privateGameKey;
    const privateKeyPart = privateKey.substring(privateKey.length - 8);

    return userGuidStr + privateKeyPart;
  }

  /* ================= User Data Methods ================= */

  public async GetUserData(useCache = true): Promise<UserData> {
    if (useCache && this.cachedUserData && Date.now() < this.cacheExpiresAt) {
      return this.cachedUserData;
    }

    const response = await fetch(`${this.apiUri}/User/get-full-data`, {
      headers: this.getAuthHeaders(false)
    });

    if (!response.ok) throw new Error("Failed to fetch user data");

    this.cachedUserData = await response.json();
    this.updateCacheExpiration();
    return this.cachedUserData!;
  }

  public GetCachedUserData(): UserData | null {
    return this.cachedUserData;
  }

  public async GetBalance(useCache = true): Promise<BalanceResponse> {
    if (useCache && this.cachedBalance && Date.now() < this.cacheExpiresAt) {
      return this.cachedBalance;
    }

    const response = await fetch(`${this.apiUri}/User/get-balance`, {
      headers: this.getAuthHeaders(false)
    });

    if (!response.ok) throw new Error("Failed to fetch balance");

    this.cachedBalance = await response.json();
    return this.cachedBalance!;
  }

  public GetCachedBalance(): BalanceResponse | null {
    return this.cachedBalance;
  }

  public async GetVouchers(useCache = true): Promise<VoucherData[]> {
    if (useCache && this.cachedVouchers && Date.now() < this.cacheExpiresAt) {
      return this.cachedVouchers;
    }

    const response = await fetch(`${this.apiUri}/User/vouchers-data`, {
      headers: this.getAuthHeaders(false)
    });

    if (!response.ok) throw new Error("Failed to fetch vouchers");

    this.cachedVouchers = await response.json();
    return this.cachedVouchers!;
  }

  public GetCachedVouchers(): VoucherData[] | null {
    return this.cachedVouchers;
  }

  public async CanAfford(type: EntryFeeType, amount: number): Promise<boolean> {
    const balance = await this.GetBalance(false);
    return this.evaluateAffordability(balance, type, amount);
  }

  public CanAffordFromCache(type: EntryFeeType, amount: number): boolean {
    if (!this.cachedBalance) return false;
    return this.evaluateAffordability(this.cachedBalance, type, amount);
  }

  private evaluateAffordability(balance: BalanceResponse, type: EntryFeeType, amount: number): boolean {
    switch (type) {
      case EntryFeeType.Free:
        return true;
      case EntryFeeType.IC:
        return balance.Coins >= amount;
      case EntryFeeType.Tico:
        return balance.Diamonds >= amount;
      case EntryFeeType.SemifinalsTickets:
        return balance.SemiFinalTickets >= amount;
      case EntryFeeType.FinalTickets:
        return balance.FinalTickets >= amount;
      case EntryFeeType.PrivateTickets:
        return balance.PrivateTickets >= amount;
      default:
        return false;
    }
  }

  private updateCacheExpiration(): void {
    const ttl = this.config.cacheTTL || 30000;
    this.cacheExpiresAt = Date.now() + ttl;
  }

  /* ================= Rooms & Tournament Methods ================= */

  public async GetTiers(): Promise<TierViewModel[]> {
    const response = await fetch(`${this.apiUri}/Rooms/tiers`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament tiers");
    return await response.json();
  }

  public async GetRooms(roomType: number = 0, limit: number = 10): Promise<RoomViewModel[]> {
    const response = await fetch(`${this.apiUri}/Rooms/get-rooms?roomType=${roomType}&limit=${limit}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch rooms list");
    return await response.json();
  }

  public async GetRoom(roomId: string): Promise<RoomViewModel> {
    const response = await fetch(`${this.apiUri}/Rooms/get-room?roomId=${roomId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch room details");
    return await response.json();
  }

  public async GetRoomPublic(id: string): Promise<RoomViewModel> {
    const response = await fetch(`${this.apiUri}/Rooms/get-room-public?id=${id}`, {
      headers: {
        "X-User-Key": this.config.publicGameKey
      }
    });
    if (!response.ok) throw new Error("Failed to fetch public room details");
    return await response.json();
  }

  public async GetRoomSettings(eventId: string): Promise<any> {
    const response = await fetch(`${this.apiUri}/Rooms/game-settings?eventId=${eventId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch room settings");
    return await response.json();
  }

  public async GetPrePaid(): Promise<any[]> {
    const response = await fetch(`${this.apiUri}/Rooms/pre-paid`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch pre-paid list");
    return await response.json();
  }

  public async GetHistory(page: number, filters?: string, limit = 10, cursor?: string): Promise<any> {
    let url = `${this.apiUri}/Rooms/history?page=${page}&limit=${limit}`;
    if (filters) url += `&filters=${encodeURIComponent(filters)}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const response = await fetch(url, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch rooms history");
    return await response.json();
  }

  public async GetRoomHistoryDetails(sessionId: string, withEvent = true): Promise<any> {
    const response = await fetch(`${this.apiUri}/Rooms/get-history?sessionId=${sessionId}&withEvent=${withEvent}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch detailed room history");
    return await response.json();
  }

  public async GetLeaderboard(eventId: string, sessionId: string, matchId?: string): Promise<RoomLeaderboardViewModel> {
    let url = `${this.apiUri}/Rooms/leaders?eventId=${eventId}&session_or_match_id=${sessionId}`;
    if (matchId) url += `&matchId=${matchId}`;

    const response = await fetch(url, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch leaderboard");
    return await response.json();
  }

  /**
   * Joins a room. Handles entry fee validation and starts a pending session.
   */
  public async JoinRoom(roomGuid: string, useVoucher = false): Promise<RoomSessionData> {
    const response = await fetch(`${this.apiUri}/Rooms/join-room`, {
      method: "POST",
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({
        TournamentId: roomGuid,
        UseVoucher: useVoucher
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to join room: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * Signals the server that gameplay has started.
   */
  public async StartRoomSP(eventId: string, sessionOrMatchId: string): Promise<any> {
    const url = `${this.apiUri}/Rooms/start-room-sp?eventId=${eventId}&sessionOrMatchId=${sessionOrMatchId}`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getAuthHeaders(false)
    });

    if (!response.ok) throw new Error("Failed to start gameplay session");
    return await response.json();
  }

  /**
   * Ends a room session and sends the player's encrypted score to the game API (Client-side).
   */
  public async EndRoomSP(
    eventId: string,
    sessionOrMatchId: string,
    score: number,
    userId: number,
    ip = "127.0.0.1",
    gameEvents: string[] = []
  ): Promise<any> {
    const scorePayload = {
      Score: score,
      UserId: userId,
      Ip: ip,
      GameEvents: gameEvents.length > 0 ? gameEvents : this.currentClientSessionEvents
    };

    const plainText = JSON.stringify(scorePayload);
    const encryptionKey = sessionOrMatchId.substring(0, 8) + this.config.privateGameKey.substring(0, 8);
    const encryptedData = await CryptoHelper.encrypt(plainText, encryptionKey);

    const hashKey = this.config.privateGameKey.substring(8);
    const hash = await CryptoHelper.hmacSha256(encryptedData, hashKey);

    const response = await fetch(`${this.apiUri}/Rooms/end-room-sp?eventId=${eventId}&gameSessionIrOrMatchId=${sessionOrMatchId}`, {
      method: "POST",
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({
        TournamentId: eventId,
        Hash: hash,
        EncryptedData: encryptedData
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to end gameplay session: ${await response.text()}`);
    }

    // Auto-close client session locally
    this.CloseCurrentSession_Client();

    return await response.json();
  }

  /* ================= Special Tournaments Methods ================= */

  public async GetTournaments(page = 1, perPage = 100, filter?: TournamentsFilterEnum): Promise<TournamentViewModel[]> {
    let url = `${this.apiUri}/SpecialTournaments/all-tournaments?page=${page}&perPage=${perPage}`;
    if (filter) url += `&filterEnum=${filter}`;

    const response = await fetch(url, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch special tournaments");
    return await response.json();
  }

  public async GetTournamentDetailsLight(tournamentId: string): Promise<TournamentViewModel> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/light-tournament-details?tournamentId=${tournamentId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament metadata");
    return await response.json();
  }

  public async GetTournamentLeaderboard(tournamentId: string): Promise<TournamentLeaderboardViewModel> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/get-special-tournament-leaderboard?tournamentId=${tournamentId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament leaderboard");
    return await response.json();
  }

  public async GetTournamentCommunities(tournamentId: string): Promise<TournamentCommunityViewModel[]> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/get-tournaments-communities?tournamentId=${tournamentId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament communities");
    return await response.json();
  }

  public async JoinTournament(tournamentId: string, communityId?: string, password?: string): Promise<boolean> {
    let url = `${this.apiUri}/SpecialTournaments/join-tournament?tournamentId=${tournamentId}`;
    if (communityId) url += `&communityId=${communityId}`;
    if (password) url += `&password=${encodeURIComponent(password)}`;

    const response = await fetch(url, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to join special tournament");
    return await response.json(); // returns boolean
  }

  public async EnterTournament(tournamentId: string): Promise<TournamentEnterData> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/enter-tournament?tournamentId=${tournamentId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to enter special tournament");
    return await response.json();
  }

  public async GetPrizes(tournamentId: string): Promise<Prize[]> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/get-prizes?tournamentId=${tournamentId}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament prizes");
    return await response.json();
  }

  public async GetTournamentsHistory(page = 1, perPage = 10): Promise<TournamentHistoryViewModel> {
    const response = await fetch(`${this.apiUri}/SpecialTournaments/history?page=${page}&per_page=${perPage}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch tournament history");
    return await response.json();
  }

  /**
   * Submits a special tournament game result from a trusted Dedicated Server.
   */
  public async ResultTournament_Server(
    tournamentId: string,
    saveScoreId: string,
    score: number,
    userId: number,
    isSuccess: boolean,
    ip = "0.0.0.0"
  ): Promise<TournamentResultViewModel> {
    const requestPayload = {
      UserId: userId,
      Score: score,
      IsSuccess: isSuccess,
      Ip: ip
    };

    const response = await fetch(`${this.apiUri}/SpecialTournaments/result-tournament?tournamentId=${tournamentId}&saveScoreId=${saveScoreId}`, {
      method: "POST",
      headers: this.getServerHeaders(),
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit server tournament result: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * Submits an encrypted special tournament game result from a Client build.
   */
  public async ResultTournament_Client(
    tournamentId: string,
    saveScoreId: string,
    score: number,
    isSuccess: boolean,
    customData = ""
  ): Promise<boolean> {
    const scorePayload = {
      Score: score,
      IsSuccess: isSuccess,
      CustomData: customData,
      GameEvents: this.currentClientSessionEvents
    };

    const plainText = JSON.stringify(scorePayload);
    // Encryption key derived from saveScoreId and privateGameKey
    const encryptionKey = saveScoreId.substring(0, 8) + this.config.privateGameKey.substring(0, 8);
    const encryptedData = await CryptoHelper.encrypt(plainText, encryptionKey);

    // Signature key starting from character 8
    const hashKey = this.config.privateGameKey.substring(8);
    const hash = await CryptoHelper.hmacSha256(encryptedData, hashKey);

    const response = await fetch(`${this.apiUri}/SpecialTournaments/result-tournament-client?tournamentId=${tournamentId}&saveScoreId=${saveScoreId}`, {
      method: "POST",
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({
        EncryptedData: encryptedData,
        Hash: hash
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to submit client tournament result: ${await response.text()}`);
    }

    this.CloseCurrentSession_Client();
    return await response.json(); // returns boolean success
  }

  /* ================= Hall of Fame Methods ================= */

  /**
   * Fetches a page of the Hall of Fame ranking.
   * @param mode     Global (all-time) or Monthly (current calendar month, UTC).
   * @param page     1-based page index.
   * @param limit    Entries per page.
   * @param gameMode Restricts the ranking to a single mode; All applies no filter.
   */
  public async GetHallOfFame(
    mode: HallOfFamePeriodMode,
    page = 1,
    limit = 10,
    gameMode: HallOfFameGameModeFilter = HallOfFameGameModeFilter.All
  ): Promise<HallOfFameResponse> {
    let path: string;
    switch (mode) {
      case HallOfFamePeriodMode.Global:
        path = "global";
        break;
      case HallOfFamePeriodMode.Monthly:
        path = "monthly";
        break;
      default:
        throw new Error(`Unsupported Hall of Fame period mode: ${mode}`);
    }

    let url = `${this.apiUri}/HallOfFame/${path}?page=${page}&limit=${limit}`;
    if (gameMode !== HallOfFameGameModeFilter.All) {
      url += `&gameMode=${this.mapHallOfFameGameMode(gameMode)}`;
    }

    const response = await fetch(url, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch Hall of Fame leaderboard");
    return await response.json();
  }

  /**
   * Fetches the Hall of Fame prize distribution table.
   */
  public async GetHallOfFameDistribution(): Promise<HOFDistributionResponse> {
    const response = await fetch(`${this.apiUri}/HallOfFame/distribution`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to fetch Hall of Fame distribution");
    return await response.json();
  }

  private mapHallOfFameGameMode(gameMode: HallOfFameGameModeFilter): HallOfFameGameMode {
    switch (gameMode) {
      case HallOfFameGameModeFilter.SpecialTournament:
        return HallOfFameGameMode.SpecialTournament;
      case HallOfFameGameModeFilter.Rooms:
        return HallOfFameGameMode.Rooms;
      case HallOfFameGameModeFilter.Practice:
        return HallOfFameGameMode.Practice;
      default:
        throw new Error(`Unsupported Hall of Fame game mode filter: ${gameMode}`);
    }
  }

  /* ================= Client Session Methods (Reconnection) ================= */

  public async UserHasUnfinishedSession_Client(): Promise<UnfinishedSessionsResponse> {
    const response = await fetch(`${this.apiUri}/Session/any-unfinished-sessions`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to check unfinished sessions");
    return await response.json();
  }

  public async ReconnectToUnfinishedSession_Client(id: string): Promise<string> {
    const response = await fetch(`${this.apiUri}/Session/reconnect-to-session?id=${id}`, {
      headers: this.getAuthHeaders(false)
    });
    if (!response.ok) throw new Error("Failed to reconnect to session");
    
    const data: SavedSessionResponse = await response.json();
    
    // Decrypt the custom session state
    const decryptionKey = this.getSessionEncryptionKey();
    const decryptedState = await CryptoHelper.decrypt(data.Data, decryptionKey);

    // Restore session tracking
    this.activeClientSessionDbId = data.Id;
    this.activeClientSessionId = data.SessionId;
    this.currentClientSessionId = data.SaveSessionId;
    this.currentClientSessionEvents = []; // clean logs to record new events during resume
    
    return decryptedState;
  }

  public async CreateSession_Client(
    json: string,
    gameType: GameTypeEnum,
    eventId: string,
    saveSessionId: string
  ): Promise<SavedSessionResponse> {
    // Encrypt custom data before storing
    const encryptionKey = this.getSessionEncryptionKey();
    const encryptedData = await CryptoHelper.encrypt(json, encryptionKey);

    // Hash is calculated using eventId (SessionId) as key
    const hash = await CryptoHelper.hmacSha256(encryptedData, eventId);

    const response = await fetch(`${this.apiUri}/Session/create-session`, {
      method: "POST",
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({
        SessionId: eventId,
        SaveSessionId: saveSessionId,
        GameType: gameType,
        Data: encryptedData,
        Hash: hash
      })
    });

    if (!response.ok) throw new Error("Failed to create client session");

    const savedSession: SavedSessionResponse = await response.json();
    this.activeClientSessionDbId = savedSession.Id;
    this.activeClientSessionId = eventId;
    this.currentClientSessionId = saveSessionId;
    this.currentClientSessionEvents = [];
    return savedSession;
  }

  public async UpdateSession_Client(json: string): Promise<boolean> {
    if (!this.activeClientSessionDbId || !this.activeClientSessionId) {
      throw new Error("No active client session found to update. Create or Reconnect first.");
    }

    const encryptionKey = this.getSessionEncryptionKey();
    const encryptedData = await CryptoHelper.encrypt(json, encryptionKey);

    // Hash is calculated using activeClientSessionId (eventId) as key
    const hash = await CryptoHelper.hmacSha256(encryptedData, this.activeClientSessionId);

    const response = await fetch(`${this.apiUri}/Session/update-session`, {
      method: "POST",
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({
        Id: this.activeClientSessionDbId,
        Data: encryptedData,
        Hash: hash
      })
    });

    if (!response.ok) throw new Error("Failed to update client session progress");
    return await response.json(); // returns boolean
  }

  /**
   * Closes active local client session tracking.
   */
  public CloseCurrentSession_Client(): void {
    this.activeClientSessionDbId = null;
    this.activeClientSessionId = null;
    this.currentClientSessionId = null;
    this.currentClientSessionEvents = [];
  }

  public RecordEvent_Client(eventInfo: string): void {
    this.currentClientSessionEvents.push(eventInfo);
  }

  public GetCurrentSessionEvents_Client(): string[] {
    return [...this.currentClientSessionEvents];
  }

  /* ================= Dedicated Server Session Methods ================= */

  /**
   * Registers a new multiplayer session on the API from a Dedicated Game Server.
   */
  public async CreateSession_Server(
    serverUrl: string,
    sessionId: string,
    playersInfo: ServerUserData[]
  ): Promise<boolean> {
    const response = await fetch(`${this.apiUri}/Session/create-server-session`, {
      method: "POST",
      headers: this.getServerHeaders(),
      body: JSON.stringify({
        ServerUrl: serverUrl,
        SessionId: sessionId,
        PlayersInfo: playersInfo
      })
    });

    if (!response.ok) throw new Error("Failed to create server session");
    
    this.activeServerSessionId = sessionId;
    this.activeServerSessionEvents.clear();
    playersInfo.forEach(p => {
      this.activeServerSessionEvents.set(p.FunticoUserId, []);
    });

    return await response.json(); // returns boolean
  }

  /**
   * Reports that a player has left the server match session.
   */
  public async UserLeaveSession_Server(platformUserId: number): Promise<boolean> {
    if (!this.activeServerSessionId) {
      throw new Error("No active server session tracked.");
    }

    const response = await fetch(`${this.apiUri}/Session/server-session-user-leave?id=${this.activeServerSessionId}&userId=${platformUserId}`, {
      headers: this.getServerHeaders()
    });

    if (!response.ok) throw new Error("Failed to submit player leave status to server");
    return await response.json(); // returns boolean
  }

  /**
   * Closes active server match session on the API.
   */
  public async CloseCurrentSession_Server(): Promise<boolean> {
    if (!this.activeServerSessionId) {
      throw new Error("No active server session tracked.");
    }

    const response = await fetch(`${this.apiUri}/Session/close-server-session?id=${this.activeServerSessionId}`, {
      headers: this.getServerHeaders()
    });

    if (!response.ok) throw new Error("Failed to close server session");
    
    this.activeServerSessionId = null;
    this.activeServerSessionEvents.clear();
    return await response.json(); // returns boolean
  }

  /**
   * Submits multiplayer results for all match participants in one payload from Dedicated Server.
   */
  public async FinishRoomSession_Server(
    eventId: string,
    sessionId: string,
    participants: Array<{
      Score: number;
      UserId: number;
      FunticoUserId: number;
      UserIp: string;
      AdditionalData?: string;
      GameEvents?: string[];
    }>
  ): Promise<boolean> {
    // Fill in auto-collected server events if omitted
    const processedParticipants = participants.map(p => {
      const serverLoggedEvents = this.activeServerSessionEvents.get(p.FunticoUserId) || [];
      return {
        ...p,
        GameEvents: p.GameEvents || serverLoggedEvents
      };
    });

    const response = await fetch(`${this.apiUri}/Rooms/end-room-all-users?eventId=${eventId}`, {
      method: "POST",
      headers: this.getServerHeaders(),
      body: JSON.stringify({
        GameSessionOrMatchId: sessionId,
        Participants: processedParticipants
      })
    });

    if (!response.ok) throw new Error("Failed to finalize server match results");

    // Cleanup session tracking
    this.activeServerSessionId = null;
    this.activeServerSessionEvents.clear();

    return await response.json();
  }

  public RecordEvent_Server(platformUserId: number, eventInfo: string): void {
    const list = this.activeServerSessionEvents.get(platformUserId) || [];
    list.push(eventInfo);
    this.activeServerSessionEvents.set(platformUserId, list);
  }

  public GetCurrentSessionEvents_Server(platformUserId: number): string[] {
    return [...(this.activeServerSessionEvents.get(platformUserId) || [])];
  }
}

/**
 * Phaser 3 Plugin wrapper for FunticoSDK.
 * Emits Phaser Events for seamless integration with Phaser Scenes.
 */
export class FunticoPhaserPlugin extends Phaser.Plugins.BasePlugin {
  public sdk: FunticoSDK;

  // Custom Phaser Event keys
  public static readonly EVENTS = {
    INITIALIZED: 'funtico_initialized',
    AUTHENTICATED: 'funtico_authenticated',
    USER_DATA_UPDATED: 'funtico_user_updated',
    BALANCE_UPDATED: 'funtico_balance_updated'
  };

  constructor(pluginManager: Phaser.Plugins.PluginManager) {
    super(pluginManager);
    this.sdk = FunticoSDK.Instance;
  }

  /**
   * Initializes the Funtico SDK inside the Phaser lifecycle.
   */
  public async init(config: FunticoConfig): Promise<void> {
    try {
      await this.sdk.Initialize(config);
      this.game.events.emit(FunticoPhaserPlugin.EVENTS.INITIALIZED);
      
      if (this.sdk.getUserToken()) {
        this.game.events.emit(FunticoPhaserPlugin.EVENTS.AUTHENTICATED, this.sdk.getUserToken());
      }
    } catch (error) {
      console.error("[FunticoPhaserPlugin] Initialization error:", error);
    }
  }

  public async login(platformToken: string): Promise<any> {
    const result = await this.sdk.Authentication(platformToken);
    this.game.events.emit(FunticoPhaserPlugin.EVENTS.AUTHENTICATED, this.sdk.getUserToken());
    return result;
  }

  public async refreshUserData(useCache = false): Promise<UserData> {
    const data = await this.sdk.GetUserData(useCache);
    this.game.events.emit(FunticoPhaserPlugin.EVENTS.USER_DATA_UPDATED, data);
    return data;
  }

  public async refreshBalance(useCache = false): Promise<BalanceResponse> {
    const balance = await this.sdk.GetBalance(useCache);
    this.game.events.emit(FunticoPhaserPlugin.EVENTS.BALANCE_UPDATED, balance);
    return balance;
  }
}
