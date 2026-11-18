// The offline-software test tool, run here against the simulated console, so that a
// result from the real software can be trusted to mean what the tool says it means.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SimConsole } from './sim-console.mjs'
import { runOfflineTests, saveResults } from '../tools/offline-test.mjs'

let nextPort = 25000
async function against(t, simOpts = {}, opts = {}) {
	const send = nextPort++
	const listen = nextPort++
	const sim = new SimConsole({ listenPort: send, replyPort: listen, ...simOpts })
	await sim.start()
	t.after(() => sim.stop().catch(() => {}))
	const results = await runOfflineTests({
		host: '127.0.0.1',
		send,
		listen,
		label: 'sim',
		rate: 3000,
		queryTimeout: 120,
		...opts,
	})
	return { sim, results }
}

test('read-only run: connects, measures coverage, recognises the console family, changes nothing', async (t) => {
	const { sim, results } = await against(t, { family: 'compact' })
	assert.equal(results.connect.name, 'SimQuantum')
	assert.equal(results.coverage.busFamily, 'compact')
	assert.deepEqual(results.coverage.unexpectedSilence, [])
	assert.ok(
		results.coverage.Group_Outputs.silent.includes('EQ/eq_gain_8'),
		'what this family lacks is recorded as silent',
	)
	assert.ok('Filters/hi_filter_freq' in results.coverage.Group_Outputs.answered)
	assert.deepEqual(results.unknown.answered, [])
	assert.equal(sim.received.length, 0, 'nothing was written')
	assert.deepEqual([results.writes, results.module, results.watch], [null, null, null])
	assert.ok(results.summary.some((line) => line === 'Bus EQ family: four bands plus bus filters (SD8/9/11/12)'))
	assert.ok(
		results.summary.some((line) => line.startsWith('Every setting that did not answer is one this console family')),
	)

	const large = await against(t, { family: 'large' })
	assert.equal(large.results.coverage.busFamily, 'large')
	assert.deepEqual(large.results.coverage.unexpectedSilence, [])
})

test('a setting the module expects but the console lacks is called out', async (t) => {
	const send = nextPort++
	const listen = nextPort++
	const sim = new SimConsole({ listenPort: send, replyPort: listen })
	sim.values.delete('/Input_Channels/1/Dynamics/comp_ratio_2')
	await sim.start()
	t.after(() => sim.stop().catch(() => {}))
	const results = await runOfflineTests({
		host: '127.0.0.1',
		send,
		listen,
		label: 'sim',
		rate: 3000,
		queryTimeout: 120,
	})
	assert.deepEqual(results.coverage.unexpectedSilence, ['Input_Channels: Dynamics/comp_ratio_2'])
	assert.ok(results.summary.some((line) => line.startsWith('UNEXPECTED: 1 setting(s)')))
})

