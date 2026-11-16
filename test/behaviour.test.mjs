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
import { parseNumberList } from '../src/config.js'
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

test('console families: addresses a console lacks are left out, then no longer asked for', async (t) => {
	// An SD9-style console: four-band bus EQ with filters, nothing for bands 5 to 8
	const { sim, engine, logs } = await rig(t, {}, { family: 'compact' })
	const queriesFor = async (section, index) => {
		const before = sim.queryCount
		const snap = await engine.captureChannel(section, index)
		return { snap, queries: sim.queryCount - before }
	}
	const expected = captureSuffixes('Group_Outputs', 4, [], 'compact')
	const first = await queriesFor('Group_Outputs', 1)
	assert.deepEqual(Object.keys(first.snap.values).sort(), [...expected].sort())
	assert.ok('Filters/lo_filter_freq' in first.snap.values && !('EQ/eq_gain_5' in first.snap.values))
	const second = await queriesFor('Group_Outputs', 2)
	assert.ok(
		logs.some(([, text]) => text === 'Group: 25 setting(s) this console does not have will not be asked for again'),
	)
	const third = await queriesFor('Group_Outputs', 1)
	assert.equal(third.queries, expected.length, 'asks only for what this console has')
	assert.ok(first.queries > third.queries && second.queries > third.queries)
	assert.deepEqual(third.snap.values, first.snap.values)

	// A channel that does not exist says nothing about which addresses exist
	await engine.captureChannel('Aux_Outputs', 99)
	await engine.captureChannel('Aux_Outputs', 99)
	assert.equal((await queriesFor('Aux_Outputs', 1)).snap.values['Filters/hi_filter_in'] !== undefined, true)

	// A Quantum-style console drops the bus filters instead
	const big = await rig(t)
	await big.engine.captureChannel('Matrix_Outputs', 1)
	const again = await big.engine.captureChannel('Matrix_Outputs', 2)
	assert.ok('EQ/eq_gain_8' in again.values && !('Filters/hi_filter_in' in again.values))
	assert.ok(
		big.logs.some(([, text]) => text === 'Matrix: 4 setting(s) this console does not have will not be asked for again'),
	)
	// ...and starts afresh when the console goes away and comes back
	big.engine.absent.Matrix_Outputs.set('fader', 2)
	big.engine.online = false
	big.sim.surface('/Input_Channels/1/mute', 'f', [1])
	await until(() => big.engine.online, 'back online')
	assert.deepEqual(big.engine.absent, {})
})

// A realistic input for the fader-to-unity tests: fader low, compressor in, gate out
function strip(sim, n, over = {}) {
	const base = `/Input_Channels/${n}/`
	const set = {
		fader: -12,
		'Channel_Input/trim': 3,
		'Channel_Input/analog_gain': 30,
		'Dynamics/gate_thresh': -50,
		'Dynamics/gate_in': 0,
		'Dynamics/comp_in': 1,
		'Dynamics/comp_thresh_1': -20,
		'Dynamics/comp_thresh_2': -18,
		'Dynamics/comp_thresh_3': -16,
		...Object.fromEntries(
			[1, 2, 3, 4].flatMap((b) => [
				[`EQ/eq_thresh_${b}`, -30],
				[`EQ/dynamic_eq_on_${b}`, 0],
			]),
		),
		'Aux_Send/1/send_level': -6,
		'Aux_Send/1/send_on': 1,
		'Aux_Send/2/send_level': -10,
		'Aux_Send/2/send_on': 1,
		'Aux_Send/3/send_level': -120, // down: left alone
		'Aux_Send/3/send_on': 1,
		'Aux_Send/4/send_level': -3, // not listed as pre-fader: left alone
		'Aux_Send/4/send_on': 1,
		...over,
	}
	for (const [suffix, v] of Object.entries(set)) sim.values.set(base + suffix, { t: 'f', a: [v] })
	return (suffix) => sim.get(base + suffix)
}
const settle = async (engine) => {
	await engine.transport.drained()
	await sleep(60)
}

