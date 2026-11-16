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
await mod.init({ host: '127.0.0.1', sendPort: 18101, recvPort: 18100, rate: 2000, queryTimeout: 150 })
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
await run('script_record')
await run('scopes', { scopes: ['eq', 'comp'] })
await run('slot', { slot: 1 })
await run('scopes', { scopes: ['eq', 'gain'] })
await run('slot', { slot: 3 })
await run('script_record')
await run('script', { script: 1 })
await run('names_capture', { set: 1, sections: ['Input_Channels', 'Group_Outputs', 'Aux_Outputs'] })

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
				body: body || undefined,
			})
			res.writeHead(out.status ?? 200, out.headers ?? {})
			res.end(out.body ?? '')
		})
	})
	.listen(8088, () => console.log('\nOpen http://localhost:8088/instance/recall/\n'))
