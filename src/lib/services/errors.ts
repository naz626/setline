/** A problem with what the person entered. The message is safe to show them. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
