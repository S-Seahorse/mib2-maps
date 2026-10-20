# mib2-maps
Tools for customising the MIB2 navigation map styles on a **2017 Audi A4 (B9) with MMI Navigation plus**, with Australian maps.

This started as [hgnme/mib2-maps](https://github.com/hgnme/mib2-maps), which restyled the maps on VW Discover Pro head units (below, its iOS 15 style). The Audi MMI Navigation plus uses the same MIB2 High platform and the same Elektrobit map style format, so the same approach works with the Audi style files.

![iOS 15 Styled maps in NightMode](img/before-after.gif)
### Built With
* regret
* angst
* typescript
* photoshop's colour picker

## What's in here
| Folder | What it holds |
|---|---|
| [mapstyles-audidefault/](mapstyles-audidefault) | The stock Audi map styles (`StyleDB_MIB_AUDI`, MIB2-H, Australian market, revision 2811). The starting point for the A4. |
| [mapstyles/](mapstyles) | The stock VW Discover Pro styles from the original project (Australian market, revision 2562), kept for reference. |
| [mapstyles-alt/](mapstyles-alt) | Alternate map styles: one folder of MapConfigs per style, listed in its `index.json`. It starts with an iOS 15 style ported from mib2-mapbuilder. See its [README](mapstyles-alt/README.md). |
| [previewer/](previewer) | A web app to preview and recolour the styles and export MapConfigs for the head unit. |
| [utilities/](utilities) | The preview server, the deploy and screenshot scripts, the builder for the palette-based styles in `mapstyles-alt/`, and CFF image tools. |
| [mib2-mapbuilder/](mib2-mapbuilder) | (submodule) The original TypeScript builder for VW `.mxf` files. It doesn't produce the Audi files. |

### How the Audi styles differ from the VW ones
* **MapConfigs.** Audi has `mapconfig_default_0/1_DTM` (the standard map), `mapconfig_sat_default_0/1_DTM` (roads and labels drawn over satellite imagery) and `mapconfig_traffic_0/1` (a muted map for the traffic view). There is no `1280x640` folder and there are no `kombi` files: one set of MapConfigs serves every display. `_0` is day and `_1` is night, as on VW.
* **Displays.** The zoom tables in `pcconfig/` come per display: `1024x436` is the map area of the 8.3" MMI screen, and `1440x455`, `1440x520` and `1440x540` are Virtual Cockpit map sizes. The MMI's main map is tilted lower than VW's (25° above the horizon against 34°).
* **Fonts.** Labels use Audi Type, defined in `MapConfigs/fontconfig_audi_0.fcx` with different font ids from VW's `fontconfig_default_0.fcx`.
* **Colours.** The colour entries have the same names as VW's, plus `satcopyright_text_color` and `satcopyright_background_color`. Road widths, zoom ranges and the terrain colours differ.

### Prerequisites
* [Node.js](https://nodejs.org) 18 or later, with npm: for the deploy and screenshot scripts, the style builder and serving the previewer
* `ssh` and `scp` (OpenSSH), which come with macOS, Linux and Windows 10 and later
* Root SSH access to the head unit, set up as the host `mib2` (see below). Getting root on the MMI, for example with patched firmware or the M.I.B. toolbox, is outside this repo.

## Previewing and recolouring the map styles
[previewer/](previewer/) is a small web app for trying colour changes before they go anywhere near the car. It loads the stock Audi MapConfigs, draws a sample city with their colours, road widths, zoom ranges and camera angles, and exports a MapConfigs folder with your changes.

1. In the repo folder, start the previewer:
   ```sh
   npm run preview
   ```
   This serves the repo folder on your computer and opens http://localhost:8000/previewer/ in your browser; Ctrl+C stops it. For another port, use `npm run preview -- --port 8080`. Any web server for the repo folder works too, for example `python3 -m http.server 8000`.
2. Pick a map style: the stock Audi styles, one of the styles in [mapstyles-alt/](mapstyles-alt), or a draft of your own. **New style** starts a draft from what's on screen; drafts are kept in your browser until you export them.
3. Click anything on the map, or pick an entry in the colour list, and change its colour. You can preview day and night, the **Standard**, **Satellite** and **Traffic** maps, 2D and 3D, the zoom steps from the zoom tables, and both the MMI screen and the Virtual Cockpit. **Hold to compare** shows the original colours.
4. Export:
   * **Map style folder** downloads the style as a folder for [mapstyles-alt/](mapstyles-alt), with an `index.json` that lists it beside the styles already there. Unzip it into `mapstyles-alt/` (replacing `index.json`) and it appears in the style picker.
   * **MapConfigs folder** downloads just the MapConfig files, to deploy straight away.
   * **SD card** writes the whole style folder with your colours to an SD card, for [using a style from an SD card](#using-a-style-from-an-sd-card). In Chrome or Edge you pick the card and it's written straight to it; other browsers download a `.zip` to unzip onto the card. It needs the Style Lab started with `npm run preview`.

   In each of them, only the values you changed differ from the files you started with (the SD card also gets a raised version), and the files keep their original `.mxf.gz` names, so they replace the files on the head unit.

A change on the Standard map also applies to the satellite and traffic maps wherever they used the same colour as the Standard map; a change made on one of those maps applies to that map only. That way the traffic map keeps its muted colours unless you change them there.

The style picker also switches to the VW reference styles. To tweak the output of [mib2-mapbuilder](mib2-mapbuilder) (VW only), pick the VW styles, then use **Open files** and pick the `.mxf` files from `mib2-mapbuilder/rendered` and `mib2-mapbuilder/rendered/1280x640`. **Export → Colour theme** saves only your changes as JSON in the builder's `{ name, outline, fill }` colour format.

Opening `previewer/index.html` straight from disk doesn't load any styles, because browsers block a page opened that way from reading the style folders; you can only open files yourself with **Open files**. Edits are kept in your browser, for the address you opened it at, until you export or reset them.

## Deploying to the car
[deploy.js](utilities/deploy.js) stages a complete map style folder in `deploy/` (the stock Audi styles, with your exported MapConfigs swapped in) and, with `--deploy`, copies it to the head unit. Run it from the repo folder, in any terminal.

1. Find the Audi map style folder on the head unit. The script assumes `/mnt/app/navigation/resources/app/audi/aus/`, which hasn't been confirmed on an A4 yet:
   ```sh
   node utilities/deploy.js --list
   ```
2. Pick what to deploy: a style in `mapstyles-alt/` (`--style ios-15`), or a **MapConfigs folder** exported from the previewer and unzipped (`--map-configs path/to/unzipped-export`).
3. Stage it and look over `deploy/` before going further:
   ```sh
   node utilities/deploy.js --style ios-15
   ```
4. Deploy, keeping a copy of what's on the head unit in `backup/`:
   ```sh
   node utilities/deploy.js --style ios-15 --dest-path /mnt/app/navigation/resources/app/audi/aus/ --deploy --backup
   ```
   The script stops if `--dest-path` doesn't exist on the head unit, or if the backup doesn't finish. It then remounts `/net/mmx/mnt/app` read-write, copies the files, remounts it read-only and restarts `AppStartATF` (not if the copy failed). Those steps come from the original VW workflow; the A4 runs the same MIB2 High platform, but they haven't been tried on it yet, so keep the backup.

`node utilities/deploy.js --help` lists the options. To deploy the VW styles as the original project did, use `--styles mapstyles --vw-builder --dest-path /mnt/app/navigation/resources/app/vw/aus/`.

### Which copy of the style the navigation uses
There can be several copies of the map style: the one on the head unit (the folder above), one in the map database that comes with map updates, and, with the SD card method below, one in the root of an SD card. Each time it starts, the navigation uses the one with the highest version in its `version-cfg.txt` ([mib2-toolbox#150](https://github.com/jilleb/mib2-toolbox/issues/150)). So whenever a style's MapConfigs are swapped in, the deploy script raises the version (for example `10.0.2811` becomes `10.0.9999`), or a newer map database would win and the style would never show. Stock styles keep their version, and `--keep-version` keeps it for a style too.

## Using a style from an SD card
The navigation can also load its map style from the root of an SD card, once the head unit has an empty file called `/navigation/LoadStylesFromSDCard`. Nothing on the head unit changes after that: you swap styles by writing the card, and without the card the navigation goes back to its own style.

1. Set the flag, once. [mib2-toolbox](https://github.com/jilleb/mib2-toolbox)'s **Use Audi mapstyles from SD-card** menu item sets it. (It also tries to copy Audi's stock styles onto the card from the European map database, which doesn't matter here, since the next step writes the card.) Over SSH, after making its partition writable (`mount -uw /net/mmx/mnt/app` if `/navigation` is on the app partition), it's:
   ```sh
   touch /navigation/LoadStylesFromSDCard
   ```
2. Write the style to the card, either from the Style Lab (**Export → SD card**) or with the deploy script:
   ```sh
   node utilities/deploy.js --style allroad --sd /path/to/card
   ```
   The card's root gets the whole style folder: the stock Audi styles (so Audi's icons and fonts stay right) with the style's MapConfigs and a raised version. Only a map style's own items in the root are replaced; anything else on the card, such as the toolbox or M.I.B., stays. A folder that has items with those names but no map style isn't written to, in case it isn't the card.
3. Put the card in an SD slot and restart the MMI.

To stop using the card, take it out; to turn the method off, delete `/navigation/LoadStylesFromSDCard`.

### Configuring mib2 SSH host
Add the below to your ~/.ssh/config file
```
Host mib2
  HostName 10.173.189.1 # put your MIB2 IP address here (usually 10.173.189.1)
  User root
  IdentityFile ~/.ssh/id_mib2 ## Replace this with the path to the private key you previously configured
```

### Screenshots
[screenshot.js](utilities/screenshot.js) saves a screenshot of the main display to `screenshots/`:
```sh
node utilities/screenshot.js
```
With `--kombi` it switches the main display to the VW cluster map to capture it; that display context is VW's and hasn't been checked on the Audi Virtual Cockpit.
