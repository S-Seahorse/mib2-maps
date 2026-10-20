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

### Styles built from palettes
**quadro**, **carta**, **folio** and **allroad** are built from the palettes in [utilities/palettes](../utilities/palettes): a few dozen colours each for day and night, which [build-styles.js](../utilities/build-styles.js) spreads over the stock Audi files (its comments list what each palette colour covers). To change one of these styles, edit its palette and rebuild it:
```sh
node utilities/build-styles.js quadro
```
That rewrites the style's files and its entry in `index.json`, and leaves files that haven't changed alone. With no names it builds every palette, and `--check` only reports what would change. For a new palette style, copy a palette to `utilities/palettes/<id>.js`, give it a `name` and `description`, change the colours and build it.

Changes made to these styles in the previewer are lost the next time their palette is built, so make lasting changes in the palette.

## Deploying a style
```sh
node utilities/deploy.js --style ios-15 --dest-path /mnt/app/navigation/resources/app/audi/aus/ --deploy --backup
```
See the main [README](../README.md#deploying-to-the-car) for the head-unit folder and the first-run checks.

## The styles here
None of these has been tried on the car yet. All of them change colours only: every entry keeps the stock Audi file's shown, hidden and pattern settings, and the satellite map keeps Audi's white city and road labels for legibility over imagery (other labels, such as water names, follow the style).

* **ios-15**: the iOS 15-inspired colours from [mib2-mapbuilder](../mib2-mapbuilder) (made for VW Discover Pro), applied to the Audi files by entry name, with flat land colours in place of Audi's terrain shading.
* **quadro**, **carta** and **folio** (built from [palettes](../utilities/palettes), see above) take their colours from the three themes of the [map65](https://github.com/S-Seahorse/map65) exam planner (`css/skin-*.css`). Each traffic map is the same style washed towards the land colour, so the traffic colours stand out, and traffic uses each theme's own success, warning and danger colours.
  * **quadro**: after Quadro, a modern take on Mac OS 8–9 Platinum. By day, white roads with hairline outlines on a platinum desk, lavender motorways (the selection highlight), Stickies-yellow main roads and a focus-blue route. At night, near-black warm graphite with the theme's lighter lavender and blue.
  * **carta**: after Carta, an atlas and encyclopaedia look. By day, ivory paper with ultramarine ink, atlas-red motorways, antique-gold main roads, an ultramarine route, hypsometric height tints and a gold-lit horizon. At night, the planetarium: navy land and water with gold motorways and gold place names.
  * **folio**: after Folio, Garamond-era print and Gray's Anatomy plates. By day, ink on warm paper with arterial-red motorways, venous-blue main roads, an ink-black route and relief in sepia. At night, the radiograph: blue-black film with bone-white streets and route, red motorways and blue main roads.
* **allroad** (built from a [palette](../utilities/palettes/allroad.js)): muted beiges and forest greens for the A4 allroad quattro, a luxury estate with an off-road side. By day, oat and gravel land, deep fir and sage woodland, slate-grey lakes, sand main roads and cognac motorways with a forest-green casing, like the car's contrasting wheel-arch cladding, with an alpine-blue route. At night, a forest after dark: green-black land, lifted forest greens and warm brass roads. Its traffic colours are brighter than stock so slow traffic stands out from the cognac motorways, and each route type has its own core colour.
