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
}

const sim = new SimConsole({ listenPort: CONSOLE_PORT, replyPort: MODULE_PORT, dropEvery: 17 })
await sim.start()
let mod = new Instance({})
await mod.init(config)
const run = (id, options = {}) => mod.actions[id].callback({ options })
const fb = (id, options = {}) => mod.feedbacks[id].callback({ options })
const http = async (method, path, body, query = {}) => {
	const res = await mod.handleHttpRequest({
		method,
		path,
		query,
		body: body === undefined ? undefined : JSON.stringify(body),
	})
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
	const snap = mod.engine.lib.slots['1'].steps[0]
	assert.equal(mod.engine.lib.slots['1'].steps.length, 1)
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
	const snap = mod.engine.lib.slots['1'].steps[0]
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
	await until(() => mod.vars.target === 'Grp 2 Grp2', 'TO button names the channel that will be written to')
	const before5 = sim.get('/Input_Channels/5/Dynamics/comp_ratio_1')
	await run('slot', { slot: 1 })
	const want = mod.engine.lib.slots['1'].steps[0].values['Dynamics/comp_ratio_1'].a[0]
	await until(() => sim.get('/Group_Outputs/2/Dynamics/comp_ratio_1') === want, 'comp copied to group 2')
	assert.equal(sim.get('/Input_Channels/5/Dynamics/comp_ratio_1'), before5)
	await run('target', { mode: 'original' })
	await until(() => mod.vars.target === 'ORIGINAL', 'TO button back to ORIGINAL')
})

await test('graphic EQ capture and recall', async () => {
	await run('capture', { section: 'Graphic_EQ', index: 2 })
	assert.equal(mod.engine.mode, 'holding')
	await run('slot', { slot: 2 })
	assert.equal(Object.keys(mod.engine.lib.slots['2'].steps[0].values).length, 35)
	const saved = mod.engine.lib.slots['2'].steps[0].values.geq_gain_17.a[0]
	sim.surface('/Graphic_EQ/2/geq_gain_17', 'f', [-11])
	await run('scopes', { scopes: ['geq'] })
	await run('slot', { slot: 2 })
	await until(() => sim.get('/Graphic_EQ/2/geq_gain_17') === saved, 'GEQ band restored')
})

await test('record a script from several recalls, store it in a slot, run it from that slot', async () => {
	await run('capture', { section: 'Input_Channels', index: 7 })
	await run('slot', { slot: 3 })
	assert.equal(fb('slot_kind', { slot: 3, kind: 'capture' }), true)
	await run('script_record')
	assert.equal(fb('script_recording'), true)
	await run('scopes', { scopes: ['eq'] })
	await run('slot', { slot: 1 })
	await run('scopes', { scopes: ['comp', 'level'] })
	await run('slot', { slot: 3 })
	await run('script_record')
	assert.equal(fb('script_waiting'), true)
	await until(() => mod.vars.waiting === 'SCRIPT', 'waiting variable')
	await run('slot', { slot: 6 })
	assert.equal(fb('slot_kind', { slot: 6, kind: 'script' }), true)
	assert.equal(fb('slot_kind', { slot: 6, kind: 'capture' }), false)
	const script = mod.engine.lib.slots['6']
	assert.equal(script.kind, 'script')
	assert.equal(script.steps.length, 2)
	assert.ok(
		script.steps.every((step) => step.fixed),
		'script steps are sent in full',
	)
	const scopesOf = (step) => [...new Set(Object.keys(step.values).map((suffix) => suffix.split('/')[0]))].sort()
	assert.deepEqual(scopesOf(script.steps[0]), ['EQ', 'Filters'])
	assert.deepEqual(scopesOf(script.steps[1]), ['Dynamics', 'fader', 'mute'])

	// Clearing the source slots, or changing the scope toggles, must not change the script
	await run('clear_slot', { slot: 1 })
	await run('clear_slot', { slot: 3 })
	await run('scopes', { scopes: ['pan'] })
	sim.surface('/Input_Channels/5/EQ/eq_freq_3', 'f', [1234])
	sim.surface('/Input_Channels/7/fader', 'f', [-99])
	sim.surface('/Input_Channels/7/EQ/eq_freq_3', 'f', [4321])
	await sleep(50)
	await run('slot', { slot: 6 })
	await until(
		() => sim.get('/Input_Channels/5/EQ/eq_freq_3') === script.steps[0].values['EQ/eq_freq_3'].a[0],
		'step 1 EQ',
	)
	await until(() => sim.get('/Input_Channels/7/fader') === script.steps[1].values.fader.a[0], 'step 2 level')
	assert.equal(sim.get('/Input_Channels/7/EQ/eq_freq_3'), 4321, 'input 7 EQ was not in the script')
})

