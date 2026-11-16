// Checks what a console (or the DiGiCo offline software) actually answers, without Companion.
//
//   node tools/probe.mjs <console-ip> [console-receive-port=8001] [console-send-port=8000] [section=Input_Channels] [number=1]
//
// It asks for the console name and channel counts, then queries every address this module
// would capture for one channel and lists which were answered and which were not. After
// that it stays open and prints whatever the console sends, so you can move controls and
// see their addresses (useful for finding Quantum-only parameters). Ctrl+C to stop.
//
// Close Companion's connection first: only one program can listen on the port.

import { Engine } from '../src/engine.js'
import { SECTIONS, captureSuffixes, scopeOf } from '../src/params.js'

const [ip, sendPort = '8001', recvPort = '8000', section = 'Input_Channels', number = '1'] = process.argv.slice(2)
if (!ip || !SECTIONS[section]) {
	console.log('Usage: node tools/probe.mjs <console-ip> [console-receive-port] [console-send-port] [section] [number]')
	console.log('Sections: ' + Object.keys(SECTIONS).join(', '))
	process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const engine = new Engine(
	{ ip, sendPort: Number(sendPort), recvPort: Number(recvPort), rate: 300, queryTimeout: 600 },
	{
		log: (level, text) => console.log(`[${level}] ${text}`),
	},
)
engine.start()
await sleep(1200)

if (!engine.online) {
	console.log(`\nNo reply from ${ip}. Check that External Control is enabled on the console, that this`)
	console.log(`computer is listed as a "DiGiCo Pad" device with send port ${recvPort} and receive port ${sendPort},`)
	console.log('that the device is switched on in that list, and that no firewall is blocking UDP.')
} else {
	console.log(`\nConsole name: ${engine.consoleName || '(not reported)'}`)
	for (const id of Object.keys(SECTIONS)) {
		console.log(`  ${SECTIONS[id].label.padEnd(14)} ${engine.counts[id] ?? 'not reported'}`)
	}
	const index = Number(number)
	const suffixes = captureSuffixes(section, engine.count('Aux_Outputs'))
	console.log(`\nQuerying ${suffixes.length} addresses on ${SECTIONS[section].label} ${index}...`)
	const started = Date.now()
	const snap = await engine.captureChannel(section, index)
	const answered = Object.keys(snap.values)
	const missing = suffixes.filter((s) => !snap.values[s])
	console.log(`${answered.length} answered, ${missing.length} not answered, in ${Date.now() - started} ms\n`)
	const byScope = {}
	for (const s of answered) (byScope[scopeOf(s)] ??= []).push(s)
	for (const [scope, list] of Object.entries(byScope)) {
		console.log(`${scope.toUpperCase()} (${list.length})`)
		for (const s of list) console.log(`  ${s.padEnd(34)} ${snap.values[s].t}  ${snap.values[s].a.join(' ')}`)
	}
	if (missing.length) {
		console.log('\nNOT ANSWERED')
		for (const s of missing) console.log(`  ${s}`)
	}
}

console.log('\nListening. Move controls on the console to see their addresses. Ctrl+C to stop.\n')
const original = engine.onMessage.bind(engine)
engine.onMessage = (m) => {
	if (!/meter/i.test(m.path) && m.path !== '/Console/Name') console.log(`${m.path}  ${m.types}  ${m.args.join(' ')}`)
	original(m)
}
