# Adding a tool to Motion Kit

A tool is one file, `src/tools/<category>/<id>.js`, that calls `MK.registerTool({...})`. `build.py` puts every file into the panel bundles, so there is nothing to wire up. The ids in the default layout (`bounce`, `easeKeys`, `limb`, `cropComp`...) already have buttons. Until a tool with that id is registered the button is the grey "?" one, and registering it makes the button work.

`src/tools/animate/bounce.js` and `src/tools/rig/parentNull.js` are complete examples, with `tests/test_bounce.jsx` and `tests/test_parentNull.jsx`.

## Rules

- ES3-style JavaScript: `var` and function expressions only. `build.py` refuses `let`, `const`, `=>`, template literals and `class`.
- Wrap the file in `(function () { ... })();`. All sources share one function scope in the bundle.
- Validate the selection before changing anything. Report a bad selection with `ctx.fail("select ...")`, which shows an alert and changes nothing.
- Never throw past `run`. The runner catches everything, but a half-done edit stays in the project, so check first and edit second.
- Check every EffectCraft API you call against `crates/script/src/prelude.js` (scripting), `crates/script/src/scriptui.js` (ScriptUI) and `crates/expr/src/prelude.js` (expressions) in the EffectCraft source.
- Write expressions, maths and icons yourself. Don't name commercial products in code, docs or tests.

## The contract

```js
// SPDX-License-Identifier: MIT OR Apache-2.0
// My Tool: what it does, and the maths behind it.
(function () {
  var NAME = "My Tool", C = MK.controls;
  MK.registerTool({
    id: "myTool",              // lowerCamelCase, unique
    name: NAME,                // button label and undo name ("Motion Kit: My Tool")
    category: "Rig",           // Animate, Rig, Shapes or Comp (sets the accent colour)
    description: "One line: what a click does.",
    icon: ["M3 20 L21 4", { d: "O12 12 3", fill: "accent" }],
    options: [
      { key: "size", label: "Size", type: "number", "default": 40, min: 1, max: 500, unit: "px" }
    ],
    run: function (ctx, opts) {
      if (!ctx.layers.length) ctx.fail("select one or more layers.");
      // ... edit the project ...
      ctx.created.push(newLayer);
      return ctx.done("Did it to " + ctx.layers.length + " layers.");
    }
  });
})();
```

`run(ctx, opts)` returns `{ok, message, created}`. `ctx.done(message)` builds the success value; returning nothing counts as success with no message.

The runner, `MotionKit.run(id, options)`:

