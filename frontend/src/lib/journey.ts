/** Scan journey steps shown to the user. */

export const JOURNEY_STEPS = [
  {
    id: 1,
    key: "health",
    label: "Crawling",
    title: "Looking at your website",
    description: "Reading your pages like a visitor so we know what you offer.",
  },
  {
    id: 2,
    key: "technical",
    label: "Speed",
    title: "Is your site ready for visitors?",
    description: "Trust, speed, and how you look when someone finds you on Google.",
  },
  {
    id: 3,
    key: "google",
    label: "Searching",
    title: "Where do you show up on Google?",
    description: "Running the searches your buyers use and checking if you appear.",
  },
  {
    id: 4,
    key: "competitors",
    label: "Visibility",
    title: "Who shows up instead of you",
    description: "The other brands buyers see when they look for what you sell.",
  },
  {
    id: 5,
    key: "ai",
    label: "GEO",
    title: "Do AI assistants recommend you?",
    description: "Buyers ask ChatGPT, Claude, Gemini, and Grok before they open Google.",
  },
  {
    id: 6,
    key: "ready",
    label: "Next steps",
    title: "What to do next",
    description: "A short list of changes so more of the right people find you.",
  },
] as const;

export type JourneyStepId = (typeof JOURNEY_STEPS)[number]["id"];

/**
 * Map backend pipeline stages onto the friendly journey.
 * 1 crawl → crawling
 * 2 audit → speed
 * 3 brand → still speed until Google intents start
 * 4–5 intents+SERP → searching
 * 6–8 competitors → visibility
 * 9–10 GEO → geo
 * 11+ / finished → next steps
 */
export function journeyStepFromStage(stage: number, finished: boolean): JourneyStepId {
  if (finished || stage >= 11) return 6;
  if (stage >= 9) return 5;
  if (stage >= 6) return 4;
  if (stage >= 4) return 3;
  if (stage >= 2) return 2;
  if (stage >= 1) return 1;
  return 1;
}

export function journeyProgressPercent(
  step: JourneyStepId,
  finished: boolean,
  running: boolean,
): number {
  if (finished) return 100;
  const base = ((step - 1) / JOURNEY_STEPS.length) * 100;
  const within = running ? 100 / JOURNEY_STEPS.length / 2 : 0;
  return Math.min(99, Math.round(base + within));
}

export function estimateSecondsRemaining(step: JourneyStepId, finished: boolean): number {
  if (finished) return 0;
  const weights = [20, 8, 24, 28, 20, 16];
  return weights.slice(step - 1).reduce((a, b) => a + b, 0);
}

export type SerpCheckSample = {
  query: string;
  brandPosition: number;
  foundInTop50: boolean;
  results: {
    position: number;
    domain: string;
    title: string;
    url?: string;
    snippet?: string;
    own: boolean;
  }[];
  queriesChecked: number;
  top10: number;
  top50: number;
  notFound: number;
};

export type GeoPromptSample = {
  prompt: string;
  index: number;
  total: number;
  models: string[];
};

export type GeoModelReply = {
  model: string;
  prompt: string;
  response: string;
  failed?: boolean;
  at: string;
};

export type CompetitorSample = {
  domain: string;
  brandName?: string;
  classification?: string;
  appearances?: number;
  bestPosition?: number;
};
