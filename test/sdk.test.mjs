// Checks the module against the real Companion SDK: the manifest validates, the entry
// point has the shape Companion loads, and every preset refers to things that exist.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { InstanceBase } from '@companion-module/base'
import { validateManifest } from '@companion-module/base/manifest'
import { getActions } from '../src/actions.js'
import { getFeedbacks } from '../src/feedbacks.js'
import { getVariableDefinitions } from '../src/variables.js'
import { getPresets } from '../src/presets.js'
import { DEFAULTS, getConfigFields } from '../src/config.js'

import { parseDosc, doscAddresses } from '../tools/check-dosc.mjs'
import { captureSuffixes, meterSuffixes } from '../src/params.js'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('companion/manifest.json'))
const pkg = JSON.parse(read('package.json'))

test('manifest passes the SDK validator', () => {
	validateManifest(manifest, false)
})

test('manifest, package.json and changelog agree on name and version', () => {
	assert.equal(manifest.id, pkg.name)
	assert.equal(manifest.version, pkg.version)
	assert.ok(pkg.repository.url.endsWith(`companion-module-${manifest.id}.git`))
	assert.ok(read('CHANGELOG.md').includes(`## [${pkg.version}]`), 'CHANGELOG has an entry for this version')
	assert.ok(fs.existsSync(new URL('../companion/HELP.md', import.meta.url)))
	assert.ok(fs.existsSync(new URL(`../${manifest.runtime.entrypoint.replace('../', '')}`, import.meta.url)))
})

test('name shown in Companion: one short product, console models in keywords', () => {
	// Companion lists a connection as "<manufacturer>: <products joined with ;>"
	assert.equal(manifest.manufacturer, 'DiGiCo')
	assert.deepEqual(manifest.products, ['SD/Quantum Recall'])
	for (const model of ['SD9', 'SD10', 'SD11', 'Quantum 338']) assert.ok(manifest.keywords.includes(model), model)
})

test('entry point exports an InstanceBase subclass and an UpgradeScripts array', async () => {
	const main = await import('../src/main.js')
	assert.equal(typeof main.default, 'function')
	assert.ok(main.default.prototype instanceof InstanceBase)
	assert.ok(Array.isArray(main.UpgradeScripts))
	for (const method of ['init', 'destroy', 'configUpdated', 'getConfigFields', 'handleHttpRequest']) {
		assert.equal(typeof main.default.prototype[method], 'function', method)
	}
})

test('settings: every field has a default, and ids are unique', () => {
	const fields = getConfigFields()
	const ids = fields.map((f) => f.id)
	assert.equal(new Set(ids).size, ids.length)
	for (const field of fields) {
		if (field.type !== 'static-text') assert.ok(field.id in DEFAULTS, `${field.id} has a default`)
	}
})

test('actions and feedbacks are well formed', () => {
	const self = { engine: null }
	for (const [id, def] of Object.entries(getActions(self))) {
		assert.ok(def.name && Array.isArray(def.options) && typeof def.callback === 'function', id)
	}
	for (const [id, def] of Object.entries(getFeedbacks(self))) {
		assert.equal(def.type, 'boolean', id)
		assert.ok(def.name && def.defaultStyle && typeof def.callback === 'function', id)
		assert.equal(def.callback({ options: {} }), false, `${id} is false while the module is stopped`)
	}
})

test('actions do nothing, without throwing, while the module is stopped', async () => {
	for (const def of Object.values(getActions({ engine: null }))) {
		await def.callback({ options: { slot: 1, script: 1, set: 1, section: 'Input_Channels', index: 1 } })
	}
})

