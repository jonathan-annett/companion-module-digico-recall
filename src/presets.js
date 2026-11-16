import { SCOPES, SECTION_IDS } from './params.js'
import { ids } from './config.js'
import { COLORS, FEEDBACK_STYLES, KIND_STYLES } from './feedbacks.js'

/**
 * Ready-made buttons for the Presets tab.
 * @param {string} label  the connection label, used to reference this module's variables
 * @returns {{structure: object[], presets: Record<string, object>}}
 */
export function getPresets(label, config) {
	const v = (name) => `$(${label}:${name})`
	const presets = {}
	const sections = new Map()

	const button = (id, section, name, text, down, feedbacks = [], size = 'auto', held = null) => {
		const step = { down, up: [] }
		// Actions run when the button has been held for this many milliseconds
		if (held) step[held.after] = { options: { runWhileHeld: true }, actions: held.actions }
		presets[id] = {
			type: 'simple',
			name,
			style: { text, size, color: COLORS.white, bgcolor: COLORS.dim },
			steps: [step],
			feedbacks,
		}
		if (!sections.has(section)) sections.set(section, [])
		sections.get(section).push(id)
	}
	const act = (actionId, options = {}) => ({ actionId, options })
	const fb = (feedbackId, options = {}, style = FEEDBACK_STYLES[feedbackId]) => ({ feedbackId, options, style })
	const amber = { bgcolor: COLORS.amber, color: COLORS.black }

	// Tap: start a capture. Hold for two seconds: clear mode, the next slot pressed is emptied.
	button(
		'arm',
		'Capture',
		'Capture (hold 2 s to clear a slot)',
		`CAPTURE\\n${v('state')}`,
		[act('arm')],
		[
			fb('state', { state: 'armed' }),
			fb('state', { state: 'capturing' }, amber),
			fb('state', { state: 'holding' }, amber),
			fb('state', { state: 'clearing' }, FEEDBACK_STYLES.clearing),
		],
		'auto',
		{ after: 2000, actions: [act('clear_mode')] },
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
	// The last touched input: fader to 0 dB, trim the other way, so the level stays and the fader is usable
	button('fader_unity', 'Level', 'Fader to unity, level kept (last touched input)', `UNITY\\n${v('touched')}`, [
		act('fader_unity'),
	])
	// The preamp, with the trim keeping the level: for an input that is clipping going in
	button('gain_down', 'Level', 'Gain down 1 dB, level kept (last touched input)', '⬇ GAIN ⬇\\n-1 dB', [
		act('gain_nudge', { step: -1 }),
	])
	button('gain_up', 'Level', 'Gain up 1 dB, level kept (last touched input)', '⬆ GAIN ⬆\\n+1 dB', [
		act('gain_nudge', { step: 1 }),
	])
	button('fader_unity_result', 'Level', 'What the last UNITY or GAIN key did', v('unity'), [], [], '7')
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

	// Build: things that end with "press a slot to store"
	button(
		'script_record',
		'Build',
		'Record script',
		`SCRIPT\\nREC ${v('script_steps')}`,
		[act('script_record')],
		[fb('script_recording'), fb('script_waiting')],
	)
	button(
		'names_record',
		'Build',
		'Save names',
		`SAVE\\nNAMES ${v('names_count')}`,
		[act('names_record')],
		[fb('names_recording')],
	)
	button(
		'names_add_all',
		'Build',
		'Add all names',
		'ALL\\nNAMES',
		[act('names_add_all', { sections: SECTION_IDS })],
		[fb('names_recording', {}, amber)],
	)

	// Log: the audit trail
	button(
		'audit',
		'Log',
		'Audit log on / off',
		`LOG\\n${v('audit')}`,
		[act('audit', { mode: 'toggle' })],
		[fb('audit_on')],
	)
	button('audit_last', 'Log', 'Latest change', v('audit_last'), [], [fb('audit_on')], '7')
	button(
		'meter_capture',
		'Log',
		'Capture meter data for 10 s (diagnostic)',
		'METER\\nCAPTURE',
		[act('meter_capture', { seconds: 10 })],
		[fb('meter_capturing')],
	)

	// One kind of slot. Its colour says what it holds; yellow text marks the last one recalled.
	for (const i of ids(config.slotCount)) {
		button(
			`slot_${i}`,
			'Slots',
			`Slot ${i}`,
			`${i}\\n${v(`slot_${i}`)}`,
			[act('slot', { slot: i })],
			[
				...Object.keys(KIND_STYLES).map((kind) => fb('slot_kind', { slot: i, kind }, KIND_STYLES[kind])),
				fb('slot_last', { slot: i }),
			],
		)
	}

	const structure = [...sections.entries()].map(([name, list]) => {
		const id = name.toLowerCase().replace(/\W+/g, '_')
		return { id, name, definitions: [{ id: `${id}_all`, name, type: 'simple', presets: list }] }
	})
	return { structure, presets }
}
