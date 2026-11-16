import dgram from 'node:dgram'
import { encode, decode } from './osc.js'

const TICK_MS = 4

/**
 * UDP link to the console, set up on the console as a "DiGiCo Pad" external control device.
 * The console sends to our receive port; we send to its receive port. Outgoing traffic is
 * paced so a full-channel recall doesn't arrive as one burst.
 */
export class Transport {
	/**
	 * @param {{ip: string, sendPort: number, recvPort: number, rate: number,
	 *   onMessage: (m: {path: string, types: string, args: any[]}) => void,
	 *   onRaw?: (buf: Buffer) => void, onStatus?: (ok: boolean, text: string) => void,
	 *   log?: (level: string, text: string) => void}} opts
	 */
	constructor(opts) {
		this.opts = opts
		this.queue = []
		this.drainWaiters = []
		this.timer = null
		this.socket = null
		this.closed = false
	}

	start() {
		const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
		this.socket = socket
		socket.on('error', (err) => {
			this.opts.onStatus?.(false, `UDP error: ${err.message}`)
			this.opts.log?.('error', `UDP error: ${err.message}`)
		})
		socket.on('listening', () => {
			this.opts.onStatus?.(true, `Listening on UDP ${this.opts.recvPort}`)
		})
		socket.on('message', (buf) => {
			if (this.closed) return
			this.opts.onRaw?.(buf)
			let messages
			try {
				messages = decode(buf)
			} catch (err) {
				this.opts.log?.('debug', `Bad OSC packet: ${err.message}`)
				return
			}
			for (const m of messages) this.opts.onMessage(m)
		})
		socket.bind(this.opts.recvPort)
	}

	/** Queue a value message. */
	send(path, types, args) {
		this.sendRaw(encode(path, types, args))
	}

	/** Queue a DiGiCo-style value query: the address with "/?" appended and no arguments. */
	query(path) {
		this.sendRaw(encode(`${path}/?`))
	}

	/** Queue an already-encoded datagram (also used by the iPad relay). */
	sendRaw(buf) {
		if (this.closed) return
		this.queue.push(buf)
		if (!this.timer) this.timer = setInterval(() => this.pump(), TICK_MS)
	}

	pump() {
		const perTick = Math.max(1, Math.round(((this.opts.rate || 500) * TICK_MS) / 1000))
		for (let i = 0; i < perTick && this.queue.length; i++) {
			const buf = this.queue.shift()
			try {
				this.socket.send(buf, this.opts.sendPort, this.opts.ip)
			} catch (err) {
				this.opts.log?.('error', `Send failed: ${err.message}`)
			}
		}
		if (!this.queue.length) {
			clearInterval(this.timer)
			this.timer = null
			for (const resolve of this.drainWaiters.splice(0)) resolve()
		}
	}

	/** Resolves once everything queued so far has been put on the wire. */
	drained() {
		if (!this.queue.length) return Promise.resolve()
		return new Promise((resolve) => this.drainWaiters.push(resolve))
	}

	async close() {
		this.closed = true
		if (this.timer) clearInterval(this.timer)
		this.timer = null
		this.queue.length = 0
		for (const resolve of this.drainWaiters.splice(0)) resolve()
		if (this.socket) {
			await new Promise((resolve) => {
				try {
					this.socket.close(() => resolve())
				} catch {
					resolve()
				}
			})
		}
	}
}
