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
None of these has been tried on the car yet. All of them change colours only: every entry keeps the stock Audi file's shown, hidden and pattern settings, and the satellite map keeps Audi's white labels for legibility over imagery.

* **ios-15**: the iOS 15-inspired colours from [mib2-mapbuilder](../mib2-mapbuilder) (made for VW Discover Pro), applied to the Audi files by entry name, with flat land colours in place of Audi's terrain shading.
* **quadro**, **carta** and **folio** take their palettes from the three themes of the [map65](https://github.com/S-Seahorse/map65) exam planner (`css/skin-*.css`). Each traffic map is the same style washed towards the land colour, so the traffic colours stand out, and traffic uses each theme's own success, warning and danger colours.
  * **quadro**: after Quadro, a modern take on Mac OS 8–9 Platinum. By day, white roads with hairline outlines on a platinum desk, lavender motorways (the selection highlight), Stickies-yellow main roads and a focus-blue route. At night, near-black warm graphite with the theme's lighter lavender and blue.
  * **carta**: after Carta, an atlas and encyclopaedia look. By day, ivory paper with ultramarine ink, atlas-red motorways, antique-gold main roads, an ultramarine route, hypsometric height tints and a gold-lit horizon. At night, the planetarium: navy land and water with gold motorways and gold place names.
  * **folio**: after Folio, Garamond-era print and Gray's Anatomy plates. By day, ink on warm paper with arterial-red motorways, venous-blue main roads, an ink-black route and relief in sepia. At night, the radiograph: blue-black film with bone-white streets and route, red motorways and blue main roads.
