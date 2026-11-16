// Edge cases and safety behaviour, each test with its own console and module so they
// don't depend on one another.

import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SimConsole } from './sim-console.mjs'
import { Engine } from '../src/engine.js'
import { makeInstanceClass } from '../src/instance.js'
import { encode, decode } from '../src/osc.js'
import { captureSuffixes, scopeOf, parseAddress, SCOPE_IDS, SECTION_IDS } from '../src/params.js'
import { localAddressFor, consoleSetup } from '../src/network.js'
import { getConfigFields } from '../src/config.js'
import { cleanSlot, cleanLibrary, cleanNames, namesToSteps } from '../src/validate.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, what, ms = 4000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (check()) return
		await sleep(10)
	}
	throw new Error(`Timed out waiting for: ${what}`)
}

let nextPort = 19000
/** A console and an engine wired together on their own pair of ports. */
async function rig(t, cfg = {}, simOpts = {}) {
	const consolePort = nextPort++
	const modulePort = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: modulePort, ...simOpts })
	await sim.start()
	const logs = []
	let saved = null
	const engine = new Engine(
		{ ip: '127.0.0.1', sendPort: consolePort, recvPort: modulePort, rate: 2000, queryTimeout: 120, ...cfg },
		{ log: (level, text) => logs.push([level, text]), persist: (lib) => (saved = JSON.parse(JSON.stringify(lib))) },
	)
	engine.start()
	t.after(async () => {
		await engine.stop()
		await sim.stop().catch(() => {})
	})
	await until(() => engine.consoleName === 'SimQuantum' && engine.counts.Aux_Outputs !== undefined, 'console info')
	return { sim, engine, logs, saved: () => saved, consolePort, modulePort }
}

test('parameter table: every address has a recall scope, and the dangerous ones are absent', () => {
	for (const section of SECTION_IDS) {
		const suffixes = captureSuffixes(section, 4)
		assert.ok(suffixes.length > 0, section)
		assert.equal(new Set(suffixes).size, suffixes.length, `${section} has duplicate addresses`)
		for (const suffix of suffixes) {
			assert.ok(SCOPE_IDS.includes(scopeOf(suffix)), `${section}/${suffix}`)
			assert.ok(!/phantom|solo|listen|meter|alt_|main\/alt/i.test(suffix), `${section}/${suffix} must not be captured`)
		}
	}
	assert.equal(scopeOf('EQ/eq_gain_3'), 'eq')
	assert.equal(scopeOf('Filters/hi_filter_freq'), 'eq')
	assert.equal(scopeOf('geq_gain_31'), 'eq')
	assert.equal(scopeOf('Dynamics/comp_thresh_1'), 'comp')
	assert.equal(scopeOf('Dynamics/gate_thresh'), 'gate')
	assert.equal(scopeOf('Dynamics/gate-duck-comp'), 'gate')
	assert.equal(scopeOf('fader'), 'level')
	assert.equal(scopeOf('mute'), 'level')
	assert.equal(scopeOf('Aux_Send/12/send_level'), 'aux')
	assert.equal(scopeOf('Channel_Input/analog_gain'), 'gain')
	assert.equal(scopeOf('Buss_Trim/trim'), 'gain')
	assert.equal(scopeOf('Panner/pan'), 'pan')
	assert.equal(scopeOf('Channel_Delay/delay'), 'delay')
	assert.equal(scopeOf('Channel_Input/name'), 'name')
	assert.equal(scopeOf('Buss_Trim/name'), 'name')
	assert.equal(scopeOf('Insert/insert_A_in'), 'other')
	assert.deepEqual(parseAddress('/Group_Outputs/12/EQ/eq_gain_2'), {
		section: 'Group_Outputs',
		index: 12,
		suffix: 'EQ/eq_gain_2',
	})
	assert.equal(parseAddress('/Snapshots/Current_Snapshot'), null)
})

test('aux send capture follows the number of auxes the console reports', async (t) => {
	const { engine } = await rig(t, {}, { counts: { Aux_Outputs: 7 } })
	const snap = await engine.captureChannel('Input_Channels', 1)
	const sends = Object.keys(snap.values).filter((s) => s.startsWith('Aux_Send/'))
	assert.equal(sends.length, 7 * 3)
	assert.ok(snap.values['Aux_Send/7/send_pan'])
})

