export class InvalidStateTransitionError extends Error {
  readonly name = 'InvalidStateTransitionError';

  constructor(
    public readonly threadId: string,
    public readonly fromState: string,
    public readonly toState: string,
  ) {
    super(
      `Invalid pipeline state transition for thread ${threadId}: ${fromState} → ${toState}`,
    );
  }
}
