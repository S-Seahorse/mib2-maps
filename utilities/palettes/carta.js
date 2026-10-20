// Carta, after the Carta theme of the map65 exam planner: the atlas. Ivory paper, ultramarine
// ink and antique gold, atlas inks and hypsometric tints; at night the planetarium, navy under a
// gold-lit sky.
const { tint } = require('../lib/colour');

module.exports = {
  name: 'Carta',
  description: "After map65's Carta theme, an atlas and encyclopaedia look: ivory paper, ultramarine ink and antique gold, atlas-red motorways, gold main roads and height tints; a navy planetarium at night with gold place names. Not yet tried on the car.",
  day: {
    land: '#F6F2E7', builtUp: '#F0E6CE', building: '#E4D7B8', cityModels: '#EFE6D2', cityModelsEdge: '#D8CBA8',
    park: '#D5E6C0', woodland: '#C2DAA9', green2: '#DCEAC6', glacier: '#FFFFFF', beach: '#F6E7B8',
    water: '#C4D9EF', sea: '#B8D1EC', airport: '#E7E1D2', aircraft: '#D6CEBB', industry: '#E5DCCA', place: '#EDE3D6',
    parking: '#E7E1D2', station: '#E2D3AE', pedestrian: '#FBF9F4',
    bridge: ['#B8A27A', '#F3EFE4'], bridgeShadow: '#D6CEBB',
    motorway: ['#B9472E', '#E8836A'], dual: ['#8A6208', '#E7B84E'], express: ['#B8964A', '#FBEAB8'], country: ['#B8964A', '#FFF4D6'], urban: ['#CBBE9F', '#FFFFFF'],
    pedestrianRoad: ['#E3DBC8', '#FBF9F4'], footway: '#C9BFA6', restricted: ['#D8CFBB', '#F3EFE4'], oneWay: '#5A677E',
    rail: ['#2F3D55', '#FFFFFF'], tram: '#7A8496', ferry: '#1F5A9E',
    boundary: '#7D4A8F', ink: '#14223A',
    text: '#14223A', halo: '#FFFFFF', cityText: '#14223A', areaText: '#177A68', waterText: '#1F5A9E', waterHalo: '#F3F7FC',
    skyTop: '#9EBFE6', skyHorizon: '#F6E3B4', haze: '#F8EBCB',
    route: ['#1C4F9C', '#B9472E', '#177A68', '#4A4AA3', '#7D4A8F'], alternatives: ['#177A68', '#7D4A8F', '#B9472E', '#B8860B', '#4A4AA3'], routeCore: '#FFFFFF',
    ok: '#2F7A45', warnLight: '#D9A23A', warn: '#A86F0C', danger: '#B3392D', muted: '#8C96A8', flowEdge: '#FFFFFF',
    trafficWash: 0.38,
    // hypsometric tints, as in a school atlas
    dtm: tint([[0, '#D3E3B9'], [100, '#DCE7BC'], [200, '#E8EAC0'], [500, '#F0E2B0'], [1000, '#E6CC98'], [1500, '#D9B482'], [2000, '#C99C6E'], [3000, '#B38A6A'], [4000, '#D9CFC4'], [5000, '#FBFAF6']]),
  },
  night: {
    land: '#0A1325', builtUp: '#121E37', building: '#1C2C4C', cityModels: '#1A2946', cityModelsEdge: '#26375A',
    park: '#0E2230', woodland: '#0C1E2B', green2: '#10263A', glacier: '#26375A', beach: '#2A2814',
    water: '#06101F', sea: '#050C19', airport: '#14213B', aircraft: '#1C2C4C', industry: '#13203A', place: '#162241',
    parking: '#13203A', station: '#2A2B3E', pedestrian: '#101B33',
    bridge: ['#26375A', '#16243F'], bridgeShadow: '#04080F',
    motorway: ['#8A6A20', '#E2B04A'], dual: ['#5E4A16', '#B88A3A'], express: ['#2E4166', '#3A4A6A'], country: ['#2E4166', '#3B4258'], urban: ['#1C2A47', '#2B3D63'],
    pedestrianRoad: ['#1C2A47', '#1A2741'], footway: '#2E4166', restricted: ['#1C2A47', '#182640'], oneWay: '#8A98B3',
    rail: ['#8A98B3', '#16243F'], tram: '#56667F', ferry: '#78A8F0',
    boundary: '#C69AD8', ink: '#E3EAF6',
    text: '#E3EAF6', halo: '#0A1325', cityText: '#ECC46A', areaText: '#56C2A8', waterText: '#78A8F0', waterHalo: '#050C19',
    skyTop: '#060C1C', skyHorizon: '#0F1E3E', haze: '#0E1A33',
    route: ['#4C83DC', '#F08A6C', '#56C2A8', '#A0A0EC', '#C69AD8'], alternatives: ['#56C2A8', '#C69AD8', '#F08A6C', '#E2B04A', '#A0A0EC'], routeCore: '#E3EAF6',
    ok: '#72C98A', warnLight: '#ECC46A', warn: '#E2B04A', danger: '#F08878', muted: '#8A98B3', flowEdge: '#0A1325',
    trafficWash: 0.3,
    dtm: tint([[0, '#0B1628'], [200, '#0D192C'], [1000, '#121D30'], [2000, '#182235'], [4000, '#26375A']]),
  },
};
