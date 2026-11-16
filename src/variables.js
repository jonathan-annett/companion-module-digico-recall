import { SCOPES } from './params.js'
import { ids } from './config.js'

export function getVariableDefinitions(config) {
	const defs = {
		state: { name: 'What the module is waiting for' },
		console: { name: 'Console name' },
		touched: { name: 'Last touched channel' },
		held: { name: 'Capture waiting to be stored' },
		scopes: { name: 'Active recall scopes' },
		target: { name: 'Recall target mode' },
		script_steps: { name: 'Steps in the script being recorded' },
		names_count: { name: 'Names in the list being saved' },
	}
	for (const i of ids(config.slotCount)) defs[`slot_${i}`] = { name: `Slot ${i} contents` }
	for (const i of ids(config.scriptCount)) defs[`script_${i}`] = { name: `Script ${i} contents` }
	for (const i of ids(config.nameSetCount)) defs[`nameset_${i}`] = { name: `Name set ${i} contents` }
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
		scopes: SCOPES.filter((s) => engine.scopes.has(s.id))
			.map((s) => s.label)
			.join(' '),
		target: engine.targetMode === 'touched' ? 'TOUCHED' : 'ORIGINAL',
		script_steps: status.scriptSteps ? String(status.scriptSteps) : '',
		names_count: status.namesRecording ? String(status.namesCount) : '',
	}
	for (const i of ids(config.slotCount)) values[`slot_${i}`] = engine.slotLabel(i)
	for (const i of ids(config.scriptCount)) values[`script_${i}`] = engine.scriptLabel(i)
	for (const i of ids(config.nameSetCount)) values[`nameset_${i}`] = engine.nameSetLabel(i)
	return values
}