await test('save names with the buttons, store them in a slot, restore from that slot', async () => {
	await run('names_record')
	assert.equal(fb('names_recording'), true)
	await run('names_add_all', { sections: ['Input_Channels', 'Group_Outputs'] })
	await until(() => mod.vars.names_count === '16', 'count on the button')
	await run('slot', { slot: 7 })
	assert.equal(fb('names_recording'), false)
	assert.equal(fb('slot_kind', { slot: 7, kind: 'names' }), true)
	const slot = mod.engine.lib.slots['7']
	assert.equal(slot.steps.length, 12 + 4)
	assert.deepEqual(slot.steps.find((step) => step.section === 'Group_Outputs' && step.index === 3).values, {
		'Buss_Trim/name': { t: 's', a: ['Grp3'] },
	})
	await until(() => mod.vars.slot_7 === '16 names', 'slot label')
	sim.surface('/Input_Channels/4/Channel_Input/name', 's', ['Wrong'])
	sim.surface('/Group_Outputs/3/Buss_Trim/name', 's', ['Wrong'])
	sim.surface('/Aux_Outputs/1/Buss_Trim/name', 's', ['Left alone'])
	await run('scopes', { scopes: ['eq'] }) // names in a names slot don't depend on the NAME toggle
	await run('slot', { slot: 7 })
	await until(() => sim.get('/Input_Channels/4/Channel_Input/name') === 'In4', 'input name restored')
	await until(() => sim.get('/Group_Outputs/3/Buss_Trim/name') === 'Grp3', 'group name restored')
	assert.equal(sim.get('/Aux_Outputs/1/Buss_Trim/name'), 'Left alone', 'auxes were not in the list')
})

await test('NAME scope carries a channel name with a preset', async () => {
	await run('capture', { section: 'Input_Channels', index: 2 })
	await run('slot', { slot: 4 })
	sim.surface('/Input_Channels/2/Channel_Input/name', 's', ['Renamed'])
	await run('scopes', { scopes: ['name'] })
	await run('slot', { slot: 4 })
	await until(() => sim.get('/Input_Channels/2/Channel_Input/name') === 'In2', 'name restored')
})

await test('Buttons tab: the web API plans a page and returns a file to import, for this connection', async () => {
	const status = (await http('GET', '/api/status')).data
	assert.equal(status.label, 'recall')
	assert.deepEqual(
		status.layout.decks.map((d) => [d.columns, d.rows]),
		[
			[8, 4],
			[5, 3],
			[4, 2],
			[3, 2],
			[10, 6],
		],
	)
	const made = (await http('POST', '/api/layout', status.layout.defaults)).data
	assert.equal(made.filename, 'digico-recall-page-8x4.companionconfig')
	assert.equal(made.plan.slots.length, Math.min(15, status.slotCount), 'as many slots as fit, up to the number set up')
	assert.equal(made.file.type, 'page')
	assert.equal(Object.values(made.file.instances)[0].label, 'recall')
	assert.ok(!JSON.stringify(made.file).includes('In5'), 'stored captures are not in the file')
	const small = (await http('POST', '/api/layout', { columns: 3, rows: 2, nav: false, keys: ['arm', 'target'] })).data
	assert.deepEqual(small.plan.slots, [1, 2, 3, 4])
	const refused = await http('POST', '/api/layout', {
		columns: 2,
		rows: 1,
		nav: false,
		keys: ['arm', 'target', 'cancel'],
	})
	assert.equal(refused.status, 400)
	assert.match(refused.data.error, /do not fit/)
})

