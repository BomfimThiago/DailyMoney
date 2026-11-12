// A sample-answer builder: fresh defaults on every call, with the test's own fields on top.
export const builder =
  <T>(defaults: () => T) =>
  (o: Partial<T> = {}): T => ({ ...defaults(), ...o });
