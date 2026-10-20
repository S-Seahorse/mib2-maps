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
| [previewer/](previewer) | A web app to preview and recolour the styles and export MapConfigs for the head unit. |
| [utilities/](utilities) | The deploy script, screenshot scripts and CFF image tools. |
| [mib2-mapbuilder/](mib2-mapbuilder) | (submodule) The original TypeScript builder for VW `.mxf` files. It doesn't produce the Audi files. |

### How the Audi styles differ from the VW ones
* **MapConfigs.** Audi has `mapconfig_default_0/1_DTM` (the standard map), `mapconfig_sat_default_0/1_DTM` (roads and labels drawn over satellite imagery) and `mapconfig_traffic_0/1` (a muted map for the traffic view). There is no `1280x640` folder and there are no `kombi` files: one set of MapConfigs serves every display. `_0` is day and `_1` is night, as on VW.
* **Displays.** The zoom tables in `pcconfig/` come per display: `1024x436` is the map area of the 8.3" MMI screen, and `1440x455`, `1440x520` and `1440x540` are Virtual Cockpit map sizes. The MMI's main map is tilted lower than VW's (25° above the horizon against 34°).
* **Fonts.** Labels use Audi Type, defined in `MapConfigs/fontconfig_audi_0.fcx` with different font ids from VW's `fontconfig_default_0.fcx`.
* **Colours.** The colour entries have the same names as VW's, plus `satcopyright_text_color` and `satcopyright_background_color`. Road widths, zoom ranges and the terrain colours differ.

### Prerequisites
* npm, to serve the previewer (and to run the VW builder)
* PowerShell, for the deploy script
* Root SSH access to the head unit, set up as the host `mib2` (see below). Getting root on the MMI, for example with patched firmware or the M.I.B. toolbox, is outside this repo.

## Previewing and recolouring the map styles
[previewer/](previewer/) is a small web app for trying colour changes before they go anywhere near the car. It loads the stock Audi MapConfigs, draws a sample city with their colours, road widths, zoom ranges and camera angles, and exports a MapConfigs folder with your changes.

1. Serve the repo folder and open the previewer (`python3 -m http.server 8000` works too)
   ```powershell
   npx --yes http-server -p 8000 -c-1
   ```
   then browse to http://localhost:8000/previewer/
2. Click anything on the map, or pick an entry in the colour list, and change its colour. You can preview day and night, the **Standard**, **Satellite** and **Traffic** maps, 2D and 3D, the zoom steps from the zoom tables, and both the MMI screen and the Virtual Cockpit. **Hold to compare** shows the original colours.
3. **Export → MapConfigs folder** downloads a .zip with every MapConfig file. Only the values you changed differ from the originals, and the files keep their original `.mxf.gz` names, so they replace the files on the head unit.

A change on the Standard map also applies to the satellite and traffic maps wherever they used the same colour as the Standard map; a change made on one of those maps applies to that map only. That way the traffic map keeps its muted colours unless you change them there.

The style picker also switches to the VW reference styles. To tweak the output of [mib2-mapbuilder](mib2-mapbuilder) (VW only), pick the VW styles, then use **Open files** and pick the `.mxf` files from `mib2-mapbuilder/rendered` and `mib2-mapbuilder/rendered/1280x640`. **Export → Colour theme** saves only your changes as JSON in the builder's `{ name, outline, fill }` colour format.

Opening `previewer/index.html` straight from disk also works, but browsers block it from reading the style folders, so you'll need to open the files yourself. Edits are kept in your browser until you export or reset them.

## Deploying to the car
[deploy_scp.ps1](utilities/deploy_scp.ps1) stages a complete map style folder in `.\deploy` (the stock Audi styles, with your exported MapConfigs swapped in) and, with `-deploy`, copies it to the head unit.

1. Find the Audi map style folder on the head unit. The script assumes `/mnt/app/navigation/resources/app/audi/aus/`, which hasn't been confirmed on an A4 yet:
   ```powershell
   .\utilities\deploy_scp.ps1 -list
   ```
2. Export **MapConfigs folder** from the previewer and unzip it.
3. Stage it and look over `.\deploy` before going further:
   ```powershell
   .\utilities\deploy_scp.ps1 -mapConfigs .\path\to\unzipped-export
   ```
4. Deploy, keeping a copy of what's on the head unit in `.\backup`:
   ```powershell
   .\utilities\deploy_scp.ps1 -mapConfigs .\path\to\unzipped-export -destPath /mnt/app/navigation/resources/app/audi/aus/ -deploy -backup
   ```
   The script stops if `-destPath` doesn't exist on the head unit. It then remounts `/net/mmx/mnt/app` read-write, copies the files, remounts it read-only and restarts `AppStartATF`. Those steps come from the original VW workflow; the A4 runs the same MIB2 High platform, but they haven't been tried on it yet, so keep the backup.

To deploy the VW styles as the original project did, use `-styles mapstyles -vwBuilder -destPath /mnt/app/navigation/resources/app/vw/aus/`.

### Configuring mib2 SSH host
Add the below to your ~/.ssh/config file
```
Host mib2
  HostName 10.173.189.1 # put your MIB2 IP address here (usually 10.173.189.1)
  User root
  IdentityFile ~/.ssh/id_mib2 ## Replace this with the path to the private key you previously configured
```

### Screenshots
[screenshot-mib.ps1](utilities/screenshot-mib.ps1) saves a screenshot of the main display to `.\screenshots`. [screenshot-kombi.ps1](utilities/screenshot-kombi.ps1) switches the main display to the VW cluster map to capture it; that display context is VW's and hasn't been checked on the Audi Virtual Cockpit.