test('OSC decoder: bundles, address-only packets and garbage do not throw', () => {
	const a = encode('/Input_Channels/1/fader', 'f', [-5])
	const b = encode('/Input_Channels/2/Channel_Input/name', 's', ['Vox'])
	const size = (buf) => {
		const s = Buffer.alloc(4)
		s.writeUInt32BE(buf.length)
		return s
	}
	const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(a), a, size(b), b])
	const out = decode(bundle)
	assert.equal(out.length, 2)
	assert.equal(out[1].args[0], 'Vox')
	assert.deepEqual(decode(Buffer.from('/Console/Session/!\0\0')), [{ path: '/Console/Session/!', types: '', args: [] }])
	assert.deepEqual(decode(Buffer.from('not osc at all')), [])
	assert.deepEqual(decode(Buffer.alloc(0)), [])
	// Untagged meter payload, as the console sends for some meters
	const meter = Buffer.concat([Buffer.from('/Meters/values\0\0'), Buffer.from([0x3f, 0x80, 0, 0])])
	assert.equal(decode(meter)[0].args.length, 0)
	// A truncated float argument is dropped rather than read past the end
	assert.equal(decode(a.subarray(0, a.length - 2))[0].args.length, 0)
})

test('while armed: meters, names from queries and console info do not trigger a capture', async (t) => {
	const { sim, engine } = await rig(t)
	engine.toggleArm()
	sim.out('/Input_Channels/3/Dynamics/GR_meter_1', 'f', [0.4])
	sim.out('/Group_Outputs/1/fader_meter/left', 'f', [0.2])
	sim.out('/Console/Name', 's', ['SimQuantum'])
	sim.out('/Snapshots/Current_Snapshot', 'i', [4])
	await sleep(150)
	assert.equal(engine.mode, 'armed')
	assert.equal(engine.lastTouched, null)
	sim.surface('/Input_Channels/3/solo', 'f', [1])
	await until(() => engine.mode === 'holding', 'solo press triggers the capture')
	assert.equal(engine.held[0].index, 3)
	assert.equal(engine.held[0].values.solo, undefined, 'solo state itself is not stored')
})

test('cancel: arming twice cancels, and cancel drops a waiting capture and a script recording', async (t) => {
	const { sim, engine } = await rig(t)
	engine.toggleArm()
	engine.toggleArm()
	assert.equal(engine.mode, 'idle')
	sim.surface('/Input_Channels/2/fader', 'f', [0])
	await sleep(100)
	assert.equal(engine.mode, 'idle', 'a touch while not armed captures nothing')

	engine.toggleArm()
	sim.surface('/Input_Channels/2/fader', 'f', [1])
	await until(() => engine.mode === 'holding', 'capture')
	engine.toggleScriptRecord()
	engine.cancel()
	assert.equal(engine.mode, 'idle')
	assert.equal(engine.held.length, 0)
	assert.equal(engine.scriptRec, null)
	assert.equal(engine.pressSlot(1), 'empty', 'nothing was stored')
})

test('slot buttons do nothing harmful while a capture is in progress or the slot is empty', async (t) => {
	const { sim, engine } = await rig(t)
	sim.received.length = 0
	assert.equal(engine.pressSlot(5), 'empty')
	engine.toggleArm()
	assert.equal(engine.pressSlot(5), 'busy')
	assert.equal(engine.pressSlot(11), 'busy')
	engine.cancel()
	assert.equal(engine.pressSlot(11), 'empty')
	await sleep(80)
	assert.equal(sim.received.length, 0, 'nothing was sent to the console')
})

test('multi-channel capture: arm, touch several channels, one slot stores and recalls them all', async (t) => {
	const { sim, engine } = await rig(t)
	engine.toggleArm()
	// A fader move is a stream of messages; it must still add the channel only once
	for (const v of [-10, -9, -8, -7]) sim.surface('/Input_Channels/2/fader', 'f', [v])
	sim.surface('/Input_Channels/6/solo', 'f', [1])
	sim.surface('/Group_Outputs/3/mute', 'f', [1])
	sim.surface('/Input_Channels/2/mute', 'f', [0])
	await until(() => engine.mode === 'holding' && engine.held.length === 3, 'three channels captured')
	assert.equal(engine.stateLabel(), '3 CH: PRESS SLOT')
	assert.equal(engine.pressSlot(1), 'stored')
	assert.equal(engine.mode, 'idle')
	const slot = engine.lib.slots['1']
	assert.deepEqual(
		slot.steps.map((c) => `${c.section}/${c.index}`),
		['Input_Channels/2', 'Input_Channels/6', 'Group_Outputs/3'],
	)
	assert.equal(engine.slotLabel(1), 'In2, In6, Grp3')

	// Change all three plus a bystander, then recall EQ only
	for (const path of ['/Input_Channels/2', '/Input_Channels/6', '/Group_Outputs/3', '/Input_Channels/9']) {
		sim.surface(`${path}/EQ/eq_gain_1`, 'f', [-15])
		sim.surface(`${path}/Dynamics/comp_thresh_1`, 'f', [-50])
	}
	await sleep(50)
	engine.setScopes(['eq'])
	// "Last touched" must not redirect a multi-channel capture
	engine.setTargetMode('touched')
	sim.surface('/Input_Channels/9/mute', 'f', [0])
	await until(() => engine.lastTouched?.index === 9, 'touch 9')
	assert.equal(engine.pressSlot(1), 'recalled')
	for (const [i, path] of ['/Input_Channels/2', '/Input_Channels/6', '/Group_Outputs/3'].entries()) {
		const want = slot.steps[i].values['EQ/eq_gain_1'].a[0]
		await until(() => sim.get(`${path}/EQ/eq_gain_1`) === want, `${path} EQ restored`)
		assert.equal(sim.get(`${path}/Dynamics/comp_thresh_1`), -50, 'comp not in scope')
	}
	assert.equal(sim.get('/Input_Channels/9/EQ/eq_gain_1'), -15, 'bystander untouched')

	// Recording that recall into a script gives one step per channel
	engine.toggleScriptRecord()
	engine.pressSlot(1)
	engine.toggleScriptRecord()
	engine.pressSlot(11)
	assert.equal(engine.lib.slots['11'].steps.length, 3)
})

