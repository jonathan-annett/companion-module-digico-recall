import dgram from 'node:dgram'
import fs from 'node:fs'
import { Engine, normalizeLibrary } from './engine.js'
import { decode } from './osc.js'
import { parseAddress } from './params.js'
import { cleanLibrary } from './validate.js'
import { DEFAULTS, getConfigFields } from './config.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getVariableDefinitions, getVariableValues } from './variables.js'
import { getPresets } from './presets.js'
import { handleHttp } from './http.js'

/**
 * Builds the Companion instance class. The Companion SDK base class is passed in rather
 * than imported so the same class can be driven by the test harness without Companion.
 */
export function makeInstanceClass({ InstanceBase, InstanceStatus }) {
	return class DigicoRecallInstance extends InstanceBase {
		constructor(internal) {
			super(internal)
			this.config = { ...DEFAULTS }
			this.engine = null
			this.ipadSocket = null
			this.refreshTimer = null
		}

		async init(config) {
			this.config = { ...DEFAULTS, ...config }
			this.startEngine()
		}

		async destroy() {
			if (this.refreshTimer) clearTimeout(this.refreshTimer)
			this.refreshTimer = null
			await this.stopEngine()
		}

		async configUpdated(config) {
			// Companion's settings form doesn't know about the stored library, so carry it over.
			const library = config.library || JSON.stringify(this.engine ? this.engine.lib : {})
			await this.stopEngine()
			this.config = { ...DEFAULTS, ...config, library }
			this.startEngine()
			if (!config.library) this.saveConfig(this.config)
		}

		getConfigFields() {
			return getConfigFields(this.config, this.label)
		}

		/** Change the console address from the web page's Setup tab, save it, and reconnect. */
		async setConsoleHost(host) {
			const library = JSON.stringify(this.engine ? this.engine.lib : {})
			await this.stopEngine()
			this.config = { ...this.config, host, library }
			this.saveConfig(this.config)
			this.startEngine()
		}

		async handleHttpRequest(request) {
			return handleHttp(this, request)
		}

		// ---- engine ------------------------------------------------------------------

		startEngine() {
			const c = this.config
			this.updateStatus(InstanceStatus.Connecting)
			this.engine = new Engine(
				{
					ip: c.host,
					sendPort: Number(c.sendPort),
					recvPort: Number(c.recvPort),
					rate: Number(c.rate) || DEFAULTS.rate,
					queryTimeout: Number(c.queryTimeout) || DEFAULTS.queryTimeout,
					learn: !!c.learn,
				},
				{
					onChange: () => this.scheduleRefresh(),
					persist: (lib) => this.saveLibrary(lib),
					log: (level, text) => this.log(level, text),
					onStatus: (ok, text) =>
						this.updateStatus(ok ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure, ok ? null : text),
					onRaw: (buf) => this.relayToIpad(buf),
				},
			)
			this.engine.lib = this.loadLibrary()

			this.setActionDefinitions(getActions(this))
			this.setFeedbackDefinitions(getFeedbacks(this))
			this.setVariableDefinitions(getVariableDefinitions(c))
			const { structure, presets } = getPresets(this.label, c)
			this.setPresetDefinitions(structure, presets)

			try {
				this.engine.start()
				this.startRelay()
			} catch (err) {
				this.updateStatus(InstanceStatus.UnknownError, String(err.message || err))
			}
			this.refresh()
		}

		async stopEngine() {
			if (this.ipadSocket) {
				try {
					this.ipadSocket.close()
				} catch {
					// already closed
				}
				this.ipadSocket = null
			}
			await this.engine?.stop()
			this.engine = null
		}

		loadLibrary() {
			const file = (this.config.libraryFile || '').trim()
			if (file) {
				try {
					if (fs.existsSync(file)) return cleanLibrary(JSON.parse(fs.readFileSync(file, 'utf8')))
				} catch (err) {
					this.log('error', `Could not read library file ${file}: ${err.message}`)
				}
			}
			try {
				return this.config.library ? cleanLibrary(JSON.parse(this.config.library)) : normalizeLibrary(null)
			} catch {
				return normalizeLibrary(null)
			}
		}

		saveLibrary(lib) {
			this.config.library = JSON.stringify(lib)
			this.saveConfig(this.config)
			const file = (this.config.libraryFile || '').trim()
			if (file) {
				try {
					fs.writeFileSync(file, JSON.stringify(lib, null, 1))
				} catch (err) {
					this.log('error', `Could not write library file ${file}: ${err.message}`)
				}
			}
		}

		scheduleRefresh() {
			if (this.refreshTimer) return
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null
				this.refresh()
			}, 20)
		}

		refresh() {
			if (!this.engine) return
			this.setVariableValues(getVariableValues(this.engine, this.config))
			this.checkAllFeedbacks()
		}

		// ---- iPad relay --------------------------------------------------------------
		// The console accepts one iPad-type device. With the relay on, the real iPad talks
		// to this module and every datagram is passed through untouched in both directions.

		startRelay() {
			const c = this.config
			if (!c.ipadEnabled) return
			if (Number(c.ipadRecvPort) === Number(c.recvPort)) {
				this.log('error', 'iPad relay: the iPad port must differ from the console port')
				return
			}
			const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
			this.ipadSocket = socket
			socket.on('error', (err) => this.log('error', `iPad relay error: ${err.message}`))
			socket.on('message', (buf) => {
				const engine = this.engine
				if (!engine?.transport) return
				engine.transport.sendRaw(buf)
				// Replies to the iPad's own queries must not look like the operator touching a
				// channel, but values the iPad writes are exactly that.
				try {
					for (const m of decode(buf)) {
						if (m.path.endsWith('/?')) engine.sentAt.set(m.path.slice(0, -2), Date.now())
						else if (m.args.length) {
							const addr = parseAddress(m.path)
							engine.sentAt.set(m.path, Date.now())
							if (addr && !/meter/i.test(addr.suffix)) engine.touch(addr.section, addr.index)
						}
					}
				} catch {
					// forwarded anyway
				}
			})
			socket.bind(Number(c.ipadRecvPort))
		}

		relayToIpad(buf) {
			if (!this.ipadSocket) return
			try {
				this.ipadSocket.send(buf, Number(this.config.ipadSendPort), this.config.ipadHost)
			} catch {
				// iPad not reachable; nothing to do
			}
		}
	}
}
