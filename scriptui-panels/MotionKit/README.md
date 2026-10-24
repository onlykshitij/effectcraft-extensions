# Motion Kit

Motion design tools for EffectCraft in four ScriptUI panels you can rearrange and restyle, plus a compact menu panel.

This is a work in progress. The panels, layouts, styling, the command box, the user library and four tools (Bounce, Elastic, Loop In/Out and Add Parent Null) work. The other buttons in the default layout show as a grey "?" until their tools are added.

## Install

In EffectCraft, use File ▸ Scripts ▸ Install ScriptUI Panel… for each of `dist/Motion Kit 1.jsx` to `dist/Motion Kit 4.jsx` and `dist/Motion Kit Menu.jsx`, then open them from the bottom of the Window menu. `dist/motionkit-lib.jsx` has no UI; the tests use it.

## Use

Click a button to run its tool on the selection. Shift-click or right-click opens the tool's options. Drag a button to reorder it in its panel. The ⚙ button opens Layout & Style, where buttons move between panels and colours, layouts and library items are edited.

## Develop

```sh
python3 build.py              # src/ -> dist/
python3 build.py --check      # fails when dist/ is out of date
tests/run_all.sh              # headless tests in effectcraft-cli
```

[CONTRIBUTING-TOOLS.md](CONTRIBUTING-TOOLS.md) explains how to add a tool.

This is an independent project written from scratch for EffectCraft.
