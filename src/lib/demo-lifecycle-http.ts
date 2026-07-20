export function toHttpStatusFromOutcome(outcome: string) {
  if (
    outcome === "DEMO_LIFECYCLE_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_MISMATCH" ||
    outcome === "DEMO_ACTIVATION_SEQUENCE_INVALID" ||
    outcome === "DEMO_ACTIVATION_INVALID_STATE" ||
    outcome === "DEMO_TRANSITION_NOT_ALLOWED" ||
    outcome === "DEMO_TERMINAL_STATE"
  ) {
    return 409;
  }

  if (
    outcome === "DEMO_NOT_FOUND" ||
    outcome === "DEMO_DEALER_NOT_FOUND" ||
    outcome === "DEMO_REQUEST_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    outcome === "DEMO_INVALID_INPUT" ||
    outcome === "DEMO_INVALID_ACTION" ||
    outcome === "DEMO_INVALID_REASON" ||
    outcome === "DEMO_INVALID_PLAN" ||
    outcome === "DEMO_PROFILE_INVALID"
  ) {
    return 400;
  }

  return 422;
}
