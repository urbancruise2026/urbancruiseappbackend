/**
 * Static source for GET /config/spiritual-tours.
 *
 * Content is taken from the Spiritual Tours designs (Nov 2026): the list
 * screen's six tours under two region headings, plus the tour detail
 * screen (title, fact strip, About the Tour, and tappable section rows that
 * open a bottom sheet). Entry order inside a region is the order the app
 * shows; regions themselves are ordered by REGION_ORDER below.
 *
 * THE BACKEND DECIDES, THE APP ONLY DRAWS
 *   Which facts a tour shows (and their labels, icons and values), and
 *   which section rows it has (and their order, titles, icons and empty
 *   messages), all come from here. Changing any of it is a backend deploy,
 *   never an app release — the app revalidates the catalog whenever the
 *   screen opens. Moving this to a database later only changes the loader
 *   in service.ts.
 *
 * HOW COMPLETE A TOUR HAS TO BE
 *   Only id, region, title, icon and either places or summary are needed to
 *   publish. facts may be empty (the strip hides), overview may be null
 *   (the About block hides), and every section may be empty (its row still
 *   shows; its sheet shows the empty message). So a tour can be listed as
 *   soon as its name and stops are known, and written up afterwards.
 *
 * FACT VALUES — RESEARCHED, CONFIRM WITH OPS (18 Nov 2026)
 *   Durations are typical road-trip lengths taken from published packages
 *   for each circuit (Char Dham from Urban Cruise's own package page,
 *   urbancruise.in/delhi/char-dham-yatra-package, which says 10–12 days by
 *   road). Passengers and vehicle come from that same page, which lists the
 *   Tempo Traveller in 9 to 26 seat layouts. These are NOT Urban Cruise
 *   commitments until ops confirms them; edit FLEET and each tour's
 *   duration below.
 *   Shakti Peeth: the published circuits found cover North India
 *   (Himachal / Vaishno Devi) only, not the Madhya Pradesh leg this tour's
 *   title promises, so its duration is the weakest of the six.
 *
 * POINTS TO CONFIRM WITH DESIGN
 *   1. Spelling. The list design's titles read "Ayudhya-PrayagRaj-Varanasi"
 *      and "(Maharashtra + Gujrat)", while its own subtitles on those same
 *      cards read "Ayodhya" and "Gujarat". The standard spellings are used
 *      below. One-line revert each if the short forms were deliberate.
 *   2. Char Dham stop order: the traditional yatra order, "Yamunotri ·
 *      Gangotri · Kedarnath · Badrinath", as on the detail design.
 *   3. Itinerary, inclusions, exclusions and pricing are empty for every
 *      tour. None were in any design, and prices are real money, so none
 *      are invented here. Each row's sheet says "Details coming soon" until
 *      ops fills them in.
 *
 * TODO(ops): every imageUrl is empty. Upload the card photographs and put
 * their absolute https URLs here. Until then the app draws its own branded
 * tiles, so the screens are complete and shippable — they just have no
 * photography.
 *
 * The catalog is validated when this file loads; a bad edit stops the server
 * at startup (see assertSpiritualTourCatalog in ../schemas.ts).
 */
import { assertSpiritualTourCatalog } from '../schemas.js';
import type {
  SpiritualTourEntry,
  SpiritualTourFact,
  SpiritualTourInfoSection,
  SpiritualTourItineraryDay,
  SpiritualTourPrice,
  SpiritualTourRegion,
} from '../types.js';

/**
 * The order regions appear on screen. Regions with no tours are skipped by
 * the app, so this list may name more than the catalog currently uses.
 */
export const REGION_ORDER: readonly SpiritualTourRegion[] = [
  'north',
  'west',
  'south',
  'east',
  'central',
  'northeast',
];

/* ---------------- Fact strip ---------------- */

/**
 * The vehicle every tour is quoted with today. One place to change it for
 * all tours; a tour that needs something else can pass its own facts.
 * Source: Urban Cruise's Char Dham package page (Tempo Traveller, 9 – 26
 * seats). TODO(ops): confirm.
 */
const FLEET = {
  passengers: 'Up to 26',
  vehicle: 'Tempo Traveller',
  vehicleNote: '9 – 26 Seater',
} as const;

/** Duration · Passengers · Vehicle — the three facts the design shows. */
function standardFacts(duration: string): SpiritualTourFact[] {
  return [
    { icon: 'calendar', label: 'Duration', value: duration, note: null },
    { icon: 'users', label: 'Passengers', value: FLEET.passengers, note: null },
    { icon: 'vehicle', label: 'Vehicle', value: FLEET.vehicle, note: FLEET.vehicleNote },
  ];
}

/* ---------------- Section rows ---------------- */

/** What a tour's four standard sections contain. Every field is optional. */
type StandardSectionContent = {
  itinerary?: SpiritualTourItineraryDay[];
  inclusions?: string[];
  exclusions?: string[];
  pricing?: SpiritualTourPrice[];
  pricingNote?: string | null;
};