test('clear mode: the next slot pressed is emptied, whatever it holds, and nothing is sent', async (t) => {
	const { sim, engine, saved } = await rig(t, { clearTimeout: 150 })
	for (const slot of [1, 2]) {
		await engine.captureToHold('Input_Channels', slot)
		engine.pressSlot(slot)
	}
	engine.toggleScriptRecord()
	engine.pressSlot(1)
	engine.toggleScriptRecord()
	engine.pressSlot(11)
	engine.toggleNamesRecord()
	await engine.addAllNamesToList(['Aux_Outputs'])
	engine.pressSlot(21)
	await sleep(100)
	sim.received.length = 0

	engine.setClearMode(true)
	assert.equal(engine.stateLabel(), 'PRESS SLOT TO CLEAR')
	assert.equal(engine.pressSlot(1), 'cleared')
	assert.equal(engine.clearMode, false, 'one press, then back to normal')
	assert.equal(engine.lib.slots['1'], undefined)
	assert.ok(engine.lib.slots['2'], 'other slots untouched')
	assert.equal(saved().slots['1'], undefined, 'saved')

	engine.setClearMode(true)
	assert.equal(engine.pressSlot(11), 'cleared')
	engine.setClearMode(true)
	assert.equal(engine.pressSlot(21), 'cleared')
	assert.deepEqual(Object.keys(engine.lib.slots), ['2'], 'the script and names slots are gone too')

	// An empty slot just ends clear mode
	engine.setClearMode(true)
	assert.equal(engine.pressSlot(7), 'empty')
	assert.equal(engine.clearMode, false)
	await sleep(60)
	assert.equal(sim.received.length, 0, 'clearing never writes to the console')
})

test('clear mode: drops a capture in progress, ends on capture or cancel, and times out', async (t) => {
	const { sim, engine } = await rig(t, { clearTimeout: 150 })
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(3)

	// Holding the capture button first arms (on press) and then enters clear mode
	engine.toggleArm()
	sim.surface('/Input_Channels/4/solo', 'f', [1])
	await until(() => engine.mode === 'holding', 'a capture waiting')
	engine.setClearMode(true)
	assert.equal(engine.mode, 'idle', 'the waiting capture is dropped, not stored')
	sim.surface('/Input_Channels/5/solo', 'f', [1])
	await sleep(60)
	assert.equal(engine.mode, 'idle', 'touches do not capture in clear mode')

	engine.toggleArm() // tapping capture leaves clear mode without arming
	assert.equal(engine.clearMode, false)
	assert.equal(engine.mode, 'idle')

	engine.setClearMode(true)
	engine.cancel()
	assert.equal(engine.clearMode, false)

	engine.setClearMode(true)
	await sleep(250)
	assert.equal(engine.clearMode, false, 'switches itself off')
	assert.equal(engine.pressSlot(3), 'recalled', 'so a later press recalls rather than deletes')
	assert.ok(engine.lib.slots['3'])
})

test('recall with no scopes switched on sends nothing', async (t) => {
	const { sim, engine } = await rig(t)
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(1)
	engine.setScopes([])
	sim.received.length = 0
	assert.equal(engine.pressSlot(1), 'recalled')
	await sleep(80)
	assert.equal(sim.received.length, 0)
})

