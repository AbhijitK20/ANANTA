import type {
  AccessNeed,
  BanditState,
  DietNeed,
  DiscoveryContext,
  EvalScenario,
  TravellerProfile,
  TravelMode,
} from "@/lib/engine/contracts";
import { COMPONENT_IDS } from "@/lib/engine/contracts";
import { PRIOR_WEIGHTS } from "@/lib/engine/scoring";

/**
 * The eval suite's scenario set.
 *
 * Every prompt here is a sentence somebody could plausibly have typed. A
 * scenario phrased as "test the time gate" measures the test author, not the
 * product, so none of them are phrased that way.
 *
 * Determinism: `now` is a literal on every scenario, `deadline` is derived from
 * it by `minutesFromNow`, and nothing in this file reads a clock. Two runs on two
 * machines produce byte-identical reports.
 *
 * IST is UTC+05:30, so a 09:00 local start is `T03:30:00.000Z`. A dry-season
 * date and a monsoon date both appear, because the gate reasons about months.
 */

const IST_OFFSET_MINUTES = 330;

/**
 * A local wall-clock instant in Asia/Kolkata, written the way a person would say
 * it, returned as the UTC ISO string the contracts require. IST is UTC+05:30, so
 * 09:00 local is `T03:30:00.000Z` on the same calendar day.
 */
const at = (isoDay: string, hour: number, minute = 0): string => {
  const asUtc = Date.parse(`${isoDay}T00:00:00.000Z`);
  const istMinutes = hour * 60 + minute;
  return new Date(asUtc + (istMinutes - IST_OFFSET_MINUTES) * 60_000).toISOString();
};

/** `availableMinutes` later than `now`, so the deadline never contradicts it. */
const deadlineAfter = (now: string, availableMinutes: number): string =>
  new Date(Date.parse(now) + availableMinutes * 60_000).toISOString();

/** A cold bandit seeded from the prior, so a scenario has no hidden learning. */
const coldBandit = (now: string): BanditState => ({
  arms: COMPONENT_IDS.map((component) => ({ component, alpha: 1, beta: 1, pulls: 0 })),
  observations: 0,
  updatedAt: now,
});

/**
 * A traveller profile with the prior weights and no learned overrides. Only the
 * fields a scenario actually varies are arguments; the rest stay empty rather
 * than being written twenty-two times.
 */
const traveller = (
  now: string,
  patch: Partial<Omit<TravellerProfile, "weights" | "bandit">> = {},
): TravellerProfile => ({
  id: "traveller-eval",
  interests: {},
  avoid: {},
  accessibility: [],
  diets: [],
  excludes: [],
  pins: [],
  weights: { ...PRIOR_WEIGHTS },
  bandit: coldBandit(now),
  ...patch,
});

/** Shorthand for the 22 near-identical context tails. */
interface Common {
  now: string;
  availableMinutes: number;
  budgetInr: number;
  partySize?: number;
  idealStops?: number;
  minStops?: number;
  hasToddler?: boolean;
  hasElderly?: boolean;
  raining?: boolean;
  weatherSeverity?: DiscoveryContext["weatherSeverity"];
  travelMode?: TravelMode;
  pace?: DiscoveryContext["pace"];
  accessNeeds?: AccessNeed[];
  diets?: DietNeed[];
  query?: string;
  origin?: DiscoveryContext["origin"];
  cityId?: string;
  profile?: Partial<Omit<TravellerProfile, "weights" | "bandit">>;
}

const FORT = { coordinates: [72.8331, 18.9317] as [number, number], label: "Fort", area: "Fort" };
const BANDRA = { coordinates: [72.8322, 19.0603] as [number, number], label: "Bandra station", area: "Bandra" };
const DADAR = { coordinates: [72.8433, 19.0209] as [number, number], label: "Dadar", area: "Dadar" };
const VASHI = { coordinates: [72.9971, 19.0759] as [number, number], label: "Vashi", area: "Vashi" };
const NERUL = { coordinates: [73.0142, 19.0365] as [number, number], label: "Nerul", area: "Nerul/Seawoods" };
const GHATKOPAR = { coordinates: [72.9082, 19.086] as [number, number], label: "Ghatkopar", area: "Ghatkopar" };

