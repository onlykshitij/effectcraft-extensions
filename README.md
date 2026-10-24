# EffectCraft extensions

Scripts, ScriptUI panels and effect plug-ins for [EffectCraft](https://github.com/storytold/effectcraft), the open-source motion graphics app. Everything here is written from scratch for EffectCraft's scripting API and plug-in API.

This is an independent project. It is not made by or affiliated with the EffectCraft team.

## Contents

| Name | Kind | What it does |
|---|---|---|
| [TextBox](scriptui-panels/TextBox/) | ScriptUI panel | Puts a rounded rectangle behind each selected text layer. The box follows the text as it changes. |
| [Motion Kit](scriptui-panels/MotionKit/) | ScriptUI panels | Motion design tools in four rearrangeable panels and a menu panel. Work in progress: bounce, elastic, loops and parent nulls so far. |

## Installing

Download the `.jsx` file, then in EffectCraft:

- **ScriptUI panel:** File ▸ Scripts ▸ Install ScriptUI Panel…, pick the file, then open it from the bottom of the Window menu.
- **Script:** File ▸ Scripts ▸ Install Script File…, then run it from File ▸ Scripts.

You can also copy the file into EffectCraft's settings folder yourself:

| System | Scripts | ScriptUI panels |
|---|---|---|
| Linux | `~/.config/effectcraft/Scripts/` | `~/.config/effectcraft/Scripts/ScriptUI Panels/` |
| Windows | `%APPDATA%\EffectCraft\Scripts\` | `%APPDATA%\EffectCraft\Scripts\ScriptUI Panels\` |
| macOS | `~/Library/Application Support/EffectCraft/Scripts/` | `~/Library/Application Support/EffectCraft/Scripts/ScriptUI Panels/` |

On Linux, `$XDG_CONFIG_HOME/effectcraft` replaces `~/.config/effectcraft` when that variable is set.

## Testing

Each extension has a self-check script that runs headless in `effectcraft-cli`, which ships with EffectCraft (in the AppImage it is `usr/bin/effectcraft-cli`):

```sh
cd scriptui-panels/TextBox
effectcraft-cli script "$PWD/test_textbox.jsx" --empty
```

The path must be absolute so the test can find the script next to it.

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option, the same as EffectCraft.
