/**
 * Decides whether a discount code can still be used. Pure so the rule is
 * testable; the callers supply the two sources of truth — codes this app has
 * already requested, and codes Momence itself holds.
 */

export type LocalCodeMatch = { code: string; status: string };

export type AvailabilityResult = {
  code: string;
  available: boolean;
  /** What claimed the code, when it is unavailable. */
  takenBy: "request" | "momence" | null;
  /** False when Momence could not be reached, so the answer is partial. */
  momenceChecked: boolean;
  message: string;
};

export function normaliseCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

export function resolveAvailability(input: {
  code: string;
  localMatches: LocalCodeMatch[];
  /** null when Momence could not be reached. */
  momenceCodes: Set<string> | null;
}): AvailabilityResult {
  const code = normaliseCode(input.code);
  const momenceChecked = input.momenceCodes !== null;

  if (!code) {
    return {
      code,
      available: false,
      takenBy: null,
      momenceChecked,
      message: "Enter a discount code.",
    };
  }

  // Momence is the system of record, so it wins the attribution when both hold
  // the code.
  if (input.momenceCodes?.has(code)) {
    return {
      code,
      available: false,
      takenBy: "momence",
      momenceChecked,
      message: `${code} already exists in Momence. Choose a different code.`,
    };
  }

  // A rejected request never created a code, so its code is free again.
  const blocking = input.localMatches.filter(
    (match) => normaliseCode(match.code) === code && match.status !== "rejected",
  );

  if (blocking.length) {
    return {
      code,
      available: false,
      takenBy: "request",
      momenceChecked,
      message: `${code} was already requested (${blocking[0].status}). Choose a different code.`,
    };
  }

  return {
    code,
    available: true,
    takenBy: null,
    momenceChecked,
    message: momenceChecked
      ? `${code} is available.`
      : `${code} is free in this app, but Momence could not be checked — it may already exist there.`,
  };
}
