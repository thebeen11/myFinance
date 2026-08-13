// Vercel turns every file under `api/` into a function, compiling it with
// esbuild — which does not support `emitDecoratorMetadata` and would therefore
// strip the type metadata Nest's DI depends on. So this shim stays trivial and
// defers to `dist/`, which `nest build` compiled with tsc.
module.exports = require('../dist/vercel.js').default;
