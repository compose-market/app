export interface ReconciliationController {
  reconcile(): Promise<void>;
}

export function createReconciliationController(
  fetchAuthoritative: () => Promise<unknown>,
): ReconciliationController {
  let running: Promise<void> | null = null;
  let dirty = false;

  const start = async (): Promise<void> => {
    dirty = false;
    await fetchAuthoritative();

    if (dirty) {
      dirty = false;
      await fetchAuthoritative();
    }
  };

  return {
    reconcile(): Promise<void> {
      if (running) {
        dirty = true;
        return running;
      }

      running = start().finally(() => {
        const rerun = dirty;
        running = null;
        if (rerun) void this.reconcile();
      });
      return running;
    },
  };
}