test('fader to unity: the fader goes to 0 dB, the trim takes up the difference, thresholds and pre-fader sends follow', async (t) => {
	const { sim, engine } = await rig(t, { preFaderAuxes: [1, 2, 3], unityStepMs: 5 })
	const get = strip(sim, 5)
	sim.received.length = 0
	const result = await engine.faderToUnity('Input_Channels', 5)
	await settle(engine)
	assert.deepEqual([result.ok, result.moved, result.fader], [true, -12, 0])
	assert.equal(result.text, 'trim -12 dB, fader at 0 dB')
	assert.equal(get('fader'), 0)
	assert.equal(get('Channel_Input/trim'), -9, 'trim down by what the fader came up: same level in the mix')
	assert.equal(get('Channel_Input/analog_gain'), 30, 'the preamp is not touched')
	// Thresholds move with the trim, so the processors act on the signal as before
	assert.deepEqual(
		[1, 2, 3].map((n) => get(`Dynamics/comp_thresh_${n}`)),
		[-32, -30, -28],
	)
	assert.equal(
		get('Dynamics/gate_thresh'),
		-60,
		'a switched-out gate follows as far as it can and does not stop the move',
	)
	assert.equal(get('EQ/eq_thresh_2'), -42)
	// Pre-fader sends come up by what the trim took off; the others are left alone
	assert.deepEqual(
		[1, 2, 3, 4].map((n) => get(`Aux_Send/${n}/send_level`)),
		[6, 2, -120, -3],
	)
	// Quieter first: the trim is written before the fader comes up
	const order = sim.received.map((m) => m.path.replace('/Input_Channels/5/', ''))
	assert.ok(order.indexOf('Channel_Input/trim') < order.indexOf('fader'))
	assert.ok(order.indexOf('Channel_Input/trim') < order.indexOf('Aux_Send/1/send_level'))
	// A smooth move, not a jump: 24 half-dB steps, and at no moment is the level in the mix
	// (trim plus fader) or in a monitor (trim plus send) more than half a dB from where it began
	assert.equal(order.filter((suffix) => suffix === 'fader').length, 24)
	const now = { 'Channel_Input/trim': 3, fader: -12, 'Aux_Send/1/send_level': -6 }
	let worst = 0
	for (const m of sim.received) {
		const suffix = m.path.replace('/Input_Channels/5/', '')
		if (!(suffix in now)) continue
		assert.ok(Math.abs(m.args[0] - now[suffix]) <= 0.5 + 1e-6, `${suffix} moved more than half a dB in one step`)
		now[suffix] = m.args[0]
		worst = Math.max(
			worst,
			Math.abs(now['Channel_Input/trim'] + now.fader + 9),
			Math.abs(now['Channel_Input/trim'] + now['Aux_Send/1/send_level'] + 3),
		)
	}
	assert.ok(worst <= 0.5 + 1e-6 && worst > 0, `level strayed ${worst} dB`)
	assert.equal(engine.unityNote, result.text)
	// The console echoing these is not the operator touching the channel
	assert.equal(engine.lastTouched, null)

	// Pressed again: nothing to do
	sim.received.length = 0
	assert.equal((await engine.faderToUnity('Input_Channels', 5)).text, 'already at 0 dB')
	assert.equal(sim.received.length, 0)
})

test('fader to unity: a fader above 0 dB comes down and the trim goes up, loudest change last', async (t) => {
	const { sim, engine } = await rig(t, { preFaderAuxes: [1], unityStepMs: 5 })
	const get = strip(sim, 6, { fader: 6, 'Dynamics/comp_thresh_1': -20 })
	sim.received.length = 0
	const result = await engine.faderToUnity('Input_Channels', 6)
	await settle(engine)
	assert.equal(result.text, 'trim +6 dB, fader at 0 dB')
	assert.deepEqual(
		[get('fader'), get('Channel_Input/trim'), get('Dynamics/comp_thresh_1'), get('Aux_Send/1/send_level')],
		[0, 9, -14, -12],
	)
	const order = sim.received.map((m) => m.path.replace('/Input_Channels/6/', ''))
	assert.ok(
		order.indexOf('fader') < order.indexOf('Channel_Input/trim'),
		'the fader comes down before the trim goes up',
	)
})

test('fader to unity: stops short when a setting runs out of range, and says which', async (t) => {
	const { sim, engine } = await rig(t, { preFaderAuxes: [1, 2], unityStepMs: 2 })
	// The compressor is in and its threshold can only go 5 dB lower
	let get = strip(sim, 7, { 'Dynamics/comp_thresh_3': -55 })
	let result = await engine.faderToUnity('Input_Channels', 7)
	await settle(engine)
	assert.deepEqual([result.moved, result.limitedBy], [-5, 'comp thresh 3'])
	assert.equal(result.text, 'trim -5 dB, fader at -7 dB (stopped by comp thresh 3)')
	assert.deepEqual(
		[get('fader'), get('Channel_Input/trim'), get('Dynamics/comp_thresh_3'), get('Aux_Send/1/send_level')],
		[-7, -2, -60, -1],
	)

	// A pre-fader send that would have to go above +10 dB
	get = strip(sim, 8, { 'Aux_Send/2/send_level': 7 })
	result = await engine.faderToUnity('Input_Channels', 8)
	await settle(engine)
	assert.deepEqual([result.moved, result.limitedBy], [-3, 'aux 2 send'])
	assert.deepEqual([get('fader'), get('Aux_Send/2/send_level')], [-9, 10])

	// The trim itself at the end of its travel: nothing can move, and nothing is sent
	get = strip(sim, 9, { 'Channel_Input/trim': -40 })
	sim.received.length = 0
	result = await engine.faderToUnity('Input_Channels', 9)
	assert.deepEqual([result.ok, result.text], [false, 'cannot move: trim is at its limit'])
	assert.equal(sim.received.length, 0)
})