await test('Keys tab: live keys show what a Stream Deck would, and pressing them runs the same actions', async () => {
	const layout = { columns: 4, rows: 2, keys: ['arm', 'cancel', 'target', 'scope_eq'] }
	const read = async () => (await http('POST', '/api/keys', layout)).data
	const key = (page, id) => page.keys.flat().find((k) => k?.id === id)
	await run('cancel')
	await run('scopes', { scopes: ['eq'] })
	let page = await read()
	assert.deepEqual([page.columns, page.rows], [4, 2])
	assert.deepEqual(
		page.keys.map((row) => row.map((k) => k.id)),
		[
			['slot_1', 'slot_2', 'slot_3', 'slot_4'],
			['arm', 'cancel', 'target', 'scope_eq'],
		],
	)
	// Text is the preset's text with the variables filled in; colours follow the feedbacks
	assert.deepEqual(key(page, 'slot_1').lines, ['1', mod.engine.slotLabel(1)])
	assert.deepEqual(key(page, 'arm').lines, ['CAPTURE', 'READY'])
	assert.deepEqual([key(page, 'arm').bgcolor, key(page, 'scope_eq').bgcolor], ['#282828', '#dc8c00'])
	assert.deepEqual(key(page, 'arm').hold, [2000])
	assert.notEqual(
		key(page, 'slot_1').bgcolor,
		key(page, 'slot_4').bgcolor,
		'a used slot is coloured, an empty one is not',
	)

	// A press answers with the page as it now is
	page = (await http('POST', '/api/keys/press', { key: 'arm', layout })).data
	assert.equal(mod.engine.mode, 'armed')
	assert.deepEqual([key(page, 'arm').lines[1], key(page, 'arm').bgcolor], ['TOUCH A CHANNEL', '#c80000'])
	page = (await http('POST', '/api/keys/press', { key: 'scope_eq', layout })).data
	assert.equal(key(page, 'scope_eq').bgcolor, '#282828')
	assert.equal(fb('scope', { scope: 'eq' }), false)
	await http('POST', '/api/keys/press', { key: 'cancel', layout })
	assert.equal(mod.engine.mode, 'idle')

	// Held for two seconds, CAPTURE arms clearing, as on the Stream Deck
	page = (await http('POST', '/api/keys/press', { key: 'arm', held: 2000, layout })).data
	assert.equal(mod.engine.clearMode, true)
	assert.equal(key(page, 'arm').bgcolor, '#ffffff')
	await run('cancel')
	await run('scopes', { scopes: ['eq'] })
	assert.equal((await http('POST', '/api/keys/press', { key: 'nope', layout })).status, 400)
	assert.equal((await http('POST', '/api/keys/press', { key: 'cancel', held: 2000, layout })).status, 400)
})

await test('web page and API: browse, edit a value, rename, send, names, import', async () => {
	const page = await http('GET', '/')
	assert.equal(page.status, 200)
	assert.ok(page.data.includes('<title>DiGiCo Recall</title>'))

	const status = (await http('GET', '/api/status')).data
	assert.equal(status.consoleName, 'SimQuantum')
	assert.equal(status.counts.Input_Channels, 12)
	assert.ok(status.scopeDefs.length >= 9 && status.sections.Input_Channels)
	assert.deepEqual(
		status.kinds.map((k) => k.id),
		['capture', 'script', 'names'],
	)
	assert.equal(status.setup.send, MODULE_PORT)
	assert.equal(status.setup.rcv, CONSOLE_PORT)
	assert.equal(status.setup.type, 'DiGiCo Pad')

	const lib = (await http('GET', '/api/lib')).data
	const snap = lib.slots['4']
	assert.equal(snap.steps.length, 1)
	snap.label = 'Lead Vox'
	snap.steps[0].values['EQ/eq_gain_1'].a[0] = -4.5
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

	// A script slot: relabel and reorder its steps
	const script = lib.slots['6']
	script.label = 'Song 2'
	script.steps.reverse()
	await http('POST', '/api/slot', { id: '6', value: script })
	assert.equal(mod.engine.lib.slots['6'].steps[0].index, 7)
	assert.equal(mod.engine.lib.slots['6'].kind, 'script')
	await until(() => mod.vars.slot_6 === 'Song 2', 'script label reaches the button')

	// Names edited on the page can be stored as a names slot
	await http('POST', '/api/names/slot', {
		id: '8',
		label: 'Monitors',
		names: { Aux_Outputs: { 1: 'Wedge 1', 2: 'IEM Jon' } },
	})
	assert.equal(mod.engine.lib.slots['8'].kind, 'names')
	assert.equal(mod.engine.lib.slots['8'].steps.length, 2)
	assert.equal((await http('POST', '/api/names/slot', { id: '8', names: {} })).status, 400)

	// Bad input is refused or cleaned rather than stored
	assert.equal((await http('POST', '/api/slot', { id: '5', value: { section: 'Nope', index: 1 } })).status, 400)
	assert.equal((await http('POST', '/api/slot', { id: 'x', value: snap })).status, 400)
	snap.steps[0].values['EQ/eq_gain_2'] = { t: 'f', a: ['not a number'] }
	await http('POST', '/api/slot', { id: '5', value: snap })
	assert.equal(mod.engine.lib.slots['5'].steps[0].values['EQ/eq_gain_2'], undefined)

	await http('POST', '/api/slot', { id: '5', value: null })
	assert.equal(mod.engine.lib.slots['5'], undefined)
})

