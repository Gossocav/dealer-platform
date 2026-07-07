export const VEHICLE_LIFECYCLE_STATES = [
  "draft",
  "in_acquisition",
  "in_preparation",
  "in_photography",
  "in_review",
  "ready_to_publish",
  "published",
  "reserved",
  "in_negotiation",
  "sold",
  "delivered",
  "archived",
] as const;

export type VehicleLifecycleState = (typeof VEHICLE_LIFECYCLE_STATES)[number];

export type VehiclePermission =
  | "vehicle.state.update"
  | "vehicle.publish"
  | "vehicle.reserve"
  | "vehicle.negotiate"
  | "vehicle.sell"
  | "vehicle.deliver"
  | "vehicle.archive";

export type TransitionRule = {
  from: VehicleLifecycleState;
  to: VehicleLifecycleState;
  requiredPermissions: VehiclePermission[];
  sideEffects: string[];
  events: string[];
};

export type TransitionEvaluation = {
  allowed: boolean;
  from: VehicleLifecycleState;
  to: VehicleLifecycleState;
  requiredPermissions: VehiclePermission[];
  missingPermissions: VehiclePermission[];
  sideEffects: string[];
  events: string[];
  reasonCode: "transition_not_allowed" | "missing_permissions" | null;
};

const STATE_LABELS: Record<VehicleLifecycleState, string> = {
  draft: "Bozza",
  in_acquisition: "In acquisizione",
  in_preparation: "In preparazione",
  in_photography: "In fotografia",
  in_review: "In revisione",
  ready_to_publish: "Pronto alla pubblicazione",
  published: "Pubblicato",
  reserved: "Prenotato",
  in_negotiation: "In trattativa",
  sold: "Venduto",
  delivered: "Consegnato",
  archived: "Archiviato",
};

const STATE_ALIASES: Record<string, VehicleLifecycleState> = {
  draft: "draft",
  bozza: "draft",
  in_acquisition: "in_acquisition",
  acquisizione: "in_acquisition",
  in_preparation: "in_preparation",
  preparazione: "in_preparation",
  in_photography: "in_photography",
  fotografia: "in_photography",
  photoshoot: "in_photography",
  in_review: "in_review",
  review: "in_review",
  revisione: "in_review",
  ready_to_publish: "ready_to_publish",
  ready: "ready_to_publish",
  pronto: "ready_to_publish",
  published: "published",
  pubblicato: "published",
  active: "published",
  attivo: "published",
  reserved: "reserved",
  prenotato: "reserved",
  in_negotiation: "in_negotiation",
  negotiation: "in_negotiation",
  trattativa: "in_negotiation",
  sold: "sold",
  venduto: "sold",
  delivered: "delivered",
  consegnato: "delivered",
  archived: "archived",
  archiviato: "archived",
};

const PERMISSION_BY_STATE: Record<VehicleLifecycleState, VehiclePermission[]> = {
  draft: ["vehicle.state.update"],
  in_acquisition: ["vehicle.state.update"],
  in_preparation: ["vehicle.state.update"],
  in_photography: ["vehicle.state.update"],
  in_review: ["vehicle.state.update"],
  ready_to_publish: ["vehicle.state.update"],
  published: ["vehicle.publish"],
  reserved: ["vehicle.reserve"],
  in_negotiation: ["vehicle.negotiate"],
  sold: ["vehicle.sell"],
  delivered: ["vehicle.deliver"],
  archived: ["vehicle.archive"],
};

const SIDE_EFFECTS_BY_STATE: Record<VehicleLifecycleState, string[]> = {
  draft: ["inventory.checklist.reset"],
  in_acquisition: ["inventory.acquisition.tasklist.open"],
  in_preparation: ["inventory.preparation.tasklist.open"],
  in_photography: ["inventory.photography.tasklist.open"],
  in_review: ["inventory.review.qa.required"],
  ready_to_publish: ["inventory.publish.preflight.required"],
  published: ["inventory.marketplace.visibility.enable", "inventory.crm.lead-routing.enable"],
  reserved: ["inventory.availability.soft-lock"],
  in_negotiation: ["inventory.crm.negotiation-tracking.enable"],
  sold: ["inventory.marketplace.visibility.disable", "inventory.sales.pipeline.close"],
  delivered: ["inventory.delivery.record.finalize"],
  archived: ["inventory.readonly.snapshot"],
};