test('a graphic EQ capture is refused on a channel, and a channel capture on a graphic EQ', async (t) => {
	const { sim, engine, logs } = await rig(t)
	await engine.captureToHold('Graphic_EQ', 1)
	engine.pressSlot(1)
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(2)
	engine.setTargetMode('touched')
	engine.setScopes(SCOPE_IDS)
	sim.surface('/Input_Channels/4/fader', 'f', [0])
	await until(() => engine.lastTouched?.index === 4, 'touch input 4')
	sim.received.length = 0
	assert.equal(engine.pressSlot(1), 'mismatch')
	sim.surface('/Graphic_EQ/2/geq_gain_3', 'f', [1])
	await until(() => engine.lastTouched?.section === 'Graphic_EQ', 'touch GEQ 2')
	assert.equal(engine.pressSlot(2), 'mismatch')
	await sleep(80)
	assert.equal(sim.received.length, 0)
	assert.ok(logs.some(([level]) => level === 'warn'))
	// GEQ to another GEQ is fine
	assert.equal(engine.pressSlot(1), 'recalled')
	await until(() => sim.get('/Graphic_EQ/2/geq_gain_9') === sim.get('/Graphic_EQ/1/geq_gain_9'), 'GEQ copied')
})

test('script recorded with "last touched" target replays to the channels it was aimed at', async (t) => {
	const { sim, engine } = await rig(t)
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(1)
	engine.setTargetMode('touched')
	engine.setScopes(['eq'])
	engine.toggleScriptRecord()
	for (const n of [6, 7]) {
		sim.surface(`/Input_Channels/${n}/mute`, 'f', [0])
		await until(() => engine.lastTouched?.index === n, `touch ${n}`)
		engine.pressSlot(1)
	}
	engine.toggleScriptRecord()
	assert.equal(engine.pressSlot(12), 'stored')
	assert.deepEqual(
		engine.lib.slots['12'].steps.map((s) => s.index),
		[6, 7],
	)
	sim.surface('/Input_Channels/6/EQ/eq_gain_1', 'f', [-17])
	sim.surface('/Input_Channels/7/EQ/eq_gain_1', 'f', [-17])
	sim.surface('/Input_Channels/9/mute', 'f', [0]) // touching something else must not redirect the script
	await until(() => engine.lastTouched?.index === 9, 'touch 9')
	engine.pressSlot(12)
	const want = engine.lib.slots['1'].steps[0].values['EQ/eq_gain_1'].a[0]
	await until(() => sim.get('/Input_Channels/6/EQ/eq_gain_1') === want, 'input 6')
	await until(() => sim.get('/Input_Channels/7/EQ/eq_gain_1') === want, 'input 7')
	assert.notEqual(sim.get('/Input_Channels/9/EQ/eq_gain_1'), want)
})

test('scripts can contain scripts and names; contents are copied, so a script can never call itself', async (t) => {
	const { sim, engine } = await rig(t)
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(1) // capture
	engine.toggleNamesRecord()
	sim.surface('/Group_Outputs/1/solo', 'f', [1])
	await until(() => engine.namesCount() === 1, 'one name')
	engine.pressSlot(2) // names

	// Inner script: EQ of slot 1
	engine.setScopes(['eq'])
	engine.toggleScriptRecord()
	engine.pressSlot(1)
	engine.toggleScriptRecord()
	engine.pressSlot(3)
	const inner = engine.lib.slots['3'].steps.length

	// Outer script: the inner script, then the names, then slot 1's fader
	engine.toggleScriptRecord()
	engine.pressSlot(3)
	engine.pressSlot(2)
	engine.setScopes(['level'])
	engine.pressSlot(1)
	engine.toggleScriptRecord()
	engine.pressSlot(4)
	const outer = engine.lib.slots['4']
	assert.equal(outer.kind, 'script')
	assert.equal(outer.steps.length, inner + 2)
	assert.ok(outer.steps.every((step) => step.fixed))

	// Record a script that includes slot 4, and store it over slot 4 itself
	engine.toggleScriptRecord()
	engine.pressSlot(4)
	engine.pressSlot(4)
	engine.toggleScriptRecord()
	engine.pressSlot(4)
	assert.equal(engine.lib.slots['4'].steps.length, (inner + 2) * 2, 'twice its old contents, by value')

	// Running it sends a fixed, finite number of messages
	await engine.transport.drained() // let the recalls made while recording finish going out
	await sleep(100)
	sim.received.length = 0
	const expected = engine.lib.slots['4'].steps.reduce((n, step) => n + Object.keys(step.values).length, 0)
	assert.equal(engine.pressSlot(4), 'recalled')
	await until(() => sim.received.length === expected, 'all script values sent')
	await sleep(100)
	assert.equal(sim.received.length, expected, 'and nothing more')

	// Emptying the slots it was built from changes nothing
	for (const id of [1, 2, 3]) engine.clearSlot(id)
	assert.equal(engine.lib.slots['4'].steps.length, (inner + 2) * 2)
})

