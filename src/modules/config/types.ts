/**
 * config DTOs for GET /config/app and GET /config/brochures. Shipped clients
 * read these: add fields freely, but never rename or remove one without a
 * deprecation cycle.
 */

export type Platform = 'ios' | 'android';

export type AppConfigVersion = {
  /** Below this the client must force-update. */
  minSupported: string;
  /** Below this the client shows a soft update banner. */
  latest: string;
  /** Caller is below minSupported. False when updateUrl is null. */
  updateRequired: boolean;
  /** Caller is below latest. False when updateUrl is null. */
  updateAvailable: boolean;
  /** Store page for the caller's platform; null if not published there yet. */
  updateUrl: string | null;
};

export type AppConfigMaintenance = {
  active: boolean;
  /** Shown on the maintenance screen. */
  message: string | null;
  /** Expected end (ISO-8601); the client shows a countdown. */
  estimatedEndAt: string | null;
};

export type AppConfigFeatureFlags = {
  /** Always false; kept for shipped clients. Use testMode from /auth/otp/request. */
  otpTestMode: boolean;
  referralsEnabled: boolean;
  supportChatEnabled: boolean;
};

export type AppConfigSupport = {
  phone: string;
  whatsapp: string;
  email: string;
  helpUrl: string;
};

export type AppConfigLegal = {
  termsUrl: string;
  privacyUrl: string;
  termsVersion: string;
};

/**
 * Spiritual Tours is a SEPARATE app published by Urban Cruise. This app only
 * points customers at it, so all it needs is the store page.
 *
 * Resolved per request from the caller's platform, exactly like
 * version.updateUrl: an iPhone never gets a Play Store link it cannot open.
 * null means not published on that store yet — the app then shows the
 * download button disabled rather than opening a dead link.
 */
export type AppConfigSpiritualToursApp = {
  /** Store page for the caller's platform; null if not published there yet. */
  url: string | null;
};

/** GET /config/app payload. Some version fields are computed per request. */
export type AppConfigData = {
  version: AppConfigVersion;
  maintenance: AppConfigMaintenance;
  featureFlags: AppConfigFeatureFlags;
  support: AppConfigSupport;
  legal: AppConfigLegal;
  spiritualToursApp: AppConfigSpiritualToursApp;
  serviceCities: string[];
};

/** Validated caller context passed to the service. */
export type AppConfigContext = {
  platform: Platform;
  appVersion: string;
  buildNumber: number | null;
  locale: string | null;
};

/* ---------- Vehicle brochures (GET /config/brochures) ---------- */

/** Same keys as the app's vehicleTierOptions.ts. */
export type VehicleTier = 'economy' | 'premium' | 'royal' | 'royal_vip';

/**
 * Comparison facts for the app's Compare screen. null means "not provided";
 * the app shows a dash. Values are short display strings set by ops.
 */
export type BrochureSpecs = {
  modelYear: string | null;
  airConditioning: string | null;
  seatType: string | null;
  chargingPoint: string | null;
  musicSystem: string | null;
  sofaBed: string | null;
  tv: string | null;
  panoramicWindow: string | null;
};

/**
 * One tier inside a vehicle group. A group (groupKey) is one vehicle type at
 * one seater count, e.g. "Force Traveller 13 Seater", and maps to one
 * Unlisted YouTube playlist. Each tier of that group is one entry.
 */
export type BrochureEntry = {
  /** Stable id of the group, shared by all tiers of the group. */
  groupKey: string;
  /** Top grouping level, e.g. "Force Traveller". */
  vehicleType: string;
  /** Second grouping level. */
  seater: number;
  tier: VehicleTier;
  /** Card title, e.g. "Force Traveller 13 Seater — Royal". */
  title: string;
  /** The group's playlist; null until ops creates it. */
  youtubePlaylistId: string | null;
  /** Videos for this tier, in display order. Empty means "Coming soon". */
  videoIds: string[];
  /** Facilities checklist shown under the video. */
  features: string[];
  specs: BrochureSpecs;
};

/** GET /config/brochures payload. Entries keep the catalog's order. */
export type BrochureCatalogData = {
  brochures: BrochureEntry[];
};

/* ---------- Spiritual tours (GET /config/spiritual-tours) ---------- */

