/**
 * config schemas.
 * AppConfigQuery: GET /config/app query. platform and appVersion are
 * required (400 if missing) so client integration bugs surface instead of
 * getting a generic config.
 * BrochureCatalogSchema: the static brochure catalog, checked at startup.
 */
import { z } from 'zod';
import { valid as semverValid } from 'semver';

export const AppConfigQuery = z.object({
  platform: z.enum(['ios', 'android']),
  appVersion: z
    .string()
    .min(1)
    .refine(v => semverValid(v) !== null, {
      message: 'appVersion must be a valid semver string (e.g. 1.2.3)',
    }),
  buildNumber: z.coerce.number().int().nonnegative().optional(),
  // BCP-47 shape only, no fixed list.
  locale: z
    .string()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, {
      message: 'locale must be a BCP-47 tag like "en" or "en-IN"',
    })
    .optional(),
});

export type AppConfigQuery = z.infer<typeof AppConfigQuery>;

/* ---------- Vehicle brochure catalog (static data, checked at startup) ---------- */

/**
 * YouTube video and playlist ids are used only inside URLs the app builds.
 * YouTube does not publish a fixed format, so this checks a URL-safe
 * character set and a sane length instead of an exact shape.
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Lowercase words joined by single hyphens, e.g. "force-traveller-13". */
const GROUP_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Not empty and no leading or trailing whitespace. */
const NOT_PADDED_RE = /^\S(?:[\s\S]*\S)?$/;

const displayText = (max: number) =>
  z.string().max(max).regex(NOT_PADDED_RE, 'must not be empty or start/end with spaces');

const SpecValue = displayText(80).nullable();

export const BrochureEntrySchema = z.strictObject({
  groupKey: z.string().max(64).regex(GROUP_KEY_RE, 'must look like "force-traveller-13"'),
  vehicleType: displayText(60),
  seater: z.number().int().min(1).max(100),
  tier: z.enum(['economy', 'premium', 'royal', 'royal_vip']),
  title: displayText(120),
  youtubePlaylistId: z.string().regex(YOUTUBE_ID_RE, 'invalid YouTube playlist id').nullable(),
  videoIds: z.array(z.string().regex(YOUTUBE_ID_RE, 'invalid YouTube video id')).max(20),
  features: z.array(displayText(60)).max(30),
  specs: z.strictObject({
    modelYear: SpecValue,
    airConditioning: SpecValue,
    seatType: SpecValue,
    chargingPoint: SpecValue,
    musicSystem: SpecValue,
    sofaBed: SpecValue,
    tv: SpecValue,
    panoramicWindow: SpecValue,
  }),
});

/**
 * The whole catalog. Besides each entry's own shape it checks the rules the
 * app relies on to find the right brochure:
 *   - one entry per (groupKey, tier);
 *   - every entry of a group has the same vehicleType, seater and playlist;
 *   - one groupKey per (vehicleType, seater), so a vehicle maps to one group;
 *   - no repeated video id inside an entry.
 */
export const BrochureCatalogSchema = z
  .array(BrochureEntrySchema)
  .min(1)
  .superRefine((entries, ctx) => {
    const seenTier = new Map<string, number>();
    const groupHead = new Map<string, number>();
    const groupForVehicle = new Map<string, string>();

    entries.forEach((e, i) => {
      const tierKey = `${e.groupKey}|${e.tier}`;
      const firstTier = seenTier.get(tierKey);
      if (firstTier !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'tier'],
          message: `duplicate tier "${e.tier}" in group "${e.groupKey}" (first at index ${firstTier})`,
        });
      } else {
        seenTier.set(tierKey, i);
      }

      const headIndex = groupHead.get(e.groupKey);
      if (headIndex === undefined) {
        groupHead.set(e.groupKey, i);
      } else {
        const head = entries[headIndex]!;
        for (const field of ['vehicleType', 'seater', 'youtubePlaylistId'] as const) {
          if (e[field] !== head[field]) {
            ctx.addIssue({
              code: 'custom',
              path: [i, field],
              message: `group "${e.groupKey}" has ${field} ${JSON.stringify(head[field])} at index ${headIndex} but ${JSON.stringify(e[field])} here`,
            });
          }
        }
      }

      const vehicleKey = `${e.vehicleType}|${e.seater}`;
      const otherGroup = groupForVehicle.get(vehicleKey);
      if (otherGroup === undefined) {
        groupForVehicle.set(vehicleKey, e.groupKey);
      } else if (otherGroup !== e.groupKey) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'groupKey'],
          message: `"${e.vehicleType}" ${e.seater} seater already uses group "${otherGroup}"`,
        });
      }

      const seenVideo = new Set<string>();
      e.videoIds.forEach((id, j) => {
        if (seenVideo.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'videoIds', j],
            message: `video id "${id}" is listed twice`,
          });
        }
        seenVideo.add(id);
      });
    });
  });

/**
 * Throws with every problem listed if the catalog is invalid. Called when
 * data/brochures.ts is loaded, so a bad edit stops the server at startup.
 */
export function assertBrochureCatalog(entries: unknown): void {
  const result = BrochureCatalogSchema.safeParse(entries);
  if (result.success) return;
  const issues = result.error.issues
    .map(i => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`[config/brochures] invalid brochure catalog:\n${issues}`);
}

/* ---------- Spiritual tours catalog (static data, checked at startup) ---------- */

/** Lowercase words joined by single hyphens, e.g. "char-dham-yatra". */
const TOUR_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Absolute https URL. http is rejected outright: iOS App Transport Security
 * and Android's cleartext policy both block it, so an http image would fail
 * on device rather than merely look wrong.
 */