test('an empty script recording is discarded rather than stored', async (t) => {
	const { engine } = await rig(t)
	engine.toggleScriptRecord()
	engine.toggleScriptRecord()
	assert.equal(engine.scriptHeld, null)
	assert.equal(engine.pressSlot(11), 'empty')
})

test('save names: tap channels to build a list, store it in a slot, restore it from that slot', async (t) => {
	const { sim, engine, saved } = await rig(t)
	sim.values.set('/Input_Channels/3/Channel_Input/name', { t: 's', a: ['Snare'] })
	sim.values.set('/Input_Channels/5/Channel_Input/name', { t: 's', a: ['Vox'] })
	sim.values.set('/Group_Outputs/2/Buss_Trim/name', { t: 's', a: ['Drums'] })

	assert.equal(engine.pressSlot(21), 'empty', 'an empty slot does nothing')
	engine.toggleNamesRecord()
	assert.equal(engine.stateLabel(), 'TAP SOLOS')
	assert.equal(engine.pressSlot(21), 'busy', 'nothing to store yet')
	sim.surface('/Input_Channels/3/solo', 'f', [1])
	sim.surface('/Input_Channels/5/solo', 'f', [1])
	sim.surface('/Group_Outputs/2/solo', 'f', [1])
	sim.surface('/Input_Channels/3/solo', 'f', [0]) // un-soloing the same channel adds nothing new
	await until(() => engine.namesCount() === 3, 'three names collected')
	assert.equal(engine.stateLabel(), '3 NAMES: PRESS SLOT')

	// Other buttons are inert while names are being collected
	sim.received.length = 0
	engine.toggleArm()
	assert.equal(engine.mode, 'idle')
	assert.equal(engine.mode, 'idle', 'capture cannot be armed meanwhile')

	assert.equal(engine.pressSlot(21), 'stored')
	assert.equal(engine.namesRec, null)
	const slot = saved().slots['21']
	assert.equal(slot.kind, 'names')
	assert.deepEqual(
		slot.steps.map((step) => [step.section, step.index, step.fixed, step.values]),
		[
			['Input_Channels', 3, true, { 'Channel_Input/name': { t: 's', a: ['Snare'] } }],
			['Input_Channels', 5, true, { 'Channel_Input/name': { t: 's', a: ['Vox'] } }],
			['Group_Outputs', 2, true, { 'Buss_Trim/name': { t: 's', a: ['Drums'] } }],
		],
	)
	assert.equal(engine.slotLabel(21), '3 names')
	await sleep(60)
	assert.equal(sim.received.length, 0, 'collecting and storing wrote nothing to the console')

	// Later: names change on the console; the button puts back only the saved ones
	sim.surface('/Input_Channels/3/Channel_Input/name', 's', ['x'])
	sim.surface('/Group_Outputs/2/Buss_Trim/name', 's', ['y'])
	sim.surface('/Input_Channels/4/Channel_Input/name', 's', ['Not saved'])
	engine.setScopes([]) // saved names go back whatever the scope toggles say
	assert.equal(engine.pressSlot(21), 'recalled')
	await until(() => sim.get('/Input_Channels/3/Channel_Input/name') === 'Snare', 'input name back')
	await until(() => sim.get('/Group_Outputs/2/Buss_Trim/name') === 'Drums', 'group name back')
	assert.equal(sim.get('/Input_Channels/4/Channel_Input/name'), 'Not saved', 'channels not in the list are left alone')
})

test('save names: "all names" fills the list, and pressing save names again throws it away', async (t) => {
	const { engine } = await rig(t)
	assert.equal(await engine.addAllNamesToList(['Input_Channels']), 0, 'does nothing unless collecting')
	engine.toggleNamesRecord()
	assert.equal(await engine.addAllNamesToList(['Input_Channels', 'Aux_Outputs']), 12 + 4)
	engine.toggleNamesRecord()
	assert.equal(engine.namesRec, null)
	assert.equal(engine.pressSlot(22), 'empty')
	assert.deepEqual(engine.lib.slots, {})

	// Cancel also drops it, and it can't start in the middle of a capture
	engine.toggleNamesRecord()
	engine.cancel()
	assert.equal(engine.namesRec, null)
	engine.toggleArm()
	engine.toggleNamesRecord()
	assert.equal(engine.namesRec, null)
})