test('gain nudge: the preamp gain moves and the trim takes it back, so nothing after the trim changes', async (t) => {
	const { sim, engine } = await rig(t, { gainSettleMs: 10 })
	const get = strip(sim, 5) // gain 30, trim 3, fader -12
	sim.received.length = 0
	const down = await engine.nudgeGain('Input_Channels', 5, -1)
	await settle(engine)
	assert.equal(down.text, 'gain 29 dB (-1), trim +4 dB')
	assert.deepEqual([get('Channel_Input/analog_gain'), get('Channel_Input/trim')], [29, 4])
	// Only those two were written, the gain first: quieter before louder
	assert.deepEqual(
		sim.received.map((m) => m.path.replace('/Input_Channels/5/Channel_Input/', '')),
		['analog_gain', 'trim'],
	)
	assert.deepEqual([get('fader'), get('Dynamics/comp_thresh_1'), get('Aux_Send/1/send_level')], [-12, -20, -6])

	// Up: the trim comes down first, then the gain goes up
	sim.received.length = 0
	const up = await engine.nudgeGain('Input_Channels', 5, 2)
	await settle(engine)
	assert.equal(up.text, 'gain 31 dB (+2), trim +2 dB')
	assert.deepEqual(
		sim.received.map((m) => m.path.replace('/Input_Channels/5/Channel_Input/', '')),
		['trim', 'analog_gain'],
	)
	assert.equal(engine.lastTouched, null, 'the console echoing these is not a touch')
})

test('gain nudge: tap, tap, tap is three steps; then UNITY gives a new working level', async (t) => {
	// The operator's sequence: the input is clipping and the fader has been pulled down
	const { sim, engine } = await rig(t, { gainSettleMs: 5, unityStepMs: 2, preFaderAuxes: [1] })
	const get = strip(sim, 5) // gain 30, trim 3, fader -12, aux 1 at -6
	const level = () => get('Channel_Input/analog_gain') + get('Channel_Input/trim') + get('fader')
	const monitor = () => get('Channel_Input/analog_gain') + get('Channel_Input/trim') + get('Aux_Send/1/send_level')
	const [mix, mon] = [level(), monitor()]
	const taps = [
		engine.nudgeGain('Input_Channels', 5, -1),
		engine.nudgeGain('Input_Channels', 5, -1),
		engine.nudgeGain('Input_Channels', 5, -1),
	]
	const results = await Promise.all(taps)
	await settle(engine)
	assert.deepEqual(
		results.map((r) => r.gain),
		[29, 28, 27],
		'one after another, none lost',
	)
	assert.deepEqual([get('Channel_Input/analog_gain'), get('Channel_Input/trim')], [27, 6])
	assert.deepEqual([level(), monitor()], [mix, mon], 'the mix and the monitor are where they were')

	const unity = await engine.faderToUnity('Input_Channels', 5)
	await settle(engine)
	assert.equal(unity.text, 'trim -12 dB, fader at 0 dB')
	assert.deepEqual([get('Channel_Input/analog_gain'), get('Channel_Input/trim'), get('fader')], [27, -6, 0])
	assert.deepEqual(
		[level(), monitor()],
		[mix, mon],
		'still the same level, with the preamp 3 dB safer and the fader at unity',
	)
})

test('gain nudge: a preamp that moves in fixed steps, and the ends of the range', async (t) => {
	const { sim, engine } = await rig(t, { gainSettleMs: 10 })
	const get = strip(sim, 5)
	// This preamp only takes whole dB: asked for 0.5 less, it stays where it was
	const handle = sim.handle.bind(sim)
	sim.handle = (m) => {
		if (m.path.endsWith('/analog_gain') && m.args.length) m.args[0] = Math.round(m.args[0] + 0.01)
		handle(m)
	}
	const half = await engine.nudgeGain('Input_Channels', 5, -0.5)
	await settle(engine)
	assert.deepEqual(
		[get('Channel_Input/analog_gain'), get('Channel_Input/trim')],
		[30, 3],
		'the trim follows what the preamp did, which was nothing',
	)
	assert.match(half.text, /the preamp moved 0, not -0.5/)
	// Asked for 0.5 more, it goes a whole dB: the trim comes down a whole dB to match
	sim.handle = (m) => {
		if (m.path.endsWith('/analog_gain') && m.args.length) m.args[0] = Math.ceil(m.args[0] - 0.01)
		handle(m)
	}
	await engine.nudgeGain('Input_Channels', 5, 0.5)
	await settle(engine)
	assert.deepEqual([get('Channel_Input/analog_gain'), get('Channel_Input/trim')], [31, 2])
	sim.handle = handle

	// Ends of the range: a shorter step, then none
	strip(sim, 6, { 'Channel_Input/analog_gain': -19.5 })
	assert.match(
		(await engine.nudgeGain('Input_Channels', 6, -1)).text,
		/^gain -20 dB \(-0.5\), trim \+3.5 dB \(at the limit\)$/,
	)
	await settle(engine)
	sim.received.length = 0
	assert.equal((await engine.nudgeGain('Input_Channels', 6, -1)).text, 'cannot move: gain is at its limit')
	strip(sim, 7, { 'Channel_Input/trim': -40 })
	assert.equal((await engine.nudgeGain('Input_Channels', 7, 1)).text, 'cannot move: trim is at its limit')
	assert.equal((await engine.nudgeGain('Group_Outputs', 1, 1)).text, 'inputs only')
	assert.equal((await engine.nudgeGain('Input_Channels', 5, 12)).text, 'step must be up to 6 dB')
	assert.equal(sim.received.length, 0)
})

