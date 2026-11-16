// End-to-end tests: the real module class (with a stand-in for the Companion SDK base
// class) talking over real UDP to the simulated console in sim-console.mjs.
//
//   yarn test            (or: node --test test/*.test.mjs)
//
// The tests share one console and one module instance and run in order, the way an
// operator would use it: capture, recall, script, names, web page, restart.

import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { SimConsole } from './sim-console.mjs'
import { makeInstanceClass } from '../src/instance.js'
import { encode, decode } from '../src/osc.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 4000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (check()) return
		await sleep(10)
	}
	throw new Error(`Timed out waiting for: ${what}`)
}

// Stand-in for @companion-module/base
class FakeBase {
	constructor(internal) {
		this.internal = internal
		this.label = 'recall'
		this.vars = {}
		this.saved = null
		this.statuses = []
	}
	setActionDefinitions(d) {
		this.actions = d
	}
	setFeedbackDefinitions(d) {
		this.feedbacks = d
	}
	setVariableDefinitions(d) {
		this.variableDefs = d
	}
	setPresetDefinitions(structure, presets) {
		this.presetStructure = structure
		this.presets = presets
	}
	setVariableValues(v) {
		Object.assign(this.vars, v)
	}
	checkAllFeedbacks() {
		this.feedbackChecks = (this.feedbackChecks ?? 0) + 1
	}
	updateStatus(s, t) {
		this.statuses.push([s, t])
	}
	saveConfig(c) {
		this.saved = { ...c }
	}
	log(level, text) {
		if (process.env.VERBOSE) console.log(`  [${level}] ${text}`)
	}
}
const Instance = makeInstanceClass({
	InstanceBase: FakeBase,
	InstanceStatus: {
		Ok: 'ok',
		Connecting: 'connecting',
		ConnectionFailure: 'connection_failure',
		UnknownError: 'unknown_error',
	},
})

const CONSOLE_PORT = 18001
const MODULE_PORT = 18000
const config = {
	host: '127.0.0.1',
	sendPort: CONSOLE_PORT,
	recvPort: MODULE_PORT,
	rate: 2000,
	queryTimeout: 150,
	slotCount: 8,
	scriptCount: 4,
	nameSetCount: 2,
}

const sim = new SimConsole({ listenPort: CONSOLE_PORT, replyPort: MODULE_PORT, dropEvery: 17 })
await sim.start()
let mod = new Instance({})
await mod.init(config)
const run = (id, options = {}) => mod.actions[id].callback({ options })
const fb = (id, options = {}) => mod.feedbacks[id].callback({ options })
const http = async (method, path, body) => {
	const res = await mod.handleHttpRequest({ method, path, body: body === undefined ? undefined : JSON.stringify(body) })
	return {
		status: res.status,
		data: res.headers['Content-Type'].startsWith('application/json') ? JSON.parse(res.body) : res.body,
	}
}

await test('OSC codec round-trips floats, ints and strings', () => {
	const [m] = decode(encode('/Input_Channels/3/fader', 'fis', [-12.5, 7, 'Kick']))
	assert.equal(m.path, '/Input_Channels/3/fader')
	assert.deepEqual(m.args, [-12.5, 7, 'Kick'])
	assert.equal(decode(encode('/Console/Name/?'))[0].args.length, 0)
})

await test('connects and learns console name and channel counts', async () => {
	await until(() => mod.engine.consoleName === 'SimQuantum' && mod.engine.counts.Aux_Outputs === 4, 'console info')
	assert.equal(mod.engine.count('Input_Channels'), 12)
	await until(() => mod.vars.console === 'SimQuantum', 'console variable')
})