test('learn mode: an unknown parameter is added to captures; solo, meters and names never are', async (t) => {
	const { sim, engine, saved } = await rig(t, { learn: true })
	sim.surface('/Input_Channels/2/Mustard/drive', 'f', [0.7])
	sim.surface('/Input_Channels/2/solo', 'f', [1])
	sim.surface('/Input_Channels/2/Dynamics/GR_meter_1', 'f', [0.1])
	sim.surface('/Input_Channels/2/Channel_Input/phantom', 'f', [1])
	sim.surface('/Input_Channels/2/EQ/eq_gain_1', 'f', [2]) // already known
	await until(() => engine.lib.learned.Input_Channels?.length === 1, 'one parameter learned')
	await sleep(80)
	assert.deepEqual(engine.lib.learned.Input_Channels, ['Mustard/drive'])
	assert.deepEqual(saved().learned.Input_Channels, ['Mustard/drive'], 'learned list is persisted')
	const snap = await engine.captureChannel('Input_Channels', 2)
	assert.equal(snap.values['Mustard/drive'].a[0], Math.fround(0.7))
	assert.equal(scopeOf('Mustard/drive'), 'other')
})

test('learn mode off (the default): unknown parameters are ignored', async (t) => {
	const { sim, engine } = await rig(t)
	sim.surface('/Input_Channels/2/Mustard/drive', 'f', [0.7])
	await until(() => engine.lastTouched?.index === 2, 'touch')
	assert.deepEqual(engine.lib.learned, {})
})

test('sending is paced to the configured rate', async (t) => {
	const { sim, engine } = await rig(t, { rate: 200 })
	await engine.captureToHold('Graphic_EQ', 1)
	engine.pressSlot(1)
	engine.setScopes(['eq'])
	sim.received.length = 0
	const started = Date.now()
	engine.pressSlot(1) // 33 values at 200/s should take roughly 160 ms
	await until(() => sim.received.length === 33, 'all GEQ values to arrive')
	const took = Date.now() - started
	assert.ok(took >= 100, `33 messages at 200/s arrived in ${took} ms, which is too fast`)
	assert.ok(took < 1500, `took ${took} ms`)
})

test('values go back with the same OSC type they were read with', async (t) => {
	const { sim, engine } = await rig(t)
	sim.values.set('/Input_Channels/1/mute', { t: 'i', a: [1] })
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(1)
	engine.setScopes(['level', 'name'])
	sim.received.length = 0
	engine.pressSlot(1)
	await until(() => sim.received.length === 3, 'fader, mute, name')
	const types = Object.fromEntries(sim.received.map((m) => [m.path.split('/').pop(), m.types]))
	assert.deepEqual(types, { fader: 'f', mute: 'i', name: 's' })
})

test('libraries from 0.1.x are converted: captures become slots of steps, scripts and name sets move into free slots', () => {
	const fader = { fader: { t: 'f', a: [0] } }
	const lib = cleanLibrary({
		version: 2,
		slots: {
			1: { section: 'Aux_Outputs', index: 2, name: 'IEM', label: 'Mon', values: fader }, // 0.1.0
			3: { label: 'Kit', channels: [{ section: 'Input_Channels', index: 1, name: 'Kick', values: fader }] },
		},
		scripts: {
			1: { name: 'Song 2', steps: [{ section: 'Input_Channels', index: 7, scopes: ['eq'], values: fader }] },
			2: { name: '', steps: [{ section: 'Input_Channels', index: 8, values: fader }] },
		},
		nameSets: { 1: { name: 'Friday', names: { Input_Channels: { 1: 'Kick', 2: 'Snare' } } }, 2: { names: {} } },
	})
	assert.deepEqual(Object.keys(lib), ['version', 'slots', 'learned'])
	assert.equal(lib.version, 3)
	assert.deepEqual(lib.slots['1'], {
		label: 'Mon',
		when: lib.slots['1'].when,
		kind: 'capture',
		steps: [{ section: 'Aux_Outputs', index: 2, name: 'IEM', fixed: false, values: fader }],
	})
	assert.equal(lib.slots['3'].kind, 'capture')
	assert.equal(lib.slots['3'].steps[0].fixed, false)
	// Scripts and name sets land in the first free slots: 2, 4, 5
	assert.deepEqual(
		['2', '4', '5'].map((id) => [lib.slots[id].kind, lib.slots[id].label, lib.slots[id].steps.length]),
		[
			['script', 'Song 2', 1],
			['script', 'Script 2', 1],
			['names', 'Friday', 2],
		],
	)
	assert.equal(lib.slots['2'].steps[0].fixed, true, 'an old script step is still sent in full')
	assert.equal(Object.keys(lib.slots).length, 5, 'the empty name set is dropped')
	// Converting again changes nothing
	assert.deepEqual(cleanLibrary(JSON.parse(JSON.stringify(lib))), lib)
})