/**
 * Itinerary · Inclusions · Exclusions · Pricing, as in the design. Rows
 * always show; an empty one opens a sheet with the app's "Details coming
 * soon" message (emptyText null).
 */
function standardSections(content: StandardSectionContent = {}): SpiritualTourInfoSection[] {
  return [
    {
      id: 'itinerary',
      title: 'Itinerary',
      icon: 'itinerary',
      emptyText: null,
      kind: 'itinerary',
      days: content.itinerary ?? [],
    },
    {
      id: 'inclusions',
      title: 'Inclusions',
      icon: 'check',
      emptyText: null,
      kind: 'list',
      marker: 'check',
      items: content.inclusions ?? [],
    },
    {
      id: 'exclusions',
      title: 'Exclusions',
      icon: 'cross',
      emptyText: null,
      kind: 'list',
      marker: 'cross',
      items: content.exclusions ?? [],
    },
    {
      id: 'pricing',
      title: 'Pricing',
      icon: 'rupee',
      emptyText: null,
      kind: 'pricing',
      rows: content.pricing ?? [],
      note: content.pricingNote ?? null,
    },
  ];
}

/* ---------------- Catalog ---------------- */

const SPIRITUAL_TOURS: SpiritualTourEntry[] = [
  /* ---------- North ---------- */
  {
    id: 'char-dham-yatra',
    region: 'north',
    title: 'Char Dham Yatra',
    titleNote: null,
    // Traditional yatra order — see point 2 in the header note.
    places: [
      { name: 'Yamunotri', imageUrl: null },
      { name: 'Gangotri', imageUrl: null },
      { name: 'Kedarnath', imageUrl: null },
      { name: 'Badrinath', imageUrl: null },
    ],
    summary: null,
    icon: 'temple',
    imageUrl: null,

    facts: standardFacts('10 – 12 Days'),
    overview:
      'The Char Dham Yatra covers Yamunotri, Gangotri, Kedarnath and Badrinath, offering a divine journey through the majestic Himalayas, known for its spiritual significance and natural beauty.',
    sections: standardSections(),
  },
  {
    id: 'ayodhya-prayagraj-varanasi',
    region: 'north',
    // Design reads "Ayudhya-PrayagRaj-Varanasi"; see the header note.
    title: 'Ayodhya-Prayagraj-Varanasi',
    titleNote: null,
    places: [
      { name: 'Ayodhya', imageUrl: null },
      { name: 'Prayagraj', imageUrl: null },
      { name: 'Varanasi', imageUrl: null },
    ],
    summary: null,
    icon: 'temple',
    imageUrl: null,

    facts: standardFacts('4 – 5 Days'),
    overview: null,
    sections: standardSections(),
  },
  {
    id: 'shakti-peeth-tour-north-mp',
    region: 'north',
    title: 'Shakti peeth Tour',
    titleNote: '(North, MP)',
    places: [],
    summary: 'Famous Shakti Peeths across North India and Madhya Pradesh',
    icon: 'trishul',
    imageUrl: null,

    // Weakest figure of the six — see the header note.
    facts: standardFacts('6 – 8 Days'),
    overview: null,
    sections: standardSections(),
  },

  /* ---------- West ---------- */
  {
    id: 'ujjain-omkareshwar',
    region: 'west',
    title: 'Ujjain-Omkareshwar',
    titleNote: null,
    places: [
      { name: 'Mahakaleshwar (Ujjain)', imageUrl: null },
      { name: 'Omkareshwar', imageUrl: null },
    ],
    summary: null,
    icon: 'om',
    imageUrl: null,

    facts: standardFacts('2 – 3 Days'),
    overview: null,
    sections: standardSections(),
  },
  {
    id: 'ashtvinayak-yatra',
    region: 'west',
    title: 'Ashtvinayak Yatra',
    titleNote: null,
    places: [],
    summary: 'Visit the 8 revered Ganesh temples in Maharashtra',
    icon: 'ganesh',
    imageUrl: null,

    facts: standardFacts('2 – 3 Days'),
    overview: null,
    sections: standardSections(),
  },
  {
    id: 'jyotirlinga-tours',
    region: 'west',
    title: 'Jyotirlinga Tours',
    // Design reads "(Maharashtra + Gujrat)"; see the header note.
    titleNote: '(Maharashtra + Gujarat)',
    places: [],
    summary: 'Explore sacred Jyotirlingas across Maharashtra and Gujarat',
    icon: 'shivling',
    imageUrl: null,

    facts: standardFacts('7 – 8 Days'),
    overview: null,
    sections: standardSections(),
  },
];

assertSpiritualTourCatalog(SPIRITUAL_TOURS);

/** Fresh deep copies, so callers can never mutate the catalog. */
export function getStaticSpiritualTours(): SpiritualTourEntry[] {
  return structuredClone(SPIRITUAL_TOURS);
}