test('fader to unity: refuses what it should not touch, and says when sends were not adjusted', async (t) => {
	const { sim, engine } = await rig(t, { unityStepMs: 2 }) // no pre-fader auxes named
	const get = strip(sim, 3)
	const result = await engine.faderToUnity('Input_Channels', 3)
	await settle(engine)
	assert.equal(result.text, 'trim -12 dB, fader at 0 dB; aux sends not adjusted')
	assert.equal(get('Aux_Send/1/send_level'), -6)

	strip(sim, 4, { fader: -150 })
	sim.received.length = 0
	assert.equal((await engine.faderToUnity('Input_Channels', 4)).text, 'fader is down')
	assert.equal((await engine.faderToUnity('Group_Outputs', 1)).text, 'inputs only')
	assert.equal((await engine.faderToUnity('Input_Channels', 99)).text, 'no answer')
	assert.equal(sim.received.length, 0)
	assert.deepEqual(parseNumberList('1-6, 9;12  x 3-2 0 '), [1, 2, 3, 4, 5, 6, 9, 12])
	assert.deepEqual(parseNumberList(''), [])
})

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
	assert.equal(scopeOf('geq_gain_31'), 'geq')
	assert.equal(scopeOf('geq_in'), 'geq')
	assert.equal(scopeOf('geq__trim'), 'geq')
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

