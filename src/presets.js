import { SCOPES, SECTION_IDS } from './params.js'
import { ids } from './config.js'
import { COLORS, FEEDBACK_STYLES } from './feedbacks.js'

/**
 * Ready-made buttons for the Presets tab.
 * @param {string} label  the connection label, used to reference this module's variables
 * @returns {{structure: object[], presets: Record<string, object>}}
 */
export function getPresets(label, config) {
	const v = (name) => `$(${label}:${name})`
	const presets = {}
	const sections = new Map()

	const button = (id, section, name, text, down, feedbacks = [], size = 'auto') => {
		presets[id] = {
			type: 'simple',
			name,
			style: { text, size, color: COLORS.white, bgcolor: COLORS.dim },
			steps: [{ down, up: [] }],
			feedbacks,
		}
		if (!sections.has(section)) sections.set(section, [])
		sections.get(section).push(id)
	}
	const act = (actionId, options = {}) => ({ actionId, options })
	const fb = (feedbackId, options = {}, style = FEEDBACK_STYLES[feedbackId]) => ({ feedbackId, options, style })
	const amber = { bgcolor: COLORS.amber, color: COLORS.black }

	button(
		'arm',
		'Capture',
		'Arm capture',
		`CAPTURE\\n${v('state')}`,
		[act('arm')],
		[
			fb('state', { state: 'armed' }),
			fb('state', { state: 'capturing' }, amber),
			fb('state', { state: 'holding' }, amber),
		],
	)
	button(
		'capture_touched',
		'Capture',
		'Capture last touched',
		`GRAB\\n${v('touched')}`,
		[act('capture_touched')],
		[fb('state', { state: 'busy' }, amber)],
	)
	button('cancel', 'Capture', 'Cancel', 'CANCEL', [act('cancel')])
	button(
		'target',
		'Capture',
		'Recall target',
		`TO\\n${v('target')}`,
		[act('target', { mode: 'toggle' })],
		[fb('target_touched')],
	)

	for (const scope of SCOPES) {
		button(
			`scope_${scope.id}`,
			'Recall scope',
			scope.label,
			scope.label,
			[act('scope', { scope: scope.id, mode: 'toggle' })],
			[fb('scope', { scope: scope.id })],
			'14', // the largest size at which five letters (LEVEL, DELAY, OTHER) stay on one line
		)
	}

	for (const i of ids(config.slotCount)) {
		button(
			`slot_${i}`,
			'Slots',
			`Slot ${i}`,
			`${i}\\n${v(`slot_${i}`)}`,
			[act('slot', { slot: i })],
			[fb('slot_used', { slot: i }), fb('slot_last', { slot: i })],
		)
	}
	for (const i of ids(config.slotCount)) {
		button(`clear_slot_${i}`, 'Clear slots', `Clear slot ${i}`, `CLEAR\\n${i}`, [act('clear_slot', { slot: i })])
	}

	button(
		'script_record',
		'Scripts',
		'Record script',
		`SCRIPT\\nREC ${v('script_steps')}`,
		[act('script_record')],
		[fb('script_recording'), fb('script_waiting')],
	)
	for (const i of ids(config.scriptCount)) {
		button(
			`script_${i}`,
			'Scripts',
			`Script ${i}`,
			`S${i}\\n${v(`script_${i}`)}`,
			[act('script', { script: i })],
			[fb('script_used', { script: i })],
		)
	}
	for (const i of ids(config.scriptCount)) {
		button(`clear_script_${i}`, 'Scripts', `Clear script ${i}`, `CLEAR\\nS${i}`, [act('clear_script', { script: i })])
	}

	button(
		'names_record',
		'Names',
		'Save names',
		`SAVE\\nNAMES ${v('names_count')}`,
		[act('names_record')],
		[fb('names_recording')],
	)
	button(
		'names_add_all',
		'Names',
		'Add all names',
		'ALL\\nNAMES',
		[act('names_add_all', { sections: SECTION_IDS })],
		[fb('names_recording', {}, amber)],
	)
	for (const i of ids(config.nameSetCount)) {
		button(
			`names_set_${i}`,
			'Names',
			`Name set ${i}`,
			`N${i}\\n${v(`nameset_${i}`)}`,
			[act('names_set', { set: i, sections: SECTION_IDS })],
			[fb('nameset_used', { set: i })],
		)
	}

	const structure = [...sections.entries()].map(([name, list]) => {
		const id = name.toLowerCase().replace(/\W+/g, '_')
		return { id, name, definitions: [{ id: `${id}_all`, name, type: 'simple', presets: list }] }
	})
	return { structure, presets }
}
