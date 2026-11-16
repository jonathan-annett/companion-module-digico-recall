import { SECTIONS, SECTION_IDS, SCOPES } from './params.js'

export const SECTION_CHOICES = SECTION_IDS.map((id) => ({ id, label: SECTIONS[id].label }))
export const SCOPE_CHOICES = SCOPES.map((s) => ({ id: s.id, label: s.label }))

export const slotOption = { type: 'number', id: 'slot', label: 'Slot', default: 1, min: 1, max: 999 }
export const scriptOption = { type: 'number', id: 'script', label: 'Script', default: 1, min: 1, max: 999 }
export const setOption = { type: 'number', id: 'set', label: 'Name set', default: 1, min: 1, max: 999 }

const sectionsOption = {
	type: 'multidropdown',
	id: 'sections',
	label: 'Which names',
	default: SECTION_IDS,
	choices: SECTION_CHOICES,
}
const list = (value) => [].concat(value ?? []).map(String)

/** @param {{engine: import('./engine.js').Engine | null}} self */
export function getActions(self) {
	const e = () => self.engine
	// Adding a channel is allowed whenever names aren't being collected; a capture can hold several
	const canCapture = () => e() && !e().namesRec && !e().clearMode

	return {
		arm: {
			name: 'Capture: arm (each touched channel is read)',
			description:
				'Press, then nudge a fader or hit solo on each channel you want, then press a slot. Press again to cancel.',
			options: [],
			callback: async () => e()?.toggleArm(),
		},
		capture: {
			name: 'Capture: add a specific channel',
			options: [
				{ type: 'dropdown', id: 'section', label: 'Type', default: 'Input_Channels', choices: SECTION_CHOICES },
				{ type: 'number', id: 'index', label: 'Number', default: 1, min: 1, max: 512 },
			],
			callback: async (action) => {
				if (canCapture()) await e().captureToHold(String(action.options.section), Number(action.options.index))
			},
		},
		capture_touched: {
			name: 'Capture: add the last touched channel',
			options: [],
			callback: async () => {
				const t = e()?.lastTouched
				if (t && canCapture()) await e().captureToHold(t.section, t.index)
			},
		},
		slot: {
			name: 'Slot: store (if a capture is waiting) or recall',
			options: [slotOption],
			callback: async (action) => {
				e()?.pressSlot(Number(action.options.slot))
			},
		},
		clear_slot: {
			name: 'Slot: clear',
			options: [slotOption],
			callback: async (action) => e()?.clearSlot(Number(action.options.slot)),
		},
		scope: {
			name: 'Recall scope: switch one on or off',
			options: [
				{ type: 'dropdown', id: 'scope', label: 'Scope', default: 'eq', choices: SCOPE_CHOICES },
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Action',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
				},
			],
			callback: async (action) => e()?.setScope(String(action.options.scope), String(action.options.mode)),
		},
		scopes: {
			name: 'Recall scope: set exactly these',
			options: [{ type: 'multidropdown', id: 'scopes', label: 'Scopes', default: ['eq'], choices: SCOPE_CHOICES }],
			callback: async (action) => e()?.setScopes(list(action.options.scopes)),
		},
		target: {
			name: 'Recall target: original channel or last touched channel',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Target',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'original', label: 'Original channel' },
						{ id: 'touched', label: 'Last touched channel' },
					],
				},
			],
			callback: async (action) => e()?.setTargetMode(String(action.options.mode)),
		},
		script_record: {
			name: 'Script: start / finish recording',
			description: 'Start, press the slots you want (with the scopes you want), finish, then press a script button.',
			options: [],
			callback: async () => e()?.toggleScriptRecord(),
		},
		script: {
			name: 'Script: store (if a recording is waiting) or run',
			options: [scriptOption],
			callback: async (action) => {
				e()?.pressScript(Number(action.options.script))
			},
		},
		clear_script: {
			name: 'Script: clear',
			options: [scriptOption],
			callback: async (action) => e()?.clearScript(Number(action.options.script)),
		},
		names_record: {
			name: 'Names: start saving names (tap solo on each channel)',
			description:
				'Press, then tap solo (or move anything) on each channel whose name you want. Then press a name set button to store the list. Press again to cancel.',
			options: [],
			callback: async () => e()?.toggleNamesRecord(),
		},
		names_add_all: {
			name: 'Names: add every name to the list being saved',
			description: 'Only does something after "start saving names".',
			options: [sectionsOption],
			callback: async (action) => {
				await e()?.addAllNamesToList(list(action.options.sections))
			},
		},
		names_set: {
			name: 'Names: store (if a list is waiting) or restore a name set',
			options: [setOption, sectionsOption],
			callback: async (action) => {
				e()?.pressNameSet(Number(action.options.set), list(action.options.sections))
			},
		},
		names_capture: {
			name: 'Names: capture every name straight to a name set',
			options: [setOption, sectionsOption],
			callback: async (action) => {
				await e()?.captureNameSet(Number(action.options.set), list(action.options.sections))
			},
		},
		names_restore: {
			name: 'Names: restore a name set to the console (never stores)',
			options: [setOption, sectionsOption],
			callback: async (action) => {
				e()?.restoreNameSet(Number(action.options.set), list(action.options.sections))
			},
		},
		clear_mode: {
			name: 'Clear: the next slot, script or name set pressed is emptied',
			description:
				'Meant for a long press on the capture button. Switches itself off after 10 seconds, or when capture or cancel is pressed.',
			options: [],
			callback: async () => e()?.setClearMode(true),
		},
		cancel: {
			name: 'Cancel capture / script recording / saving names',
			options: [],
			callback: async () => e()?.cancel(),
		},
	}
}