await test('arm, touch a channel, press a slot: whole channel is stored', async () => {
	await run('arm')
	assert.equal(mod.engine.mode, 'armed')
	assert.equal(fb('state', { state: 'armed' }), true)
	sim.surface('/Input_Channels/5/fader', 'f', [-7])
	await until(() => mod.engine.mode === 'holding', 'capture to finish')
	assert.equal(fb('slot_used', { slot: 1 }), false)
	await run('slot', { slot: 1 })
	assert.equal(mod.engine.mode, 'idle')
	assert.equal(fb('slot_used', { slot: 1 }), true)
	const snap = mod.engine.lib.slots['1']
	assert.equal(snap.section, 'Input_Channels')
	assert.equal(snap.index, 5)
	assert.equal(snap.name, 'In5')
	// Every address the simulated console holds for the channel came back, despite dropped packets
	const expected = [...sim.values.keys()].filter((p) => p.startsWith('/Input_Channels/5/')).length
	assert.equal(Object.keys(snap.values).length, expected)
	assert.ok(expected > 100, `expected a full channel, got ${expected}`)
	assert.equal(snap.values.fader.a[0], -7)
	assert.equal(snap.values['Aux_Send/4/send_level'].t, 'f')
	await until(() => mod.vars.slot_1 === 'In 5 In5', 'slot label variable')
})

await test('library is saved into the Companion config', () => {
	assert.ok(mod.saved?.library, 'saveConfig was called with a library')
	assert.ok(JSON.parse(mod.saved.library).slots['1'])
})