test('presets only use actions, feedbacks, options and variables that exist', () => {
	const self = { engine: null }
	const actions = getActions(self)
	const feedbacks = getFeedbacks(self)
	const variables = getVariableDefinitions(DEFAULTS)
	const { structure, presets } = getPresets('recall', DEFAULTS)
	const optionIds = (def) => new Set(def.options.map((o) => o.id))

	for (const [id, preset] of Object.entries(presets)) {
		assert.equal(preset.type, 'simple', id)
		for (const [, name] of preset.style.text.matchAll(/\$\(recall:([a-z0-9_]+)\)/g)) {
			assert.ok(variables[name], `${id} uses unknown variable ${name}`)
		}
		for (const step of preset.steps) {
			const held = Object.keys(step)
				.filter((key) => /^\d+$/.test(key))
				.flatMap((key) => step[key].actions)
			for (const a of [...step.down, ...step.up, ...held]) {
				assert.ok(actions[a.actionId], `${id} uses unknown action ${a.actionId}`)
				for (const key of Object.keys(a.options)) assert.ok(optionIds(actions[a.actionId]).has(key), `${id}: ${key}`)
			}
		}
		for (const f of preset.feedbacks) {
			assert.ok(feedbacks[f.feedbackId], `${id} uses unknown feedback ${f.feedbackId}`)
			assert.ok(f.style, `${id}: boolean feedback ${f.feedbackId} needs a style`)
			for (const key of Object.keys(f.options)) assert.ok(optionIds(feedbacks[f.feedbackId]).has(key), `${id}: ${key}`)
		}
	}

	// Holding CAPTURE for two seconds enters clear mode; there are no separate clear buttons
	assert.equal(presets.arm.steps[0][2000].actions[0].actionId, 'clear_mode')
	assert.equal(presets.arm.steps[0][2000].options.runWhileHeld, true)
	assert.ok(!Object.keys(presets).some((id) => id.startsWith('clear_')))

	// Fixed-size labels must fit on one line: Companion wraps five letters at size 18
	for (const [id, preset] of Object.entries(presets)) {
		if (preset.style.size === 'auto') continue
		if (preset.style.text.includes('$(')) continue // variable text: its length isn't known here
		const longest = Math.max(...preset.style.text.split('\\n').map((line) => line.length))
		assert.ok(
			Number(preset.style.size) * longest <= 72,
			`${id}: "${preset.style.text}" at size ${preset.style.size} will wrap`,
		)
	}

	// Every preset is listed in exactly one section, and every listed id exists
	const listed = structure.flatMap((s) => s.definitions.flatMap((d) => d.presets))
	assert.equal(new Set(listed).size, listed.length)
	assert.deepEqual([...listed].sort(), Object.keys(presets).sort())
})

test('command-set checker: reads a .DOSC file and names its commands the way the module does', () => {
	// A made-up file in the same layout as DiGiCo's (theirs is not ours to include)
	const title = Buffer.from('Test OSC Commands 3\0')
	const record = (section, block, type, min, max, label) => {
		const b = Buffer.alloc(64)
		b[3] = section
		b[6] = block
		b[10] = type
		b.writeFloatLE(min, 11)
		b.writeFloatLE(max, 15)
		b[27] = 1
		b[29] = label.length
		b.write(label, 30, 'ascii')
		return b
	}
	const length = Buffer.alloc(2)
	length.writeUInt16LE(title.length)
	const file = Buffer.concat([
		length,
		title,
		record(1, 4, 1, -18, 18, 'eq gain 2'),
		record(6, 2, 0, 0, 2, 'send pre-post'),
		record(1, 1, 3, 0, 0, 'post meter/left'),
		record(17, 15, 1, -18, 18, 'geq  trim'),
		record(99, 1, 0, 0, 1, 'not a channel'),
	])
	const { title: readTitle, records } = parseDosc(file)
	assert.equal(readTitle, 'Test OSC Commands 3')
	assert.equal(records.length, 5)
	assert.deepEqual(
		doscAddresses(records).map((a) => [a.section, a.suffix, a.type, a.min, a.max]),
		[
			['Input_Channels', 'EQ/eq_gain_2', 'number', -18, 18],
			['Group_Outputs', 'Aux_Send/#/send_pre-post', 'switch', 0, 2],
			['Input_Channels', 'Channel_Input/post_meter/left', 'meter', 0, 0],
			['Graphic_EQ', 'geq__trim', 'number', -18, 18],
		],
	)
})

test('parameter table reflects the Quantum 338 command set: eight-band bus EQ, no bus filters, GEQ trim', () => {
	const group = captureSuffixes('Group_Outputs', 1)
	const input = captureSuffixes('Input_Channels', 1)
	assert.ok(group.includes('EQ/eq_gain_8') && group.includes('EQ/eq_symm_Q_8') && group.includes('EQ/eq_pre-ins'))
	assert.ok(!group.includes('EQ/eq_thresh_5'), 'only the first four bands are dynamic')
	assert.ok(!group.some((suffix) => suffix.startsWith('Filters/')), 'busses have no separate filters')
	assert.ok(group.includes('Dynamics/gate-duck-comp') && group.includes('Aux_Send/1/send_pre-post'))
	assert.ok(input.includes('Filters/hi_filter_freq') && !input.includes('EQ/eq_gain_5'))
	assert.ok(captureSuffixes('Graphic_EQ', 1).includes('geq__trim'))
	assert.ok(meterSuffixes('Input_Channels').includes('Channel_Input/post_meter/left'))
	assert.ok(meterSuffixes('Aux_Outputs').includes('Buss_Trim/post_meter'))
	assert.deepEqual(meterSuffixes('Graphic_EQ'), ['input_meter', 'output_meter'])
})