test('EQ and GEQ are separate scopes: a channel captured with its graphic can be recalled as either', async (t) => {
	const { sim, engine } = await rig(t)
	assert.deepEqual([...engine.scopes].sort(), ['eq', 'geq'], 'both are lit to begin with')
	// One capture holding a group and the graphic EQ inserted on it
	await engine.captureToHold('Group_Outputs', 1)
	await engine.captureToHold('Graphic_EQ', 2)
	engine.pressSlot(1)
	const [group, graphic] = engine.lib.slots['1'].steps
	const eqWas = group.values['EQ/eq_gain_3'].a[0]
	const geqWas = graphic.values.geq_gain_10.a[0]
	const disturb = () => {
		sim.surface('/Group_Outputs/1/EQ/eq_gain_3', 'f', [-15])
		sim.surface('/Graphic_EQ/2/geq_gain_10', 'f', [-9])
		sim.surface('/Graphic_EQ/2/geq_in', 'f', [0])
		sim.received.length = 0
	}
	const settle = async () => {
		await engine.transport.drained()
		await sleep(60)
	}

	// EQ only: the parametric EQ and filters come back, the graphic is left alone
	disturb()
	engine.setScopes(['eq'])
	engine.pressSlot(1)
	await until(() => sim.get('/Group_Outputs/1/EQ/eq_gain_3') === eqWas, 'group EQ restored')
	await settle()
	assert.ok(
		sim.received.every((m) => m.path.startsWith('/Group_Outputs/1/EQ/')),
		'nothing sent to the graphic',
	)
	assert.equal(sim.get('/Graphic_EQ/2/geq_gain_10'), -9)

	// GEQ only: the graphic comes back (bands, in/out, trim), the group's EQ is left alone
	disturb()
	engine.setScopes(['geq'])
	engine.pressSlot(1)
	await until(() => sim.get('/Graphic_EQ/2/geq_gain_10') === geqWas, 'graphic restored')
	await settle()
	assert.ok(
		sim.received.every((m) => m.path.startsWith('/Graphic_EQ/2/geq_')),
		'nothing sent to the group',
	)
	assert.equal(sim.received.length, 34, '32 bands, in/out and trim; not the name')
	assert.equal(sim.get('/Group_Outputs/1/EQ/eq_gain_3'), -15)

	// Both lit: both come back
	disturb()
	engine.setScopes(['eq', 'geq'])
	engine.pressSlot(1)
	await until(
		() => sim.get('/Graphic_EQ/2/geq_gain_10') === geqWas && sim.get('/Group_Outputs/1/EQ/eq_gain_3') === eqWas,
		'both',
	)
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
	engine.setScopes(['geq'])
	sim.received.length = 0
	const started = Date.now()
	engine.pressSlot(1) // 34 values at 200/s should take roughly 160 ms
	await until(() => sim.received.length === 34, 'all GEQ values to arrive')
	const took = Date.now() - started
	assert.ok(took >= 100, `34 messages at 200/s arrived in ${took} ms, which is too fast`)
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

// The pattern below is what the Quantum 338 offline software sent when one band of a
// ganged pair of graphic EQs (9 and 10, "PC 1 L" and "PC 1 R") was moved: the same
// control on both, 0 to 1 ms apart, about twenty times per move. offset is how far apart
// the two curves sit: ganged graphics track each other from wherever each one was.
async function moveGanged(sim, band, values, offset = 0, members = [9, 10]) {
	for (const v of values) {
		sim.surface(`/Graphic_EQ/${members[0]}/geq_gain_${band}`, 'f', [v])
		sim.surface(`/Graphic_EQ/${members[1]}/geq_gain_${band}`, 'f', [v + offset])
		await sleep(12)
	}
}

test('gangs: two graphic EQs that always move together are recognised as a pair', async (t) => {
	const { sim, engine } = await rig(t, { audit: true }, { counts: { Graphic_EQ: 12 } })
	sim.values.set('/Graphic_EQ/9/name', { t: 's', a: ['PC 1 L'] })
	sim.values.set('/Graphic_EQ/10/name', { t: 's', a: ['PC 1 R'] })

	// A single graphic moved on its own: no gang
	for (const v of [-4.7, -5.5, -6.4, -7.37]) {
		sim.surface('/Graphic_EQ/1/geq_gain_12', 'f', [v])
		await sleep(12)
	}
	await until(() => engine.lastTouched?.index === 1, 'GEQ 1 touched')
	assert.deepEqual(engine.gangList(), [])

	await moveGanged(sim, 13, [-0.5, -1.2, -2.1, -3.02])
	await until(() => engine.gangList().length === 1, 'pair recognised')
	assert.deepEqual(engine.gangList(), [{ section: 'Graphic_EQ', members: [9, 10] }])
	assert.deepEqual(engine.gangPartners('Graphic_EQ', 9), [10])
	assert.deepEqual(engine.gangPartners('Graphic_EQ', 10), [9])
	assert.deepEqual(engine.gangPartners('Graphic_EQ', 1), [])
	await until(() => engine.touchedLabel() === 'GEQ 9+10 PC 1 L', 'the buttons name the pair')
	assert.ok(engine.audit.entries.some((e) => e.to === 'Ganged: Graphic EQ 9 and 10 move together'))
	assert.equal(engine.status().gangs.length, 1)
})

test('gangs: a pair with different curves is recognised by moving the same amount', async (t) => {
	const { sim, engine } = await rig(t, {}, { counts: { Graphic_EQ: 12 } })
	// The right side sits 4 dB below the left on this band, and tracks it
	await moveGanged(sim, 8, [2, 1.25, 0.5, -0.25, -1, -1.75], -4)
	await until(() => engine.gangList().length === 1, 'pair recognised from equal movement')
	assert.deepEqual(engine.gangList(), [{ section: 'Graphic_EQ', members: [9, 10] }])

	// Two graphics changing the same band at the same moment by different amounts are not a pair
	for (const [a, b] of [
		[1, 5],
		[2, 3],
		[3, 8],
		[4, 2],
		[5, 9],
	]) {
		sim.surface('/Graphic_EQ/3/geq_gain_8', 'f', [a])
		sim.surface('/Graphic_EQ/4/geq_gain_8', 'f', [b])
		await sleep(12)
	}
	await sleep(60)
	assert.deepEqual(engine.gangPartners('Graphic_EQ', 3), [])
})

test('gangs: one coincidence is not enough, and different kinds of channel are never paired', async (t) => {
	const { sim, engine } = await rig(t)
	// Two inputs muted at the same instant, once (a snapshot, or two fingers)
	sim.surface('/Input_Channels/1/mute', 'f', [1])
	sim.surface('/Input_Channels/2/mute', 'f', [1])
	// An input and a group that happen to report the same thing repeatedly
	for (let i = 0; i < 5; i++) {
		sim.surface('/Input_Channels/3/fader', 'f', [-i])
		sim.surface('/Group_Outputs/3/fader', 'f', [-i])
		await sleep(12)
	}
	await sleep(60)
	assert.deepEqual(engine.gangList(), [])
})

test('gangs: a recall writes to one member only, and the others follow by the same amount', async (t) => {
	const { sim, engine } = await rig(t, { audit: true }, { counts: { Graphic_EQ: 12 } })
	sim.gangs.push({ section: 'Graphic_EQ', members: [9, 10] })
	await engine.captureToHold('Graphic_EQ', 1)
	engine.pressSlot(1)
	const want = engine.lib.slots['1'].steps[0].values.geq_gain_20.a[0]

	// The pair has different curves: band 20 sits 2 dB apart
	sim.values.set('/Graphic_EQ/10/geq_gain_20', { t: 'f', a: [Math.fround(sim.get('/Graphic_EQ/9/geq_gain_20') + 2)] })
	await moveGanged(sim, 16, [-1, -2, -3, -3.4])
	await until(() => engine.gangList().length === 1, 'pair recognised')
	const side = engine.lastTouched.index // whichever member reported last
	const other = side === 9 ? 10 : 9
	const apart = sim.get(`/Graphic_EQ/${other}/geq_gain_20`) - sim.get(`/Graphic_EQ/${side}/geq_gain_20`)
	assert.equal(Math.abs(apart), 2)
	engine.setTargetMode('touched')
	engine.setScopes(['geq'])
	sim.received.length = 0
	assert.equal(engine.pressSlot(1), 'recalled')
	await until(() => sim.get(`/Graphic_EQ/${side}/geq_gain_20`) === want, 'touched side set exactly')
	await engine.transport.drained()
	await sleep(80)
	assert.ok(
		sim.received.every((m) => m.path.startsWith(`/Graphic_EQ/${side}/`)),
		'nothing is written to the other side',
	)
	assert.equal(sim.get(`/Graphic_EQ/${side}/geq_gain_20`), want, 'and the touched side stays where it was put')
	assert.equal(
		sim.get(`/Graphic_EQ/${other}/geq_gain_20`),
		Math.fround(want + apart),
		'the other side keeps its 2 dB difference',
	)
	assert.notEqual(sim.get('/Graphic_EQ/11/geq_gain_20'), want, 'a graphic outside the pair is untouched')
	// The other side moving in step is the console's doing: it is not taken for a touch
	assert.equal(engine.lastTouched.index, side)
	assert.deepEqual(engine.gangList(), [{ section: 'Graphic_EQ', members: [9, 10] }])
	assert.match(
		JSON.stringify(engine.audit.entries),
		new RegExp(`ganged GEQ ${other}.* left to follow by the same amount`),
	)

	// A capture of both sides, recalled to where it came from, writes the first side only
	engine.setTargetMode('original')
	await engine.captureToHold('Graphic_EQ', 9)
	await engine.captureToHold('Graphic_EQ', 10)
	engine.pressSlot(2)
	sim.received.length = 0
	engine.pressSlot(2)
	await engine.transport.drained()
	await sleep(60)
	assert.ok(sim.received.length > 0 && sim.received.every((m) => m.path.startsWith('/Graphic_EQ/9/')))

	// A capture of one channel sent back to its own channel is unaffected by gangs elsewhere
	sim.received.length = 0
	engine.pressSlot(1)
	await engine.transport.drained()
	await sleep(60)
	assert.ok(sim.received.length > 0 && sim.received.every((m) => m.path.startsWith('/Graphic_EQ/1/')))
})

test('gangs: when one member keeps moving alone, the pair is dropped; one lone report is forgiven', async (t) => {
	const { sim, engine } = await rig(t, { audit: true }, { counts: { Graphic_EQ: 12 } })
	await moveGanged(sim, 24, [1, 2, 3, 4.5])
	await until(() => engine.gangList().length === 1, 'pair recognised')
	await sleep(120)
	// One report from GEQ 9 alone (its partner pinned at the end of its range, say), then together again
	sim.surface('/Graphic_EQ/9/geq_gain_24', 'f', [5])
	await sleep(120)
	await moveGanged(sim, 24, [5.5, 6])
	await sleep(120)
	assert.equal(engine.gangList().length, 1, 'still a pair')
	// Un-ganged on the console: now only GEQ 9 moves, repeatedly
	for (const v of [5, 4, 3, 2, 1]) {
		sim.surface('/Graphic_EQ/9/geq_gain_24', 'f', [v])
		await sleep(100)
	}
	await until(() => engine.gangList().length === 0, 'pair dropped')
	assert.ok(engine.audit.entries.some((e) => e.to === 'No longer ganged: Graphic EQ 9 and 10'))
	assert.equal(engine.touchedLabel().startsWith('GEQ 9'), true)
	assert.equal(engine.touchedLabel().includes('+'), false)
})

test('audit log: off by default, and nothing is recorded until it is switched on', async (t) => {
	const { sim, engine } = await rig(t)
	assert.equal(engine.audit.enabled, false)
	sim.surface('/Input_Channels/1/fader', 'f', [-5])
	await until(() => engine.lastTouched?.index === 1, 'touch')
	await engine.captureToHold('Input_Channels', 1)
	engine.pressSlot(1)
	assert.equal(engine.audit.entries.length, 0)
})

test('audit log: operator changes are timestamped, a fader move is one entry with from and to', async (t) => {
	const { sim, engine } = await rig(t, { audit: true })
	sim.values.set('/Input_Channels/5/Channel_Input/name', { t: 's', a: ['Vox'] })
	await engine.captureChannel('Input_Channels', 5) // gives the log "before" values and the name
	const start = Date.now()
	for (const v of [-10, -8, -6, -4.25]) sim.surface('/Input_Channels/5/fader', 'f', [v])
	sim.surface('/Input_Channels/5/mute', 'f', [1])
	sim.surface('/Group_Outputs/2/EQ/eq_gain_1', 'f', [3])
	sim.out('/Input_Channels/5/Dynamics/GR_meter_1', 'f', [0.5]) // meters are never logged
	sim.out('/Snapshots/Current_Snapshot', 'i', [7]) // not a channel, still worth a line
	sim.out('/Console/Name', 's', ['SimQuantum']) // housekeeping, not logged
	await until(() => engine.audit.entries.filter((e) => e.type === 'change').length === 4, 'four changes')
	await sleep(60)
	const changes = engine.audit.entries.filter((e) => e.type === 'change')
	assert.equal(changes.length, 4, 'fader burst merged; meter and console name ignored')

	const fader = changes.find((e) => e.parameter === 'fader')
	assert.equal(fader.channel, 'In 5 Vox')
	assert.equal(fader.to, '-4.25')
	assert.notEqual(fader.from, '', 'the value before the move is known from the earlier read')
	assert.equal(fader.count, 4)
	assert.ok(fader.t >= start && fader.t2 >= fader.t && fader.t2 <= Date.now())
	assert.equal(changes.find((e) => e.parameter === 'mute').to, '1')
	assert.equal(changes.find((e) => e.channel.startsWith('Grp 2')).parameter, 'EQ/eq_gain_1')
	const snapshot = changes.find((e) => e.channel === 'Snapshots')
	assert.equal(snapshot.parameter, 'Current_Snapshot')
	assert.equal(snapshot.to, '7')
	assert.equal(engine.audit.lastText().length > 0, true)

	// A second move on the same fader later is a new entry, starting from where the first ended
	await sleep(1600)
	sim.surface('/Input_Channels/5/fader', 'f', [0])
	await until(() => engine.audit.entries.filter((e) => e.parameter === 'fader').length === 2, 'second fader entry')
	const again = engine.audit.entries.filter((e) => e.parameter === 'fader')[1]
	assert.equal(again.from, '-4.25')
	assert.equal(again.to, '0')
})

test('audit log: what the module does is recorded as events, and its own writes are not logged as operator changes', async (t) => {
	const { sim, engine } = await rig(t, { audit: true })
	await until(() => engine.audit.entries.some((e) => /Console connected/.test(e.to)), 'connection logged')
	await engine.captureToHold('Input_Channels', 3)
	engine.pressSlot(4)
	engine.setScopes(['eq', 'comp'])
	engine.pressSlot(4)
	await engine.transport.drained()
	await sleep(150) // the console echoes every value back
	engine.setClearMode(true)
	engine.pressSlot(4)
	const events = engine.audit.entries.filter((e) => e.type === 'event').map((e) => e.to)
	assert.ok(
		events.some((text) => /^Stored capture in slot 4: In 3/.test(text)),
		events.join(' | '),
	)
	assert.ok(
		events.some((text) => /^Recalled slot 4 \(In 3 In3\) \[EQ COMP\]: \d+ values to In 3/.test(text)),
		events.join(' | '),
	)
	assert.ok(events.includes('Cleared slot 4'))
	assert.equal(
		engine.audit.entries.filter((e) => e.type === 'change').length,
		0,
		'echoes and query replies are not changes',
	)

	engine.audit.setEnabled(false)
	sim.surface('/Input_Channels/3/mute', 'f', [1])
	await sleep(60)
	assert.equal(engine.audit.entries[engine.audit.entries.length - 1].to, 'Audit log switched off')
})

test('audit log: written to one CSV file per day when a folder is set', async (t) => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-log-'))
	const { sim, engine } = await rig(t, { audit: true, auditFolder: folder })
	sim.surface('/Input_Channels/2/Channel_Input/name', 's', ['Say "hi", ok'])
	sim.surface('/Input_Channels/2/fader', 'f', [-3])
	await until(() => engine.audit.entries.filter((e) => e.type === 'change').length === 2, 'two changes')
	engine.audit.flush(true)
	const files = fs.readdirSync(folder)
	assert.equal(files.length, 1)
	assert.match(files[0], /^digico-recall-log-\d{4}-\d{2}-\d{2}\.csv$/)
	const lines = fs.readFileSync(path.join(folder, files[0]), 'utf8').trim().split('\n')
	assert.equal(lines[0], '"time","source","channel","parameter","from","to","messages","address"')
	const faderLine = lines.find((line) => line.endsWith(',"fader","","-3","1","/Input_Channels/2/fader"'))
	assert.ok(faderLine, lines.join('\n'))
	assert.match(faderLine, /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z","console","In 2 /)
	assert.ok(
		lines.some((line) => line.includes('"Say ""hi"", ok"')),
		'quotes and commas are escaped',
	)
	// Flushing again writes nothing twice
	engine.audit.flush(true)
	assert.equal(fs.readFileSync(path.join(folder, files[0]), 'utf8').trim().split('\n').length, lines.length)
})

test('meter capture: records pushed and polled meter data with timing, asks only read queries, saves a file', async (t) => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-meters-'))
	const { sim, engine } = await rig(t, { auditFolder: folder })
	// A console that pushes a meter stream unasked, answers one meter address when asked,
	// and also sends an untagged packet the decoder can't read
	sim.values.set('/Input_Channels/4/Channel_Input/post_meter/left', { t: 'f', a: [-18.5] })
	sim.values.set('/Group_Outputs/1/Dynamics/GR_meter_1', { t: 'f', a: [3] })
	const stream = setInterval(() => sim.out('/Meters/values', 'iiii', [1, 40, 2, 55]), 20)
	t.after(() => clearInterval(stream))
	sim.surface('/Input_Channels/4/solo', 'f', [1])
	await until(() => engine.lastTouched?.index === 4, 'touch input 4')
	sim.received.length = 0

	assert.equal(engine.startMeterCapture(1), true)
	assert.equal(engine.startMeterCapture(1), false, 'one at a time')
	assert.equal(engine.status().meterCapturing, true)
	sim.socket.send(
		Buffer.concat([Buffer.from('/Meters/raw\0'), Buffer.from([1, 2, 3, 4])]),
		engine.cfg.recvPort,
		'127.0.0.1',
	)
	sim.surface('/Input_Channels/4/fader', 'f', [-3]) // ordinary traffic: counted, not stored
	await until(() => engine.meterCaptures.length === 1, 'capture to finish', 3000)
	const cap = engine.meterCaptures[0]

	assert.equal(engine.status().meterCapturing, false)
	assert.equal(cap.console, 'SimQuantum')
	assert.deepEqual(cap.targets[0], { section: 'Input_Channels', index: 4 }, 'the last touched channel comes first')
	assert.ok(cap.targets.some((x) => x.section === 'Group_Outputs' && x.index === 1))
	assert.ok(cap.queries.includes('/Input_Channels/4/Channel_Input/post_meter/left'))
	assert.ok(cap.pollRounds >= 1)

	// The pushed stream: present in the listen-only phase, with values and timing
	const pushed = cap.byAddress['/Meters/values']
	assert.ok(pushed.count > 20, `stream packets: ${pushed.count}`)
	assert.ok(pushed.unasked > 5, 'seen before any query was sent')
	assert.deepEqual([pushed.min, pushed.max, pushed.types], [1, 55, ['iiii']])
	const streamPackets = cap.packets.filter((pkt) => pkt.messages[0]?.path === '/Meters/values')
	assert.ok(
		streamPackets.every((pkt, i) => i === 0 || pkt.ms >= streamPackets[i - 1].ms),
		'in time order',
	)
	assert.ok(streamPackets[0].hex.startsWith(Buffer.from('/Meters/values').toString('hex')), 'raw bytes are kept')

	// A polled meter: only arrives after the listen-only phase
	const polled = cap.byAddress['/Input_Channels/*/Channel_Input/post_meter/left']
	assert.ok(polled.count >= 1 && polled.unasked === 0)
	assert.equal(polled.max, -18.5)
	assert.equal(cap.byAddress['/Group_Outputs/*/Dynamics/GR_meter_1'].max, 3)

	// The packet with no type tags is kept raw; ordinary traffic is only counted
	assert.ok(cap.packets.some((pkt) => pkt.hex.startsWith(Buffer.from('/Meters/raw').toString('hex'))))
	assert.equal(cap.other['/Input_Channels/*/fader'], 1)
	assert.ok(!cap.packets.some((pkt) => pkt.messages.some((m) => m.path.endsWith('/fader'))))

	// Reads only: the console received no value writes during the capture
	assert.equal(sim.received.length, 0)

	// Saved next to the audit log, and summarised without the packet list for the web page
	const files = fs.readdirSync(folder).filter((name) => name.startsWith('digico-recall-meters-'))
	assert.equal(files.length, 1)
	assert.equal(JSON.parse(fs.readFileSync(path.join(folder, files[0]), 'utf8')).meterDatagrams, cap.packets.length)
	const [summary] = engine.meterCaptureList()
	assert.equal(summary.packets, undefined)
	assert.ok(summary.addressesWithValues >= 3)
})

