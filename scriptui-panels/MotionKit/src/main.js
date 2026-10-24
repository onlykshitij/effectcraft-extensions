// SPDX-License-Identifier: MIT OR Apache-2.0
// Entry point (last in the bundle, outside the shared model): publish $.global.MotionKit once,
// then build this file's UI. MK_PANEL is 1-4, "all" (the combined panel 5) or "menu" in the
// panels and null in motionkit-lib.jsx (no UI).

if (!MK.api) {
  MK.api = {
    version: MK.version,
    tools: MK.tools,
    toolOrder: MK.toolOrder,
    loadErrors: MK.loadErrors,
    run: MK.run,
    callTool: MK.callTool,
    registerTool: MK.registerTool,
    describe: MK.describe,
    catalog: MK.catalog,
    layout: MK.layout,
    settings: MK.settings,
    library: MK.library,
    options: MK.options,
    optionsDialog: MK.optionsDialog,
    layoutDialog: MK.layoutDialog,
    commandBox: MK.commandBox,
    ui: MK.ui,
    prompts: MK.prompts,
    helpers: {
      util: MK.util, sel: MK.sel, undo: MK.undo, controls: MK.controls, expr: MK.expr, mat: MK.mat,
      space: MK.space, keys: MK.keys, shapes: MK.shapes, icons: MK.icons, widgets: MK.widgets
    },
    // The panels' poll task calls this.
    __tick: function (key) { return MK.ui.tick(key); },
    __mk: MK
  };
}
if (!$.global.MotionKit) $.global.MotionKit = MK.api;

return MK.ui.start(thisObj, typeof MK_PANEL === "undefined" ? undefined : MK_PANEL);