/**
 * The band of the country a tour belongs to. The app groups the list under
 * one heading per region, in the order defined by REGION_ORDER in
 * data/spiritual-tours.ts — never in the order the regions appear here.
 *
 * Only 'north' and 'west' have tours today. The rest are listed so adding a
 * southern tour is a data edit, not a contract change; a region with no
 * tours produces no heading in the app.
 */
export type SpiritualTourRegion = 'north' | 'south' | 'east' | 'west' | 'central' | 'northeast';

/**
 * Which line icon the app draws beside the tour title. A closed set, because
 * each value maps to a hand-drawn SVG in the app — the backend cannot
 * introduce a new one without an app release. An app that receives a value
 * it does not know falls back to 'temple' rather than rendering nothing.
 */
export type SpiritualTourIcon = 'temple' | 'trishul' | 'om' | 'ganesh' | 'shivling';

/**
 * One named stop. The list card joins the names; the detail screen shows
 * them as a row of picture tiles, which is why the image lives here rather
 * than in a parallel array that could fall out of step with the names.
 */
export type SpiritualTourPlace = {
  name: string;
  /** Absolute https URL, or null until ops uploads the tile photograph. */
  imageUrl: string | null;
};

/**
 * The four facts in the strip under the destinations. Every one is a
 * DISPLAY STRING set by ops, not a parsed value: "10 – 12 Days" and
 * "May – Oct" are ranges, "Car / Tempo / Bus" is a list, and the app only
 * ever prints them. Typing them as numbers or enums would buy nothing and
 * would stop ops writing "Apr – Jun, Sep – Oct" when that is the truth.
 * null hides that one fact rather than printing a dash.
 */
export type SpiritualTourFacts = {
  duration: string | null;
  travelMode: string | null;
  bestSeason: string | null;
  difficulty: string | null;
};

/** One row of the Itinerary tab. */
export type SpiritualTourItineraryDay = {
  /** "Day 1", "Day 3 – 4" — a label, because days are often grouped. */
  dayLabel: string;
  title: string;
  detail: string | null;
};

/**
 * One row of the Pricing tab. `amount` is a display string including the
 * currency, e.g. "₹24,500" — the backend never does money arithmetic here
 * and the app never parses it. A real quotation is priced by the team
 * through the enquiry flow; this tab is indicative only.
 */
export type SpiritualTourPrice = {
  label: string;
  amount: string;
  note: string | null;
};

export type SpiritualTourEntry = {
  /** Stable slug, e.g. "char-dham-yatra". Used as the detail screen's param. */
  id: string;
  region: SpiritualTourRegion;
  /** Main title, e.g. "Char Dham Yatra". */
  title: string;
  /**
   * The smaller qualifier the design sets in brackets after the title, e.g.
   * "(North, MP)". null when the title stands alone.
   */
  titleNote: string | null;
  /**
   * Named stops, shown on the card as joined names and on the detail screen
   * as picture tiles. Empty for tours the design describes in prose instead
   * — those carry `summary`.
   */
  places: SpiritualTourPlace[];
  /** Prose description, used on the card when `places` is empty. */
  summary: string | null;
  icon: SpiritualTourIcon;
  /**
   * Absolute https URL of the LIST CARD photograph, or null until ops
   * uploads one. The app draws its own branded tile for null, so a missing
   * photo never leaves a broken image.
   */
  imageUrl: string | null;

  /* ----- Detail screen -----
   * Everything below is read only by the detail screen. All of it is
   * optional: a tour with none of it still lists and still opens, it just
   * shows empty states inside its tabs. That lets ops publish a tour as
   * soon as its name and stops are known, and fill the rest in later.
   */

  /** One line under the title, e.g. "A sacred pilgrimage to the four …". */
  tagline: string | null;
  /** Carousel images, in order. Empty falls back to `imageUrl`, then to a tile. */
  heroImages: string[];
  facts: SpiritualTourFacts;
  /** The "About the Tour" body on the Overview tab. */
  overview: string | null;
  /** The ticked list in the Tour Highlights panel. */
  highlights: string[];
  itinerary: SpiritualTourItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  pricing: SpiritualTourPrice[];
  /** Small print under the price rows, e.g. what the figures exclude. */
  pricingNote: string | null;
};

/** GET /config/spiritual-tours payload. Entries keep the catalog's order. */
export type SpiritualTourCatalogData = {
  tours: SpiritualTourEntry[];
};
