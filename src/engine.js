import { Transport } from './transport.js'
import {
	SECTIONS,
	SECTION_IDS,
	FALLBACK_COUNTS,
	SCOPE_IDS,
	NEVER_LEARN,
	captureSuffixes,
	isKnownSuffix,
	scopeOf,
	parseAddress,
	describe,
} from './params.js'

const ECHO_WINDOW_MS = 1500
const STATUS_POLL_MS = 5000

export function emptyLibrary() {
	return { version: 1, slots: {}, scripts: {}, nameSets: {}, learned: {} }
}

export function normalizeLibrary(input) {
	const lib = emptyLibrary()
	if (!input || typeof input !== 'object') return lib
	for (const key of ['slots', 'scripts', 'nameSets', 'learned']) {
		if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) lib[key] = input[key]
	}
	return lib
}

/**
 * Everything the module does, independent of Companion: talks to the console, tracks the
 * last touched channel, captures and recalls channel snapshots, records scripts, and
 * captures and restores names.
 *
 * A snapshot is { section, index, name, when, values: { suffix: { t, a } } } where t is the
 * OSC type-tag string and a the argument list exactly as the console reported them, so a
 * recall sends back precisely what was read.
 */
export class Engine {
	/**
	 * @param {object} cfg  ip, sendPort, recvPort, rate, queryTimeout, learn
	 * @param {object} hooks  onChange(), persist(lib), log(level, text), onStatus(ok, text), onRaw(buf)
	 */
	constructor(cfg, hooks = {}) {
		this.cfg = { rate: 500, queryTimeout: 400, learn: false, ...cfg }
		this.hooks = hooks
		this.lib = emptyLibrary()
		this.scopes = new Set(['eq'])
		this.mode = 'idle' // idle | armed | capturing | holding
		this.held = null
		this.scriptRec = null // null, or { steps: [] } while recording
		this.scriptHeld = null // recorded steps waiting for a script button
		this.targetMode = 'original' // original | touched
		this.lastTouched = null
		this.lastRecalled = null
		this.lastScript = null
		this.counts = {}
		this.names = {}
		this.consoleName = ''
		this.online = false
		this.lastReply = 0
		this.sentAt = new Map()
		this.batch = null
		this.chain = Promise.resolve()
		this.transport = null
		this.pollTimer = null
	}

	// ---- lifecycle -------------------------------------------------------------------

	start() {
		this.transport = new Transport({
			ip: this.cfg.ip,
			sendPort: this.cfg.sendPort,
			recvPort: this.cfg.recvPort,
			rate: this.cfg.rate,
			onMessage: (m) => this.onMessage(m),
			onRaw: this.hooks.onRaw,
			onStatus: (ok, text) => {
				if (!ok) this.hooks.onStatus?.(false, text)
			},
			log: this.hooks.log,
		})
		this.transport.start()
		this.refreshConsole()
		this.pollTimer = setInterval(() => this.poll(), STATUS_POLL_MS)
	}