1. merges the saved options with `options` (the passed ones win and aren't saved) and validates them leniently: numbers are clamped, and missing or bad values take the default;
2. checks for an active comp unless the tool sets `needsComp: false`;
3. runs `run` inside `app.beginUndoGroup("Motion Kit: <name>")` / `endUndoGroup` in a `finally`;
4. turns anything thrown into `{ok: false, message}` and shows failures with `alert`.

`ctx` holds:

| Field | |
|---|---|
| `comp` | the active `CompItem` (null only when `needsComp: false`) |
| `layers` | `comp.selectedLayers` |
| `props` | the selected `Property` objects (no groups), in selection order |
| `groups` | the selected property groups (shape groups, effects, masks) |
| `time`, `frame` | `comp.time` and `comp.frameDuration` |
| `created` | push the layers or items you make; they are returned in `created` |
| `fail(msg)` | stop with a user message. The runner prefixes "<Tool>: ", so start with a lower-case verb |
| `warn(msg)` | a note appended to the result message |
| `confirm(msg)` | ask yes/no (tests answer through `MotionKit.prompts`) |
| `done(msg)` | the success result |

Optional fields of the definition:

- `needsComp: false` lets the tool run without an active comp (Project panel tools).
- `dot: function () { return bool; }` shows an accent dot on the button while true, for example while a clipboard holds something.
- `openOptions: function () {...}` replaces the generated options dialog, for a dialog of your own such as a curve editor. Return a run result or null.

## Options

`options` is a list of fields. The options dialog (Shift-click or right-click on the button) is built from it, with OK (save and run), Save, Cancel and Defaults. Every field has `key`, `label`, `type`, `default` and an optional `help` tooltip.

| type | value | more keys |
|---|---|---|
| `number` | a number | `min`, `max`, `integer`, `unit` |
| `checkbox` | `true` / `false` | |
| `dropdown` | one of the item values | `items: [["cycle", "Cycle"], ...]` or plain strings |
| `color` | `"#RRGGBB"` | |
| `text` | a string | `multiline`, `maxLength` |
| `custom` | anything JSON | `build(group, value, api)` returns `{get(), set(v)}`; `validate(v)` returns the clean value or throws |

`MK.options.get(id)` and `MK.options.save(id, values)` read and write the stored options. A `custom` field is how a tool adds its own controls inside the generated dialog (a 3 x 3 anchor grid, a list of chips, a "Clear clipboard" button). `api.widgets` holds `MK.widgets`.

## Icons

Icons are drawn on a 24 x 24 grid in two colours: `fg` for the base strokes and `accent` for one highlighted part. An icon is an array of layers. A layer is a path string (stroked in `fg` at 1.6 units) or `{d, stroke, fill, w, alpha}`, where `stroke` and `fill` are `"fg"`, `"accent"` or a hex colour and `w` is the pen width in grid units.

| Command | |
|---|---|
| `M x y`, `L x y`, `H x`, `V y`, `Z` | move, line, horizontal, vertical, close |
| `Q x1 y1 x y`, `C x1 y1 x2 y2 x y` | quadratic and cubic Béziers (flattened to 10 segments) |
| `A cx cy r a0 a1` | arc in degrees, 0 = +x, clockwise on screen; joins the current point |
| `O cx cy r`, `E cx cy rx ry` | circle, ellipse |
| `R x y w h`, `U x y w h r` | rectangle, rounded rectangle |
| `P cx cy r n rot`, `S cx cy r1 r2 n rot` | regular polygon, star |

An icon may also be `function (g, x, y, size, fg, accent)` drawing with ScriptUIGraphics itself (`fg` and `accent` are `[r, g, b, a]`). `MK.icons.geom` has the flattening helpers (`quad`, `cubic`, `arc`, `roundRect`, `star`, `polygon`) for that. Keep icons simple enough to read at 20 px. `test_ui.jsx` draws every registered icon and checks it stays inside its square.

## Helpers

All of these are on `MK` inside the bundle and on `MotionKit.helpers` outside it.

### Selection: `MK.sel`

- `comp()` is the active comp or null. `props(comp)` and `groups(comp)` split the selected properties.
- `layerOf(prop)` is the layer a property belongs to. `label(prop)` gives `"Position" on Box` for messages.
- `isNumeric(prop)` is true for numbers, 2D/3D values, spatial values and colours. `isAnimatable(prop)` is true when it can have keys.
- `keyed(props, min)` keeps the properties with at least `min` keys. `selectedKeys(prop)` gives 1-based indices.
- `byIndex(layers)` sorts layers top first.

### Expression controls: `MK.controls`

- `name("Bounce", "Amplitude")` gives `"Bounce – Amplitude"` (with an en dash), the house naming.
- `ensure(layer, matchName, name, value)` returns the control with that name, creating it with `value` only when the layer has none. One control set then drives every property a tool touched on that layer. The shortcuts are `slider`, `checkbox`, `color` (hex or `[r, g, b]`), `point`, `point3d`, `angle`, `layer` (a Layer) and `dropdown` (a 1-based index; EffectCraft's scripting can't name the menu items).
- `find(layer, name, matchName?)`, `set(effect, value)` and `prop(effect)` (the value property).
- `ref(name, matchName?)` is the expression text that reads a control, such as `effect("Bounce – Amplitude")("Slider")`. Add `.value` when you do maths with it.

Create the controls before setting the expression that reads them.

### Expressions: `MK.expr`

Every expression a tool writes starts with the line `// Motion Kit: <id>`. Use `mk`-prefixed variable names inside expressions so they don't shadow expression globals.

- `decide(ctx, props)` returns `{apply, skip}`. Properties with an expression Motion Kit didn't write are only replaced if the user agrees (one question for all of them).
- `set(prop, id, body)` writes `// Motion Kit: id` and the body. `make(id, body)` returns that text.
- `applyAll(ctx, props, id, body)` runs `decide` and `set` together. `body` can be `function (prop)`.
- `isOurs(prop, id?)` and `hasForeign(prop)` read the mark. `str(s)` quotes a string for expression code.
- `report(name, applied, invalid, kept, needs)` gives the standard result message.

### Layer and comp space: `MK.space`

These conversions run EffectCraft's own `toComp` / `fromComp` / `toWorld` / `fromWorld` on a temporary 3D Point Control, so parents, 3D, cameras and expressions on transforms all count, at any comp time `t` (the default is the current time). Points are `[x, y, z]` in and out. The probe is removed again inside the same undo step. Cameras and lights, which take no effects, use a temporary null.

- `toComp`, `fromComp`, `toWorld`, `fromWorld(layer, p, t?)`.
- `toCompPoints(layer, points, t?)` converts many points with one affine matrix when `is2D(layer)` (the layer and all its parents are 2D), else point by point.
- `matrix(layer, t?)` is the 2D affine layer-to-comp matrix `[a, b, c, d, e, f]`.
- `rectCorners(layer, t?, extents?)` gives the four `sourceRectAtTime` corners in layer space (top-left, top-right, bottom-right, bottom-left). `rectCornersInComp` gives the same corners in comp space.
- `anchorInComp(layer, t?)` is where the layer is. `compToParent(layer, p, t?)` turns a comp point into the space the layer's Position is in, so setting Position to it puts the anchor there.
- `bounds(points)` gives `{left, top, right, bottom, width, height, center}`.
- `probe(layer, function (evaluate) {...})` runs your own expressions on the layer: `evaluate(code, t)` returns up to three numbers, and `L` is the layer inside `code`.

### Keyframes: `MK.keys`

- `read(prop, i)` gives a plain object: `time` (comp time), `value`, `inInterp`, `outInterp`, `inEase` / `outEase` (`[{speed, influence}]` per dimension), `continuous`, `autoBezier`, `roving`, `selected`, plus `inTangent`, `outTangent`, `spatialContinuous` and `spatialAutoBezier` for spatial properties.
- `readAll(prop)` and `readSelected(prop)`.
- `write(prop, key, time?, parts?)` writes such an object at `time` (the default is its own) and returns the new index. `parts` such as `{value: false, interp: false}` limits what is written; the parts are `value`, `ease`, `interp`, `spatial` and `roving`.
- `setEase(prop, i, inEase, outEase)` fits eases to the property's dimensions, reusing the first entry when the counts differ. `fit(list, dims)` returns the `KeyframeEase` list.
- `remove(prop, indices)` removes keys by index, in any order.

### Shapes: `MK.shapes`

- `contents(layer)` is the Contents group, or null for other layers. `isGroup(p)`, `inner(group)` (its contents) and `groupTransform(group)`.
- `walk(root, fn)` visits every item under a shape layer, its contents or a group, depth first, as `fn(item, groups)` with the enclosing groups outermost first. Return `false` to skip a group's insides.
- `find(root, matchName)` gives `[{item, groups}]`. `paths(layer)` gives `[{prop, groups}]` for every path (`ADBE Vector Shape`). `groupsOf(prop)` walks up from a property.
- `groupMatrix(group, t)` is one group's transform. `toLayerMatrix(groups, t)` takes item space to layer space through the groups. Both match EffectCraft's renderer, skew included (`test_helpers.jsx` checks them against `sourceRectAtTime`).

### 2D matrices: `MK.mat`

These are affine matrices `[a, b, c, d, e, f]`, with `identity`, `mul`, `translate`, `scale`, `rotate` (degrees), `skew(deg, axisDeg)`, `apply`, `applyVec`, `invert` (null when singular) and `transform(anchor, position, scalePct, rotation, skew, skewAxis)` in the layer transform order EffectCraft uses.

### Other helpers

- `MK.util` has `clamp`, `clone`, `isArray`, `isNum`, `normHex`, `hexToRgb`, `rgbToHex`, `mixHex`, `uniqueName`, `map` and `filter`.
- `MK.settings.get(key, fallback)` and `MK.settings.set(key, value)` keep tool data, such as a clipboard, under a key named after the tool id. Each save bumps `rev` and every open panel rebuilds.
- `MK.undo.wrap(name, fn)` is for work outside `run`, such as a button in your own dialog. `run` is already wrapped.
- `MK.widgets` (`row`, `label`, `swatch`, `colorField`) and `MK.optionsDialog.build(tool, values)` help with dialogs of your own.
- `MK.prompts.alert` and `MK.prompts.confirm` are what the runner and `ctx.confirm` use. Tests replace them.

## Writing a test

Each tool gets `tests/test_<id>.jsx`. Build the comp and layers, select, run, and check numbers through the scripting API: `valueAtTime(t, false)` (after expressions), key times and eases, layer counts, names, parenting, and positions in comp space (`sourcePointToComp` is EffectCraft's own answer).

```js
// SPDX-License-Identifier: MIT OR Apache-2.0
// My Tool: what this test proves.
$.evalFile(new File($.fileName).path + "/testlib.jsx");

var comp = T.comp("My Tool Test");        // 1000 x 600, 10 s, 25 fps, active
var a = T.solid(comp, "A", 100, 100);
T.select(comp, [a], []);                  // exactly these layers and properties
var r = MotionKit.run("myTool", { size: 20 });
T.check(r.ok, "it runs: " + r.message);
T.check(T.near(a.transform.position.valueAtTime(1, false), [500, 300]), "the layer ends up where expected");
T.select(comp, [], []);
T.check(!MotionKit.run("myTool").ok && /select/.test(T.lastAlert()), "no selection: refused with an alert");
T.done();
```

`testlib.jsx` provides:

- `T.check(ok, what)` throws on failure, so the CLI exits 1.
- `T.near(a, b, eps)` compares numbers or arrays. `T.throws(fn, what)` expects an error.
- `T.comp`, `T.solid` and `T.select` set up the scene.
- `T.alerts` and `T.lastAlert()` collect alerts. Set `T.answer` (true or false) to answer `confirm`, and `T.confirms` lists the questions.
- `T.mouse(win, control, type, x, y, extra)` sends a synthetic mouse event through EffectCraft's ScriptUI routing.
- `T.done()` prints the "all checks passed" line the runner looks for.

Test failure paths too: bad selections change nothing, foreign expressions are kept on "no", and one Undo (`app.executeCommand(app.findMenuCommandId("Undo"))`) reverts the whole tool.

## Build and test in a private folder

Agents working in parallel build to their own folder and test that build:

```sh
cd scriptui-panels/MotionKit
python3 build.py --out /tmp/me/dist                 # writes the six bundles there
MK_DIST=/tmp/me/dist tests/run_all.sh               # every test against that build
MK_DIST=/tmp/me/dist tests/run_all.sh test_myTool.jsx test_ui.jsx
```

Before handing in, run `python3 build.py` (which updates `dist/`), then `python3 build.py --check` and `tests/run_all.sh`. `run_all.sh` finds the CLI from `$EFFECTCRAFT_CLI`, `effectcraft-cli` on `PATH`, or an EffectCraft checkout next to this repository. It copies the tests and the dist folder into one staging folder, because EffectCraft only lets a script load files from its own folder.

## EffectCraft behaviour worth knowing

These were found while building the core, in EffectCraft 0.14.

- Keyframe times snap to whole frames: `setValueAtTime(1.5, v)` at 25 fps lands on 1.48. Use frame times in tests.
- 2D layers report Position, Anchor Point and Scale with three values (`[x, y, 0]`), and Scale's eases have three entries. Setting two values works.
- New keys from `setValueAtTime` start selected. `setSelectedAtKey(i, false)` replaces the comp's key selection with that property's other selected keys.
- `sourceRectAtTime` on a shape layer has a 1 px margin and whole-pixel width and height, and a shape with no fill or stroke has an empty rectangle.
- Expression results aren't clamped: Opacity can read 120.
- Headless, a modal `dialog.show()` ends the script run there, so build dialogs without showing them in tests (`MK.optionsDialog.build`, `MK.layoutDialog.build`). `confirm()` answers yes, file writes are refused (the error names Preferences ▸ Scripting & Expressions ▸ Allow Scripts to Write Files and Access Network), `File.saveDialog` / `openDialog` return null, and `app.scheduleTask` tasks don't run.
- ScriptUI delivers no key events, and an edit text commits (`onChange`) when it loses focus. Mouse events carry `clientX` / `clientY` relative to the control under the pointer and bubble to its containers.
- Dropdown Menu Control exists, but scripts can't set its item names.
