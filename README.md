# mib2-maps
A collection of utilities to enable simpler customisation of the MIB2 MapStyle files for Volkswagen MIB2 Headunits.

![iOS 15 Styled maps in NightMode](img/before-after.gif)
### Built With
* regret
* angst
* typescript
* photoshop's colour picker

## Getting Started
The quickest way to get started is to download the latest [release](https://github.com/hgnme/mib2-maps/releases/latest) and copy it to your MIB2 headunit.

If you would like to build the maps for yourself, simply clone the repo and run the [deploy_scp.ps1](utilities/deploy_scp.ps1) powershell script. This will build a "Deploy folder" which can be copied to the MIB2 headunit.

### Prerequisites
* npm

## Previewing and recolouring the map styles
[previewer/](previewer/) is a small web app for trying colour changes before they go anywhere near the car. It loads the MapConfig files in [mapstyles/MapConfigs](mapstyles/MapConfigs), draws a sample city with their colours, road widths and zoom ranges, and exports a MapConfigs folder with your changes.

1. Serve the repo folder and open the previewer (npm is already a prerequisite; `python3 -m http.server 8000` works too)
   ```powershell
   npx --yes http-server -p 8000 -c-1
   ```
   then browse to http://localhost:8000/previewer/
2. Click anything on the map, or pick an entry in the colour list, and change its colour. Day and night (`_0` / `_1` files), 2D and 3D, the zoom steps from `pcconfig/zoomlevel_instance0.xml`, and both screen sizes can be previewed. Hold **Hold to compare** to see the original colours.
3. **Export → MapConfigs folder** downloads a .zip with every loaded file. Only the colours you changed differ from the originals, so it can replace `deploy/MapConfigs` or be copied to `/mnt/app/navigation/resources/app/vw/<region>/MapConfigs` on the head unit (back up the original first).

To tweak the output of [mib2-mapbuilder](mib2-mapbuilder) instead of the stock files, use **Open files** and pick the `.mxf` files from `mib2-mapbuilder/rendered` and `mib2-mapbuilder/rendered/1280x640`. **Export → Colour theme** saves only your changes as JSON in the builder's `{ name, outline, fill }` colour format, ready to paste into `mib2-mapbuilder/src/config/colours/`.

Opening `previewer/index.html` straight from disk also works, but browsers block it from reading `mapstyles/`, so you'll need to open the files yourself. Edits are kept in your browser until you export or reset them.

## Build/Deploy instructions
### Using the Deploy powershell script
The Deploy script will compile the .mxf files for both Day, Night mode as well as Kombi and High-Resolution headunit formats (800x480 and 1280x640).
1. Clone the repo
   ```powershell
   git clone https://github.com/hgnme/mib2-maps.git 
   cd mib2-maps
   git submodule init 
   git submodule update
   ```
2. Install NPM packages
   ```powershell
   cd mib2-mapbuilder 
   npm install
   ```
3. Run [deploy_scp.ps1](utilities/deploy_scp.ps1)
   ```powershell
   .\utilities\deploy_scp.ps1
   ```
4. The complete map folder will be output in .\deploy.
   ```
   mib2-maps\deploy
    ├───exitview
    ├───Font
    ├───gui
    │   └───1
    ├───guidanceview
    ├───intersectionmap
    ├───MapConfigs
    │   └───1280x640
    ├───Models
    ├───pcconfig
    ├───poi
    │   └───_replace
    │       └───petrol_stations
    ├───res
    │   └───strings
    ├───roadicon
    ├───signpost
    ├───textures
    └───tti
    ```
5. copy the contents of this folder to ```/mnt/app/navigation/resources/app/vw/aus/``` on your MIB2 headunit. Remember to replace the ```aus``` folder with your region of choice.

Optionally, you may use the ```-deploy``` flag when calling ```deploy_scp.ps1``` to automatically copy the files to your MIB2 headunit during compilation. The ```-backup``` flag will also create a local copy (backup) of the existing deployment on the headunit before deploying.
This assumes a pre-configured SSH host of "mib2" with identity pre-configured.
```powershell
.\utilities\deploy_scp.ps1 -deploy -backup
```

### Configuring mib2 SSH host
Add the below to your ~/.ssh/config file
```
Host mib2
  HostName 10.173.189.1 # put your MIB2 IP address here (usually 10.173.189.1)
  User root
  IdentityFile ~/.ssh/id_mib2 ## Replace this with the path to the private key you previously configured
```
