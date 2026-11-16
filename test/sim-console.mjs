// A stand-in console for testing without a desk. It behaves the way the DiGiCo iPad
// protocol is understood to behave: it answers "<address>/?" queries with the address and
// its value, applies and echoes values written to it, and announces changes made "on the
// surface". It is NOT DiGiCo software and proves nothing about a real console's addresses.
//
// Run standalone:  node test/sim-console.mjs [listenPort=8001] [replyPort=8000] [replyHost=127.0.0.1]

import dgram from 'node:dgram'
import { pathToFileURL } from 'node:url'
import { encode, decode } from '../src/osc.js'
import { SECTIONS, captureSuffixes } from '../src/params.js'

export class SimConsole {
	constructor({ listenPort, replyPort, replyHost = '127.0.0.1', counts, dropEvery = 0 }) {
		this.opts = { listenPort, replyPort, replyHost }
		this.counts = {
			Input_Channels: 12,
			Group_Outputs: 4,
			Aux_Outputs: 4,
			Matrix_Outputs: 2,
			Graphic_EQ: 2,
			Control_Groups: 2,
			...counts,
		}
		this.values = new Map()
		this.received = []
		this.dropEvery = dropEvery
		this.queryCount = 0
		for (const [section, total] of Object.entries(this.counts)) {
			for (let n = 1; n <= total; n++) {
				for (const suffix of captureSuffixes(section, this.counts.Aux_Outputs)) {
					const path = `/${section}/${n}/${suffix}`
					if (suffix === SECTIONS[section].name)
						this.values.set(path, { t: 's', a: [`${SECTIONS[section].short}${n}`] })
					else this.values.set(path, { t: 'f', a: [Math.fround(n + (hash(suffix) % 1000) / 100)] })
				}
			}
		}
	}

	start() {
		this.socket = dgram.createSocket('udp4')
		this.socket.on('message', (buf) => {
			for (const m of decode(buf)) this.handle(m)
		})
		return new Promise((resolve) => this.socket.bind(this.opts.listenPort, resolve))
	}

	stop() {
		return new Promise((resolve) => this.socket.close(resolve))
	}

	out(path, types, args) {
		this.socket.send(encode(path, types, args), this.opts.replyPort, this.opts.replyHost)
	}

	handle(m) {
		if (m.path.endsWith('/?')) {
			const path = m.path.slice(0, -2)
			this.queryCount++
			if (this.dropEvery && this.queryCount % this.dropEvery === 0) return // simulate a lost packet
			if (path === '/Console/Name') return this.out(path, 's', ['SimQuantum'])
			if (path === '/Console/Channels') {
				for (const [section, total] of Object.entries(this.counts)) this.out(`/Console/${section}`, 'i', [total])
				return
			}
			const count = /^\/Console\/(\w+)$/.exec(path)
			if (count && this.counts[count[1]] !== undefined) return this.out(path, 'i', [this.counts[count[1]]])
			const v = this.values.get(path)
			if (v) this.out(path, v.t, v.a)
			return
		}
		if (!m.args.length) return
		this.received.push(m)
		this.values.set(m.path, { t: m.types, a: m.args })
		this.out(m.path, m.types, m.args) // the console echoes what it was told
	}

	/** Someone moves a control on the surface. */
	surface(path, types, args) {
		this.values.set(path, { t: types, a: args })
		this.out(path, types, args)
	}

	get(path) {
		return this.values.get(path)?.a[0]
	}
}

function hash(text) {
	let h = 0
	for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
	return h
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [listenPort = '8001', replyPort = '8000', replyHost = '127.0.0.1'] = process.argv.slice(2)
	const sim = new SimConsole({ listenPort: Number(listenPort), replyPort: Number(replyPort), replyHost })
	await sim.start()
	console.log(`Simulated console listening on UDP ${listenPort}, replying to ${replyHost}:${replyPort}`)
	console.log('Type an input number and press Enter to "touch" that channel\'s fader.')
	process.stdin.on('data', (data) => {
		const n = Number(String(data).trim())
		if (n >= 1) {
			sim.surface(`/Input_Channels/${n}/fader`, 'f', [Math.fround(-Math.random() * 20)])
			console.log(`Touched input ${n}`)
		}
	})
}
