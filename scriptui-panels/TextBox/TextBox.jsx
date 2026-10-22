// SPDX-License-Identifier: MIT OR Apache-2.0
// TextBox.jsx: puts a rounded rectangle behind each selected text layer.
// Each box is a shape layer parented to its text layer. Expressions size it from the text's
// sourceRectAtTime every frame, so it follows text edits and animation. Padding, roundness and
// color are expression controls on the box layer, editable later in Effect Controls.
// Install: File > Scripts > Install ScriptUI Panel..., then open it from the Window menu.
(function (thisObj) {
  var TITLE = "TextBox";

  // Shared by the expressions: the parent text layer's box plus padding, in the parent's layer space.
  var RECT_EXPR =
    'var r = hasParent ? parent.sourceRectAtTime(time, false) : {left: 0, top: 0, width: 0, height: 0};\n' +
    'var px = effect("Padding X")("Slider"), py = effect("Padding Y")("Slider");\n' +
    'var w = Math.max(0, r.width + 2 * px), h = Math.max(0, r.height + 2 * py);\n';
  var SIZE_EXPR = RECT_EXPR + '[w, h]';
  var POS_EXPR = RECT_EXPR + '[r.left + r.width / 2, r.top + r.height / 2]';
  var ROUND_EXPR = RECT_EXPR + 'Math.min(w, h) / 2 * Math.max(0, Math.min(100, effect("Roundness")("Slider"))) / 100';

  function hexToRgb(s) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(s).replace(/\s/g, ""));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function rgbToHex(c) {
    var s = "#";
    for (var i = 0; i < 3; i++) {
      var h = Math.round(c[i] * 255).toString(16).toUpperCase();
      s += h.length < 2 ? "0" + h : h;
    }
    return s;
  }

  function addControl(layer, matchName, name, value) {
    var fx = layer.property("ADBE Effect Parade").addProperty(matchName);
    fx.name = name;
    fx.property(1).setValue(value);
  }

  function makeBox(comp, text, opts) {
    var box = comp.layers.addShape();
    box.name = text.name + " Box";
    box.moveAfter(text);
    box.threeDLayer = text.threeDLayer;
    // No compensation: with an identity transform the box's layer space is the text's.
    box.setParentWithJump(text);
    var tr = box.property("ADBE Transform Group");
    var zero = text.threeDLayer ? [0, 0, 0] : [0, 0];
    tr.property("ADBE Anchor Point").setValue(zero);
    tr.property("ADBE Position").setValue(zero);
    tr.property("ADBE Scale").setValue(text.threeDLayer ? [100, 100, 100] : [100, 100]);
    if (text.threeDLayer) {
      tr.property("ADBE Orientation").setValue([0, 0, 0]);
      tr.property("ADBE Rotate X").setValue(0);
      tr.property("ADBE Rotate Y").setValue(0);
    }
    tr.property("ADBE Rotate Z").setValue(0);
    box.startTime = text.startTime;
    box.inPoint = text.inPoint;
    box.outPoint = text.outPoint;

    addControl(box, "ADBE Slider Control", "Padding X", opts.padX);
    addControl(box, "ADBE Slider Control", "Padding Y", opts.padY);
    addControl(box, "ADBE Slider Control", "Roundness", opts.roundness);
    addControl(box, "ADBE Color Control", "Color", opts.color.concat([1]));

    var contents = box.property("ADBE Root Vectors Group");
    var rect = contents.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").expression = SIZE_EXPR;
    rect.property("ADBE Vector Rect Position").expression = POS_EXPR;
    rect.property("ADBE Vector Rect Roundness").expression = ROUND_EXPR;
    var fill = contents.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").expression = 'effect("Color")("Color")';
    return box;
  }

  function create(opts) {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return alert("Open a composition first.", TITLE);
    var sel = comp.selectedLayers, texts = [];
    for (var i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) texts.push(sel[i]);
    if (!texts.length) return alert("Select at least one text layer.", TITLE);
    app.beginUndoGroup("TextBox");
    try {
      for (var j = 0; j < texts.length; j++) makeBox(comp, texts[j], opts);
    } finally {
      app.endUndoGroup();
    }
  }

  function buildUI(host) {
    var win = host instanceof Panel ? host : new Window("palette", TITLE, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 8;
    var color = [0.1, 0.1, 0.1];

    var colorRow = win.add("group");
    colorRow.add("statictext", undefined, "Color");
    var swatch = colorRow.add("group");
    swatch.preferredSize = [24, 20];
    swatch.onDraw = function () {
      var g = this.graphics;
      g.newPath();
      g.rectPath(0, 0, 24, 20);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, color));
    };
    var hexEt = colorRow.add("edittext", undefined, rgbToHex(color));
    hexEt.characters = 8;
    hexEt.helpTip = "Hex color, such as #FFAA00";
    var randomBtn = colorRow.add("button", undefined, "Random");

    var padRow = win.add("group");
    padRow.add("statictext", undefined, "Padding X");
    var padXEt = padRow.add("edittext", undefined, "20");
    padXEt.characters = 4;
    padRow.add("statictext", undefined, "Y");
    var padYEt = padRow.add("edittext", undefined, "10");
    padYEt.characters = 4;
    var linkCb = padRow.add("checkbox", undefined, "Same");
    linkCb.helpTip = "Use the X padding for Y too";

    var roundRow = win.add("group");
    roundRow.add("statictext", undefined, "Roundness %");
    var roundEt = roundRow.add("edittext", undefined, "25");
    roundEt.characters = 4;

    var createBtn = win.add("button", undefined, "Create");

    hexEt.onChange = function () {
      var c = hexToRgb(hexEt.text);
      if (c) color = c;
      hexEt.text = rgbToHex(color);
    };
    randomBtn.onClick = function () {
      color = [Math.random(), Math.random(), Math.random()];
      hexEt.text = rgbToHex(color);
    };
    function syncLink() {
      padYEt.enabled = !linkCb.value;
      if (linkCb.value) padYEt.text = padXEt.text;
    }
    linkCb.onClick = syncLink;
    padXEt.onChange = syncLink;
    createBtn.onClick = function () {
      var padX = parseFloat(padXEt.text), padY = parseFloat(linkCb.value ? padXEt.text : padYEt.text);
      var roundness = parseFloat(roundEt.text);
      if (!isFinite(padX) || !isFinite(padY)) return alert("Padding must be a number.", TITLE);
      if (!isFinite(roundness) || roundness < 0 || roundness > 100) return alert("Roundness must be 0 to 100.", TITLE);
      create({ padX: padX, padY: padY, roundness: roundness, color: color });
    };

    if (win instanceof Window) {
      win.center();
      win.show();
    } else {
      win.layout.layout(true);
    }
    return win;
  }

  return buildUI(thisObj);
})(this);
