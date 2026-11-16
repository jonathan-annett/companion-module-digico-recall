// Try the web page with no Companion and no console: runs the module against the
// simulated console and serves the page at http://localhost:8088/instance/recall/
//
//   node tools/preview.mjs
//
// A few captures, a script and a name set are created so there is something to look at.
// Nothing here touches a real console.

import http from 'node:http'
import { SimConsole } from '../test/sim-console.mjs'
import { makeInstanceClass } from '../src/instance.js'

class FakeBase {
	label = 'recall'
	setActionDefinitions(d) {
		this.actions = d
	}
	setFeedbackDefinitions() {}
	setVariableDefinitions() {}
	setPresetDefinitions() {}
	setVariableValues() {}
	checkAllFeedbacks() {}
	updateStatus() {}
	saveConfig() {}
	log(level, text) {
		console.log(`[${level}] ${text}`)
	}
}
const Instance = makeInstanceClass({ InstanceBase: FakeBase, InstanceStatus: {} })

const sim = new SimConsole({
	listenPort: 18101,
	replyPort: 18100,
	counts: {
		Input_Channels: 48,
		Group_Outputs: 12,
		Aux_Outputs: 12,
		Matrix_Outputs: 8,
		Graphic_EQ: 8,
		Control_Groups: 10,
	},
})
await sim.start()
const names = [
	'Kick In',
	'Kick Out',
	'Snare Top',
	'Snare Bot',
	'Hat',
	'Rack',
	'Floor',
	'OH L',
	'OH R',
	'Bass DI',
	'Bass Mic',
	'Gtr L',
	'Gtr R',
	'Keys L',
	'Keys R',
	'Lead Vox',
	'BV 1',
	'BV 2',
]
names.forEach((name, i) => sim.values.set(`/Input_Channels/${i + 1}/Channel_Input/name`, { t: 's', a: [name] }))

const mod = new Instance({})
await mod.init({ host: '127.0.0.1', sendPort: 18101, recvPort: 18100, rate: 2000, queryTimeout: 150, audit: true })
const run = (id, options = {}) => mod.actions[id].callback({ options })
await new Promise((r) => setTimeout(r, 300))
let slot = 1
for (const [section, index] of [
	['Input_Channels', 1],
	['Input_Channels', 3],
	['Input_Channels', 16],
	['Group_Outputs', 2],
	['Graphic_EQ', 1],
]) {
	await run('capture', { section, index })
	await run('slot', { slot: slot++ })
}
// One capture holding several channels
for (const index of [1, 2, 3, 4, 5]) await run('capture', { section: 'Input_Channels', index })
await run('slot', { slot: slot++ })
await run('script_record')
await run('scopes', { scopes: ['eq', 'comp'] })
await run('slot', { slot: 1 })
await run('scopes', { scopes: ['eq', 'gain'] })
await run('slot', { slot: 3 })
await run('script_record')
await run('slot', { slot: slot++ })
await run('names_record')
await run('names_add_all', { sections: ['Input_Channels', 'Group_Outputs', 'Aux_Outputs'] })
await run('slot', { slot: slot++ })

// A pretend meter stream, so a meter capture has something in it
setInterval(
	() => sim.out('/Meters/values', 'iiii', [1, Math.round(Math.random() * 100), 2, Math.round(Math.random() * 100)]),
	50,
)

// Pretend someone is mixing, so the Log tab has something to show
const moves = [
	(n) => sim.surface(`/Input_Channels/${n}/fader`, 'f', [Math.fround(-30 + Math.random() * 35)]),
	(n) => sim.surface(`/Input_Channels/${n}/mute`, 'f', [Math.round(Math.random())]),
	(n) => sim.surface(`/Input_Channels/${n}/EQ/eq_gain_2`, 'f', [Math.fround(-6 + Math.random() * 12)]),
	(n) => sim.surface(`/Input_Channels/${n}/Aux_Send/3/send_level`, 'f', [Math.fround(-20 + Math.random() * 20)]),
]
setInterval(() => {
	const n = 1 + Math.floor(Math.random() * names.length)
	const move = moves[Math.floor(Math.random() * moves.length)]
	for (let i = 0; i < 1 + Math.floor(Math.random() * 4); i++) move(n)
}, 900)

const PREFIX = '/instance/recall'
http
	.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost')
		if (!url.pathname.startsWith(PREFIX)) {
			res.writeHead(302, { Location: PREFIX + '/' })
			return res.end()
		}
		let body = ''
		req.on('data', (chunk) => (body += chunk))
		req.on('end', async () => {
			const out = await mod.handleHttpRequest({
				method: req.method,
				path: url.pathname.slice(PREFIX.length) || '/',
				query: Object.fromEntries(url.searchParams),
				body: body || undefined,
			})
			res.writeHead(out.status ?? 200, out.headers ?? {})
			res.end(out.body ?? '')
		})
	})
	.listen(8088, () => console.log('\nOpen http://localhost:8088/instance/recall/\n'))
