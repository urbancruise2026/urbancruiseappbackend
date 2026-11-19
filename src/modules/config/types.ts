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
 * One named stop. The list card and the detail screen join the names.
 * `imageUrl` is kept for a future picture-tile layout; nothing shows it
 * today.
 */
export type SpiritualTourPlace = {
  name: string;
  /** Absolute https URL, or null until ops uploads the tile photograph. */
  imageUrl: string | null;
};

/**
 * Which icon the app draws beside one fact in the strip under the title.
 * A closed set, because each value maps to an icon bundled in the app. An
 * app that receives a value it does not know draws a neutral info icon, so
 * adding a value here is safe for older apps — it just looks plainer there.
 */
export type SpiritualTourFactIcon =
  'calendar' | 'users' | 'vehicle' | 'clock' | 'map-pin' | 'sun' | 'mountain' | 'info';

/**
 * One fact in the strip under the title, e.g. Duration · 10 – 12 Days.
 * The backend decides which facts a tour shows, their order, their labels
 * and their icons — the app only lays them out, so changing a label or
 * adding a fact needs no app release. Every value is a DISPLAY STRING set
 * by ops ("10 – 12 Days", "Up to 26"), never parsed.
 */
export type SpiritualTourFact = {
  icon: SpiritualTourFactIcon;
  /** Small grey label, e.g. "Duration". */
  label: string;
  /** Bold value, e.g. "10 – 12 Days". */
  value: string;
  /** Optional small line under the value, e.g. "9 – 26 Seater". */
  note: string | null;
};

/** One day (or group of days) of an itinerary section. */
export type SpiritualTourItineraryDay = {
  /** "Day 1", "Day 3 – 4" — a label, because days are often grouped. */
  dayLabel: string;
  title: string;
  detail: string | null;
};

/**
 * One row of a pricing section. `amount` is a display string including the
 * currency, e.g. "₹24,500" — the backend never does money arithmetic here
 * and the app never parses it. A real quotation is priced by the team
 * through the enquiry flow; this is indicative only.
 */
export type SpiritualTourPrice = {
  label: string;
  amount: string;
  note: string | null;
};

/**
 * Which icon the app draws on a section row (and its sheet's header). A
 * closed set, mapped to bundled icons; an unknown value falls back to
 * 'info' in the app.
 */
export type SpiritualTourSectionIcon = 'itinerary' | 'check' | 'cross' | 'rupee' | 'info' | 'list';

/** Fields every section has, whatever its kind. */
type SpiritualTourSectionBase = {
  /** Stable key within one tour, e.g. "itinerary". */
  id: string;
  /** Row title and sheet title, e.g. "Itinerary". */
  title: string;
  icon: SpiritualTourSectionIcon;
  /**
   * What the sheet says when the section has no content yet. null lets
   * the app use its own default ("Details coming soon").
   */
  emptyText: string | null;
};

/**
 * One tappable row on the detail screen; tapping opens a bottom sheet with
 * its content. The backend decides which rows a tour has, their order,
 * titles and icons. `kind` decides how the sheet lays the content out:
 *
 *   itinerary — a day-by-day timeline
 *   list      — a marked list; `marker` picks tick, cross or dot
 *   pricing   — label/amount rows plus an optional note
 *   text      — one paragraph
 *
 * A section with no content still shows as a row, and its sheet shows
 * `emptyText`. An older app that receives a kind it does not know skips
 * that row, so a new kind can be added without breaking anything.
 */
export type SpiritualTourInfoSection =
  | (SpiritualTourSectionBase & {
      kind: 'itinerary';
      days: SpiritualTourItineraryDay[];
    })
  | (SpiritualTourSectionBase & {
      kind: 'list';
      marker: 'check' | 'cross' | 'dot';
      items: string[];
    })
  | (SpiritualTourSectionBase & {
      kind: 'pricing';
      rows: SpiritualTourPrice[];
      /** Small print under the rows, e.g. what the figures exclude. */
      note: string | null;
    })
  | (SpiritualTourSectionBase & {
      kind: 'text';
      body: string | null;
    });

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
   * Named stops, joined with "·" under the title on the card and on the
   * detail screen. Empty for tours described in prose instead — those
   * carry `summary`.
   */
  places: SpiritualTourPlace[];
  /** Prose description, used under the title when `places` is empty. */
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
   * optional: a tour with none of it still lists and still opens. That lets
   * ops publish a tour as soon as its name and stops are known, and fill
   * the rest in later.
   */

  /** The fact strip under the title, in order. Empty hides the strip. */
  facts: SpiritualTourFact[];
  /** The "About the Tour" body. null hides that block. */
  overview: string | null;
  /** The tappable rows under About the Tour, in order. */
  sections: SpiritualTourInfoSection[];
};

/** GET /config/spiritual-tours payload. Entries keep the catalog's order. */
export type SpiritualTourCatalogData = {
  tours: SpiritualTourEntry[];
};
