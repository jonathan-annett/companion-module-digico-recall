// Tests the module against a console or the DiGiCo offline software, with no Companion
// and no clicking, and writes down what it found. Needs only Node 22: no install step.
//
//   node tools/offline-test.mjs --label "Quantum 338 offline" [--host 127.0.0.1] [--send 8001] [--listen 8000]
//                               [--write] [--channel 48] [--watch 60] [--out test-results]
//                               [--set /Group_Outputs/1/EQ/eq_curve_1=2 ...]
//
// What it does, in order:
//   1. connect     asks for the console's name and channel counts
//   2. coverage    asks one channel of each kind for every setting the module knows, and
//                  records which answer, with what type and value. Read-only.
//   3. unknown     asks for a setting that does not exist and records what comes back
//   4. writes      (only with --write) on ONE input channel: changes each setting a little,
//                  reads it back, puts it back. Shows which settings can be set, how the
//                  software rounds them, and whether it announces the change.
//   5. module      (only with --write) runs the module's own engine against that channel:
//                  capture, change, compare, put back, fader to unity, gain nudge
//   6. watch       (only with --watch N) listens for N seconds and records everything the
//                  console announces, for when someone moves controls with the mouse
// --set address=value (any number of them) writes those values first and reads them back,
// for putting the console into a known state before looking at its screen.
//
// --write changes the session that is open, on the one channel named by --channel (the
// highest-numbered input unless told otherwise). Every value is put back afterwards and
// that is checked, but use a scratch session all the same.
//
// Close Companion's connection to the console first: only one program can listen on the port.
// The External Control device on the console must point at this computer (127.0.0.1 works
// when the software runs on the same PC) with send port = --listen and receive port = --send.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Engine } from '../src/engine.js'
import { SECTIONS, captureSuffixes, meterSuffixes, onFamily, scopeOf } from '../src/params.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (n) => Math.round(n * 1000) / 1000
const same = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005

/** Settings the write test leaves alone: names, and things that reroute or mute audio in ways a nudge cannot describe. */
const NO_WRITE = /(^|\/)name$|solo|insert|main_alt|phantom/i

/**
 * Run the tests.
 * @param {object} o  host, send, listen, label, write, channel, watch, rate, queryTimeout, log
 * @returns {Promise<object>} the results, ready to save
 */
