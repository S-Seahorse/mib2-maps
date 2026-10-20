# Alternate map styles

Each folder here is a complete set of MapConfigs for one alternate map style, built on one of the stock style sets (`mapstyles-audidefault` for the Audi A4, or `mapstyles` for the VW reference). The previewer lists every style in [index.json](index.json) in its style picker, and the deploy script can copy any of them to the head unit.

```
mapstyles-alt/
├── index.json              which styles there are
└── ios-15/
    └── MapConfigs/
        ├── mapconfig_default_0_DTM.mxf.gz
        ├── mapconfig_default_1_DTM.mxf.gz
        ├── mapconfig_sat_default_0_DTM.mxf.gz
        ├── mapconfig_sat_default_1_DTM.mxf.gz
        ├── mapconfig_traffic_0.mxf.gz
        └── mapconfig_traffic_1.mxf.gz
```

The files keep the stock names, so they replace the stock files on the head unit. Fonts, icons and zoom tables always come from the stock set; a style only changes MapConfigs.

## index.json
```json
{
  "styles": [
    {
      "id": "ios-15",
      "name": "iOS 15",
      "description": "What makes this style different",
      "base": "audi"
    }
  ]
}
```
* `id` is the folder name: lower case letters, digits and dashes.
* `base` is the stock set the style is built on: `audi` or `vw`.
* `files` (optional) lists the MapConfig files the folder holds, for a style that only replaces some of them, for example `["MapConfigs/mapconfig_default_1_DTM.mxf.gz"]` for a night-only style. Files it leaves out come from the stock set. Without `files`, the folder holds all of them.

## Adding a style
1. In the previewer, pick the style to start from and choose **New style**. Give it a name; it's kept in your browser as a draft while you work on it.
2. When it's ready, choose **Export → Map style folder**. The .zip holds the style's folder and an `index.json` that lists it beside the styles already here.
3. Unzip it into this folder, replacing `index.json`, and commit both.

To update a style that's already here, pick it in the previewer, make your changes and export **Map style folder** again; unzipping replaces its files.

To remove a style, delete its folder and its entry in `index.json`.

## Deploying a style
```powershell
.\utilities\deploy_scp.ps1 -style ios-15 -destPath /mnt/app/navigation/resources/app/audi/aus/ -deploy -backup
```
See the main [README](../README.md#deploying-to-the-car) for the head-unit folder and the first-run checks.

## The styles here
* **ios-15**: the iOS 15-inspired colours from [mib2-mapbuilder](../mib2-mapbuilder) (made for VW Discover Pro), applied to the Audi files by entry name, with flat land colours in place of Audi's terrain shading. The satellite map keeps Audi's white labels for legibility over imagery. Not yet tried on the car.