test('write run: tries each setting on one channel, runs the module functions, and leaves the channel as found', async (t) => {
	const send = nextPort++
	const listen = nextPort++
	const sim = new SimConsole({ listenPort: send, replyPort: listen })
	// A plausible strip, so that fader-to-unity and the gain nudge have room to work
	const base = '/Input_Channels/8/'
	for (const [suffix, v] of Object.entries({
		fader: -5,
		'Channel_Input/trim': 0,
		'Channel_Input/analog_gain': 30,
		'Dynamics/gate_in': 0,
		'Dynamics/comp_in': 0,
	})) {
		sim.values.set(base + suffix, { t: 'f', a: [v] })
	}
	for (const [key] of sim.values)
		if (key.startsWith(base) && /thresh/.test(key)) sim.values.set(key, { t: 'f', a: [-30] })
	// This console only takes the analogue gain in whole dB
	const handle = sim.handle.bind(sim)
	sim.handle = (m) => {
		if (m.path === `${base}Channel_Input/analog_gain` && m.args.length) m.args[0] = Math.round(m.args[0])
		handle(m)
	}
	const start = new Map([...sim.values].filter(([key]) => key.startsWith(base)).map(([key, v]) => [key, v.a[0]]))
	await sim.start()
	t.after(() => sim.stop().catch(() => {}))
	const results = await runOfflineTests({
		host: '127.0.0.1',
		send,
		listen,
		label: 'sim',
		rate: 3000,
		queryTimeout: 120,
		write: true,
		channel: 8,
	})

	assert.equal(results.writes.channel, 8)
	assert.ok(results.writes.rows.length > 80)
	assert.ok(
		results.writes.rows.every((r) => r.restored),
		'every setting put back',
	)
	assert.ok(
		results.writes.rows.every((r) => r.echoed),
		'the simulator echoes writes, and the tool sees that',
	)
	assert.deepEqual(
		results.writes.rows.filter((r) => r.alsoMoved.length).map((r) => [r.suffix, r.alsoMoved]),
		[],
		'nothing else moves on this console',
	)
	assert.ok(!results.writes.rows.some((r) => /name|solo/.test(r.suffix)), 'names and solos are left alone')
	assert.equal(results.writes.rows.find((r) => r.suffix === 'fader').result, 'exact')
	assert.ok(
		sim.received.every((m) => m.path.startsWith(base)),
		'only the one channel was written to',
	)

	assert.ok(results.module.captured > 100)
	assert.deepEqual(results.module.compareFound.sort(), ['Channel_Input/trim', 'fader'])
	assert.equal(results.module.revertedFader, true)
	assert.deepEqual([results.module.unity.faderAfter, results.module.unity.levelKept], [0, true])
	assert.deepEqual([results.module.nudge.gainAfter, results.module.nudge.levelKept], [29, true])
	assert.match(results.module.halfStep.text, /the preamp moved/, 'a whole-dB preamp is noticed')
	assert.equal(results.module.channelRestored, true)
	for (const [key, v] of start)
		if (typeof v === 'number') assert.ok(Math.abs(sim.get(key) - v) < 0.005, `${key} left as found`)
	assert.ok(!results.summary.some((line) => /NOT RESTORED|UNEXPECTED|: NO/.test(line)), results.summary.join('\n'))
})

test('watch: records what the console announces, the channel touched and gangs', async (t) => {
	const send = nextPort++
	const listen = nextPort++
	const sim = new SimConsole({ listenPort: send, replyPort: listen })
	await sim.start()
	t.after(() => sim.stop().catch(() => {}))
	const run = runOfflineTests({
		host: '127.0.0.1',
		send,
		listen,
		label: 'sim',
		rate: 3000,
		queryTimeout: 120,
		watch: 1.2,
	})
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
	await sleep(1500) // connect and coverage take about this long here; then the watch is running
	const until = Date.now() + 5000
	while (Date.now() < until) {
		sim.surface('/Input_Channels/3/fader', 'f', [-4])
		await sleep(50)
		if (await Promise.race([run.then(() => true), sleep(1).then(() => false)])) break
	}
	const results = await run
	assert.ok(results.watch.messages > 0)
	assert.deepEqual(results.watch.addresses, ['/Input_Channels/3/fader'])
	assert.deepEqual(results.watch.touched, { section: 'Input_Channels', index: 3 })
	assert.deepEqual(results.watch.events[0].args, [-4])
})

test('--set puts chosen values on the console and reports what it read back', async (t) => {
	const { sim, results } = await against(
		t,
		{},
		{
			set: [
				{ address: '/Group_Outputs/1/EQ/eq_curve_1', value: 3 },
				{ address: '/Input_Channels/2/name', value: 'Kick' },
			],
		},
	)
	assert.equal(sim.get('/Group_Outputs/1/EQ/eq_curve_1'), 3)
	assert.equal(sim.get('/Input_Channels/2/name'), 'Kick')
	assert.deepEqual(
		results.set.map((r) => r.now),
		[3, 'Kick'],
	)
	assert.ok(results.summary.some((line) => line.startsWith('Set /Group_Outputs/1/EQ/eq_curve_1 = 3: was ')))
})

test('no console: says so plainly and saves that; results are written as JSON and text', async (t) => {
	const results = await runOfflineTests({
		host: '127.0.0.1',
		send: nextPort++,
		listen: nextPort++,
		label: 'Nothing there / v1',
		rate: 3000,
		queryTimeout: 50,
	})
	assert.equal(results.connect.online, false)
	assert.match(results.summary[0], /^NO ANSWER from the console/)
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-'))
	t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
	const saved = saveResults(results, folder)
	assert.match(path.basename(saved.json), /^Nothing-there-v1_\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.json$/)
	assert.equal(JSON.parse(fs.readFileSync(saved.json, 'utf8')).label, 'Nothing there / v1')
	assert.ok(fs.readFileSync(saved.text, 'utf8').includes('NO ANSWER'))
})
