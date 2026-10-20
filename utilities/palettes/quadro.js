// Quadro, after the Quadro theme of the map65 exam planner: Mac OS 8–9 Platinum, modernised.
// A platinum desk and white windows, hairline outlines, the lavender selection highlight, the
// clear focus blue and a Stickies-note yellow; at night, near-black warm graphite.
const { mix, tint } = require('../lib/colour');

module.exports = {
  name: 'Quadro',
  description: "After map65's Quadro theme, a modern take on Mac OS 8–9 Platinum: white roads with hairline outlines on a platinum desk, lavender motorways, Stickies-yellow main roads and a focus-blue route; warm graphite at night. Not yet tried on the car.",
  day: {
    land: '#EFEDE8', builtUp: '#E3DFD7', building: '#FCFBF9', cityModels: '#F7F6F2', cityModelsEdge: '#CFCBC2',
    park: '#D7E3D2', woodland: '#C7D8C4', green2: '#DCE6D6', glacier: '#FCFBF9', beach: '#FAF1BC',
    water: '#CBD8EC', sea: '#C3D2EA', airport: '#E2DFD8', aircraft: '#D3CFC6', industry: '#E2DFD8', place: '#E9E4F2',
    parking: '#E2DFD8', station: '#DEDCF8', pedestrian: '#F3F1EC',
    bridge: ['#CBC7BE', '#F1EFEA'], bridgeShadow: '#D3CFC6',
    motorway: ['#5B58C4', '#DEDCF8'], dual: ['#C9B45A', '#FAF1BC'], express: ['#A9A499', '#FFFFFF'], country: ['#A9A499', '#FDF8D6'], urban: ['#B9B4AA', '#FFFFFF'],
    pedestrianRoad: ['#DFDCD5', '#F8F7F3'], footway: '#BCB8AF', restricted: ['#CFCBC2', '#EFEDE8'], oneWay: '#8A8679',
    rail: ['#6E6A62', '#FCFBF9'], tram: '#9A968C', ferry: '#3F6AA6',
    boundary: '#8A5A9C', ink: '#1E1C19',
    text: '#1E1C19', halo: '#FCFBF9', cityText: '#1E1C19', areaText: '#3F7A6B', waterText: '#3F6AA6', waterHalo: '#FCFBF9',
    skyTop: '#DEDCF8', skyHorizon: '#F5F4F0', haze: '#F1EFEA',
    route: ['#3D73C4', '#B0603A', '#3F7A6B', '#5B58C4', '#8A5A9C'], alternatives: ['#3F7A6B', '#8A5A9C', '#B0603A', '#6E6A62', '#5B58C4'], routeCore: '#FFFFFF',
    ok: '#2E7D32', warnLight: '#D8A633', warn: '#A36C00', danger: '#B3261E', muted: '#8A8679', flowEdge: '#FCFBF9',
    trafficWash: 0.35,
    // flat land up close (under 100 m a pixel), greying a little on high ground; height tints further out
    dtm: (h, res) => (res < 100 ? (h > 150 ? mix('#EFEDE8', '#E2E6DD', Math.min(1, (h - 150) / 250)) : '#EFEDE8') : tint([[0, '#E4EADF'], [200, '#E9E7DD'], [600, '#E3DCCB'], [1500, '#D7CDB8'], [3000, '#CFC6B6'], [5000, '#FCFBF9']])(h)),
  },
  night: {
    land: '#131211', builtUp: '#1D1C1A', building: '#2C2A27', cityModels: '#2A2825', cityModelsEdge: '#3A3733',
    park: '#1C2621', woodland: '#18211C', green2: '#1E2822', glacier: '#2C2A27', beach: '#2F2A17',
    water: '#18202E', sea: '#151C2A', airport: '#232120', aircraft: '#2C2A27', industry: '#22201E', place: '#221F2A',
    parking: '#22201E', station: '#2A2850', pedestrian: '#1A1917',
    bridge: ['#3A3733', '#26241F'], bridgeShadow: '#0E0D0C',
    motorway: ['#A3A0F0', '#35336A'], dual: ['#E5B95A', '#4A421E'], express: ['#4A4640', '#34312D'], country: ['#4A4640', '#332E22'], urban: ['#2A2826', '#3A3733'],
    pedestrianRoad: ['#2A2826', '#262422'], footway: '#4A4640', restricted: ['#2A2826', '#262422'], oneWay: '#948F85',
    rail: ['#948F85', '#262422'], tram: '#6E6A62', ferry: '#86AEE6',
    boundary: '#C49AD6', ink: '#ECE8E0',
    text: '#ECE8E0', halo: '#131211', cityText: '#ECE8E0', areaText: '#7FBFAE', waterText: '#86AEE6', waterHalo: '#131211',
    skyTop: '#0B0A0A', skyHorizon: '#1D1C1A', haze: '#171615',
    route: ['#74A6EA', '#E0946A', '#7FBFAE', '#A3A0F0', '#C49AD6'], alternatives: ['#7FBFAE', '#C49AD6', '#E0946A', '#A8A399', '#A3A0F0'], routeCore: '#ECE8E0',
    ok: '#8FCE86', warnLight: '#E5B95A', warn: '#E09A3E', danger: '#F08A80', muted: '#948F85', flowEdge: '#131211',
    trafficWash: 0.3,
    // flat land up close, height tints further out
    dtm: (h, res) => (res < 100 ? (h > 150 ? mix('#131211', '#171A16', Math.min(1, (h - 150) / 250)) : '#131211') : tint([[0, '#151714'], [600, '#191814'], [2000, '#1F1C17'], [5000, '#2C2A27']])(h)),
  },
};