export async function runOfflineTests(o) {
	const log = o.log ?? (() => {})
	const heard = [] // everything the console sends that nobody asked for
	let listening = false
	const engine = new Engine(
		{
			ip: o.host,
			sendPort: o.send,
			recvPort: o.listen,
			rate: o.rate ?? 300,
			queryTimeout: o.queryTimeout ?? 500,
			unityStepMs: 40,
		},
		{ log: () => {} },
	)
	const onMessage = engine.onMessage.bind(engine)
	engine.onMessage = (m) => {
		if (listening) heard.push({ t: Date.now(), path: m.path, types: m.types, args: m.args })
		onMessage(m)
	}
	const results = {
		tool: 'offline-test',
		label: o.label,
		when: new Date().toISOString(),
		target: `${o.host}:${o.send}, listening on ${o.listen}`,
		connect: null,
		set: null,
		coverage: null,
		unknown: null,
		writes: null,
		module: null,
		watch: null,
		summary: [],
	}
	const say = (line) => {
		results.summary.push(line)
		log(line)
	}
	engine.start()
	try {
		// ---- 1. connect ---------------------------------------------------------------
		for (let i = 0; i < 30 && !(engine.online && engine.counts.Input_Channels !== undefined); i++) await sleep(100)
		results.connect = { online: engine.online, name: engine.consoleName, counts: { ...engine.counts } }
		if (!engine.online) {
			say(
				'NO ANSWER from the console. Check External Control: enabled, device row pointing at this computer, ticked, command set loaded. Try setting Enable External Control to NO and back to YES.',
			)
			return results
		}
		say(
			`Connected: "${engine.consoleName}", ${Object.entries(engine.counts)
				.map(([k, v]) => `${SECTIONS[k]?.label ?? k} ${v}`)
				.join(', ')}`,
		)

		// ---- --set: put chosen values on the console, and read them back -----------------
		if (o.set?.length) {
			results.set = []
			for (const { address, value } of o.set) {
				const was = (await engine.queryMany([address])).get(address)
				const type = was?.t === 'i' ? 'i' : typeof value === 'string' ? 's' : 'f'
				engine.transport.send(address, type, [type === 'i' ? Math.round(value) : value])
				await engine.transport.drained()
				await sleep(200)
				const now = (await engine.queryMany([address])).get(address)
				results.set.push({ address, asked: value, was: was?.a[0] ?? null, now: now?.a[0] ?? null })
				say(`Set ${address} = ${value}: was ${was?.a[0] ?? 'no answer'}, now ${now?.a[0] ?? 'no answer'}`)
			}
		}

		// ---- 2. coverage --------------------------------------------------------------
		results.coverage = {}
		let busFamily = null
		for (const section of Object.keys(SECTIONS)) {
			if (!engine.count(section)) continue
			const suffixes = [...captureSuffixes(section, engine.count('Aux_Outputs')), ...meterSuffixes(section)]
			const base = `/${section}/1/`
			const got = await engine.queryMany(suffixes.map((s) => base + s))
			const answered = {}
			const silent = []
			for (const s of suffixes) {
				const v = got.get(base + s)
				if (v) answered[s] = { t: v.t, a: v.a.map((x) => (typeof x === 'number' ? round(x) : x)) }
				else silent.push(s)
			}
			results.coverage[section] = { asked: suffixes.length, answered, silent }
			if (section === 'Group_Outputs') {
				busFamily = 'Filters/hi_filter_freq' in answered ? 'compact' : 'EQ/eq_gain_8' in answered ? 'large' : null
			}
		}
		results.coverage.busFamily = busFamily
		// Is every silence one the command sets predict for this family?
		const surprises = []
		for (const [section, r] of Object.entries(results.coverage)) {
			if (!r?.silent) continue
			for (const s of r.silent) {
				const expectedSilent = (busFamily && !onFamily(busFamily, section, s)) || meterSuffixes(section).includes(s)
				if (!expectedSilent) surprises.push(`${section}: ${s}`)
			}
		}
		results.coverage.unexpectedSilence = surprises
		for (const [section, r] of Object.entries(results.coverage)) {
			if (r?.answered)
				say(`Coverage ${SECTIONS[section].label}: ${Object.keys(r.answered).length} of ${r.asked} answered`)
		}
		say(
			`Bus EQ family: ${busFamily === 'large' ? 'eight bands, no bus filters (Quantum, SD5/7/10)' : busFamily === 'compact' ? 'four bands plus bus filters (SD8/9/11/12)' : 'could not tell'}`,
		)
		say(
			surprises.length
				? `UNEXPECTED: ${surprises.length} setting(s) the module expects did not answer: ${surprises.slice(0, 12).join('; ')}${surprises.length > 12 ? ' ...' : ''}`
				: 'Every setting that did not answer is one this console family is not expected to have, or a meter',
		)
		const meters = Object.entries(results.coverage).flatMap(([section, r]) =>
			r?.answered
				? meterSuffixes(section)
						.filter((s) => s in r.answered)
						.map((s) => `${section}: ${s}`)
				: [],
		)
		say(meters.length ? `Meters that answered a query: ${meters.join('; ')}` : 'No meter address answered a query')

		// ---- 3. an address that does not exist ---------------------------------------
		heard.length = 0
		listening = true
		const bogus = ['/Input_Channels/1/no_such_setting', '/Input_Channels/9999/fader', '/No_Such_Section/1/fader']
		const bogusGot = await engine.queryMany(bogus)
		await sleep(300)
		listening = false
		results.unknown = {
			asked: bogus,
			answered: [...bogusGot.keys()],
			alsoHeard: heard.filter((m) => !/Console/.test(m.path)).slice(0, 20),
		}
		say(
			results.unknown.answered.length || results.unknown.alsoHeard.length
				? `UNEXPECTED: asking for things that do not exist produced ${results.unknown.answered.length} answer(s) and ${results.unknown.alsoHeard.length} other message(s)`
				: 'Asking for settings that do not exist is ignored in silence',
		)

		if (o.write) {
			const index = o.channel ?? engine.count('Input_Channels')
			const section = 'Input_Channels'
			const base = `/${section}/${index}/`

			// ---- 4. writes ------------------------------------------------------------
			const before = await engine.captureChannel(section, index)
			const rows = []
			let previous = '' // the setting just put back: its late echo is not a side effect of the next write
			for (const [suffix, v] of Object.entries(before.values)) {
				const was = v.a[0]
				if (typeof was !== 'number' || NO_WRITE.test(suffix)) continue
				const isSwitch = (was === 0 || was === 1) && /(_on|_in|mute|polarity|pad|listen|in$|post$)/i.test(suffix)
				const tries = isSwitch ? [was ? 0 : 1] : [was + 1, was - 1, was * 1.1 + 0.5]
				const row = { suffix, scope: scopeOf(suffix), type: v.t, was: round(was), result: 'refused', echoed: false }
				for (const want of tries) {
					heard.length = 0
					listening = true
					engine.sendValues(
						section,
						index,
						{ [suffix]: { t: v.t, a: [v.t === 'i' ? Math.round(want) : Math.fround(want)] } },
						null,
					)
					await engine.transport.drained()
					await sleep(120)
					listening = false
					const now = (await engine.queryMany([base + suffix])).get(base + suffix)?.a[0]
					row.asked = round(want)
					row.got = typeof now === 'number' ? round(now) : null
					row.echoed = heard.some((m) => m.path === base + suffix)
					// what else moved when this was written (ganged or linked settings)
					row.alsoMoved = [
						...new Set(
							heard
								.filter((m) => m.path !== base + suffix && m.path !== previous && !/meter|^\/Console\//i.test(m.path))
								.map((m) => m.path),
						),
					].slice(0, 8)
					if (same(now, want)) row.result = 'exact'
					else if (typeof now === 'number' && !same(now, was)) row.result = 'changed to something else'
					if (row.result !== 'refused') break
				}
				// put it back, and check
				engine.sendValues(section, index, { [suffix]: v }, null)
				await engine.transport.drained()
				await sleep(80)
				const back = (await engine.queryMany([base + suffix])).get(base + suffix)?.a[0]
				row.restored = same(back, was)
				previous = base + suffix
				rows.push(row)
			}
			const count = (pred) => rows.filter(pred).length
			results.writes = { channel: index, rows }
			say(
				`Writes on input ${index}: ${rows.length} settings tried; ${count((r) => r.result === 'exact')} took the value exactly, ${count((r) => r.result === 'changed to something else')} changed to a different value, ${count((r) => r.result === 'refused')} did not change`,
			)
			say(`Writes announced back by the console: ${count((r) => r.echoed)} of ${rows.length}`)
			const notBack = rows.filter((r) => !r.restored).map((r) => r.suffix)
			say(
				notBack.length
					? `NOT RESTORED (check the session): ${notBack.join(', ')}`
					: 'Every setting was put back and read back as it was',
			)
			const other = rows
				.filter((r) => r.result === 'changed to something else')
				.map((r) => `${r.suffix} asked ${r.asked} got ${r.got}`)
			if (other.length) say(`Rounded or limited: ${other.slice(0, 10).join('; ')}${other.length > 10 ? ' ...' : ''}`)
			const linked = rows.filter((r) => r.alsoMoved.length).map((r) => `${r.suffix} also moved ${r.alsoMoved.length}`)
			if (linked.length) say(`Writing one setting moved others: ${linked.slice(0, 8).join('; ')}`)

			// ---- 5. the module's own functions ----------------------------------------
			const mod = {}
			const read = async (suffix) => (await engine.queryMany([base + suffix])).get(base + suffix)?.a[0]
			const write = async (values) => {
				const map = {}
				for (const [suffix, x] of Object.entries(values)) map[suffix] = { t: before.values[suffix]?.t ?? 'f', a: [x] }
				engine.sendValues(section, index, map, null)
				await engine.transport.drained()
				await sleep(150)
			}
			// capture, change three things, compare, put back
			await engine.captureToHold(section, index)
			engine.pressSlot(1)
			const stored = engine.lib.slots['1']?.steps[0]
			mod.captured = stored ? Object.keys(stored.values).length : 0
			const f0 = stored?.values.fader?.a[0]
			await write({
				fader: f0 > -20 ? f0 - 7 : f0 + 7,
				'Channel_Input/trim': (stored?.values['Channel_Input/trim']?.a[0] ?? 0) + 2,
			})
			const diff = (await engine.compareSlot(1, true))[0]?.now ?? {}
			const changed = Object.keys(stored?.values ?? {}).filter(
				(s) => diff[s] && typeof diff[s].a[0] === 'number' && !same(diff[s].a[0], stored.values[s].a[0]),
			)
			mod.compareFound = changed
			engine.revertValues(1, 0, changed)
			await engine.transport.drained()
			await sleep(200)
			mod.revertedFader = same(await read('fader'), f0)
			say(
				`Module: captured ${mod.captured} values; after changing fader and trim the comparison found [${changed.join(', ')}]; put back: ${mod.revertedFader ? 'yes' : 'NO'}`,
			)

			// fader to unity: fader down 10, then ask for unity; trim + fader must be unchanged
			await write({ fader: -10 })
			const t0 = await read('Channel_Input/trim')
			const unity = await engine.faderToUnity(section, index)
			await engine.transport.drained()
			await sleep(250)
			const [f1, t1] = [await read('fader'), await read('Channel_Input/trim')]
			mod.unity = {
				text: unity.text,
				faderAfter: round(f1),
				trimBefore: round(t0),
				trimAfter: round(t1),
				levelKept: same(f1 + t1, -10 + t0),
			}
			say(
				`Module: fader to unity from -10 dB: "${unity.text}"; fader ${round(f1)}, trim ${round(t0)} -> ${round(t1)}; level kept: ${mod.unity.levelKept ? 'yes' : 'NO'}`,
			)

			// gain nudge: gain down 1, trim must go up by what the gain actually moved
			const [g0, t2] = [await read('Channel_Input/analog_gain'), await read('Channel_Input/trim')]
			const nudge = await engine.nudgeGain(section, index, -1)
			await engine.transport.drained()
			await sleep(250)
			const [g1, t3] = [await read('Channel_Input/analog_gain'), await read('Channel_Input/trim')]
			mod.nudge = {
				text: nudge.text,
				gainBefore: round(g0),
				gainAfter: round(g1),
				trimBefore: round(t2),
				trimAfter: round(t3),
				levelKept: same(g1 + t3, g0 + t2),
			}
			say(
				`Module: gain nudge -1 dB: "${nudge.text}"; gain ${round(g0)} -> ${round(g1)}, trim ${round(t2)} -> ${round(t3)}; level kept: ${mod.nudge.levelKept ? 'yes' : 'NO'}`,
			)
			const half = await engine.nudgeGain(section, index, -0.5)
			await sleep(250)
			mod.halfStep = { text: half.text, gainAfter: round(await read('Channel_Input/analog_gain')) }
			say(`Module: gain nudge -0.5 dB (how finely does the preamp move?): "${half.text}"`)

			// leave the channel as it was found
			engine.sendValues(section, index, before.values, null)
			await engine.transport.drained()
			await sleep(400)
			const after = await engine.captureChannel(section, index)
			const left = Object.keys(before.values).filter(
				(s) => typeof before.values[s].a[0] === 'number' && !same(after.values[s]?.a[0], before.values[s].a[0]),
			)
			mod.channelRestored = left.length === 0
			mod.notRestored = left
			say(
				left.length
					? `NOT RESTORED after the module tests: ${left.join(', ')}`
					: `Input ${index} was left exactly as it was found`,
			)
			results.module = mod
		}

		// ---- 6. watch -----------------------------------------------------------------
		if (o.watch) {
			heard.length = 0
			listening = true
			say(`Watching for ${o.watch} seconds: move controls on the console now`)
			await sleep(o.watch * 1000)
			listening = false
			const events = heard.filter((m) => !/^\/Console\//.test(m.path))
			const t0 = events[0]?.t ?? 0
			results.watch = {
				seconds: o.watch,
				messages: events.length,
				addresses: [...new Set(events.map((m) => m.path))],
				touched: engine.lastTouched,
				gangs: engine.gangList(),
				events: events
					.slice(0, 3000)
					.map((m) => ({
						ms: m.t - t0,
						path: m.path,
						types: m.types,
						args: m.args.map((x) => (typeof x === 'number' ? round(x) : x)),
					})),
			}
			say(
				`Watch: ${events.length} message(s) on ${results.watch.addresses.length} address(es); last touched ${engine.lastTouched ? `${engine.lastTouched.section} ${engine.lastTouched.index}` : 'nothing'}; gangs seen: ${results.watch.gangs.map((g) => `${g.section} ${g.members.join('+')}`).join(', ') || 'none'}`,
			)
		}
		return results
	} finally {
		await engine.stop()
	}
}

/** Save the results as JSON, and a short text summary beside it. */
export function saveResults(results, folder) {
	fs.mkdirSync(folder, { recursive: true })
	const stamp = results.when.replace(/[:.]/g, '-').slice(0, 19)
	const name = `${String(results.label || 'console')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')}_${stamp}`
	const json = path.join(folder, `${name}.json`)
	fs.writeFileSync(json, JSON.stringify(results, null, '\t'))
	const text = path.join(folder, `${name}.txt`)
	fs.writeFileSync(text, [`${results.label}  ${results.when}`, results.target, '', ...results.summary, ''].join('\n'))
	return { json, text }
}

function parseArgs(argv) {
	const o = {
		host: '127.0.0.1',
		send: 8001,
		listen: 8000,
		label: '',
		write: false,
		watch: 0,
		out: 'test-results',
		set: [],
	}
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i].replace(/^--/, '')
		if (key === 'write') o.write = true
		else if (['host', 'label', 'out'].includes(key)) o[key] = argv[++i]
		else if (key === 'set') {
			const m = /^(\/[^=]+)=(.*)$/.exec(argv[++i] ?? '')
			if (!m) return null
			o.set.push({ address: m[1], value: m[2] !== '' && Number.isFinite(Number(m[2])) ? Number(m[2]) : m[2] })
		} else if (['send', 'listen', 'channel', 'watch'].includes(key)) o[key] = Number(argv[++i])
		else return null
	}
	return o.label ? o : null
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const o = parseArgs(process.argv.slice(2))
	if (!o) {
		console.log(
			'Usage: node tools/offline-test.mjs --label "Quantum 338 offline" [--host 127.0.0.1] [--send 8001] [--listen 8000]',
		)
		console.log(
			'                                   [--write] [--channel N] [--watch SECONDS] [--out test-results] [--set /address=value]',
		)
		console.log('--write changes one input channel of the open session and puts it back. Use a scratch session.')
		process.exit(1)
	}
	const results = await runOfflineTests({ ...o, log: (line) => console.log(line) })
	const saved = saveResults(results, o.out)
	console.log(`\nSaved ${saved.json}\n      ${saved.text}`)
	process.exit(results.connect?.online ? 0 : 2)
}
