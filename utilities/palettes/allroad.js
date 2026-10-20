// Allroad, for the A4 allroad quattro: a luxury estate with an off-road side. Muted beiges and
// forest greens: oat and gravel land, deep fir and sage woodland, slate lakes, sand main roads and
// cognac motorways with a forest-green casing. At night, a forest after dark: green-black land,
// lifted forest greens and warm brass roads. The traffic colours are brighter than usual so slow
// traffic stands out from the cognac motorways.
const { mix, tint } = require('../lib/colour');

module.exports = {
  name: 'Allroad',
  description: "Muted beiges and forest greens for the A4 allroad: oat and gravel land, deep fir and sage woodland, slate lakes, sand main roads and cognac motorways with a forest-green casing, like the car's wheel-arch cladding; a forest after dark at night. Not yet tried on the car.",
  day: {
    land: '#ECE6D9', builtUp: '#E2DACB', building: '#D7CDBB', cityModels: '#E4DCCC', cityModelsEdge: '#BDB29E',
    park: '#ADC19B', woodland: '#8FA97F', green2: '#BDCBA9', glacier: '#F8F6F0', beach: '#EADFC2',
    water: '#B8CACA', sea: '#ACC0C2', airport: '#E3DCCD', aircraft: '#CFC5B2', industry: '#E0D8C8', place: '#E7DFD0',
    parking: '#DED6C6', station: '#DCD3C1', pedestrian: '#F3EEE3',
    bridge: ['#B8AD98', '#F1ECE1'], bridgeShadow: '#CFC6B4',
    // motorways: cognac with a forest-green casing, like the car's contrasting wheel-arch cladding
    motorway: ['#2A4A30', '#A87446'], dual: ['#A88D5E', '#EEE0BA'], express: ['#B1A386', '#F7F1E1'], country: ['#B1A386', '#F3EBD6'], urban: ['#C6BCA8', '#FFFDF7'],
    pedestrianRoad: ['#D9D1C1', '#F7F3EA'], footway: '#B5AA94', restricted: ['#CCC2AF', '#EDE7DA'], oneWay: '#857A66',
    rail: ['#6A6456', '#F6F2E9'], tram: '#948B7A', ferry: '#4D7A86',
    boundary: '#7D6274', ink: '#2B2A24',
    text: '#2B2A24', halo: '#FAF7F0', cityText: '#23251F', areaText: '#2C4A30', waterText: '#3E6670', waterHalo: '#F2F1EA',
    skyTop: '#C4D0CF', skyHorizon: '#EEE7D8', haze: '#E9E3D6',
    // routes as [edge, core]: alpine blue, copper, fir, plum and bronze
    route: [['#1F5A8C', '#7FB0DD'], ['#A65A2E', '#E5AE87'], ['#3F6E46', '#9CC7A2'], ['#6B5B8E', '#B7ACD8'], ['#8A6A2E', '#DCC38C']],
    alternatives: [['#3F6E46', '#9CC7A2'], ['#6B5B8E', '#B7ACD8'], ['#A65A2E', '#E5AE87'], ['#8A6A2E', '#DCC38C'], ['#1F5A8C', '#7FB0DD']],
    ok: '#3E9A4E', warnLight: '#F2C230', warn: '#F28A1C', danger: '#C0281E', muted: '#8C8474', flowEdge: '#FAF7F0',
    trafficWash: 0.38,
    // flat land up close, a little darker on high ground; earthy height tints further out
    dtm: (h, res) => (res < 100 ? (h > 300 ? mix('#ECE6D9', '#E5DDC9', Math.min(1, (h - 300) / 400)) : '#ECE6D9')
      : tint([[0, '#E6E4D2'], [200, '#ECE6D7'], [500, '#E6DCC4'], [1000, '#DACBAA'], [1500, '#CDB994'], [2200, '#BDA98A'], [3500, '#B3A99A'], [5000, '#F6F4EE']])(h)),
  },
  night: {
    land: '#141712', builtUp: '#1C201A', building: '#272C24', cityModels: '#2A2F27', cityModelsEdge: '#3A4035',
    park: '#243A29', woodland: '#1F3324', green2: '#22362A', glacier: '#2A2E28', beach: '#2A2619',
    water: '#0F1A1C', sea: '#0C1618', airport: '#1E211C', aircraft: '#2A2E27', industry: '#1D201B', place: '#1F221D',
    parking: '#1D201B', station: '#262A22', pedestrian: '#191C17',
    bridge: ['#3A3F35', '#252A22'], bridgeShadow: '#0A0C09',
    motorway: ['#4E7A55', '#A9733F'], dual: ['#5E4E32', '#93805B'], express: ['#3E4238', '#4C5044'], country: ['#3E4238', '#4A4A3C'], urban: ['#262A23', '#3D4238'],
    pedestrianRoad: ['#262A23', '#2C3028'], footway: '#41463B', restricted: ['#262A23', '#2A2E26'], oneWay: '#9A9484',
    rail: ['#9A9484', '#252A22'], tram: '#6E6A5E', ferry: '#79A6B0',
    boundary: '#B39AB0', ink: '#E7E1D3',
    text: '#E7E1D3', halo: '#141712', cityText: '#EDE4CF', areaText: '#8FB58A', waterText: '#86AEB6', waterHalo: '#0F1A1C',
    skyTop: '#080A08', skyHorizon: '#1C231C', haze: '#161A15',
    route: [['#5FA0D6', '#A9D0F0'], ['#D98A5A', '#F2C2A2'], ['#86B886', '#C2E0C2'], ['#A897D0', '#D6CCEE'], ['#D6B46A', '#EDD9A8']],
    alternatives: [['#86B886', '#C2E0C2'], ['#A897D0', '#D6CCEE'], ['#D98A5A', '#F2C2A2'], ['#D6B46A', '#EDD9A8'], ['#5FA0D6', '#A9D0F0']],
    ok: '#7CC487', warnLight: '#F5CF4A', warn: '#FF9A3D', danger: '#FF6F61', muted: '#948E80', flowEdge: '#141712',
    trafficWash: 0.3,
    // flat land up close, height tints further out
    dtm: (h, res) => (res < 100 ? '#141712' : tint([[0, '#151913'], [500, '#191B15'], [1500, '#1F1F18'], [3000, '#26261F'], [5000, '#30302A']])(h)),
  },
};
