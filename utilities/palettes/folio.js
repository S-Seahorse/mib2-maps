// Folio, after the Folio theme of the map65 exam planner: the printed plate. Ink on warm paper,
// arterial red and venous blue from Gray's plates, ochre for bone; at night the radiograph,
// bone-white ink on blue-black film.
const { tint } = require('../lib/colour');

module.exports = {
  name: 'Folio',
  description: "After map65's Folio theme, Garamond-era print and Gray's Anatomy plates: ink on warm paper, arterial-red motorways, venous-blue main roads, an ink-black route and sepia relief; a radiograph at night, bone-white on blue-black film. Not yet tried on the car.",
  day: {
    land: '#F5F1E8', builtUp: '#EDE7DA', building: '#E2DCCD', cityModels: '#EFE9DC', cityModelsEdge: '#CDC5B3',
    park: '#E1E5D1', woodland: '#D4DCC2', green2: '#E4E7D6', glacier: '#FDFBF6', beach: '#F1E6C8',
    water: '#D6DEEA', sea: '#CDD7E6', airport: '#E8E2D4', aircraft: '#D7CFBE', industry: '#E6DFD1', place: '#EFE6E0',
    parking: '#E8E2D4', station: '#E5D9C3', pedestrian: '#FBF8F1',
    bridge: ['#75705F', '#EFE9DC'], bridgeShadow: '#CDC5B3',
    motorway: ['#9E2A24', '#D9786A'], dual: ['#2F4F8A', '#8EA4CC'], express: ['#A08640', '#F1E6C8'], country: ['#A08640', '#F7EFDA'], urban: ['#BCB29D', '#FDFBF6'],
    pedestrianRoad: ['#D9D1C0', '#FBF8F1'], footway: '#B7AE99', restricted: ['#CDC5B3', '#EFE9DC'], oneWay: '#75705F',
    rail: ['#1C1A16', '#FDFBF6'], tram: '#75705F', ferry: '#2F4F8A',
    boundary: '#6A4F8A', ink: '#1C1A16',
    text: '#1C1A16', halo: '#FBF8F1', cityText: '#1C1A16', areaText: '#3F6B5A', waterText: '#2F4F8A', waterHalo: '#F5F1E8',
    skyTop: '#E2DCCD', skyHorizon: '#F5F1E8', haze: '#EFE9DC',
    route: ['#1C1A16', '#9E2A24', '#3F6B5A', '#2F4F8A', '#7A5A2A'], alternatives: ['#3F6B5A', '#6A4F8A', '#9E2A24', '#7A5A2A', '#2F4F8A'], routeCore: '#F5F1E8',
    ok: '#3D6B3A', warnLight: '#C8963A', warn: '#9A6A14', danger: '#9E2A24', muted: '#8E8775', flowEdge: '#FBF8F1',
    trafficWash: 0.38,
    // relief in sepia, like an engraved plate
    dtm: tint([[0, '#F5F1E8'], [150, '#F2EDE2'], [400, '#E9DFCB'], [1000, '#DCCCAC'], [2000, '#C9B48E'], [3500, '#B39C78'], [5000, '#FDFBF6']]),
  },
  night: {
    land: '#0D1115', builtUp: '#141A20', building: '#1F2730', cityModels: '#232C36', cityModelsEdge: '#3A4652',
    park: '#121C1B', woodland: '#101918', green2: '#141E1D', glacier: '#2C343D', beach: '#1E1D17',
    water: '#0A1824', sea: '#08141F', airport: '#151B22', aircraft: '#1F2730', industry: '#161C23', place: '#181A22',
    parking: '#151B22', station: '#1D232B', pedestrian: '#11161B',
    bridge: ['#5A6470', '#1A2129'], bridgeShadow: '#05070A',
    motorway: ['#7A3A33', '#E8877A'], dual: ['#3A5578', '#8FB3E0'], express: ['#3A434D', '#5C6670'], country: ['#3A434D', '#56606A'], urban: ['#232A32', '#47515C'],
    pedestrianRoad: ['#232A32', '#2C343D'], footway: '#3A434D', restricted: ['#232A32', '#2C343D'], oneWay: '#A9B0B8',
    rail: ['#C9C4B8', '#1A2129'], tram: '#5C6670', ferry: '#8FB3E0',
    boundary: '#B79AD0', ink: '#E9E5DC',
    text: '#E9E5DC', halo: '#0D1115', cityText: '#E9E5DC', areaText: '#8FC4AD', waterText: '#8FB3E0', waterHalo: '#0D1115',
    skyTop: '#06080B', skyHorizon: '#141A20', haze: '#10151A',
    route: ['#E9E5DC', '#E8877A', '#8FC4AD', '#8FB3E0', '#D6B47A'], alternatives: ['#8FC4AD', '#B79AD0', '#E8877A', '#D6B47A', '#8FB3E0'], routeCore: '#8F98A3',
    ok: '#8FC18A', warnLight: '#E0B45E', warn: '#D99A4E', danger: '#E8877A', muted: '#8F98A3', flowEdge: '#0D1115',
    trafficWash: 0.3,
    dtm: tint([[0, '#0E1216'], [300, '#10151A'], [1000, '#141A20'], [2500, '#1A2129'], [5000, '#2C343D']]),
  },
};
