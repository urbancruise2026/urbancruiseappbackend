/**
 * Static source for GET /config/spiritual-tours.
 *
 * Content is taken from the Spiritual Tours designs (Nov 2026): the list
 * screen's six tours under two region headings, plus the Char Dham detail
 * screen. Entry order inside a region is the order the app shows; regions
 * themselves are ordered by REGION_ORDER below.
 *
 * To add or change a tour: edit this file and deploy the backend. No app
 * release is needed — the app revalidates the catalog whenever the screen
 * opens. Moving this to a database later only changes the loader in
 * service.ts.
 *
 * HOW COMPLETE A TOUR HAS TO BE
 *   Only id, region, title, icon and either places or summary are needed to
 *   publish. Everything the detail screen reads — tagline, heroImages,
 *   facts, overview, highlights, itinerary, inclusions, exclusions, pricing
 *   — may be empty or null, and the screen shows an empty state for that
 *   tab instead. So a tour can be listed as soon as its name and stops are
 *   known, and written up afterwards.
 *
 *   Today only 'char-dham-yatra' is written up, because it is the only tour
 *   with a detail design. The other five list correctly and open to a
 *   detail screen whose tabs are empty.
 *
 * THREE POINTS TO CONFIRM WITH DESIGN
 *   1. Spelling. The list design's titles read "Ayudhya-PrayagRaj-Varanasi"
 *      and "(Maharashtra + Gujrat)", while its own subtitles on those same
 *      cards read "Ayodhya" and "Gujarat". The standard spellings are used
 *      below. One-line revert each if the short forms were deliberate.
 *   2. Char Dham stop order. The LIST design shows "Badrinath · Kedarnath ·
 *      Gangotri · Yamunotri"; the DETAIL design shows the tiles in the
 *      opposite order, "Yamunotri · Gangotri · Kedarnath · Badrinath",
 *      which is the order the yatra is traditionally walked. One array now
 *      feeds both screens, so it had to be one order: the traditional one
 *      is used. The list card will therefore read Yamunotri first.
 *   3. Pricing. Every tour's `pricing` is empty. Indicative prices are real
 *      money and were not in any design, so none are invented here. The
 *      Pricing tab shows an empty state until ops fills these in.
 *
 * TODO(ops): every imageUrl and heroImages array is empty. Upload the card
 * photographs, the carousel images and the per-stop tiles, and put their
 * absolute https URLs here. Until then the app draws its own branded tiles,
 * so the screens are complete and shippable — they just have no photography.
 *
 * The catalog is validated when this file loads; a bad edit stops the server
 * at startup (see assertSpiritualTourCatalog in ../schemas.ts).
 */
import { assertSpiritualTourCatalog } from '../schemas.js';
import type { SpiritualTourEntry, SpiritualTourFacts, SpiritualTourRegion } from '../types.js';

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

/** A tour that has no fact strip written yet. */
const NO_FACTS: SpiritualTourFacts = {
  duration: null,
  travelMode: null,
  bestSeason: null,
  difficulty: null,
};

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

    tagline: 'A sacred pilgrimage to the four revered shrines in the Himalayas.',
    heroImages: [],
    facts: {
      duration: '10 – 12 Days',
      travelMode: 'Car / Tempo / Bus',
      bestSeason: 'May – Oct',
      difficulty: 'Moderate',
    },
    overview:
      'The Char Dham Yatra covers Yamunotri, Gangotri, Kedarnath and Badrinath, offering a divine journey through the majestic Himalayas, known for its spiritual significance and natural beauty.',
    highlights: [
      'Visit all four sacred Dhams',
      'Scenic Himalayan routes and river valleys',
      'Assistance for permits and arrangements',
      'Safe and comfortable travel with experienced team',
    ],
    // TODO(ops): no itinerary, inclusions, exclusions or prices were in the
    // design. Fill these in and the matching tabs light up on their own.
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
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

    tagline: null,
    heroImages: [],
    facts: NO_FACTS,
    overview: null,
    highlights: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
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

    tagline: null,
    heroImages: [],
    facts: NO_FACTS,
    overview: null,
    highlights: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
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

    tagline: null,
    heroImages: [],
    facts: NO_FACTS,
    overview: null,
    highlights: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
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

    tagline: null,
    heroImages: [],
    facts: NO_FACTS,
    overview: null,
    highlights: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
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

    tagline: null,
    heroImages: [],
    facts: NO_FACTS,
    overview: null,
    highlights: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    pricing: [],
    pricingNote: null,
  },
];

assertSpiritualTourCatalog(SPIRITUAL_TOURS);

/** Fresh copies, so callers can never mutate the catalog. */
export function getStaticSpiritualTours(): SpiritualTourEntry[] {
  return SPIRITUAL_TOURS.map(e => ({
    ...e,
    places: e.places.map(p => ({ ...p })),
    heroImages: [...e.heroImages],
    facts: { ...e.facts },
    highlights: [...e.highlights],
    itinerary: e.itinerary.map(d => ({ ...d })),
    inclusions: [...e.inclusions],
    exclusions: [...e.exclusions],
    pricing: e.pricing.map(r => ({ ...r })),
  }));
}
