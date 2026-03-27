// Workaround for pnpm v11 beta bug: configDependencies trigger auto-loading of
// .pnpmfile.mjs (due to "type": "module"), but missing-file error handling doesn't
// catch Node's ERR_MODULE_NOT_FOUND. See pnpm/pnpm#10683.
// Can be removed once the bug is fixed upstream.
export default { hooks: {} };
