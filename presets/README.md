# Server presets

Any `.json` file in this folder (not in sub-folders) shows up as a preset in
the Design panel of every site on this install, under "On this server". You
don't need to restart anything.

To make one, design a page in the editor, save it under My presets, export
it and copy the file here. Or copy one of the files from `examples/` into
this folder and edit it. Broken files are skipped with a warning in the log.

To share one folder between several sites, set `PRESETS_DIR` in each site's
`.env`.
