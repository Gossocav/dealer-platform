/**
 * Picks the vehicle shown in the homepage showcase ("Ogni auto, radiografata").
 *
 * The slot is a benefit of the Elite plan, so it rotates among Elite dealers.
 * Rotation is derived from the calendar day rather than stored anywhere: the
 * same day always yields the same pick, which keeps the page stable for
 * everyone who loads it and needs no scheduler, no state and no cleanup.
 *
 * Fairness is per dealer, not per vehicle. Rotating over the pooled vehicle
 * list would hand the slot to whoever uploads the most cars; rotating over
 * dealers gives a dealer with five vehicles the same number of days as one
 * with three hundred.
 */

export type ShowcaseCandidate = {
  id: string;
  dealerId: string | null;
  hasCover: boolean;
};

/**
 * Days elapsed since the epoch in Rome, so the slot changes at local midnight
 * rather than at 01:00 or 02:00 depending on daylight saving.
 */
export function romeDayIndex(now: Date = new Date()) {
  // en-CA renders as YYYY-MM-DD, which parses back unambiguously.
  const romeDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return Math.floor(Date.parse(`${romeDate}T00:00:00Z`) / 86_400_000);
}

/**
 * Returns the id of the vehicle to showcase, or null when no Elite dealer has
 * a usable vehicle and the caller should fall back to its own rule.
 *
 * Only vehicles with a cover image are eligible: the showcase is a large
 * visual block, and an entry without a photo would read as a broken page.
 */
export function pickShowcaseVehicleId(
  candidates: ShowcaseCandidate[],
  eliteDealerIds: Iterable<string>,
  dayIndex: number,
): string | null {
  const elite = new Set(eliteDealerIds);
  if (elite.size === 0) {
    return null;
  }

  const eligible = candidates.filter(
    (candidate) => candidate.hasCover && candidate.dealerId && elite.has(candidate.dealerId),
  );

  if (eligible.length === 0) {
    return null;
  }

  const byDealer = new Map<string, string[]>();
  for (const candidate of eligible) {
    const dealerId = candidate.dealerId as string;
    const list = byDealer.get(dealerId);
    if (list) {
      list.push(candidate.id);
    } else {
      byDealer.set(dealerId, [candidate.id]);
    }
  }

  // Sorting both levels keeps the pick reproducible: the same day must not
  // depend on the order the database happened to return rows in.
  const dealerIds = [...byDealer.keys()].sort();
  const turn = modulo(dayIndex, dealerIds.length);
  const dealerId = dealerIds[turn];

  const vehicleIds = (byDealer.get(dealerId) ?? []).slice().sort();
  if (vehicleIds.length === 0) {
    return null;
  }

  // Advancing the vehicle by whole cycles means a dealer shows a different car
  // each time their turn comes round, instead of the same one forever.
  const cycle = Math.floor(safeIndex(dayIndex, dealerIds.length));
  return vehicleIds[modulo(cycle, vehicleIds.length)];
}

function safeIndex(dayIndex: number, dealerCount: number) {
  return dealerCount > 0 ? dayIndex / dealerCount : 0;
}

/** JavaScript's % keeps the sign of the dividend; rotation needs a real modulo. */
function modulo(value: number, length: number) {
  if (length <= 0) {
    return 0;
  }
  return ((Math.trunc(value) % length) + length) % length;
}
