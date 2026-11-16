import { SCOPES } from './params.js'
import { ids } from './config.js'

export function getVariableDefinitions(config) {
	const defs = {
		state: { name: 'What the module is waiting for' },
		console: { name: 'Console name' },
		touched: { name: 'Last touched channel' },
		held: { name: 'Capture waiting to be stored' },
		waiting: { name: 'What the next slot press will store: CAPTURE, SCRIPT, NAMES or nothing' },
		scopes: { name: 'Active recall scopes' },
		target: { name: 'Where recalls go: ORIGINAL, or the last touched channel' },
		script_steps: { name: 'Steps in the script being recorded' },
		names_count: { name: 'Names in the list being saved' },
		audit: { name: 'Audit log: ON or OFF' },
		audit_last: { name: 'Audit log: the latest entry' },
	}
	for (const i of ids(config.slotCount)) defs[`slot_${i}`] = { name: `Slot ${i} contents` }
	return defs
}

/** @param {import('./engine.js').Engine} engine */
export function getVariableValues(engine, config) {
	const status = engine.status()
	const values = {
		state: status.state,
		console: engine.consoleName,
		touched: status.touchedLabel,
		held: status.held,
		waiting: status.waiting.toUpperCase(),
		scopes: SCOPES.filter((s) => engine.scopes.has(s.id))
			.map((s) => s.label)
			.join(' '),
		// In "last touched" mode, name the channel a recall will land on as soon as one is touched
		target: engine.targetMode === 'touched' ? status.touchedLabel || 'TOUCHED' : 'ORIGINAL',
		script_steps: status.scriptSteps ? String(status.scriptSteps) : '',
		names_count: status.namesRecording ? String(status.namesCount) : '',
		audit: engine.audit.enabled ? 'ON' : 'OFF',
		audit_last: engine.audit.enabled ? engine.audit.lastText() : '',
	}
	for (const i of ids(config.slotCount)) values[`slot_${i}`] = engine.slotLabel(i)
	return values
}