await test('recall sends only the scopes that are switched on', async () => {
	// Operator changes things after the capture
	sim.surface('/Input_Channels/5/EQ/eq_gain_2', 'f', [9])
	sim.surface('/Input_Channels/5/Dynamics/comp_thresh_1', 'f', [-33])
	sim.surface('/Input_Channels/5/Dynamics/gate_thresh', 'f', [-44])
	sim.surface('/Input_Channels/5/fader', 'f', [3])
	sim.surface('/Input_Channels/5/Channel_Input/analog_gain', 'f', [55])
	await sleep(50)
	const snap = mod.engine.lib.slots['1']
	await run('scopes', { scopes: ['eq', 'gain'] })
	sim.received.length = 0
	await run('slot', { slot: 1 })
	await until(() => sim.get('/Input_Channels/5/EQ/eq_gain_2') === snap.values['EQ/eq_gain_2'].a[0], 'EQ restored')
	await until(
		() => sim.get('/Input_Channels/5/Channel_Input/analog_gain') === snap.values['Channel_Input/analog_gain'].a[0],
		'gain restored',
	)
	await sleep(150)
	assert.equal(sim.get('/Input_Channels/5/Dynamics/comp_thresh_1'), -33, 'comp untouched')
	assert.equal(sim.get('/Input_Channels/5/Dynamics/gate_thresh'), -44, 'gate untouched')
	assert.equal(sim.get('/Input_Channels/5/fader'), 3, 'fader untouched')
	assert.ok(
		sim.received.every((m) => /\/(EQ|Filters|Channel_Input)\//.test(m.path)),
		'only EQ and gain addresses were sent',
	)
	assert.ok(!sim.received.some((m) => /name|phantom/.test(m.path)), 'no name or phantom sent')
	assert.equal(fb('slot_last', { slot: 1 }), true)
})

await test('the console echoing a recall is not mistaken for a touch', async () => {
	sim.surface('/Input_Channels/9/mute', 'f', [1])
	await until(() => mod.engine.lastTouched?.index === 9, 'touch on 9')
	await run('slot', { slot: 1 }) // recalls to input 5, console echoes it all back
	await sleep(200)
	assert.equal(mod.engine.lastTouched.index, 9)
})

await test('recall to the last touched channel instead of the original', async () => {
	await run('target', { mode: 'touched' })
	await run('scopes', { scopes: ['comp'] })
	sim.surface('/Group_Outputs/2/fader', 'f', [-3])
	await until(() => mod.engine.lastTouched?.section === 'Group_Outputs', 'touch on group 2')
	const before5 = sim.get('/Input_Channels/5/Dynamics/comp_ratio_1')
	await run('slot', { slot: 1 })
	const want = mod.engine.lib.slots['1'].values['Dynamics/comp_ratio_1'].a[0]
	await until(() => sim.get('/Group_Outputs/2/Dynamics/comp_ratio_1') === want, 'comp copied to group 2')
	assert.equal(sim.get('/Input_Channels/5/Dynamics/comp_ratio_1'), before5)
	await run('target', { mode: 'original' })
})

await test('graphic EQ capture and recall', async () => {
	await run('capture', { section: 'Graphic_EQ', index: 2 })
	assert.equal(mod.engine.mode, 'holding')
	await run('slot', { slot: 2 })
	assert.equal(Object.keys(mod.engine.lib.slots['2'].values).length, 34)
	const saved = mod.engine.lib.slots['2'].values.geq_gain_17.a[0]
	sim.surface('/Graphic_EQ/2/geq_gain_17', 'f', [-11])
	await run('scopes', { scopes: ['eq'] })
	await run('slot', { slot: 2 })
	await until(() => sim.get('/Graphic_EQ/2/geq_gain_17') === saved, 'GEQ band restored')
})

await test('record a script from several recalls and run it from one button', async () => {
	await run('capture', { section: 'Input_Channels', index: 7 })
	await run('slot', { slot: 3 })
	await run('script_record')
	assert.equal(fb('script_recording'), true)
	await run('scopes', { scopes: ['eq'] })
	await run('slot', { slot: 1 })
	await run('scopes', { scopes: ['comp', 'level'] })
	await run('slot', { slot: 3 })
	await run('script_record')
	assert.equal(fb('script_waiting'), true)
	await run('script', { script: 1 })
	assert.equal(fb('script_used', { script: 1 }), true)
	const script = mod.engine.lib.scripts['1']
	assert.equal(script.steps.length, 2)
	assert.deepEqual(script.steps[0].scopes, ['eq'])
	assert.deepEqual(script.steps[1].scopes, ['comp', 'level'])

	// Clearing the source slots must not break the script
	await run('clear_slot', { slot: 1 })
	await run('clear_slot', { slot: 3 })
	sim.surface('/Input_Channels/5/EQ/eq_freq_3', 'f', [1234])
	sim.surface('/Input_Channels/7/fader', 'f', [-99])
	sim.surface('/Input_Channels/7/EQ/eq_freq_3', 'f', [4321])
	await sleep(50)
	await run('script', { script: 1 })
	await until(
		() => sim.get('/Input_Channels/5/EQ/eq_freq_3') === script.steps[0].values['EQ/eq_freq_3'].a[0],
		'step 1 EQ',
	)
	await until(() => sim.get('/Input_Channels/7/fader') === script.steps[1].values.fader.a[0], 'step 2 level')
	assert.equal(sim.get('/Input_Channels/7/EQ/eq_freq_3'), 4321, 'input 7 EQ was not in the script')
})

await test('capture all names to a set, then restore them', async () => {
	await run('names_capture', {
		set: 1,
		sections: ['Input_Channels', 'Group_Outputs', 'Aux_Outputs', 'Matrix_Outputs', 'Graphic_EQ', 'Control_Groups'],
	})
	const set = mod.engine.lib.nameSets['1']
	assert.equal(Object.keys(set.names.Input_Channels).length, 12)
	assert.equal(set.names.Group_Outputs['3'], 'Grp3')
	sim.surface('/Input_Channels/4/Channel_Input/name', 's', ['Wrong'])
	sim.surface('/Group_Outputs/3/Buss_Trim/name', 's', ['Wrong'])
	await run('names_restore', { set: 1, sections: ['Input_Channels'] })
	await until(() => sim.get('/Input_Channels/4/Channel_Input/name') === 'In4', 'input name restored')
	await sleep(100)
	assert.equal(sim.get('/Group_Outputs/3/Buss_Trim/name'), 'Wrong', 'groups were not selected')
})

await test('NAME scope carries a channel name with a preset', async () => {
	await run('capture', { section: 'Input_Channels', index: 2 })
	await run('slot', { slot: 4 })
	sim.surface('/Input_Channels/2/Channel_Input/name', 's', ['Renamed'])
	await run('scopes', { scopes: ['name'] })
	await run('slot', { slot: 4 })
	await until(() => sim.get('/Input_Channels/2/Channel_Input/name') === 'In2', 'name restored')
})

await test('web page and API: browse, edit a value, rename, send, names, import', async () => {
	const page = await http('GET', '/')
	assert.equal(page.status, 200)
	assert.ok(page.data.includes('<title>DiGiCo Recall</title>'))

	const status = (await http('GET', '/api/status')).data
	assert.equal(status.consoleName, 'SimQuantum')
	assert.equal(status.counts.Input_Channels, 12)
	assert.ok(status.scopeDefs.length >= 9 && status.sections.Input_Channels)

	const lib = (await http('GET', '/api/lib')).data
	const snap = lib.slots['4']
	snap.label = 'Lead Vox'
	snap.values['EQ/eq_gain_1'].a[0] = -4.5
	assert.equal((await http('POST', '/api/slot', { id: '4', value: snap })).status, 200)
	assert.equal(mod.engine.lib.slots['4'].label, 'Lead Vox')
	await until(() => mod.vars.slot_4 === 'Lead Vox', 'label reaches the button')

	const sent = (await http('POST', '/api/slot/recall', { id: '4', scopes: ['eq'] })).data.sent
	assert.ok(sent > 40)
	await until(() => sim.get('/Input_Channels/2/EQ/eq_gain_1') === -4.5, 'edited value reaches the console')

	const names = (await http('POST', '/api/names/fetch', { sections: ['Aux_Outputs'] })).data.names
	assert.equal(names.Aux_Outputs['2'], 'Aux2')
	await http('POST', '/api/names/apply', { names: { Aux_Outputs: { 2: 'IEM Jon' } } })
	await until(() => sim.get('/Aux_Outputs/2/Buss_Trim/name') === 'IEM Jon', 'edited name reaches the console')

	const script = lib.scripts['1']
	script.name = 'Song 2'
	script.steps.reverse()
	await http('POST', '/api/script', { id: '1', value: script })
	assert.equal(mod.engine.lib.scripts['1'].steps[0].index, 7)
	await until(() => mod.vars.script_1 === 'Song 2', 'script label variable')

	// Bad input is refused or cleaned rather than stored
	assert.equal((await http('POST', '/api/slot', { id: '5', value: { section: 'Nope', index: 1 } })).status, 400)
	assert.equal((await http('POST', '/api/slot', { id: 'x', value: snap })).status, 400)
	snap.values['EQ/eq_gain_2'] = { t: 'f', a: ['not a number'] }
	await http('POST', '/api/slot', { id: '5', value: snap })
	assert.equal(mod.engine.lib.slots['5'].values['EQ/eq_gain_2'], undefined)

	await http('POST', '/api/slot', { id: '5', value: null })
	assert.equal(mod.engine.lib.slots['5'], undefined)
})

await test('library survives a restart and a config edit', async () => {
	const saved = mod.saved
	await mod.destroy()
	mod = new Instance({})
	await mod.init(saved)
	assert.equal(mod.engine.lib.slots['4'].label, 'Lead Vox')
	assert.equal(mod.engine.lib.scripts['1'].name, 'Song 2')
	// Companion's config form sends the fields it knows about, without the library
	const { library, ...formOnly } = saved
	await mod.configUpdated({ ...formOnly, slotCount: 16 })
	assert.equal(mod.engine.lib.slots['4'].label, 'Lead Vox')
	assert.ok(mod.variableDefs.slot_16, 'variables follow the slot count')
	assert.ok(mod.presets.slot_16 && mod.presets.scope_eq && mod.presets.arm)
})

await test('a silent console produces a warning, not a stored empty capture', async () => {
	await sim.stop()
	await mod.actions.capture.callback({ options: { section: 'Input_Channels', index: 1 } })
	assert.equal(mod.engine.mode, 'idle')
	assert.equal(mod.engine.held, null)
})

after(async () => {
	await mod.destroy()
})
