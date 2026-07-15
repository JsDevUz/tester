interface PersistenceSlot {
  timer: number | null;
  inFlight: boolean;
  pending: (() => Promise<unknown>) | null;
}

const slots = new Map<string, PersistenceSlot>();

async function drain(key: string, slot: PersistenceSlot) {
  if (slot.inFlight || !slot.pending) return;

  const operation = slot.pending;
  slot.pending = null;
  slot.inFlight = true;
  try {
    await operation();
  } catch (error) {
    console.error(`Autosave failed for ${key}:`, error);
  } finally {
    slot.inFlight = false;
    if (slot.pending) {
      slot.timer = window.setTimeout(() => void drain(key, slot), 0);
    } else {
      slots.delete(key);
    }
  }
}

/**
 * Debounces writes per field and serializes slow requests. While a request is
 * running, intermediate values are coalesced so the latest value is always
 * the final value persisted on the server.
 */
export function persistLatest(
  key: string,
  operation: () => Promise<unknown>,
  delay = 450,
) {
  let slot = slots.get(key);
  if (!slot) {
    slot = { timer: null, inFlight: false, pending: null };
    slots.set(key, slot);
  }

  slot.pending = operation;
  if (slot.timer !== null) window.clearTimeout(slot.timer);
  slot.timer = window.setTimeout(() => {
    slot!.timer = null;
    void drain(key, slot!);
  }, delay);
}

export function hasPendingPersistence(prefix: string) {
  for (const key of slots.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}
