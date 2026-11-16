// Parameter map for the DiGiCo SD / Quantum "iPad" OSC protocol.
//
// Addresses look like /<Section>/<number>/<suffix>, e.g. /Input_Channels/12/EQ/eq_gain_2.
// This file lists, per section, the suffixes that make up "the whole channel" for capture.
//
// Where the names come from:
// - Parameter names (eq_gain_2, comp_thresh_1 ...) and how many of each there are were
//   checked on 2026-11-16 against the consoles' own iPad command sets: Quantum 338
//   (IPAD_Q3), SD5/SD7/SD10 and SD8/SD9/SD11/SD12, the last two in both their older and
//   "V2" versions. `node tools/check-dosc.mjs <file>` repeats that check for any console's
//   command set.
// - Those files show two families that differ only on busses (groups, auxes, matrices):
//   "large"   Quantum 338, SD5, SD7, SD10: eight-band EQ with a pre/post-insert switch,
//             no separate filters
//   "compact" SD8, SD9, SD11, SD12: four-band EQ plus high and low pass filters
//   The table below lists both. The engine notices which addresses a console never
//   answers and stops asking for them (see Engine.captureChannel).
// - Section names (Input_Channels ...) and block names (Channel_Input, EQ, Dynamics ...)
//   are not in that file, which only numbers them. They follow the table published in the
//   MIT-licensed companion-module-digico-osc project (Andrew Broughton), built by
//   observing the iPad app.
// Anything a console doesn't answer is simply left out of the capture.

export const SECTIONS = {
	Input_Channels: { label: 'Input', short: 'In', name: 'Channel_Input/name' },
	Group_Outputs: { label: 'Group', short: 'Grp', name: 'Buss_Trim/name' },
	Aux_Outputs: { label: 'Aux', short: 'Aux', name: 'Buss_Trim/name' },
	Matrix_Outputs: { label: 'Matrix', short: 'Mtx', name: 'Buss_Trim/name' },
	Graphic_EQ: { label: 'Graphic EQ', short: 'GEQ', name: 'name' },
	Control_Groups: { label: 'Control Group', short: 'CG', name: 'name' },
}

export const SECTION_IDS = Object.keys(SECTIONS)

/** Used when the console doesn't report how many of something it has. */
export const FALLBACK_COUNTS = {
	Input_Channels: 48,
	Group_Outputs: 16,
	Aux_Outputs: 16,
	Matrix_Outputs: 8,
	Graphic_EQ: 16,
	Control_Groups: 12,
}

export const SCOPES = [
	{ id: 'eq', label: 'EQ' },
	{ id: 'comp', label: 'COMP' },
	{ id: 'gate', label: 'GATE' },
	{ id: 'level', label: 'LEVEL' },
	{ id: 'aux', label: 'AUX' },
	{ id: 'gain', label: 'GAIN' },
	{ id: 'pan', label: 'PAN' },
	{ id: 'delay', label: 'DELAY' },
	{ id: 'name', label: 'NAME' },
	{ id: 'other', label: 'OTHER' },
]
export const SCOPE_IDS = SCOPES.map((s) => s.id)

const bands = (names, n) => names.flatMap((name) => Array.from({ length: n }, (_, i) => `${name}_${i + 1}`))

const FILTERS = ['Filters/hi_filter_in', 'Filters/hi_filter_freq', 'Filters/lo_filter_in', 'Filters/lo_filter_freq']

// Every EQ band has these; only the first four bands can be dynamic.
const eq = (bandCount) => [
	'EQ/eq_in',
	...bands(['EQ/eq_on', 'EQ/eq_freq', 'EQ/eq_gain', 'EQ/eq_Q', 'EQ/eq_curve', 'EQ/eq_symm_Q'], bandCount),
	...bands(['EQ/dynamic_eq_on', 'EQ/eq_thresh', 'EQ/eq_ratio', 'EQ/eq_attack', 'EQ/eq_release', 'EQ/eq_over-under'], 4),
]