const context = (c: Common): EvalScenario["context"] => {
  const partySize = c.partySize ?? 2;
  return {
    now: c.now,
    origin: c.origin ?? FORT,
    availableMinutes: c.availableMinutes,
    deadline: deadlineAfter(c.now, c.availableMinutes),
    budgetInr: c.budgetInr,
    partySize,
    hasToddler: c.hasToddler ?? false,
    hasElderly: c.hasElderly ?? false,
    raining: c.raining ?? false,
    weatherSeverity: c.weatherSeverity ?? null,
    travelMode: c.travelMode ?? "walk",
    pace: c.pace ?? "normal",
    idealStops: c.idealStops ?? 3,
    minStops: c.minStops ?? 2,
    accessNeeds: c.accessNeeds ?? [],
    diets: c.diets ?? [],
    query: c.query ?? "",
    profile: traveller(c.now, c.profile ?? {}),
    ...(c.cityId ? { cityId: c.cityId } : {}),
  };
};

const DRY_SAT = at("2026-02-14", 9);
const DRY_SUN = at("2026-02-15", 10);
const DRY_WED = at("2026-02-18", 15);
const MONSOON_SAT = at("2026-07-18", 9, 30);
const EVENING = at("2026-02-13", 17);

export const SCENARIOS: EvalScenario[] = [
  {
    id: "toddler-rain-window",
    title: "Toddler, monsoon, three hours",
    prompt: "It started raining and I have a two year old with me. We are stuck in Fort until about half past one. Somewhere dry, please.",
    context: context({
      now: MONSOON_SAT,
      availableMinutes: 180,
      budgetInr: 2500,
      partySize: 3,
      hasToddler: true,
      raining: true,
      weatherSeverity: "heavy_rain",
      accessNeeds: ["stroller_ok", "accessible_restroom", "seating_available"],
      idealStops: 2,
      minStops: 1,
      query: "indoor things to do with a small child",
      profile: { interests: { Culture: 1, Workshop: 0.6 } },
    }),
  },
  {
    id: "elderly-step-free",
    title: "Elderly relative, step-free, slow pace",
    prompt: "My mother is 78 and uses a walking frame. We have four hours and she cannot manage steps or long walks between stops.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 240,
      budgetInr: 3000,
      partySize: 3,
      hasElderly: true,
      pace: "relaxed",
      accessNeeds: ["step_free", "low_walking", "seating_available"],
      idealStops: 2,
      minStops: 1,
      travelMode: "taxi",
      query: "step free heritage near Fort",
      profile: { interests: { Culture: 1, Food: 0.5 } },
    }),
  },
  {
    id: "forty-five-minutes",
    title: "Forty-five minutes, one thing, done",
    prompt: "My train leaves at 11:20 and I am already at Charni Road. Give me one thing worth the walk, not three.",
    context: context({
      now: at("2026-02-14", 10, 35),
      availableMinutes: 45,
      budgetInr: 600,
      partySize: 1,
      idealStops: 1,
      minStops: 1,
      origin: { coordinates: [72.8223, 18.9443], label: "Charni Road", area: "Marine Drive" },
      query: "one quick thing near Charni Road",
    }),
  },
  {
    id: "tight-budget",
    title: "Eight hundred rupees, two of us",
    prompt: "We only have eight hundred between us for the whole afternoon. Free things are fine, we just do not want to be disappointed.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 210,
      budgetInr: 800,
      partySize: 2,
      idealStops: 3,
      minStops: 1,
      query: "free things to see in the Fort area",
    }),
  },
  {
    id: "sold-out-slot",
    title: "The pottery class sold out",
    prompt: "We booked the pottery class. It just says sold out. What else can we do in Powai this afternoon that is still walkable from the station?",
    context: context({
      now: DRY_WED,
      availableMinutes: 200,
      budgetInr: 2000,
      partySize: 2,
      origin: { coordinates: [72.9049, 19.1176], label: "Kanjurmarg", area: "Powai" },
      idealStops: 2,
      minStops: 1,
      query: "indoor things in Powai",
      profile: { interests: { Workshop: 1, Family: 0.5 } },
    }),
    thenTrigger: {
      trigger: "sold_out",
      mutate: { availableMinutes: 200, budgetInr: 2000 },
    },
  },
  {
    id: "lost-an-hour",
    title: "We lost an hour to a meeting",
    prompt: "We were supposed to start at ten. It is quarter past eleven now and we still have the whole afternoon, just less of it.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 300,
      budgetInr: 3500,
      partySize: 2,
      idealStops: 4,
      minStops: 2,
      query: "heritage walk plus food, south Mumbai",
    }),
    thenTrigger: { trigger: "time_lost", mutate: { availableMinutes: 240 } },
  },
  {
    id: "navi-ferry-day",
    title: "Nerul to Belapur across the creek",
    prompt: "We are in Nerul with a car we do not want to drive. Ferry over to Belapur, see something, ferry back, and be at the station by six.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 300,
      budgetInr: 1800,
      partySize: 2,
      origin: NERUL,
      travelMode: "ferry",
      idealStops: 2,
      minStops: 1,
      cityId: "navi-mumbai",
      query: "Belapur fort and the creek",
      profile: { interests: { Culture: 1, Nature: 0.7 } },
    }),
  },
  {
    id: "budget-cut-midday",
    title: "Half the money left",
    prompt: "We spent the rest on lunch. There is two thousand left and we are still out until five.",
    context: context({
      now: DRY_WED,
      availableMinutes: 200,
      budgetInr: 4000,
      partySize: 2,
      idealStops: 3,
      minStops: 2,
      origin: BANDRA,
      query: "Bandra and Bandra East, mostly free",
    }),
    thenTrigger: { trigger: "budget_dropped", mutate: { budgetInr: 2000 } },
  },
  {
    id: "jain-vegetarian-day",
    title: "Jain, no onion, no garlic",
    prompt: "My mother is Jain so no onion or garlic anywhere. We would rather eat twice than risk it. Bandra, four hours, two of us.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 240,
      budgetInr: 2600,
      partySize: 2,
      origin: BANDRA,
      diets: ["jain", "vegetarian"],
      idealStops: 3,
      minStops: 1,
      query: "vegetarian food and a quiet place in Bandra",
      profile: { interests: { Food: 1, Culture: 0.5 } },
    }),
  },
  {
    id: "restroom-urgency",
    title: "The toddler needs a bathroom now",
    prompt: "She needs the toilet right now, we are not near anything. Find somewhere with a bathroom and stay a while.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 150,
      budgetInr: 1200,
      partySize: 3,
      hasToddler: true,
      accessNeeds: ["accessible_restroom", "stroller_ok"],
      idealStops: 1,
      minStops: 1,
      origin: { coordinates: [72.8567, 19.0178], label: "Sewri junction", area: "Sewri" },
      query: "somewhere with a clean toilet and a cafe",
    }),
    thenTrigger: {
      trigger: "needs_restroom",
      mutate: { availableMinutes: 150, budgetInr: 1200 },
    },
  },
  {
    id: "tired-after-work",
    title: "Everyone is tired",
    prompt: "It is six in the evening and my daughter is done. Nothing that needs energy. Somewhere short and indoors.",
    context: context({
      now: EVENING,
      availableMinutes: 150,
      budgetInr: 1500,
      partySize: 3,
      hasToddler: true,
      pace: "relaxed",
      idealStops: 2,
      minStops: 1,
      origin: GHATKOPAR,
      query: "short indoor evening near Ghatkopar",
      profile: { interests: { Food: 1, Culture: 0.4 } },
    }),
    thenTrigger: { trigger: "tired", mutate: { availableMinutes: 150, budgetInr: 1500 } },
  },
  {
    id: "rain-breaks-midplan",
    title: "Sunshine, then rain",
    prompt: "Looks like it is clear until two and then rain. We are out from nine, so plan for both.",
    context: context({
      now: DRY_WED,
      availableMinutes: 300,
      budgetInr: 3200,
      partySize: 2,
      idealStops: 3,
      minStops: 2,
      query: "outdoor and indoor mix, south Mumbai",
    }),
    thenTrigger: {
      trigger: "rain_started",
      mutate: { raining: true, weatherSeverity: "rain", availableMinutes: 300, budgetInr: 3200 },
    },
  },
  {
    id: "seawaters-sunday",
    title: "Seawoods on a Sunday morning",
    prompt: "Sunday morning walk in Seawoods, nothing strenuous, we are staying near the station and back by lunch.",
    context: context({
      now: DRY_SUN,
      availableMinutes: 180,
      budgetInr: 700,
      partySize: 2,
      origin: NERUL,
      cityId: "navi-mumbai",
      idealStops: 2,
      minStops: 1,
      query: "creek walk and breakfast in Seawoods",
      profile: { interests: { Nature: 1, Food: 0.6 } },
    }),
  },
  {
    id: "vashi-station-stop",
    title: "Thirty minutes between trains",
    prompt: "I have half an hour before the Vashi to Thane train. Something I can see from the station, not a trek.",
    context: context({
      now: at("2026-02-18", 16, 20),
      availableMinutes: 30,
      budgetInr: 400,
      partySize: 1,
      origin: VASHI,
      cityId: "navi-mumbai",
      idealStops: 1,
      minStops: 1,
      query: "quick look near Vashi station",
    }),
  },
  {
    id: "kharghar-family-morning",
    title: "Two kids, Kharghar, no car",
    prompt: "Two kids under eight, we are at Kharghar, no car, and we need to be back on the train by one. Somewhere open and safe.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 210,
      budgetInr: 1500,
      partySize: 4,
      hasToddler: true,
      origin: { coordinates: [73.0679, 19.0469], label: "Kharghar", area: "Kharghar" },
      cityId: "navi-mumbai",
      idealStops: 2,
      minStops: 1,
      query: "open air and parks for children in Kharghar",
      profile: { interests: { Family: 1, Nature: 0.8 } },
    }),
  },
  {
    id: "monsoon-hills-refused",
    title: "Hills in the monsoon",
    prompt: "My cousin insists on the hills. It is the fourth week of the monsoon. I want to know whether that is even on the table.",
    context: context({
      now: MONSOON_SAT,
      availableMinutes: 300,
      budgetInr: 1500,
      partySize: 4,
      weatherSeverity: "heavy_rain",
      raining: true,
      origin: { coordinates: [73.0679, 19.0469], label: "Kharghar", area: "Kharghar" },
      cityId: "navi-mumbai",
      idealStops: 2,
      minStops: 1,
      query: "hills and viewpoints near Kharghar",
      profile: { interests: { Nature: 1, Adventure: 0.9 } },
    }),
  },
  {
    id: "wc-on-the-way",
    title: "A long walk with a bathroom stop",
    prompt: "We want to walk the length of the Fort precinct with a proper bathroom stop in the middle. Two hours, two people.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 120,
      budgetInr: 900,
      partySize: 2,
      accessNeeds: ["accessible_restroom", "seating_available"],
      idealStops: 3,
      minStops: 2,
      pace: "relaxed",
      query: "Fort precinct walk with a break",
    }),
  },
  {
    id: "one-of-us-wants-solo",
    title: "Two travellers, two different days",
    prompt: "My partner wants food. I want a museum. One of us is going to be disappointed, so keep it to two stops and far apart.",
    context: context({
      now: DRY_WED,
      availableMinutes: 180,
      budgetInr: 2000,
      partySize: 2,
      idealStops: 2,
      minStops: 2,
      query: "one food stop and one gallery, south Mumbai",
      profile: { interests: { Food: 1, Culture: 0.9 } },
    }),
  },
  {
    id: "early-flight",
    title: "Landed at six, out at nine",
    prompt: "Landed at six this morning, leaving the hotel at nine, back by two. Two hours, one bag each, and a lot of walking.",
    context: context({
      now: at("2026-02-14", 9, 0),
      availableMinutes: 120,
      budgetInr: 2200,
      partySize: 2,
      idealStops: 2,
      minStops: 1,
      travelMode: "metro",
      origin: { coordinates: [72.8197, 18.9647], label: "Fort landing", area: "Fort" },
      query: "close to Fort, quick and walkable",
    }),
  },
  {
    id: "weddings-sunday",
    title: "Wedding season, half the city shut",
    prompt: "Half the city is at a wedding today. We have a car and five hours and we would like to get out of Bandra.",
    context: context({
      now: DRY_SUN,
      availableMinutes: 300,
      budgetInr: 5000,
      partySize: 4,
      travelMode: "taxi",
      origin: BANDRA,
      idealStops: 3,
      minStops: 2,
      query: "out of Bandra, heritage and food, with parking",
    }),
  },
  {
    id: "monsoon-walk-repeat",
    title: "Same walk, monsoon rules",
    prompt: "We did the seafront in December. What does the same afternoon look like now that it is raining?",
    context: context({
      now: MONSOON_SAT,
      availableMinutes: 180,
      budgetInr: 1100,
      partySize: 2,
      raining: true,
      weatherSeverity: "rain",
      origin: { coordinates: [72.82229, 18.9443], label: "Marine Drive", area: "Marine Drive" },
      idealStops: 3,
      minStops: 1,
      query: "seafront and covered places near Marine Drive",
    }),
  },
  {
    id: "veg-only-five-hours",
    title: "Five hours, vegetarian only, no bar",
    prompt: "Five hours, no one drinks, nothing with meat, and we want to actually see the city rather than one mall.",
    context: context({
      now: DRY_SAT,
      availableMinutes: 300,
      budgetInr: 4000,
      partySize: 4,
      diets: ["vegetarian", "nut_free"],
      idealStops: 4,
      minStops: 2,
      origin: DADAR,
      query: "vegetarian heritage, Dadar and Matunga, all day",
      profile: { interests: { Food: 0.9, Culture: 0.8, Shopping: 0.6 } },
    }),
  },
];

/** Scenario ids, for the tests that need to name one. */
export const SCENARIO_IDS: readonly string[] = SCENARIOS.map((scenario) => scenario.id);

/** A minute-in-the-day to ISO instant helper, exported for the harness. */
export { at as scenarioInstant, deadlineAfter as scenarioDeadline, IST_OFFSET_MINUTES };
