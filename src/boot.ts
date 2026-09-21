/**
 * Cursor/Electron terminals inject ELECTRON_RUN_AS_NODE=1 into child
 * processes. That breaks CJS interop for jsonwebtoken (verify is not a
 * function) so every authenticated route returns 401. Strip it before
 * any other imports run.
 */
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}