// Inputs have a four-band EQ plus high and low pass filters on every console. Busses
// differ by family, so both forms are listed: see onFamily below.
const EQ = [...eq(4), ...FILTERS]
const BUSS_EQ = [...eq(8), 'EQ/eq_pre-ins', ...FILTERS]

const BUSSES = ['Group_Outputs', 'Aux_Outputs', 'Matrix_Outputs']

/**
 * Whether a console family has an address, going by DiGiCo's command sets.
 * @param {'large'|'compact'} family  large: Quantum 338, SD5/7/10. compact: SD8/9/11/12.
 */
export function onFamily(family, section, suffix) {
	if (!BUSSES.includes(section)) return true
	if (suffix.startsWith('Filters/')) return family === 'compact'
	if (suffix === 'EQ/eq_pre-ins' || /^EQ\/eq_(on|freq|gain|Q|curve|symm_Q)_[5-8]$/.test(suffix))
		return family === 'large'
	return true
}

const COMP = [
	'Dynamics/comp-multiband-desser',
	'Dynamics/comp_in',
	'Dynamics/comp_all_thresh',
	'Dynamics/comp_all_gain',
	'Dynamics/comp_HP_crossover',
	'Dynamics/comp_LP_crossover',
	...bands(['Dynamics/comp_thresh', 'Dynamics/comp_attack', 'Dynamics/comp_release', 'Dynamics/comp_band_in'], 3),
	...bands(['Dynamics/comp_ratio', 'Dynamics/comp_gain', 'Dynamics/comp_knee', 'Dynamics/comp_auto-gain'], 4),
	'Dynamics/desser_centre_freq',
	'Dynamics/desser_freq_width',
]

const GATE = [
	'Dynamics/gate-duck-comp',
	'Dynamics/gate_in',
	'Dynamics/gate_thresh',
	'Dynamics/gate_range',
	'Dynamics/gate_attack',
	'Dynamics/gate_hold',
	'Dynamics/gate_release',
	'Dynamics/gate_centre_freq',
	'Dynamics/gate_freq_width',
]

const STRIP = [
	'fader',
	'mute',
	'Channel_Delay/delay_on',
	'Channel_Delay/delay',
	'Channel_Delay/fine_delay',
	'Insert/insert_A_in',
	'Insert/insert_B_in',
]

// "#" is replaced by each aux number at capture time.
const INPUT_SENDS = ['Aux_Send/#/send_on', 'Aux_Send/#/send_level', 'Aux_Send/#/send_pan']
const GROUP_SENDS = [...INPUT_SENDS, 'Aux_Send/#/send_pre-post']

const BUSS = ['Buss_Trim/name', 'Buss_Trim/trim', 'Buss_Trim/phase', ...STRIP, ...BUSS_EQ, ...COMP, ...GATE]

// Deliberately not captured: phantom power, main/alt input switching and the alt-input
// preamp (recalling these by accident is how you hurt ribbon mics and ears), solo and
// listen states, meters, and routing.
const TABLE = {
	Input_Channels: [
		'Channel_Input/name',
		'Channel_Input/analog_gain',
		'Channel_Input/trim',
		'Channel_Input/input_pad',
		'Channel_Input/phase',
		'Panner/pan',
		...STRIP,
		...EQ,
		...COMP,
		...GATE,
		...INPUT_SENDS,
	],
	Group_Outputs: [...BUSS, ...GROUP_SENDS],
	Aux_Outputs: [...BUSS],
	Matrix_Outputs: [...BUSS],
	// DiGiCo's list names the trim "geq  trim", with two spaces
	Graphic_EQ: ['name', 'geq_in', 'geq__trim', ...bands(['geq_gain'], 32)],
	Control_Groups: ['name', 'fader', 'mute'],
}

/**
 * Every suffix to query when capturing one channel.
 * @param {string} section
 * @param {number} auxCount  how many aux sends to include
 * @param {string[]} [learned]  extra suffixes discovered by learn mode
 * @param {'large'|'compact'|null} [family]  leave out to get both families' addresses
 */