	async stop() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
		if (this.batch) this.batch.finish()
		await this.transport?.close()
		this.transport = null
	}

	poll() {
		if (!this.transport) return
		const wasOnline = this.online
		this.online = Date.now() - this.lastReply < STATUS_POLL_MS * 2 + 1000
		if (wasOnline !== this.online) {
			this.hooks.onStatus?.(this.online, this.online ? 'Connected' : 'No reply from console')
			this.changed()
		}
		this.transport.query('/Console/Name')
	}

	/** Ask the console what it is and how many of everything it has. */
	refreshConsole() {
		if (!this.transport) return
		this.transport.query('/Console/Name')
		this.transport.query('/Console/Channels')
		for (const section of SECTION_IDS) this.transport.query(`/Console/${section}`)
	}

	log(level, text) {
		this.hooks.log?.(level, text)
	}

	changed() {
		this.hooks.onChange?.()
	}

	persist() {
		this.hooks.persist?.(this.lib)
	}

	setLibrary(lib) {
		this.lib = normalizeLibrary(lib)
		this.changed()
	}

	count(section) {
		return this.counts[section] ?? FALLBACK_COUNTS[section] ?? 0
	}

	// ---- incoming --------------------------------------------------------------------

	onMessage(m) {
		this.lastReply = Date.now()
		if (!this.online) {
			this.online = true
			this.hooks.onStatus?.(true, 'Connected')
			this.changed()
		}

		// Reply to one of our own queries?
		if (this.batch && this.batch.want.has(m.path)) {
			if (m.args.length) this.batch.take(m)
			return
		}

		if (m.path === '/Console/Name' && typeof m.args[0] === 'string') {
			if (this.consoleName !== m.args[0]) {
				this.consoleName = m.args[0]
				this.changed()
			}
			return
		}
		const countMatch = /^\/Console\/([A-Za-z_]+)$/.exec(m.path)
		if (countMatch && SECTIONS[countMatch[1]] && typeof m.args[0] === 'number') {
			this.counts[countMatch[1]] = Math.max(0, Math.trunc(m.args[0]))
			return
		}

		const addr = parseAddress(m.path)
		if (!addr || !m.args.length) return
		if (/meter/i.test(addr.suffix)) return

		if (addr.suffix === SECTIONS[addr.section].name && typeof m.args[0] === 'string') {
			;(this.names[addr.section] ??= {})[addr.index] = m.args[0]
		}

		// The console echoes values we just wrote. Those are not the operator touching something.
		const sent = this.sentAt.get(m.path)
		if (sent && Date.now() - sent < ECHO_WINDOW_MS) return

		this.learn(addr)
		this.touch(addr.section, addr.index)
	}

	learn(addr) {
		if (!this.cfg.learn) return
		if (isKnownSuffix(addr.section, addr.suffix) || NEVER_LEARN.test(addr.suffix)) return
		const list = (this.lib.learned[addr.section] ??= [])
		if (list.includes(addr.suffix)) return
		list.push(addr.suffix)
		this.log('info', `Learned new ${SECTIONS[addr.section].label} parameter: ${addr.suffix}`)
		this.persist()
	}

	touch(section, index) {
		const same = this.lastTouched && this.lastTouched.section === section && this.lastTouched.index === index
		this.lastTouched = { section, index }
		if (this.mode === 'armed') {
			void this.captureToHold(section, index)
		} else if (!same) this.changed()
	}

	// ---- queries ---------------------------------------------------------------------

	/** Run jobs that talk to the console one at a time. */
	serial(job) {
		const run = this.chain.then(job, job)
		this.chain = run.catch(() => {})
		return run
	}

	/**
	 * Ask for many values at once. Queries are paced out, replies are matched by address,
	 * and anything unanswered is asked for twice more. Returns Map(path -> {t, a}).
	 */
	queryMany(paths) {
		return this.serial(async () => {
			const got = new Map()
			if (!this.transport) return got
			for (let attempt = 0; attempt < 3; attempt++) {
				const missing = paths.filter((p) => !got.has(p))
				if (!missing.length) break
				await new Promise((resolve) => {
					let timer = null
					const batch = {
						want: new Set(missing),
						take: (m) => {
							got.set(m.path, { t: m.types, a: m.args })
							batch.want.delete(m.path)
							if (!batch.want.size) batch.finish()
						},
						finish: () => {
							if (timer) clearTimeout(timer)
							if (this.batch === batch) this.batch = null
							resolve()
						},
					}
					this.batch = batch
					for (const p of missing) this.transport.query(p)
					void this.transport.drained().then(() => {
						if (this.batch === batch) timer = setTimeout(batch.finish, this.cfg.queryTimeout)
					})
				})
			}
			return got
		})
	}

	// ---- capture ---------------------------------------------------------------------

	async captureChannel(section, index) {
		const suffixes = captureSuffixes(section, this.count('Aux_Outputs'), this.lib.learned[section])
		const prefix = `/${section}/${index}/`
		const got = await this.queryMany(suffixes.map((s) => prefix + s))
		const values = {}
		for (const suffix of suffixes) {
			const v = got.get(prefix + suffix)
			if (v) values[suffix] = v
		}
		const nameValue = values[SECTIONS[section].name]
		const name = nameValue && typeof nameValue.a[0] === 'string' ? nameValue.a[0] : ''
		if (name) (this.names[section] ??= {})[index] = name
		return { section, index, name, when: new Date().toISOString(), values }
	}

	async captureToHold(section, index) {
		this.mode = 'capturing'
		this.changed()
		const snap = await this.captureChannel(section, index)
		const n = Object.keys(snap.values).length
		if (this.mode !== 'capturing') return // cancelled meanwhile
		if (!n) {
			this.log('warn', `Capture of ${describe(section, index)} got no replies from the console`)
			this.mode = 'idle'
		} else {
			this.log('info', `Captured ${describe(section, index, snap.name)}: ${n} values. Press a slot to store.`)
			this.held = snap
			this.mode = 'holding'
		}
		this.changed()
	}

	/** The "start recording" button. Pressing it again cancels. */
	toggleArm() {
		if (this.mode === 'idle') this.mode = 'armed'
		else {
			this.mode = 'idle'
			this.held = null
		}
		this.changed()
	}

	cancel() {
		this.mode = 'idle'
		this.held = null
		this.scriptRec = null
		this.scriptHeld = null
		this.changed()
	}

	// ---- recall ----------------------------------------------------------------------

	/** Where a snapshot should land, given the current target mode. */
	resolveTarget(snap) {
		if (this.targetMode === 'touched' && this.lastTouched) {
			const t = this.lastTouched
			const geq = (s) => s === 'Graphic_EQ'
			const cg = (s) => s === 'Control_Groups'
			// Processing addresses are shared across inputs and busses; GEQs and CGs only match themselves.
			if (geq(t.section) === geq(snap.section) && cg(t.section) === cg(snap.section)) return { ...t }
			this.log('warn', `Can't apply ${SECTIONS[snap.section].label} settings to ${describe(t.section, t.index)}`)
			return null
		}
		return { section: snap.section, index: snap.index }
	}

	/** Send a set of {suffix: {t, a}} values to one channel. Returns how many were sent. */
	sendValues(section, index, values, scopes) {
		if (!this.transport) return 0
		let n = 0
		const now = Date.now()
		for (const [suffix, v] of Object.entries(values)) {
			if (scopes && !scopes.has(scopeOf(suffix))) continue
			const path = `/${section}/${index}/${suffix}`
			this.transport.send(path, v.t, v.a)
			this.sentAt.set(path, now)
			n++
		}
		if (this.sentAt.size > 5000) {
			for (const [path, at] of this.sentAt) if (now - at > ECHO_WINDOW_MS) this.sentAt.delete(path)
		}
		return n
	}

	/** A slot button: store if a capture is waiting, otherwise recall. */
	pressSlot(id) {
		id = String(id)
		if (this.mode === 'holding') {
			this.lib.slots[id] = this.held
			this.held = null
			this.mode = 'idle'
			this.log('info', `Stored ${describe(this.lib.slots[id].section, this.lib.slots[id].index)} in slot ${id}`)
			this.persist()
			this.changed()
			return 'stored'
		}
		if (this.mode !== 'idle') return 'busy'
		const snap = this.lib.slots[id]
		if (!snap) return 'empty'
		const target = this.resolveTarget(snap)
		if (!target) return 'mismatch'
		const n = this.sendValues(target.section, target.index, snap.values, this.scopes)
		this.lastRecalled = id
		this.log('info', `Recalled slot ${id} to ${describe(target.section, target.index)}: ${n} values`)
		if (this.scriptRec) {
			// Scripts keep their own copy of the values, so re-using a slot later doesn't change them.
			const values = {}
			for (const [suffix, v] of Object.entries(snap.values)) {
				if (this.scopes.has(scopeOf(suffix))) values[suffix] = v
			}
			this.scriptRec.steps.push({
				section: target.section,
				index: target.index,
				name: snap.name,
				from: id,
				scopes: SCOPE_IDS.filter((s) => this.scopes.has(s)),
				values,
			})
		}
		this.changed()
		return 'recalled'
	}

	clearSlot(id) {
		delete this.lib.slots[String(id)]
		this.persist()
		this.changed()
	}

	setScope(scope, mode = 'toggle') {
		if (!SCOPE_IDS.includes(scope)) return
		const on = mode === 'toggle' ? !this.scopes.has(scope) : mode === 'on'
		if (on) this.scopes.add(scope)
		else this.scopes.delete(scope)
		this.changed()
	}

	setScopes(list) {
		this.scopes = new Set(list.filter((s) => SCOPE_IDS.includes(s)))
		this.changed()
	}

	setTargetMode(mode) {
		this.targetMode = mode === 'toggle' ? (this.targetMode === 'original' ? 'touched' : 'original') : mode
		this.changed()
	}

	// ---- scripts ---------------------------------------------------------------------

	/** The "record script" button: start, then press again to finish. */
	toggleScriptRecord() {
		if (this.scriptHeld) {
			this.scriptHeld = null
		} else if (this.scriptRec) {
			this.scriptHeld = this.scriptRec.steps.length ? this.scriptRec.steps : null
			this.scriptRec = null
		} else {
			this.scriptRec = { steps: [] }
		}
		this.changed()
	}

	/** A script button: store if a recording is waiting, otherwise run. */
	pressScript(id) {
		id = String(id)
		if (this.scriptHeld) {
			this.lib.scripts[id] = { name: '', when: new Date().toISOString(), steps: this.scriptHeld }
			this.scriptHeld = null
			this.persist()
			this.changed()
			return 'stored'
		}
		if (this.scriptRec || this.mode !== 'idle') return 'busy'
		const script = this.lib.scripts[id]
		if (!script) return 'empty'
		let n = 0
		for (const step of script.steps) n += this.sendValues(step.section, step.index, step.values, null)
		this.lastScript = id
		this.log('info', `Ran script ${id}: ${script.steps.length} steps, ${n} values`)
		this.changed()
		return 'ran'
	}

	clearScript(id) {
		delete this.lib.scripts[String(id)]
		this.persist()
		this.changed()
	}

	// ---- names -----------------------------------------------------------------------

	/** Read names live from the console. Returns { section: { number: name } }. */
	async fetchNames(sections = SECTION_IDS) {
		const out = {}
		for (const section of sections) {
			if (!SECTIONS[section]) continue
			const total = this.count(section)
			const paths = Array.from({ length: total }, (_, i) => `/${section}/${i + 1}/${SECTIONS[section].name}`)
			const got = await this.queryMany(paths)
			out[section] = {}
			paths.forEach((p, i) => {
				const v = got.get(p)
				if (v && typeof v.a[0] === 'string') out[section][i + 1] = v.a[0]
			})
			this.names[section] = { ...this.names[section], ...out[section] }
		}
		return out
	}

	/** Write names to the console. Returns how many were sent. */
	applyNames(names, sections) {
		if (!this.transport) return 0
		let n = 0
		const now = Date.now()
		for (const [section, byIndex] of Object.entries(names ?? {})) {
			if (!SECTIONS[section] || (sections && !sections.includes(section))) continue
			for (const [index, name] of Object.entries(byIndex ?? {})) {
				if (!/^\d+$/.test(index) || typeof name !== 'string') continue
				const path = `/${section}/${index}/${SECTIONS[section].name}`
				this.transport.send(path, 's', [name])
				this.sentAt.set(path, now)
				;(this.names[section] ??= {})[index] = name
				n++
			}
		}
		return n
	}

	async captureNameSet(id, sections) {
		const names = await this.fetchNames(sections)
		const total = Object.values(names).reduce((sum, s) => sum + Object.keys(s).length, 0)
		if (!total) {
			this.log('warn', 'Name capture got no replies from the console')
			return 0
		}
		const previous = this.lib.nameSets[String(id)]
		this.lib.nameSets[String(id)] = {
			name: previous?.name ?? '',
			when: new Date().toISOString(),
			names: { ...(previous?.names ?? {}), ...names },
		}
		this.persist()
		this.changed()
		return total
	}

	restoreNameSet(id, sections) {
		const set = this.lib.nameSets[String(id)]
		if (!set) return 0
		const n = this.applyNames(set.names, sections)
		this.log('info', `Restored name set ${id}: ${n} names`)
		return n
	}

	// ---- summaries for buttons and the web page ----------------------------------------

	slotLabel(id) {
		const snap = this.lib.slots[String(id)]
		if (!snap) return ''
		return snap.label || describe(snap.section, snap.index, snap.name)
	}

	scriptLabel(id) {
		const script = this.lib.scripts[String(id)]
		if (!script) return ''
		return script.name || `${script.steps.length} step${script.steps.length === 1 ? '' : 's'}`
	}

	touchedLabel() {
		const t = this.lastTouched
		return t ? describe(t.section, t.index, this.names[t.section]?.[t.index]) : ''
	}

	stateLabel() {
		if (this.mode === 'armed') return 'TOUCH A CHANNEL'
		if (this.mode === 'capturing') return 'READING'
		if (this.mode === 'holding') return 'PRESS A SLOT'
		if (this.scriptHeld) return 'PRESS A SCRIPT'
		if (this.scriptRec) return `SCRIPT REC ${this.scriptRec.steps.length}`
		return 'READY'
	}

	status() {
		return {
			online: this.online,
			consoleName: this.consoleName,
			counts: Object.fromEntries(SECTION_IDS.map((s) => [s, this.count(s)])),
			mode: this.mode,
			state: this.stateLabel(),
			scopes: SCOPE_IDS.filter((s) => this.scopes.has(s)),
			targetMode: this.targetMode,
			touched: this.lastTouched,
			touchedLabel: this.touchedLabel(),
			held: this.held ? describe(this.held.section, this.held.index, this.held.name) : '',
			scriptRecording: !!this.scriptRec,
			scriptSteps: this.scriptRec ? this.scriptRec.steps.length : this.scriptHeld ? this.scriptHeld.length : 0,
			scriptHeld: !!this.scriptHeld,
		}
	}
}