test('meter capture: a console that sends no meter data still produces a useful, empty result', async (t) => {
	const { engine } = await rig(t)
	engine.startMeterCapture(0.3)
	await until(() => engine.meterCaptures.length === 1, 'capture to finish', 2000)
	const cap = engine.meterCaptures[0]
	assert.equal(cap.meterDatagrams, 0)
	assert.deepEqual(cap.byAddress, {})
	assert.deepEqual(
		cap.targets.map((x) => x.section),
		['Input_Channels', 'Group_Outputs', 'Aux_Outputs'],
	)
	assert.ok(cap.queries.length > 30, 'it still says what it asked for')
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

	// With the relay on, a meter capture snoops: it records what the iPad asks for and
	// everything the console sends back, and sends no queries of its own
	assert.equal(mod.engine.status().relay, true)
	const queriesBefore = sim.queryCount
	assert.equal(mod.engine.startMeterCapture(0.6), true)
	ipad.send(encode('/Meters/request/8', 's', ['post']), moduleIpadPort, '127.0.0.1')
	ipad.send(encode('/Input_Channels/8/EQ/eq_gain_1/?'), moduleIpadPort, '127.0.0.1')
	for (let i = 0; i < 5; i++) sim.out('/Meters/values', 'ii', [8, 40 + i])
	sim.surface('/Input_Channels/2/fader', 'f', [-1]) // ordinary traffic is kept too in this mode
	await until(() => mod.engine.meterCaptures.length === 1, 'capture to finish', 3000)
	const cap = mod.engine.meterCaptures[0]
	assert.equal(cap.mode, 'snoop')
	assert.equal(cap.pollRounds, 0)
	assert.deepEqual(cap.queries, [])
	assert.equal(sim.queryCount - queriesBefore, 1, "the only query the console saw was the iPad's own")
	assert.deepEqual(cap.ipadAsked['/Meters/request/*'], { count: 1, types: 's', example: ['post'] })
	assert.ok(cap.ipadAsked['/Input_Channels/*/EQ/eq_gain_1/?'])
	assert.equal(cap.ipadPackets.length, 2)
	assert.equal(cap.byAddress['/Meters/values'].count, 5)
	assert.ok(cap.packets.some((pkt) => pkt.messages.some((m) => m.path === '/Input_Channels/2/fader')))
	assert.ok(
		cap.packets.some((pkt) => pkt.messages.some((m) => m.path === '/Input_Channels/8/EQ/eq_gain_1')),
		'the reply to the iPad',
	)
	assert.equal(mod.engine.meterCaptureList()[0].ipadPackets, undefined)
})