test('validation: bad entries from the web page or an imported file are dropped or repaired', () => {
	assert.equal(cleanSlot({ section: 'Nope', index: 1, values: {} }), null)
	assert.equal(cleanSlot({ section: 'Input_Channels', index: 0, values: {} }), null)
	assert.equal(cleanSlot({ channels: [] }), null)
	assert.equal(cleanSlot({ steps: [] }), null)
	assert.equal(cleanSlot({ steps: 'nope' }), null)
	const slot = cleanSlot({
		label: 7,
		kind: 'nonsense',
		steps: [
			{
				section: 'Input_Channels',
				index: '3',
				fixed: false,
				values: {
					fader: { t: 'f', a: ['-6.5'] },
					'EQ/eq_gain_1': { t: 'f', a: [Infinity] },
					'bad path!': { t: 'f', a: [1] },
					'Channel_Input/name': { t: 's', a: [42] },
					mute: { t: 'f', a: [1, 2] },
					pan: { t: 'x', a: [1] },
				},
			},
			{ section: 'Bogus', index: 1, values: {} },
		],
	})
	assert.equal(slot.label, '7')
	assert.equal(slot.kind, 'capture', 'an unknown kind is worked out from the steps')
	assert.equal(slot.steps.length, 1, 'the invalid step is dropped')
	assert.equal(slot.steps[0].index, 3)
	assert.deepEqual(slot.steps[0].values, {
		fader: { t: 'f', a: [-6.5] },
		'Channel_Input/name': { t: 's', a: ['42'] },
	})
	assert.equal(cleanSlot({ steps: namesToSteps({ Input_Channels: { 1: 'Kick' } }) }).kind, 'names')
	assert.equal(
		cleanSlot({ steps: [{ section: 'Input_Channels', index: 1, fixed: true, values: { fader: { t: 'f', a: [0] } } }] })
			.kind,
		'script',
	)
	assert.deepEqual(cleanNames({ Input_Channels: { 1: 'Kick', x: 'bad', 2: 7 }, Bogus: { 1: 'a' } }), {
		Input_Channels: { 1: 'Kick' },
	})
	const lib = cleanLibrary({
		slots: { 1: null, 2: { section: 'Graphic_EQ', index: 1, values: {} } },
		learned: { Input_Channels: ['ok/one', 'bad one'] },
	})
	assert.deepEqual(Object.keys(lib.slots), ['2'])
	assert.deepEqual(lib.learned.Input_Channels, ['ok/one'])
	assert.deepEqual(cleanLibrary('garbage').slots, {})
})

test("console setup: picks this computer's address on the console's network and swaps the port names", () => {
	const interfaces = {
		lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true }],
		en0: [
			{ address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false },
			{ address: '10.0.0.5', netmask: '255.255.255.0', family: 'IPv4', internal: false },
		],
		en7: [{ address: '192.168.16.162', netmask: '255.255.0.0', family: 'IPv4', internal: false }],
	}
	assert.deepEqual(localAddressFor('192.168.16.231', interfaces), {
		best: '192.168.16.162',
		matched: true,
		all: ['10.0.0.5', '192.168.16.162'],
	})
	assert.equal(localAddressFor('172.16.0.9', interfaces).matched, false)
	assert.equal(localAddressFor('172.16.0.9', interfaces).best, '10.0.0.5')
	assert.deepEqual(localAddressFor('not an address', {}), { best: '', matched: false, all: [] })

	const setup = consoleSetup({ host: '192.168.16.231', sendPort: 8001, recvPort: 8000 }, interfaces)
	assert.equal(setup.type, 'DiGiCo Pad')
	assert.equal(setup.ip, '192.168.16.162')
	assert.equal(setup.send, 8000, 'the console sends to the port the module listens on')
	assert.equal(setup.rcv, 8001, 'the console receives on the port the module sends to')
	assert.deepEqual(setup.otherIps, ['10.0.0.5'])
})

test('settings page shows the console row for the saved ports', () => {
	const fields = Object.fromEntries(
		getConfigFields({ host: '10.1.2.3', sendPort: 9101, recvPort: 9100 }).map((f) => [f.id, f]),
	)
	assert.equal(fields.consoleType.value, 'DiGiCo Pad')
	assert.equal(fields.consoleSend.value, '9100')
	assert.equal(fields.consoleRcv.value, '9101')
	assert.equal(fields.consoleSend.label, 'Send')
	assert.equal(fields.consoleRcv.label, 'Rcv')
	// The link to the web page uses the connection's own label
	const link = getConfigFields({}, 'FOH desk').find((f) => f.id === 'webPage').value
	assert.ok(link.includes('href="/instance/FOH%20desk/"'), link)
	const row = ['consoleType', 'consoleName', 'consoleIp', 'consoleSend', 'consoleRcv', 'consoleEnabled']
	assert.equal(
		row.reduce((sum, id) => sum + fields[id].width, 0),
		12,
		'the row fills one line of the form',
	)
})