const HTTPS_URL_RE = /^https:\/\/[^\s<>"]+$/;

const httpsUrl = z.string().max(500).regex(HTTPS_URL_RE, 'must be an absolute https URL');

const SpiritualTourPlaceSchema = z.strictObject({
  name: displayText(60),
  imageUrl: httpsUrl.nullable(),
});

const SpiritualTourFactSchema = z.strictObject({
  icon: z.enum(['calendar', 'users', 'vehicle', 'clock', 'map-pin', 'sun', 'mountain', 'info']),
  label: displayText(24),
  value: displayText(40),
  note: displayText(40).nullable(),
});

const SpiritualTourItineraryDaySchema = z.strictObject({
  dayLabel: displayText(24),
  title: displayText(120),
  detail: displayText(600).nullable(),
});

const SpiritualTourPriceSchema = z.strictObject({
  label: displayText(80),
  amount: displayText(40),
  note: displayText(160).nullable(),
});

/** Section key: lowercase words joined by hyphens, e.g. "itinerary". */
const SECTION_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const sectionBase = {
  id: z.string().max(40).regex(SECTION_ID_RE, 'must look like "itinerary"'),
  title: displayText(40),
  icon: z.enum(['itinerary', 'check', 'cross', 'rupee', 'info', 'list']),
  emptyText: displayText(200).nullable(),
};

const SpiritualTourInfoSectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...sectionBase,
    kind: z.literal('itinerary'),
    days: z.array(SpiritualTourItineraryDaySchema).max(40),
  }),
  z.strictObject({
    ...sectionBase,
    kind: z.literal('list'),
    marker: z.enum(['check', 'cross', 'dot']),
    items: z.array(displayText(160)).max(40),
  }),
  z.strictObject({
    ...sectionBase,
    kind: z.literal('pricing'),
    rows: z.array(SpiritualTourPriceSchema).max(12),
    note: displayText(400).nullable(),
  }),
  z.strictObject({
    ...sectionBase,
    kind: z.literal('text'),
    body: displayText(2000).nullable(),
  }),
]);

export const SpiritualTourEntrySchema = z.strictObject({
  id: z.string().max(64).regex(TOUR_ID_RE, 'must look like "char-dham-yatra"'),
  region: z.enum(['north', 'south', 'east', 'west', 'central', 'northeast']),
  title: displayText(80),
  titleNote: displayText(60).nullable(),
  places: z.array(SpiritualTourPlaceSchema).max(12),
  summary: displayText(240).nullable(),
  icon: z.enum(['temple', 'trishul', 'om', 'ganesh', 'shivling']),
  imageUrl: httpsUrl.nullable(),

  // Detail screen. All optional in practice — empty arrays and nulls are a
  // tour that is listed but not yet written up.
  // The strip has room for at most four facts side by side.
  facts: z.array(SpiritualTourFactSchema).max(4),
  overview: displayText(1200).nullable(),
  sections: z.array(SpiritualTourInfoSectionSchema).max(10),
});

/**
 * The whole catalog. Besides each entry's own shape it checks the rules the
 * app relies on:
 *   - ids are unique, because the detail screen is addressed by id;
 *   - every entry has something to show under its title — `places` or
 *     `summary` — so no card can render with a blank second line;
 *   - no repeated place name, section id or itinerary day label inside one
 *     tour, each of which would be a copy-paste slip rather than intent.
 */
export const SpiritualTourCatalogSchema = z
  .array(SpiritualTourEntrySchema)
  .min(1)
  .superRefine((entries, ctx) => {
    const seenId = new Map<string, number>();

    entries.forEach((e, i) => {
      const firstId = seenId.get(e.id);
      if (firstId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'id'],
          message: `duplicate tour id "${e.id}" (first at index ${firstId})`,
        });
      } else {
        seenId.set(e.id, i);
      }

      if (e.places.length === 0 && e.summary === null) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'summary'],
          message: 'a tour needs either places or a summary — the card has a second line to fill',
        });
      }

      const seenPlace = new Set<string>();
      e.places.forEach((place, j) => {
        if (seenPlace.has(place.name)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'places', j, 'name'],
            message: `place "${place.name}" is listed twice`,
          });
        }
        seenPlace.add(place.name);
      });

      const seenSection = new Set<string>();
      e.sections.forEach((section, j) => {
        if (seenSection.has(section.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'sections', j, 'id'],
            message: `section id "${section.id}" is used twice`,
          });
        }
        seenSection.add(section.id);

        if (section.kind !== 'itinerary') return;
        const seenDay = new Set<string>();
        section.days.forEach((day, k) => {
          if (seenDay.has(day.dayLabel)) {
            ctx.addIssue({
              code: 'custom',
              path: [i, 'sections', j, 'days', k, 'dayLabel'],
              message: `day label "${day.dayLabel}" is used twice`,
            });
          }
          seenDay.add(day.dayLabel);
        });
      });
    });
  });

/**
 * Throws with every problem listed if the catalog is invalid. Called when
 * data/spiritual-tours.ts is loaded, so a bad edit stops the server at
 * startup instead of shipping an empty section to customers.
 */
export function assertSpiritualTourCatalog(entries: unknown): void {
  const result = SpiritualTourCatalogSchema.safeParse(entries);
  if (result.success) return;
  const issues = result.error.issues
    .map(i => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`[config/spiritual-tours] invalid spiritual tour catalog:\n${issues}`);
}
