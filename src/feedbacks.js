import { SCOPE_CHOICES, slotOption, scriptOption, setOption } from './actions.js'

const rgb = (r, g, b) => (r << 16) | (g << 8) | b

export const COLORS = {
	white: rgb(255, 255, 255),
	black: rgb(0, 0, 0),
	red: rgb(200, 0, 0),
	amber: rgb(220, 140, 0),
	green: rgb(0, 140, 60),
	blue: rgb(0, 90, 200),
	purple: rgb(120, 50, 170),
	dim: rgb(40, 40, 40),
}

/** Button style used when each feedback is true. Presets reuse these. */
export const FEEDBACK_STYLES = {
	state: { bgcolor: COLORS.red, color: COLORS.white },
	slot_used: { bgcolor: COLORS.green, color: COLORS.white },
	slot_last: { bgcolor: COLORS.blue, color: COLORS.white },
	scope: { bgcolor: COLORS.amber, color: COLORS.black },
	target_touched: { bgcolor: COLORS.purple, color: COLORS.white },
	script_recording: { bgcolor: COLORS.red, color: COLORS.white },
	script_waiting: { bgcolor: COLORS.amber, color: COLORS.black },
	script_used: { bgcolor: COLORS.purple, color: COLORS.white },
	nameset_used: { bgcolor: COLORS.green, color: COLORS.white },
	names_recording: { bgcolor: COLORS.red, color: COLORS.white },
}

/** @param {{engine: import('./engine.js').Engine | null}} self */
export function getFeedbacks(self) {
	const e = () => self.engine
	const boolean = (id, name, options, callback) => ({
		type: 'boolean',
		name,
		defaultStyle: FEEDBACK_STYLES[id],
		options,
		callback: (feedback) => !!e() && !!callback(feedback.options),
	})

	return {
		state: boolean(
			'state',
			'Capture state',
			[
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'armed',
					choices: [
						{ id: 'armed', label: 'Armed, waiting for a touch' },
						{ id: 'capturing', label: 'Reading the channel' },
						{ id: 'holding', label: 'Captured, waiting for a slot' },
						{ id: 'busy', label: 'Any of the above' },
					],
				},
			],
			(o) => (o.state === 'busy' ? e().mode !== 'idle' : e().mode === o.state),
		),
		slot_used: boolean('slot_used', 'Slot has a capture', [slotOption], (o) => e().lib.slots[String(o.slot)]),
		slot_last: boolean(
			'slot_last',
			'Slot was the last one recalled',
			[slotOption],
			(o) => e().lastRecalled === String(o.slot),
		),
		scope: boolean(
			'scope',
			'Recall scope is on',
			[{ type: 'dropdown', id: 'scope', label: 'Scope', default: 'eq', choices: SCOPE_CHOICES }],
			(o) => e().scopes.has(String(o.scope)),
		),
		target_touched: boolean(
			'target_touched',
			'Recall target is the last touched channel',
			[],
			() => e().targetMode === 'touched',
		),
		script_recording: boolean('script_recording', 'Script is recording', [], () => e().scriptRec),
		script_waiting: boolean('script_waiting', 'Script recorded, waiting for a script button', [], () => e().scriptHeld),
		script_used: boolean(
			'script_used',
			'Script slot has a script',
			[scriptOption],
			(o) => e().lib.scripts[String(o.script)],
		),
		names_recording: boolean('names_recording', 'Names are being saved (tap solos)', [], () => e().namesRec),
		nameset_used: boolean('nameset_used', 'Name set has names', [setOption], (o) => e().lib.nameSets[String(o.set)]),
	}
}