await test('web setup: resolve shows what to enter on the console; apply saves the address and reconnects', async () => {
	const before = mod.config.host
	const resolved = (await http('POST', '/api/setup/resolve', { ip: '10.9.8.7' })).data.setup
	assert.equal(resolved.consoleIp, '10.9.8.7')
	assert.equal(resolved.send, MODULE_PORT)
	assert.equal(resolved.rcv, CONSOLE_PORT)
	assert.equal(mod.config.host, before, 'resolve changes nothing')
	assert.equal((await http('POST', '/api/setup/resolve', { ip: '999.1.1.1' })).status, 400)
	assert.equal((await http('POST', '/api/setup/apply', { ip: 'console.local' })).status, 400)

	const slots = Object.keys(mod.engine.lib.slots).length
	assert.equal((await http('POST', '/api/setup/apply', { ip: '127.0.0.1' })).status, 200)
	assert.equal(mod.saved.host, '127.0.0.1')
	assert.equal(Object.keys(mod.engine.lib.slots).length, slots, 'library kept across the reconnect')
	await until(() => mod.engine.consoleName === 'SimQuantum', 'reconnected')
	assert.ok((await http('GET', '/')).data.includes('data:image/png;base64,'), 'setup picture is in the page')
})

await test('audit log: the LOG button switches it on, the web page reads new entries, and clear empties it', async () => {
	assert.equal(fb('audit_on'), false)
	assert.equal((await http('GET', '/api/log')).data.enabled, false)
	await run('audit', { mode: 'toggle' })
	assert.equal(fb('audit_on'), true)
	await until(() => mod.vars.audit === 'ON', 'LOG button text')

	sim.surface('/Input_Channels/9/fader', 'f', [-2.5])
	await until(() => mod.engine.audit.entries.some((e) => e.parameter === 'fader'), 'change logged')
	await until(() => /In 9.* fader -2\.5$/.test(mod.vars.audit_last), 'latest change on the button')
	const first = (await http('GET', '/api/log')).data
	assert.equal(first.enabled, true)
	const change = first.entries.find((e) => e.parameter === 'fader')
	assert.equal(change.to, '-2.5')
	assert.ok(Math.abs(change.t - Date.now()) < 5000, 'timestamped as it arrived')

	// Asking again from where the page got to returns only what is new
	assert.equal((await http('GET', '/api/log', undefined, { since: String(first.seq) })).data.entries.length, 0)
	sim.surface('/Input_Channels/10/mute', 'f', [1])
	await until(() => mod.engine.audit.seq > first.seq, 'another change')
	const next = (await http('GET', '/api/log', undefined, { since: String(first.seq) })).data
	assert.deepEqual(
		next.entries.map((e) => e.parameter),
		['mute'],
	)

	await http('POST', '/api/log/clear', {})
	assert.equal((await http('GET', '/api/log')).data.entries.length, 0)
	assert.equal((await http('POST', '/api/log/enable', { on: false })).data.enabled, false)
	assert.equal(fb('audit_on'), false)
})

await test('meter capture: started from the button or the web page, result downloadable from the web page', async () => {
	assert.equal(fb('meter_capturing'), false)
	await run('meter_capture', { seconds: 1 })
	assert.equal(fb('meter_capturing'), true)
	assert.equal((await http('GET', '/api/meters')).data.running, true)
	assert.equal((await http('POST', '/api/meters/capture', { seconds: 1 })).status, 400, 'already running')
	await until(() => mod.engine.meterCaptures.length === 1, 'capture to finish', 3000)
	assert.equal(fb('meter_capturing'), false)
	const list = (await http('GET', '/api/meters')).data
	assert.equal(list.running, false)
	assert.equal(list.captures.length, 1)
	assert.equal(list.captures[0].packets, undefined, 'the list is a summary')
	const full = (await http('GET', '/api/meters', undefined, { id: list.captures[0].id })).data
	assert.ok(Array.isArray(full.packets) && full.queries.length > 0)
	assert.equal((await http('GET', '/api/meters', undefined, { id: 'nope' })).status, 404)
})

await test('library survives a restart and a config edit', async () => {
	const saved = mod.saved
	await mod.destroy()
	mod = new Instance({})
	await mod.init(saved)
	assert.equal(mod.engine.lib.slots['4'].label, 'Lead Vox')
	assert.equal(mod.engine.lib.slots['6'].label, 'Song 2')
	assert.equal(mod.engine.lib.slots['7'].kind, 'names')
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
	assert.equal(mod.engine.held.length, 0)
})

after(async () => {
	await mod.destroy()
})