export function captureSuffixes(section, auxCount, learned = [], family = null) {
	const out = []
	for (const suffix of TABLE[section] ?? []) {
		if (family && !onFamily(family, section, suffix)) continue
		if (suffix.includes('#')) {
			for (let n = 1; n <= auxCount; n++) out.push(suffix.replace('#', String(n)))
		} else out.push(suffix)
	}
	for (const suffix of learned) if (!out.includes(suffix)) out.push(suffix)
	return out
}

export function isKnownSuffix(section, suffix) {
	const generic = suffix.replace(/^(Aux_Send)\/\d+\//, '$1/#/')
	return (TABLE[section] ?? []).includes(generic)
}

/** Which recall toggle governs a given suffix. */
export function scopeOf(suffix) {
	if (/(^|\/)name$/.test(suffix)) return 'name'
	if (/^Aux_Send\//.test(suffix)) return 'aux'
	if (/^(EQ|Filters)\//.test(suffix) || /^geq_/.test(suffix)) return 'eq'
	if (/^Dynamics\/gate/.test(suffix)) return 'gate'
	if (/^Dynamics\//.test(suffix)) return 'comp'
	if (/^(fader|mute|hard_mute)$/.test(suffix)) return 'level'
	if (/^Panner\//.test(suffix)) return 'pan'
	if (/^Channel_Delay\//.test(suffix)) return 'delay'
	if (/^(Channel_Input|Buss_Trim)\/(analog_gain|trim|input_pad|phase)$/.test(suffix)) return 'gain'
	return 'other'
}

/** Things that arrive from the console but must never be treated as settings. */
export const NEVER_LEARN = /meter|solo|listen|name|phantom|alt_|main\/|_Send\/|sends|CGs_|stereo_mode|input_type/i

const ADDRESS = new RegExp(`^/(${SECTION_IDS.join('|')})/(\\d+)/(.+)$`)

/** Split a console address into section, channel number and suffix. */
export function parseAddress(path) {
	const m = ADDRESS.exec(path)
	return m ? { section: m[1], index: Number(m[2]), suffix: m[3] } : null
}

export function describe(section, index, name) {
	const s = SECTIONS[section]
	return `${s ? s.short : section} ${index}${name ? ` ${name}` : ''}`
}

// Meter addresses to ask for during a meter capture. The names are the meter-type entries
// in the Quantum 338 iPad command set; how the console delivers their values has not been
// seen on a console with audio, which is what the capture is for. Reads only: each is
// sent as a "<address>/?" query.
const DYN_METERS = [
	'Dynamics/gate_meter',
	'Dynamics/input_meter/left',
	'Dynamics/input_meter/right',
	'fader_meter/left',
	'fader_meter/right',
	'Output/meter/left',
	'Output/meter/right',
	...bands(['Dynamics/GR_meter', 'EQ/GR_meter'], 4),
]
const INPUT_METERS = [
	'Channel_Input/pre_meter/left',
	'Channel_Input/pre_meter/right',
	'Channel_Input/post_meter/left',
	'Channel_Input/post_meter/right',
	...DYN_METERS,
]
const BUSS_METERS = [
	'Buss_Trim/pre_meter',
	'Buss_Trim/pre_meter/right',
	'Buss_Trim/post_meter',
	'Buss_Trim/post_meter/right',
	'Buss_Trim/tube_meter/left',
	'Buss_Trim/tube_meter/right',
	'Output/dir_meter/left',
	'Output/dir_meter/right',
	...DYN_METERS,
]

export function meterSuffixes(section) {
	if (section === 'Input_Channels') return INPUT_METERS
	if (section === 'Group_Outputs' || section === 'Aux_Outputs' || section === 'Matrix_Outputs') return BUSS_METERS
	if (section === 'Graphic_EQ') return ['input_meter', 'output_meter']
	return []
}