// ---- through the Companion class ------------------------------------------------------

class FakeBase {
	constructor() {
		this.label = 'recall'
		this.saved = null
		this.logs = []
	}
	setActionDefinitions(d) {
		this.actions = d
	}
	setFeedbackDefinitions(d) {
		this.feedbacks = d
	}
	setVariableDefinitions() {}
	setPresetDefinitions() {}
	setVariableValues() {}
	checkAllFeedbacks() {}
	updateStatus(status, text) {
		this.status = [status, text]
	}
	saveConfig(c) {
		this.saved = { ...c }
	}
	log(level, text) {
		this.logs.push([level, text])
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

test('connection status follows the console: connecting, ok, then failure when it goes away', async (t) => {
	const consolePort = nextPort++
	const modulePort = nextPort++
	const mod = new Instance({})
	t.after(() => mod.destroy())
	await mod.init({ host: '127.0.0.1', sendPort: consolePort, recvPort: modulePort })
	assert.equal(mod.status[0], 'connecting')
	const sim = new SimConsole({ listenPort: consolePort, replyPort: modulePort })
	await sim.start()
	mod.engine.refreshConsole()
	await until(() => mod.status[0] === 'ok', 'status ok')
	await sim.stop()
	mod.engine.lastReply = Date.now() - 60000 // as if a minute has passed with no replies
	mod.engine.poll()
	assert.equal(mod.status[0], 'connection_failure')
})

test('library file: written on every change and read back on start', async (t) => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'recall-')), 'library.json')
	const consolePort = nextPort++
	const modulePort = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: modulePort })
	await sim.start()
	const config = {
		host: '127.0.0.1',
		sendPort: consolePort,
		recvPort: modulePort,
		rate: 2000,
		queryTimeout: 120,
		libraryFile: file,
	}
	let mod = new Instance({})
	t.after(async () => {
		await mod.destroy()
		await sim.stop()
	})
	await mod.init(config)
	await until(() => mod.engine.counts.Aux_Outputs !== undefined, 'console info')
	await mod.actions.capture.callback({ options: { section: 'Aux_Outputs', index: 2 } })
	await mod.actions.slot.callback({ options: { slot: 9 } })
	assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).slots['9'].steps[0].section, 'Aux_Outputs')
	await mod.destroy()
	mod = new Instance({})
	await mod.init(config) // note: no library in the config, only the file
	assert.equal(mod.engine.lib.slots['9'].steps[0].index, 2)
})

test('iPad relay: datagrams pass both ways, and a value written from the iPad counts as a touch', async (t) => {
	const consolePort = nextPort++
	const modulePort = nextPort++
	const ipadListen = nextPort++
	const moduleIpadPort = nextPort++
	const sim = new SimConsole({ listenPort: consolePort, replyPort: modulePort })
	await sim.start()
	const ipad = dgram.createSocket('udp4')
	const ipadGot = []
	ipad.on('message', (buf) => ipadGot.push(...decode(buf)))
	await new Promise((r) => ipad.bind(ipadListen, r))
	const mod = new Instance({})
	t.after(async () => {
		await mod.destroy()
		await sim.stop()
		ipad.close()
	})
	await mod.init({
		host: '127.0.0.1',
		sendPort: consolePort,
		recvPort: modulePort,
		rate: 2000,
		queryTimeout: 120,
		ipadEnabled: true,
		ipadHost: '127.0.0.1',
		ipadSendPort: ipadListen,
		ipadRecvPort: moduleIpadPort,
	})
	await until(() => mod.engine.counts.Aux_Outputs !== undefined, 'console info')

	// Console to iPad
	sim.surface('/Input_Channels/1/fader', 'f', [-3])
	await until(() => ipadGot.some((m) => m.path === '/Input_Channels/1/fader'), 'iPad sees the console change')

	// iPad query: the answer reaches the iPad but is not treated as a touch
	mod.engine.lastTouched = null
	ipad.send(encode('/Input_Channels/8/EQ/eq_gain_1/?'), moduleIpadPort, '127.0.0.1')
	await until(() => ipadGot.some((m) => m.path === '/Input_Channels/8/EQ/eq_gain_1'), 'iPad gets its answer')
	await sleep(50)
	assert.equal(mod.engine.lastTouched, null)

	// iPad write: reaches the console and counts as a touch
	ipad.send(encode('/Input_Channels/8/fader', 'f', [-12]), moduleIpadPort, '127.0.0.1')
	await until(() => sim.get('/Input_Channels/8/fader') === -12, 'console gets the iPad change')
	assert.deepEqual(mod.engine.lastTouched, { section: 'Input_Channels', index: 8 })
})