const EVENTS_BY_STATE: Record<VehicleLifecycleState, string[]> = {
  draft: ["vehicle.state.changed.draft"],
  in_acquisition: ["vehicle.state.changed.in_acquisition"],
  in_preparation: ["vehicle.state.changed.in_preparation"],
  in_photography: ["vehicle.state.changed.in_photography"],
  in_review: ["vehicle.state.changed.in_review"],
  ready_to_publish: ["vehicle.state.changed.ready_to_publish"],
  published: ["vehicle.state.changed.published", "vehicle.published"],
  reserved: ["vehicle.state.changed.reserved", "vehicle.reserved"],
  in_negotiation: ["vehicle.state.changed.in_negotiation"],
  sold: ["vehicle.state.changed.sold", "vehicle.sold"],
  delivered: ["vehicle.state.changed.delivered", "vehicle.delivered"],
  archived: ["vehicle.state.changed.archived", "vehicle.archived"],
};

const ALLOWED_TRANSITIONS: Record<VehicleLifecycleState, VehicleLifecycleState[]> = {
  draft: ["in_acquisition", "in_preparation", "ready_to_publish", "published", "archived"],
  in_acquisition: ["draft", "in_preparation", "archived"],
  in_preparation: ["draft", "in_acquisition", "in_photography", "in_review", "archived"],
  in_photography: ["in_preparation", "in_review", "archived"],
  in_review: ["in_preparation", "in_photography", "ready_to_publish", "archived"],
    ready_to_publish: ["in_review", "published", "archived"],
  published: ["draft", "reserved", "in_negotiation", "sold", "archived", "in_review"],
  reserved: ["published", "in_negotiation", "sold", "archived"],
  in_negotiation: ["published", "reserved", "sold", "archived"],
  sold: ["delivered", "archived"],
  delivered: ["archived"],
  archived: [],
};

const TRANSITION_RULES: TransitionRule[] = VEHICLE_LIFECYCLE_STATES.flatMap((from) =>
  ALLOWED_TRANSITIONS[from].map((to) => ({
    from,
    to,
    requiredPermissions: Array.from(new Set(["vehicle.state.update", ...PERMISSION_BY_STATE[to]])),
    sideEffects: SIDE_EFFECTS_BY_STATE[to],
    events: EVENTS_BY_STATE[to],
  }))
);

function normalizeStateInput(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeVehicleLifecycleState(value: unknown): VehicleLifecycleState | null {
  const normalized = normalizeStateInput(value);
  if (!normalized) {
    return null;
  }

  return STATE_ALIASES[normalized] ?? null;
}

export function resolveVehicleLifecycleState(status: unknown, published?: boolean | null): VehicleLifecycleState {
  const normalized = normalizeVehicleLifecycleState(status);
  if (normalized) {
    return normalized;
  }

  if (published) {
    return "published";
  }

  return "draft";
}

export function getVehicleStateLabel(state: VehicleLifecycleState) {
  return STATE_LABELS[state];
}

export function getAllowedTransitions(from: VehicleLifecycleState) {
  return [...ALLOWED_TRANSITIONS[from]];
}

export function getForbiddenTransitions(from: VehicleLifecycleState) {
  const allowed = new Set(ALLOWED_TRANSITIONS[from]);
  return VEHICLE_LIFECYCLE_STATES.filter((state) => state !== from && !allowed.has(state));
}

export function getTransitionRule(from: VehicleLifecycleState, to: VehicleLifecycleState) {
  return TRANSITION_RULES.find((rule) => rule.from === from && rule.to === to) ?? null;
}

export function isTransitionAllowed(from: VehicleLifecycleState, to: VehicleLifecycleState) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function evaluateVehicleStateTransition(
  from: VehicleLifecycleState,
  to: VehicleLifecycleState,
  actorPermissions: ReadonlyArray<VehiclePermission>
): TransitionEvaluation {
  const rule = getTransitionRule(from, to);

  if (!rule) {
    return {
      allowed: false,
      from,
      to,
      requiredPermissions: [],
      missingPermissions: [],
      sideEffects: [],
      events: [],
      reasonCode: "transition_not_allowed",
    };
  }

  const actorPermissionSet = new Set(actorPermissions);
  const missingPermissions = rule.requiredPermissions.filter((permission) => !actorPermissionSet.has(permission));

  if (missingPermissions.length > 0) {
    return {
      allowed: false,
      from,
      to,
      requiredPermissions: rule.requiredPermissions,
      missingPermissions,
      sideEffects: [],
      events: [],
      reasonCode: "missing_permissions",
    };
  }

  return {
    allowed: true,
    from,
    to,
    requiredPermissions: rule.requiredPermissions,
    missingPermissions: [],
    sideEffects: rule.sideEffects,
    events: rule.events,
    reasonCode: null,
  };
}

export function getAllVehicleStateTransitionRules() {
  return [...TRANSITION_RULES];
}
