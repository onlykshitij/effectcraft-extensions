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
    category: "Rig",           // Animate, Rig, Shapes or Comp (its group in the menu and Add lists)
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
| `warn(msg)` | a note appended to the result message; the panel shows the message even when the run worked, so use it for whatever was skipped |
| `confirm(msg)` | ask yes/no (tests answer through `MotionKit.prompts`) |
| `done(msg)` | the success result |

Optional fields of the definition:

- `needsComp: false` lets the tool run without an active comp (Project panel tools).
- `dot: function () { return bool; }` shows an accent dot on the button while true, for example while a clipboard holds something.
- `openOptions: function () {...}` replaces the generated options dialog, for a dialog of your own such as a curve editor. Return a run result or null.
- `api: {...}` holds functions other tools and widgets reuse, as `MK.tools[id].api` (Ease Copy's `paste`, for example).
- `removable: true` makes Alt-click take the tool's work off the selection (`MK.remove(id)`): its marked expressions, then its "<Tool> – …" controls on layers where none of them is left. Use it when the tool's whole result is that.

To reuse another tool inside your `run`, call `MK.callTool(id, ctx, options)`. It runs that tool's `run` with the same `ctx`, so everything stays one undo step, with the tool's saved options and `options` on top.

## Widgets

A widget is a bigger cell with controls of its own, such as sliders or a grid of buttons. It is a registry entry like a tool, in `src/tools/widgets/<id>.js`, with three more fields:

- `kind: "widget"`;
- `span: [cols, rows]`, its size in grid cells (the panel packs items first fit, so smaller items fill the holes beside it);
- `build(w)`, which adds the controls to the cell.

`run(ctx, opts)` does the work, through the same runner as a tool, so a widget's actions are undo steps with the usual error handling. Give it an option such as `action` or `type` for each thing it can do. Its `options` are also where it keeps its values: `w.save()` stores them in `toolOptions` under the widget's id. `src/tools/widgets/interpolation.js` is the smallest example.

`build(w)` gets:

| Field | |
|---|---|
| `w.w`, `w.h` | the cell's size in px |
| `w.style`, `w.look` | the panel style (`fg`, `accent`, `radius`...) and the cell's colours |
| `w.values` | the saved options |
| `w.editing` | true in edit mode: the panel ignores the widget's controls then |
| `w.part(name, [x, y, w, h], handlers)` | an interactive control, a custom-drawn `iconbutton`. `handlers`: `tip` (required, the help tip), `draw(g, part)`, `click({shift})`, and for drags `press(x, y)`, `drag(x, y)`, `release()`, with x and y in the part. `release` returns false when nothing was dragged, and the press then counts as a click |
| `w.field(name, rect, text, tip, onChange)` | a text field |
| `w.paint = function (g) {...}` | drawing on the cell's background, such as labels |
| `w.onShift = function () {...}` | Shift-click (or right-click) anywhere on the widget |
| `w.save(partial)`, `w.run(options)`, `w.options(toolId)` | save values, run the widget, open a tool's options |

Make every interactive part a `part`, never a drawn group: EffectCraft shows a help tip only for custom-drawn controls that aren't containers. The panel feeds parts through its own mouse listeners, so don't add `onClick` or listeners of your own, or a click could run twice. `MK.ui.gfx` has drawing helpers (`box`, `circle`, `text`, `button`), and `MK.THEME` has the fixed theme colours.

Keep redraws cheap. EffectCraft runs every `onDraw` of the panel, lays it out and serialises it after every event it hands the script, so every control, draw operation and path point costs time on every click. Use as few parts as the widget's help tips need, draw icons with `MK.icons.draw` (it caches the flattened paths), and don't draw what can't be seen. The panel listens to `mousemove` only while a drag needs it, so parts don't get hover events.

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

Icons are drawn on a 24 x 24 grid in two colours: `fg` for the base strokes (white in the default theme) and `accent` for one highlighted part (coral). An icon is an array of layers. A layer is a path string (stroked in `fg` at 2 units) or `{d, stroke, fill, w, alpha}`, where `stroke` and `fill` are `"fg"`, `"accent"` or a hex colour and `w` is the pen width in grid units. Strokes get round corners and ends: the renderer draws a dot on every corner sharper than 30 degrees and on open ends.

| Command | |
|---|---|
| `M x y`, `L x y`, `H x`, `V y`, `Z` | move, line, horizontal, vertical, close |
| `Q x1 y1 x y`, `C x1 y1 x2 y2 x y` | quadratic and cubic Béziers (flattened to 5 segments) |
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
- `ensure(layer, matchName, name, value)` returns the control with that name, creating it with `value` only when the layer has none. One control set then drives every property a tool touched on that layer. During a run from the options dialog's OK (`MK.run(id, null, false, {setControls: true})`), an existing control also takes `value`, since the user just chose it. The shortcuts are `slider`, `checkbox`, `color` (hex or `[r, g, b]`), `point`, `point3d`, `angle`, `layer` (a Layer) and `dropdown` (a 1-based index; EffectCraft's scripting can't name the menu items).
- `find(layer, name, matchName?)`, `set(effect, value)` and `prop(effect)` (the value property).
- `ref(name, matchName?)` is the expression text that reads a control, such as `effect("Bounce – Amplitude")("Slider")`. Add `.value` when you do maths with it.

Create the controls before setting the expression that reads them.

### Expressions: `MK.expr`

Every expression a tool writes starts with the line `// Motion Kit: <id>`. Use `mk`-prefixed variable names inside expressions so they don't shadow expression globals.

- `decide(ctx, props)` returns `{apply, skip}`. Properties with an expression Motion Kit didn't write are only replaced if the user agrees (one question for all of them).
- `set(prop, id, body)` writes `// Motion Kit: id` and the body. `make(id, body)` returns that text.
- `applyAll(ctx, props, id, body)` runs `decide` and `set` together. `body` can be `function (prop)`.
- `isOurs(prop, id?)` and `hasForeign(prop)` read the mark. `str(s)` quotes a string for expression code.
- `report(name, applied, invalid, kept, needs, resting?, linear?, ctx?)` gives the standard result message. With `ctx`, the skipped, kept and stopped notes go through `ctx.warn`.
- `ofTool(group, id)` lists the properties under a layer or group whose expression tool `id` wrote.

### Layer and comp space: `MK.space`

These conversions run EffectCraft's own `toComp` / `fromComp` / `toWorld` / `fromWorld` on a temporary 3D Point Control, so parents, 3D, cameras and expressions on transforms all count, at any comp time `t` (the default is the current time). Points are `[x, y, z]` in and out. The probe is removed again inside the same undo step. Cameras and lights, which take no effects, use a temporary null.

- `toComp`, `fromComp`, `toWorld`, `fromWorld(layer, p, t?)`.
- `toCompPoints(layer, points, t?)` converts many points with one affine matrix when `is2D(layer)` (the layer and all its parents are 2D), else point by point.
- `matrix(layer, t?)` is the 2D affine layer-to-comp matrix `[a, b, c, d, e, f]`.
- `rectCorners(layer, t?, extents?)` gives the four `sourceRectAtTime` corners in layer space (top-left, top-right, bottom-right, bottom-left). `rectCornersInComp` gives the same corners in comp space.
- `anchor(layer, t?)` is the anchor point, `[0, 0, 0]` for cameras and lights (they have none). `is3D(layer)` counts cameras and lights as 3D; `isCameraOrLight(layer)`.
- `anchorInComp(layer, t?)` is where the layer is. `compToParent(layer, p, t?)` turns a comp point into the space the layer's Position is in, so setting Position to it puts the anchor there.
- `bounds(points)` gives `{left, top, right, bottom, width, height, center}`.
- `probe(layer, function (evaluate) {...})` runs your own expressions on the layer: `evaluate(code, t)` returns up to three numbers, and `L` is the layer inside `code`.

### Keyframes: `MK.keys`

- `read(prop, i)` gives a plain object: `time` (comp time), `value`, `inInterp`, `outInterp`, `inEase` / `outEase` (`[{speed, influence}]` per dimension), `continuous`, `autoBezier`, `roving`, `selected`, plus `inTangent`, `outTangent`, `spatialContinuous` and `spatialAutoBezier` for spatial properties.
- `readAll(prop)` and `readSelected(prop)`.
- `write(prop, key, time?, parts?)` writes such an object at `time` (the default is its own) and returns the new index. `parts` such as `{value: false, interp: false}` limits what is written; the parts are `value`, `ease`, `interp`, `spatial` and `roving`.
- `setEase(prop, i, inEase, outEase)` fits eases to the property's dimensions, reusing the first entry when the counts differ. `fit(list, dims)` returns the `KeyframeEase` list.
- `setInterp(prop, i, inType, outType)` sets only the interpolation types (false when the property can't take them). EffectCraft keeps a key's ease while it is Linear or Hold, so switching back to Bezier this way brings the ease back.
- `remove(prop, indices)` removes keys by index, in any order.
- `atRest(prop, i, arriving)` is true when key i arrives (or leaves) with no speed: Hold, Easy Ease, a holding segment or an unchanged value. `easedStop(prop, i, arriving)` is just the Easy Ease case, and `offerLinearArrival(props, name)` asks to make such last keys arrive Linear, for tools that carry the arriving speed on (Elastic).

### Shapes: `MK.shapes`

- `contents(layer)` is the Contents group, or null for other layers. `isGroup(p)`, `inner(group)` (its contents) and `groupTransform(group)`.
- `walk(root, fn)` visits every item under a shape layer, its contents or a group, depth first, as `fn(item, groups)` with the enclosing groups outermost first. Return `false` to skip a group's insides.
- `find(root, matchName)` gives `[{item, groups}]`. `paths(layer)` gives `[{prop, groups}]` for every path (`ADBE Vector Shape`). `groupsOf(prop)` walks up from a property.
- `groupMatrix(group, t)` is one group's transform. `toLayerMatrix(groups, t)` takes item space to layer space through the groups. Both match EffectCraft's renderer, skew included (`test_helpers.jsx` checks them against `sourceRectAtTime`).

### 2D matrices: `MK.mat`

These are affine matrices `[a, b, c, d, e, f]`, with `identity`, `mul`, `translate`, `scale`, `rotate` (degrees), `skew(deg, axisDeg)`, `apply`, `applyVec`, `invert` (null when singular) and `transform(anchor, position, scalePct, rotation, skew, skewAxis)` in the layer transform order EffectCraft uses.

### Other helpers

- `MK.util` has `clamp`, `clone`, `isArray`, `isNum`, `normHex`, `hexToRgb`, `rgbToHex`, `mixHex`, `uniqueName`, `map` and `filter`.
- `MK.settings.get(key, fallback)` and `MK.settings.set(key, value)` keep tool data, such as a clipboard, under a key named after the tool id. Each save bumps `rev` and every open panel rebuilds. `MK.settings.setQuiet(key, value)` saves without bumping `rev`, for state only one panel reads (its view).
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
- `T.mouse(win, control, type, x, y, extra)` sends a synthetic mouse event through EffectCraft's ScriptUI routing. `tests/test_widgets.jsx` drives widgets this way.
- `T.done()` prints the "all checks passed" line the runner looks for.

Test failure paths too: bad selections change nothing, foreign expressions are kept on "no", and one Undo (`app.executeCommand(app.findMenuCommandId("Undo"))`) reverts the whole tool.

## Build and test in a private folder

Agents working in parallel build to their own folder and test that build:

```sh
cd scriptui-panels/MotionKit
python3 build.py --out /tmp/me/dist                 # Motion Kit.jsx, the library, and extra/ with the single panels
MK_DIST=/tmp/me/dist tests/run_all.sh               # every test against that build
MK_DIST=/tmp/me/dist tests/run_all.sh test_myTool.jsx test_ui.jsx
```

Before handing in, run `python3 build.py` (which updates `dist/`), then `python3 build.py --check` and `tests/run_all.sh`. `--check` also fails on a bundle the build no longer writes, such as a single panel left at the top of `dist/`. `run_all.sh` finds the CLI from `$EFFECTCRAFT_CLI`, `effectcraft-cli` on `PATH`, or an EffectCraft checkout next to this repository. It copies the tests and the dist folder (with `extra/`) into one staging folder, because EffectCraft only lets a script load files from its own folder. It also runs `tests/test_build.py`, which checks the build itself. `File.exists` answers false in the headless CLI, so a test that needs to know whether a file is there loads it with `$.evalFile`.

## EffectCraft behaviour worth knowing

These were found while building the core, in EffectCraft 0.14.

- Keyframe times snap to whole frames: `setValueAtTime(1.5, v)` at 25 fps lands on 1.48. Use frame times in tests.
- 2D layers report Position, Anchor Point and Scale with three values (`[x, y, 0]`), and Scale's eases have three entries. Setting two values works.
- New keys from `setValueAtTime` start unselected (EffectCraft 0.14). Selecting a property selects all its keys, and `setSelectedAtKey(i, true)` also selects the property.
- Write keys with `MK.keys.write`, or `MK.keys.writeAll` for a run: it sets roving after every key exists, because a key only roves between two others. Both set the ease before the interpolation types, since `setTemporalEaseAtKey` switches both sides to Bezier.
- `sourceRectAtTime` on a shape layer has a 1 px margin and whole-pixel width and height, and a shape with no fill or stroke has an empty rectangle.
- Expression results aren't clamped: Opacity can read 120.
- Headless, a modal `dialog.show()` ends the script run there, so build dialogs without showing them in tests (`MK.optionsDialog.build`, `MK.layoutDialog.build`). `confirm()` answers yes, file writes are refused (the error names Preferences ▸ Scripting & Expressions ▸ Allow Scripts to Write Files and Access Network), `File.saveDialog` / `openDialog` return null, and `app.scheduleTask` tasks don't run.
- ScriptUI delivers no key events, and an edit text commits (`onChange`) when it loses focus. Mouse events carry `clientX` / `clientY` relative to the control under the pointer and bubble to its containers.
- A custom-drawn control (`onDraw` without `drawOSControl()`) shows its `helpTip` unless it is a container (group, panel). A custom-drawn `iconbutton` still gets mousedown, mousemove and mouseup. A click on it reaches the script as a plain `click`, which runs `onClick` only, so a button driven by mouse listeners runs once.
- EffectCraft draws every script font as regular weight, and pens have no join style.
- After every event it hands a script, and after every `app.scheduleTask` run, EffectCraft runs all of the script's `onDraw` handlers, lays its windows out and serialises them (draw lists included, twice). Listen to `mousemove`, `mouseover` and `mouseout` only while you need them (`removeEventListener` afterwards): EffectCraft sends only the events some listener wants. `fillPath(brush, path)` and `strokePath(pen, path)` accept a path kept from `graphics.currentPath`, which saves rebuilding it point by point.
- Dropdown Menu Control exists, but scripts can't set its item names.
