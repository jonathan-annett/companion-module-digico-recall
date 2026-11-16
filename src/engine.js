import { Transport } from './transport.js'
import {
	SECTIONS,
	SECTION_IDS,
	FALLBACK_COUNTS,
	SCOPE_IDS,
	NEVER_LEARN,
	captureSuffixes,
	meterSuffixes,
	isKnownSuffix,
	scopeOf,
	parseAddress,
	describe,
} from './params.js'
import { namesToSteps } from './validate.js'
import { AuditLog } from './audit.js'
import { decode } from './osc.js'
import fs from 'node:fs'
import nodePath from 'node:path'

const ECHO_WINDOW_MS = 1500
const STATUS_POLL_MS = 5000
const METER_POLL_MS = 500

// Ganged channels (a stereo pair of graphic EQs, say) report every change on both members
// at the same instant. Measured on the Quantum 338 offline software: 0 to 1 ms apart. The
// members move by the same amount but need not hold the same values.
const GANG_MS = 5 // two channels reporting the same value this close together count as one hit
const GANG_HITS = 3 // hits needed, within GANG_WINDOW_MS, before the channels are treated as ganged
const GANG_WINDOW_MS = 3000
const GANG_FOLLOW_MS = 80 // a ganged partner is expected to report within this
const GANG_MISSES = 3 // times in a row a partner may fail to follow before the link is dropped
const GANG_TOLERANCE = 0.02 // how closely two movements must match to count as the same (dB, Hz ...)
const METER_PACKET_LIMIT = 30000

function uniqueTargets(targets) {
	const seen = new Set()
	return targets.filter((t) => {
		const key = `${t.section}/${t.index}`
		return seen.has(key) ? false : seen.add(key)
	})
}

/** Short text for a slot button, from what the slot holds. */
export function describeSlot(slot) {
	if (slot.kind === 'names' && slot.steps.length > 1) return `${slot.steps.length} names`
	// A script may visit the same channel more than once; name each channel once
	const seen = new Set()
	const channels = slot.steps.filter((step) => {
		const key = `${step.section}/${step.index}`
		return seen.has(key) ? false : seen.add(key)
	})
	return describeChannels(channels)
}

/** Short text for a button: one channel in full, a few by name, more as a count. */
export function describeChannels(channels) {
	if (channels.length === 1) return describe(channels[0].section, channels[0].index, channels[0].name)
	if (channels.length <= 3) return channels.map((c) => c.name || describe(c.section, c.index)).join(', ')
	return `${channels.length} channels`
}

/** What a slot holds. Decides its colour on the buttons. */
export const KINDS = [
	{ id: 'capture', label: 'Capture' },
	{ id: 'script', label: 'Script' },
	{ id: 'names', label: 'Names' },
]

export function emptyLibrary() {
	return { version: 3, slots: {}, learned: {} }
}

export function normalizeLibrary(input) {
	const lib = emptyLibrary()
	if (!input || typeof input !== 'object') return lib
	for (const key of ['slots', 'learned']) {
		if (input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) lib[key] = input[key]
	}
	return lib
}

/**
 * Everything the module does, independent of Companion: talks to the console, tracks the
 * last touched channel, captures and recalls channel snapshots, records scripts, and
 * captures and restores names.
 *
 * Everything stored is a slot, and every slot is a list of steps:
 *
 *   slot = { label, when, kind, steps: [{ section, index, name, fixed, values }] }
 *
 * values is { suffix: { t, a } }, where t is the OSC type-tag string and a the argument
 * list exactly as the console reported them, so a recall sends back precisely what was
 * read. A step that is not fixed is filtered by the recall-scope toggles when it is sent
 * (a capture: the whole channel is stored, you choose what to put back). A fixed step is
 * sent as it is (a script step or a saved name: what to send was decided when it was made).
 * kind is 'capture', 'script' or 'names' and only affects how the slot is shown.
 */
// A fader-to-unity move is made in steps no larger than this, so the level never jumps
const UNITY_STEP_DB = 0.5

export class Engine {
	/**
	 * @param {object} cfg  ip, sendPort, recvPort, rate, queryTimeout, learn
	 * @param {object} hooks  onChange(), persist(lib), log(level, text), onStatus(ok, text), onRaw(buf)
	 */
	constructor(cfg, hooks = {}) {
		this.cfg = {
			rate: 500,
			queryTimeout: 400,
			learn: false,
			unityStepMs: 40, // pause between the steps of a fader-to-unity move
			clearTimeout: 10000,
			audit: false,
			auditFolder: '',
			...cfg,
		}
		this.hooks = hooks
		this.lib = emptyLibrary()
		this.audit = new AuditLog({
			folder: this.cfg.auditFolder,
			log: (level, text) => this.log(level, text),
			onChange: () => this.changed(),
		})
		this.scopes = new Set(['eq', 'geq'])
		this.armed = false // true from pressing capture until a slot is pressed or it is cancelled
		this.pending = 0 // channel reads in progress
		this.reading = new Set() // which channels those are
		this.held = [] // channels captured so far, waiting for a slot
		this.scriptRec = null // null, or { steps: [] } while recording
		this.scriptHeld = null // recorded steps waiting for a slot
		this.clearMode = false // true after a long press on capture: the next slot pressed is cleared
		this.clearTimer = null
		this.namesRec = null // null, or { names: { section: { number: name } } } while collecting names
		this.targetMode = 'original' // original | touched
		this.lastTouched = null
		this.lastRecalled = null
		this.counts = {}
		this.names = {}
		this.consoleName = ''
		this.unityNote = '' // what the last fader-to-unity did, for the key
		this.absent = {} // section -> Map(suffix -> captures in a row it went unanswered)
		this.current = new Map() // address -> { t, a }: the latest value the console has reported
		this.online = false
		this.lastReply = 0
		this.sentAt = new Map()
		this.batch = null
		this.chain = Promise.resolve()
		this.transport = null
		this.pollTimer = null
		this.gangs = new Map() // 'Section/n' -> Set of 'Section/n' it moves with
		this.gangRecent = [] // the last few operator changes, for spotting ones that arrive together
		this.gangHits = new Map() // 'a|b' -> times of recent coincidences
		this.gangPending = [] // ganged changes waiting to see whether the partner followed
		this.gangMisses = new Map() // 'a|b' -> consecutive times the partner did not follow
		this.gangValues = new Map() // address -> last value seen, to measure how far a control moved
		this.meterCap = null // a meter capture in progress
		this.relayActive = false // set by the Companion instance while a real iPad is relayed
		this.meterCaptures = [] // finished captures, newest last
	}

	// ---- lifecycle -------------------------------------------------------------------

	start() {
		this.transport = new Transport({
			ip: this.cfg.ip,
			sendPort: this.cfg.sendPort,
			recvPort: this.cfg.recvPort,
			rate: this.cfg.rate,
			onMessage: (m) => this.onMessage(m),
			onRaw: (buf) => {
				if (this.meterCap) this.meterTap(buf)
				this.hooks.onRaw?.(buf)
			},
			onStatus: (ok, text) => {
				if (!ok) this.hooks.onStatus?.(false, text)
			},
			log: this.hooks.log,
		})
		this.transport.start()
		this.audit.setEnabled(this.cfg.audit)
		this.refreshConsole()
		this.pollTimer = setInterval(() => this.poll(), STATUS_POLL_MS)
	}

	async stop() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
		if (this.clearTimer) clearTimeout(this.clearTimer)
		this.clearTimer = null
		if (this.batch) this.batch.finish()
		if (this.meterCap) this.finishMeterCapture()
		this.audit.stop()
		await this.transport?.close()
		this.transport = null
	}

	poll() {
		if (!this.transport) return
		this.checkGangFollowers(Date.now())
		const wasOnline = this.online
		this.online = Date.now() - this.lastReply < STATUS_POLL_MS * 2 + 1000
		if (wasOnline !== this.online) {
			this.hooks.onStatus?.(this.online, this.online ? 'Connected' : 'No reply from console')
			this.audit.event(this.online ? 'Console connected' : 'No reply from console')
			this.changed()
		}
		if (this.meterCap?.mode !== 'snoop') this.transport.query('/Console/Name')
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
		// What the console last said each setting is, for comparing a capture with the console now
		if (m.args.length && !/meter/i.test(m.path)) this.current.set(m.path, { t: m.types, a: m.args })
		if (!this.online) {
			this.online = true
			this.absent = {} // it may be a different console now
			this.current.clear()
			this.audit.event(`Console connected${this.consoleName ? `: ${this.consoleName}` : ''}`)
			this.hooks.onStatus?.(true, 'Connected')
			this.changed()
		}

		// Reply to one of our own queries?
		if (this.batch && this.batch.want.has(m.path)) {
			if (m.args.length) {
				this.audit.note(m.path, m.args)
				if (typeof m.args[0] === 'number') this.gangValues.set(m.path.slice(1), m.args[0])
				this.batch.take(m)
			}
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
		if (!m.args.length || /meter/i.test(m.path)) return
		if (!addr) {
			// Not a channel: a snapshot firing, a macro, a layout change. Worth a line in the log.
			if (!m.path.startsWith('/Console/')) {
				const parts = m.path.split('/').filter(Boolean)
				this.audit.change({
					address: m.path,
					channel: parts[0] ?? '',
					parameter: parts.slice(1).join('/'),
					args: m.args,
				})
			}
			return
		}

		if (addr.suffix === SECTIONS[addr.section].name && typeof m.args[0] === 'string') {
			;(this.names[addr.section] ??= {})[addr.index] = m.args[0]
		}

		// The console echoes values we just wrote. Those are not the operator touching something.
		const sent = this.sentAt.get(m.path)
		if (sent && Date.now() - sent < ECHO_WINDOW_MS) {
			this.audit.note(m.path, m.args)
			if (typeof m.args[0] === 'number') this.gangValues.set(m.path.slice(1), m.args[0])
			return
		}
		this.audit.change({
			address: m.path,
			channel: describe(addr.section, addr.index, this.names[addr.section]?.[addr.index]),
			parameter: addr.suffix,
			args: m.args,
		})

		this.noteGang(addr, m.args)
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
		if (!same && this.names[section]?.[index] === undefined) void this.learnName(section, index)
		if (this.armed) {
			void this.captureToHold(section, index)
		} else if (this.namesRec) {
			void this.addNameToList(section, index)
		} else if (!same) this.changed()
	}

	// ---- gangs -------------------------------------------------------------------------
	// The console doesn't say which channels are ganged, but ganged channels give themselves
	// away: every change arrives on both at the same moment with the same value.

	noteGang(addr, args) {
		const now = Date.now()
		const key = `${addr.section}/${addr.index}`
		const path = `${key}/${addr.suffix}`
		const number = typeof args[0] === 'number' ? args[0] : null
		// How far this control moved. Ganged channels need not hold the same values (two
		// graphics with different curves track each other from where they were), but they move
		// by the same amount. Text and first-ever reports are compared by value instead.
		const before = this.gangValues.get(path)
		const delta = number !== null && typeof before === 'number' ? number - before : null
		this.gangValues.set(path, number ?? JSON.stringify(args))
		const value = JSON.stringify(args)
		this.checkGangFollowers(now)

		for (const other of this.gangRecent) {
			if (now - other.t > GANG_MS) continue
			if (other.key === key || other.section !== addr.section || other.suffix !== addr.suffix) continue
			const together =
				delta !== null && other.delta !== null
					? Math.abs(delta - other.delta) < GANG_TOLERANCE && Math.abs(delta) > 0
					: other.value === value
			if (!together) continue
			const pair = [key, other.key].sort().join('|')
			const hits = (this.gangHits.get(pair) ?? []).filter((t) => now - t < GANG_WINDOW_MS)
			hits.push(now)
			this.gangHits.set(pair, hits)
			if (hits.length >= GANG_HITS && !this.gangs.get(key)?.has(other.key)) this.linkGang(key, other.key)
		}
		this.gangRecent.push({ t: now, key, section: addr.section, suffix: addr.suffix, value, delta })
		if (this.gangRecent.length > 64) this.gangRecent.shift()

		// If this channel is ganged, each partner should report the same control within moments
		for (const partner of this.gangs.get(key) ?? []) {
			this.gangPending.push({ t: now, key, partner, suffix: addr.suffix })
		}
	}

	/**
	 * Drop a gang link when a member keeps moving without its partner. One miss is
	 * forgiven: a partner pinned at the end of its range may have nothing to report.
	 */
	checkGangFollowers(now) {
		if (!this.gangPending.length) return
		const waiting = []
		for (const pending of this.gangPending) {
			if (now - pending.t < GANG_FOLLOW_MS) {
				waiting.push(pending)
				continue
			}
			if (!this.gangs.get(pending.key)?.has(pending.partner)) continue
			const pair = [pending.key, pending.partner].sort().join('|')
			const followed = this.gangRecent.some(
				(r) => r.key === pending.partner && r.suffix === pending.suffix && Math.abs(r.t - pending.t) <= GANG_FOLLOW_MS,
			)
			if (followed) {
				this.gangMisses.delete(pair)
				continue
			}
			const misses = (this.gangMisses.get(pair) ?? 0) + 1
			this.gangMisses.set(pair, misses)
			if (misses >= GANG_MISSES) {
				this.gangMisses.delete(pair)
				this.unlinkGang(pending.key, pending.partner)
			}
		}
		this.gangPending = waiting
	}

	gangLabel(keyA, keyB) {
		const section = keyA.split('/')[0]
		const [low, high] = [keyA, keyB].map((key) => Number(key.split('/')[1])).sort((x, y) => x - y)
		return `${SECTIONS[section].label} ${low} and ${high}`
	}

	linkGang(a, b) {
		for (const [x, y] of [
			[a, b],
			[b, a],
		]) {
			if (!this.gangs.has(x)) this.gangs.set(x, new Set())
			this.gangs.get(x).add(y)
		}
		this.audit.event(`Ganged: ${this.gangLabel(a, b)} move together`)
		this.log('info', `Ganged: ${this.gangLabel(a, b)}`)
		this.changed()
	}

	unlinkGang(a, b) {
		this.gangs.get(a)?.delete(b)
		this.gangs.get(b)?.delete(a)
		this.gangHits.delete([a, b].sort().join('|'))
		this.audit.event(`No longer ganged: ${this.gangLabel(a, b)}`)
		this.changed()
	}

	/** Every gang once, as { section, members } with the member numbers in order. */
	gangList() {
		const seen = new Set()
		const out = []
		for (const [key, partners] of this.gangs) {
			if (!partners.size) continue
			const [section, index] = key.split('/')
			const members = [Number(index), ...this.gangPartners(section, Number(index))].sort((x, y) => x - y)
			const id = `${section}/${members.join('+')}`
			if (seen.has(id)) continue
			seen.add(id)
			out.push({ section, members })
		}
		return out
	}

	/** The numbers of the channels ganged with this one, lowest first. */
	gangPartners(section, index) {
		return [...(this.gangs.get(`${section}/${index}`) ?? [])]
			.map((key) => Number(key.split('/')[1]))
			.sort((x, y) => x - y)
	}

	/** Ask for a touched channel's name, so buttons can show "In 5 Vox" rather than "In 5". */
	async learnName(section, index) {
		if (this.meterCap?.mode === 'snoop') return // keep the trace free of this module's own traffic
		const path = `/${section}/${index}/${SECTIONS[section].name}`
		const name = (await this.queryMany([path])).get(path)?.a[0]
		if (typeof name !== 'string') return
		;(this.names[section] ??= {})[index] = name
		this.changed()
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
				if (!missing.length || !this.transport) break // nothing left, or the module was stopped
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

	/**
	 * Read every setting of one channel.
	 *
	 * The address table covers both console families (eight-band bus EQ on Quantum and
	 * SD5/7/10; four-band bus EQ with filters on SD8/9/11/12), so on any console some
	 * addresses get no answer. An address that goes unanswered in two captures of a section
	 * that otherwise answered is not asked for again until the console reconnects, which
	 * keeps later captures quick without a console-type setting to get wrong.
	 */
	async captureChannel(section, index) {
		const absent = (this.absent[section] ??= new Map())
		const suffixes = captureSuffixes(section, this.count('Aux_Outputs'), this.lib.learned[section]).filter(
			(suffix) => (absent.get(suffix) ?? 0) < 2,
		)
		const prefix = `/${section}/${index}/`
		const got = await this.queryMany(suffixes.map((s) => prefix + s))
		const values = {}
		for (const suffix of suffixes) {
			const v = got.get(prefix + suffix)
			if (v) values[suffix] = v
		}
		// Only a channel that mostly answered says anything about which addresses exist
		if (got.size * 2 > suffixes.length) {
			let dropped = 0
			for (const suffix of suffixes) {
				if (suffix in values) absent.delete(suffix)
				else {
					absent.set(suffix, (absent.get(suffix) ?? 0) + 1)
					if (absent.get(suffix) === 2) dropped++
				}
			}
			if (dropped) {
				const text = `${SECTIONS[section].label}: ${dropped} setting(s) this console does not have will not be asked for again`
				this.hooks.log?.('info', text)
				this.audit.event(text)
			}
		}
		const nameValue = values[SECTIONS[section].name]
		const name = nameValue && typeof nameValue.a[0] === 'string' ? nameValue.a[0] : ''
		if (name) (this.names[section] ??= {})[index] = name
		return { section, index, name, when: new Date().toISOString(), values }
	}

	/**
	 * Read one channel and add it to the capture being built. A capture can hold several
	 * channels: arm, touch as many as you like, then press a slot. A fader move arrives as a
	 * stream of messages, so a channel that is already in the capture, or being read, is
	 * not read again.
	 */
	async captureToHold(section, index) {
		const key = `${section}/${index}`
		if (this.reading.has(key) || this.held.some((c) => c.section === section && c.index === index)) return
		this.armed = true
		this.reading.add(key)
		this.pending++
		this.changed()
		const snap = await this.captureChannel(section, index)
		this.reading.delete(key)
		this.pending--
		if (!this.armed) return // cancelled meanwhile
		const n = Object.keys(snap.values).length
		if (!n) {
			this.log('warn', `Capture of ${describe(section, index)} got no replies from the console`)
			if (!this.held.length && !this.pending) this.armed = false
		} else {
			this.held.push(snap)
			this.log('info', `Captured ${describe(section, index, snap.name)}: ${n} values. Touch more, or press a slot.`)
		}
		this.changed()
	}

	/** idle | armed (waiting for a touch) | capturing (reading) | holding (waiting for a slot) */
	get mode() {
		if (!this.armed) return 'idle'
		if (this.pending) return 'capturing'
		return this.held.length ? 'holding' : 'armed'
	}

	/** The "start recording" button. Pressing it again cancels. */
	toggleArm() {
		if (this.clearMode) return this.setClearMode(false)
		if (this.namesRec) return // one kind of collecting at a time
		this.armed = !this.armed
		this.held = []
		this.changed()
	}

	/**
	 * Clear mode: the next slot button pressed is emptied instead of used. Entered by holding the capture button. It drops whatever was being collected,
	 * and switches itself off after a few seconds so a later press can't delete by surprise.
	 */
	setClearMode(on) {
		if (this.clearTimer) clearTimeout(this.clearTimer)
		this.clearTimer = null
		if (on) {
			this.armed = false
			this.held = []
			this.scriptRec = null
			this.scriptHeld = null
			this.namesRec = null
			this.clearTimer = setTimeout(() => this.setClearMode(false), this.cfg.clearTimeout)
		}
		this.clearMode = !!on
		this.changed()
	}

	/** In clear mode, empty a slot and leave clear mode. */
	clearPressed(id) {
		const existed = !!this.lib.slots[id]
		delete this.lib.slots[id]
		if (this.lastRecalled === id) this.lastRecalled = null
		this.setClearMode(false)
		if (existed) {
			this.audit.event(`Cleared slot ${id}`)
			this.log('info', `Cleared slot ${id}`)
			this.persist()
		}
		return existed ? 'cleared' : 'empty'
	}

	cancel() {
		if (this.clearMode) this.setClearMode(false)
		this.armed = false
		this.held = []
		this.scriptRec = null
		this.scriptHeld = null
		this.namesRec = null
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
			this.audit.note(path, v.a)
			if (typeof v.a[0] === 'number') this.gangValues.set(path.slice(1), v.a[0])
			n++
		}
		if (this.sentAt.size > 5000) {
			for (const [path, at] of this.sentAt) if (now - at > ECHO_WINDOW_MS) this.sentAt.delete(path)
		}
		return n
	}

	// ---- comparing a slot with the console ---------------------------------------------

	/**
	 * What the console has now for every value in a slot. The first look at a channel asks
	 * the console; after that the answer comes from what the console has reported since,
	 * because it announces every change, so watching a slot costs no traffic.
	 * @returns {Promise<{ now: Record<string, {t: string, a: any[]}> }[]>}  one entry per step
	 */
	async compareSlot(id, refresh = false) {
		const slot = this.lib.slots[String(id)]
		if (!slot) return []
		const pathOf = (step, suffix) => `/${step.section}/${step.index}/${suffix}`
		const ask = []
		for (const step of slot.steps) {
			for (const suffix of Object.keys(step.values)) {
				const path = pathOf(step, suffix)
				if (refresh || !this.current.has(path)) ask.push(path)
			}
		}
		if (ask.length) {
			const got = await this.queryMany([...new Set(ask)])
			for (const [path, v] of got) this.current.set(path, v)
		}
		return slot.steps.map((step) => {
			const now = {}
			for (const suffix of Object.keys(step.values)) {
				const v = this.current.get(pathOf(step, suffix))
				if (v) now[suffix] = v
			}
			return { now }
		})
	}

	/** Put chosen values of one step back on the console as captured, whatever scopes are lit. */
	revertValues(id, stepIndex, suffixes) {
		const step = this.lib.slots[String(id)]?.steps[stepIndex]
		if (!step) return 0
		const values = {}
		for (const suffix of suffixes) if (step.values[suffix]) values[suffix] = step.values[suffix]
		const n = this.sendValues(step.section, step.index, values, null)
		if (n)
			this.audit.event(
				`Put back ${n} captured value(s) of slot ${id} on ${describe(step.section, step.index, step.name)}`,
			)
		return n
	}

	/** Take the console's present values for chosen settings of one step into the capture. */
	adoptValues(id, stepIndex, suffixes) {
		const step = this.lib.slots[String(id)]?.steps[stepIndex]
		if (!step) return 0
		let n = 0
		for (const suffix of suffixes) {
			const v = this.current.get(`/${step.section}/${step.index}/${suffix}`)
			if (!v || !step.values[suffix]) continue
			step.values[suffix] = { t: v.t, a: [...v.a] }
			n++
		}
		if (n) {
			this.audit.event(
				`Updated ${n} value(s) of slot ${id} from the console (${describe(step.section, step.index, step.name)})`,
			)
			this.persist()
			this.changed()
		}
		return n
	}

	// ---- fader to unity ----------------------------------------------------------------

	/**
	 * Put an input's fader at 0 dB and move its digital trim by the same amount the other
	 * way, so the level it sends to the mix is unchanged and the fader is back where small
	 * moves make small changes.
	 *
	 * Changing the trim changes the level into everything after it, so those follow:
	 * - gate, compressor and dynamic EQ thresholds move with the trim, so they act on the
	 *   signal as before;
	 * - sends to the auxes listed as pre-fader in the settings move the other way, so
	 *   monitor mixes are unchanged. Post-fader sends need nothing: the fader moved up by
	 *   what the trim took off.
	 * The analogue gain is not touched, so the preamp and anything sharing it are unaffected.
	 *
	 * The move is made gradually, in half-dB steps about 40 ms apart (a 12 dB move takes
	 * about a second), because the console cannot change two settings at the same instant.
	 *
	 * If a setting would go past its range the move is shortened to what fits, and the
	 * result says what stopped it. A threshold of a processor that is switched out does
	 * not limit the move.
	 * @returns {Promise<{ok: boolean, text: string, moved?: number, fader?: number, limitedBy?: string}>}
	 */
	async faderToUnity(section, index) {
		const done = (ok, text, extra = {}) => {
			this.unityNote = text
			this.audit.event(`Fader to unity, ${describe(section, index, this.names[section]?.[index])}: ${text}`)
			this.log(ok ? 'info' : 'warn', `Fader to unity, ${describe(section, index)}: ${text}`)
			this.changed()
			return { ok, text, ...extra }
		}
		if (section !== 'Input_Channels') return done(false, 'inputs only')
		if (this.unityBusy) return { ok: false, text: 'busy' } // one at a time; the first is still moving
		const base = `/${section}/${index}/`
		// [suffix, the switch that says whether its processor is in]
		const thresholds = [
			['Dynamics/gate_thresh', 'Dynamics/gate_in'],
			...[1, 2, 3].map((n) => [`Dynamics/comp_thresh_${n}`, 'Dynamics/comp_in']),
			...[1, 2, 3, 4].map((n) => [`EQ/eq_thresh_${n}`, `EQ/dynamic_eq_on_${n}`]),
		]
		const pre = (this.cfg.preFaderAuxes ?? []).filter((n) => n <= this.count('Aux_Outputs'))
		const sends = pre.map((n) => [`Aux_Send/${n}/send_level`, `Aux_Send/${n}/send_on`])
		const wanted = ['fader', 'Channel_Input/trim', ...thresholds.flat(), ...sends.flat()]
		const got = await this.queryMany([...new Set(wanted)].map((suffix) => base + suffix))
		const value = (suffix) => got.get(base + suffix)?.a[0]
		const fader = value('fader')
		const trim = value('Channel_Input/trim')
		if (typeof fader !== 'number' || typeof trim !== 'number') return done(false, 'no answer')
		if (fader < -60) return done(false, 'fader is down')
		if (Math.abs(fader) < 0.05) return done(true, 'already at 0 dB', { moved: 0, fader })

		// The trim changes by the fader's present level. Shorten the move to what every
		// setting that has to follow can manage.
		let delta = fader
		let limitedBy = ''
		const limit = (name, now, change, min, max) => {
			const room = change < 0 ? now - min : max - now // how far this one can go, as a positive number
			if (Math.abs(delta) > room + 1e-6) {
				delta = Math.sign(delta) * Math.max(0, room)
				limitedBy = name
			}
		}
		limit('trim', trim, delta, -40, 60)
		const following = [] // [suffix, new value]
		for (const [suffix, sw] of thresholds) {
			const now = value(suffix)
			if (typeof now !== 'number') continue
			if ((value(sw) ?? 0) >= 0.5) limit(suffix.split('/')[1].replace(/_/g, ' '), now, delta, -60, 0)
			following.push([suffix, now, +1, -60, 0])
		}
		for (const [suffix, sw] of sends) {
			const now = value(suffix)
			if (typeof now !== 'number' || now <= -90 || (value(sw) ?? 0) < 0.5) continue // off or down: leave it
			limit(`aux ${suffix.split('/')[1]} send`, now, -delta, -150, 10)
			following.push([suffix, now, -1, -150, 10])
		}
		if (Math.abs(delta) < 0.05)
			return done(false, `cannot move: ${limitedBy} is at its limit`, { moved: 0, fader, limitedBy })

		// The console takes one value at a time, so trim and fader cannot change together.
		// Moving in small steps keeps the level within one step of where it should be all
		// the way: half a dB at most, instead of a jump of the whole amount.
		const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
		const moving = [['Channel_Input/trim', trim, +1, -40, 60], ['fader', fader, -1, -150, 10], ...following]
		// Within a step, whatever makes things quieter goes first
		const quieter = ([suffix, , sign]) => sign * delta < 0 && !/thresh/.test(suffix)
		moving.sort((x, y) => Number(quieter(y)) - Number(quieter(x)))
		const steps = Math.max(1, Math.ceil(Math.abs(delta) / UNITY_STEP_DB))
		this.unityBusy = true
		try {
			for (let k = 1; k <= steps; k++) {
				const part = (delta * k) / steps
				const values = {}
				for (const [suffix, now, sign, min, max] of moving) {
					values[suffix] = { t: got.get(base + suffix).t, a: [Math.fround(clamp(now + sign * part, min, max))] }
				}
				this.sendValues(section, index, values, null)
				await this.transport?.drained()
				if (k < steps) await new Promise((resolve) => setTimeout(resolve, this.cfg.unityStepMs))
				if (!this.transport) break // the module was stopped part way
			}
		} finally {
			this.unityBusy = false
		}
		const round = (n) => Math.round(n * 10) / 10
		const left = round(fader - delta)
		const text =
			`trim ${delta > 0 ? '+' : ''}${round(delta)} dB, fader ${left === 0 ? 'at 0 dB' : `at ${left} dB`}` +
			(limitedBy ? ` (stopped by ${limitedBy})` : '') +
			(pre.length ? '' : '; aux sends not adjusted')
		return done(true, text, { moved: delta, fader: fader - delta, limitedBy })
	}

	/** What is waiting to be stored by the next slot press: { kind, steps }, 'busy', or null. */
	waiting() {
		if (this.mode === 'holding') {
			return { kind: 'capture', steps: this.held.map((c) => ({ ...c, fixed: false })) }
		}
		if (this.mode !== 'idle') return 'busy' // armed with nothing yet, or still reading
		if (this.scriptHeld) return { kind: 'script', steps: this.scriptHeld }
		if (this.namesRec) {
			const steps = namesToSteps(this.namesRec.names)
			return steps.length ? { kind: 'names', steps } : 'busy'
		}
		return null
	}

	/**
	 * The slot button. In order: clear it (clear mode), store whatever is waiting (a
	 * capture, a recorded script or a list of names), or recall what it holds.
	 */
	pressSlot(id) {
		id = String(id)
		if (this.clearMode) return this.clearPressed(id)
		const waiting = this.waiting()
		if (waiting === 'busy') return 'busy'
		if (waiting) {
			this.lib.slots[id] = { label: '', when: new Date().toISOString(), kind: waiting.kind, steps: waiting.steps }
			this.armed = false
			this.held = []
			this.scriptHeld = null
			this.namesRec = null
			this.audit.event(`Stored ${waiting.kind} in slot ${id}: ${describeSlot(this.lib.slots[id])}`)
			this.log('info', `Stored ${waiting.kind} in slot ${id}: ${describeSlot(this.lib.slots[id])}`)
			this.persist()
			this.changed()
			return 'stored'
		}
		const slot = this.lib.slots[id]
		if (!slot) return 'empty'
		// "Last touched" only redirects a capture of one channel; anything else goes where it was
		// aimed.
		//
		// Ganged channels: the console treats a value written to one member as that control
		// being moved, and moves the other members by the same amount (found on the Quantum
		// 338 offline software with ganged graphic EQs, 2026-11-16). So only one member of a
		// gang can be set to exact values; writing to a second member would drag the first
		// away again. Each gang therefore gets one write per press, and its other members
		// are left to follow.
		const redirect = slot.steps.length === 1 && !slot.steps[0].fixed
		const sends = [] // [step, target]
		const followers = [] // gang members that will move without being written to
		const isFollower = (t) => followers.some((f) => f.section === t.section && f.index === t.index)
		for (const step of slot.steps) {
			const target = redirect ? this.resolveTarget(step) : { section: step.section, index: step.index }
			if (!target) return 'mismatch'
			if (isFollower(target)) continue
			sends.push([step, target])
			for (const index of this.gangPartners(target.section, target.index)) {
				if (!isFollower({ section: target.section, index })) followers.push({ section: target.section, index })
			}
		}
		const targets = sends.map(([, target]) => target)
		let n = 0
		for (const [step, target] of sends) {
			const scopes = step.fixed ? null : this.scopes
			n += this.sendValues(target.section, target.index, step.values, scopes)
			// The partners' moves that follow are the console's doing, not the operator's
			for (const index of this.gangPartners(target.section, target.index)) {
				for (const suffix of Object.keys(step.values)) {
					if (!scopes || scopes.has(scopeOf(suffix)))
						this.sentAt.set(`/${target.section}/${index}/${suffix}`, Date.now())
				}
			}
			if (this.scriptRec) {
				// A script keeps its own copy of exactly what was sent, so later changes to this
				// slot, or to the scope toggles, don't change the script.
				const values = {}
				for (const [suffix, v] of Object.entries(step.values)) {
					if (!scopes || scopes.has(scopeOf(suffix))) values[suffix] = v
				}
				if (Object.keys(values).length) {
					this.scriptRec.steps.push({
						section: target.section,
						index: target.index,
						name: step.name,
						fixed: true,
						values,
					})
				}
			}
		}
		this.lastRecalled = id
		const scopeNote = slot.steps.some((step) => !step.fixed)
			? ` [${SCOPE_IDS.filter((scope) => this.scopes.has(scope))
					.join(' ')
					.toUpperCase()}]`
			: ''
		this.audit.event(
			`Recalled slot ${id} (${slot.label || describeSlot(slot)})${scopeNote}: ${n} values to ${describeChannels(uniqueTargets(targets))}` +
				(followers.length ? `; ganged ${describeChannels(followers)} left to follow by the same amount` : ''),
		)
		this.log('info', `Recalled slot ${id}: ${n} values to ${describeChannels(targets)}`)
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

	/**
	 * The "record script" button: start, press slots (each recall is recorded with the scopes
	 * and target in force at that moment), press again to finish, then press a slot to store.
	 */
	toggleScriptRecord() {
		if (this.scriptHeld) {
			this.scriptHeld = null
		} else if (this.scriptRec) {
			this.scriptHeld = this.scriptRec.steps.length ? this.scriptRec.steps : null
			this.scriptRec = null
		} else if (!this.namesRec && !this.clearMode) {
			this.scriptRec = { steps: [] }
		}
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

	/** How many names are in the list being collected. */
	namesCount() {
		if (!this.namesRec) return 0
		return Object.values(this.namesRec.names).reduce((sum, byIndex) => sum + Object.keys(byIndex).length, 0)
	}

	/**
	 * The "save names" button: start collecting. Each channel touched after this (solo is
	 * the easy one) has its name read and added to a list; a slot button then stores the
	 * list. Pressing it again throws the list away.
	 */
	toggleNamesRecord() {
		if (this.namesRec) this.namesRec = null
		else if (this.mode === 'idle' && !this.scriptRec && !this.scriptHeld && !this.clearMode)
			this.namesRec = { names: {} }
		this.changed()
	}

	async addNameToList(section, index) {
		const path = `/${section}/${index}/${SECTIONS[section].name}`
		const got = await this.queryMany([path])
		const name = got.get(path)?.a[0]
		if (!this.namesRec || typeof name !== 'string') return
		;(this.namesRec.names[section] ??= {})[index] = name
		;(this.names[section] ??= {})[index] = name
		this.changed()
	}

	/** While collecting: add every name on the console (or every name of the chosen types). */
	async addAllNamesToList(sections) {
		if (!this.namesRec) return 0
		const names = await this.fetchNames(sections)
		if (!this.namesRec) return 0
		for (const [section, byIndex] of Object.entries(names)) {
			this.namesRec.names[section] = { ...this.namesRec.names[section], ...byIndex }
		}
		this.changed()
		return this.namesCount()
	}

	// ---- meter capture -----------------------------------------------------------------
	// A diagnostic, not a feature: records everything meter-related the console sends for a
	// few seconds so the format and rate can be worked out from a real desk with audio.
	// It only listens and sends read queries; it never writes a value to the console.
	//
	// With a real iPad relayed through the module it becomes a snoop instead: it sends
	// nothing of its own and records both directions in full, so the requests the iPad app
	// makes to get its meters, and what the console sends back, can be read off.

	/**
	 * @param {number} seconds  how long to record
	 * @returns {boolean} false if one is already running or the module is stopped
	 */
	startMeterCapture(seconds = 10) {
		if (this.meterCap || !this.transport) return false
		seconds = Math.min(60, Math.max(0.2, Number(seconds) || 10))
		// The last touched channel, plus the first of each kind so there is always something to compare
		const targets = []
		const addTarget = (section, index) => {
			if (meterSuffixes(section).length && !targets.some((t) => t.section === section && t.index === index)) {
				targets.push({ section, index })
			}
		}
		if (this.lastTouched) addTarget(this.lastTouched.section, this.lastTouched.index)
		for (const section of ['Input_Channels', 'Group_Outputs', 'Aux_Outputs']) addTarget(section, 1)
		const queries = ['/Meters/values']
		for (const t of targets)
			for (const suffix of meterSuffixes(t.section)) queries.push(`/${t.section}/${t.index}/${suffix}`)

		const snoop = this.relayActive
		const cap = {
			mode: snoop ? 'snoop' : 'poll',
			ipadPackets: [], // snoop: everything the iPad sent to the console
			id: String(Date.now()),
			when: new Date().toISOString(),
			started: Date.now(),
			seconds,
			listenOnlyMs: Math.round(seconds * 300), // first 30%: just listen, to see what arrives unasked
			targets,
			queries,
			pollRounds: 0,
			received: 0,
			truncated: false,
			packets: [], // meter-related datagrams: { ms, hex, messages }
			other: {}, // everything else, counted by address pattern
			timers: [],
		}
		this.meterCap = cap
		if (snoop) cap.queries = [] // the iPad does the asking
		if (!snoop)
			cap.timers.push(
				setTimeout(() => {
					const poll = () => {
						if (this.meterCap !== cap || !this.transport) return
						cap.pollRounds++
						for (const q of cap.queries) this.transport.query(q)
					}
					poll()
					cap.timers.push(setInterval(poll, METER_POLL_MS))
				}, cap.listenOnlyMs),
			)
		cap.timers.push(setTimeout(() => this.finishMeterCapture(), seconds * 1000))
		this.audit.event(`Meter capture started: ${seconds} s${snoop ? ', snooping on the relayed iPad' : ''}`)
		this.changed()
		return true
	}

	/** Called for every datagram while a capture runs. */
	meterTap(buf) {
		const cap = this.meterCap
		cap.received++
		let messages = []
		try {
			messages = decode(buf)
		} catch {
			// kept as raw hex below
		}
		const text = buf.toString('latin1', 0, Math.min(buf.length, 200))
		const meterish = cap.mode === 'snoop' || !messages.length || /meter/i.test(text)
		if (!meterish) {
			for (const m of messages) {
				const pattern = m.path.replace(/\/\d+(?=\/|$)/g, '/*')
				cap.other[pattern] = (cap.other[pattern] ?? 0) + 1
			}
			return
		}
		if (cap.packets.length >= METER_PACKET_LIMIT) {
			cap.truncated = true
			return
		}
		cap.packets.push({
			ms: Date.now() - cap.started,
			bytes: buf.length,
			hex: buf.toString('hex', 0, Math.min(buf.length, 1024)),
			messages: messages.map((m) => ({ path: m.path, types: m.types, args: m.args })),
		})
	}

	/** Called for every datagram a relayed iPad sends while a capture runs. */
	meterTapIpad(buf) {
		const cap = this.meterCap
		if (!cap || cap.ipadPackets.length >= METER_PACKET_LIMIT) return
		let messages = []
		try {
			messages = decode(buf)
		} catch {
			// kept as raw hex
		}
		cap.ipadPackets.push({
			ms: Date.now() - cap.started,
			bytes: buf.length,
			hex: buf.toString('hex', 0, Math.min(buf.length, 1024)),
			messages: messages.map((m) => ({ path: m.path, types: m.types, args: m.args })),
		})
	}

	finishMeterCapture() {
		const cap = this.meterCap
		if (!cap) return null
		this.meterCap = null
		for (const timer of cap.timers) {
			clearTimeout(timer)
			clearInterval(timer)
		}
		// Per address: how often, how often unasked, and the range of the numbers carried
		const byAddress = {}
		for (const packet of cap.packets) {
			const list = packet.messages.length ? packet.messages : [{ path: '(not decodable)', types: '', args: [] }]
			for (const m of list) {
				const pattern = m.path.replace(/\/\d+(?=\/|$)/g, '/*')
				const row = (byAddress[pattern] ??= { count: 0, unasked: 0, types: [], withValue: 0, min: null, max: null })
				row.count++
				if (packet.ms < cap.listenOnlyMs) row.unasked++
				if (!row.types.includes(m.types)) row.types.push(m.types)
				const numbers = m.args.filter((a) => typeof a === 'number')
				if (numbers.length) {
					row.withValue++
					row.min = Math.min(row.min ?? Infinity, ...numbers)
					row.max = Math.max(row.max ?? -Infinity, ...numbers)
				}
			}
		}
		// What the iPad asked for, by address pattern, with one example of the arguments
		const ipadAsked = {}
		for (const packet of cap.ipadPackets) {
			for (const m of packet.messages) {
				const pattern = m.path.replace(/\/\d+(?=\/|$)/g, '/*')
				const row = (ipadAsked[pattern] ??= { count: 0, types: m.types, example: m.args })
				row.count++
			}
		}
		const result = {
			about: 'DiGiCo Recall meter capture. Send this file to the module maintainer.',
			mode: cap.mode,
			ipadDatagrams: cap.ipadPackets.length,
			ipadAsked,
			ipadPackets: cap.ipadPackets,
			id: cap.id,
			when: cap.when,
			console: this.consoleName,
			counts: { ...this.counts },
			seconds: cap.seconds,
			listenOnlyMs: cap.listenOnlyMs,
			targets: cap.targets,
			queries: cap.queries,
			pollRounds: cap.pollRounds,
			datagramsReceived: cap.received,
			meterDatagrams: cap.packets.length,
			truncated: cap.truncated,
			byAddress,
			other: cap.other,
			packets: cap.packets,
		}
		this.meterCaptures.push(result)
		if (this.meterCaptures.length > 5) this.meterCaptures.shift()
		const folder = (this.cfg.auditFolder || '').trim()
		if (folder) {
			try {
				fs.mkdirSync(folder, { recursive: true })
				const stamp = cap.when.replace(/[:.]/g, '-')
				fs.writeFileSync(nodePath.join(folder, `digico-recall-meters-${stamp}.json`), JSON.stringify(result))
			} catch (err) {
				this.log('error', `Could not write the meter capture to ${folder}: ${err.message}`)
			}
		}
		const withValues = Object.values(byAddress).filter((row) => row.withValue).length
		this.audit.event(
			`Meter capture finished: ${cap.packets.length} meter packets, ${withValues} addresses carried values`,
		)
		this.log('info', `Meter capture: ${cap.packets.length} meter packets of ${cap.received} received`)
		this.changed()
		return result
	}

	/** Captures without their packet lists, for the web page. */
	meterCaptureList() {
		return this.meterCaptures.map((c) => {
			const { packets, ipadPackets, ...summary } = c
			void packets
			void ipadPackets
			return { ...summary, addressesWithValues: Object.values(c.byAddress).filter((row) => row.withValue).length }
		})
	}

	// ---- summaries for buttons and the web page ----------------------------------------

	slotLabel(id) {
		const slot = this.lib.slots[String(id)]
		return slot ? slot.label || describeSlot(slot) : ''
	}

	slotKind(id) {
		return this.lib.slots[String(id)]?.kind ?? ''
	}

	touchedLabel() {
		const t = this.lastTouched
		if (!t) return ''
		// A ganged pair reads "GEQ 9+10 PC 1 L"
		const members = [t.index, ...this.gangPartners(t.section, t.index)].sort((x, y) => x - y)
		return describe(
			t.section,
			members.join('+'),
			this.names[t.section]?.[members[0]] ?? this.names[t.section]?.[t.index],
		)
	}

	stateLabel() {
		if (this.clearMode) return 'PRESS SLOT TO CLEAR'
		if (this.mode === 'armed') return 'TOUCH A CHANNEL'
		if (this.mode === 'capturing') return 'READING'
		if (this.mode === 'holding') return `${this.held.length} CH: PRESS SLOT`
		if (this.namesRec) return this.namesCount() ? `${this.namesCount()} NAMES: PRESS SLOT` : 'TAP SOLOS'
		if (this.scriptHeld) return `SCRIPT ${this.scriptHeld.length}: PRESS SLOT`
		if (this.scriptRec) return `SCRIPT REC ${this.scriptRec.steps.length}`
		return 'READY'
	}

	status() {
		return {
			online: this.online,
			consoleName: this.consoleName,
			counts: Object.fromEntries(SECTION_IDS.map((s) => [s, this.count(s)])),
			mode: this.mode,
			clearMode: this.clearMode,
			state: this.stateLabel(),
			scopes: SCOPE_IDS.filter((s) => this.scopes.has(s)),
			targetMode: this.targetMode,
			touched: this.lastTouched,
			touchedLabel: this.touchedLabel(),
			held: this.held.length ? describeChannels(this.held) : '',
			waiting: typeof this.waiting() === 'object' && this.waiting() ? this.waiting().kind : '',
			scriptRecording: !!this.scriptRec,
			scriptSteps: this.scriptRec ? this.scriptRec.steps.length : this.scriptHeld ? this.scriptHeld.length : 0,
			scriptHeld: !!this.scriptHeld,
			audit: this.audit.enabled,
			meterCapturing: !!this.meterCap,
			relay: this.relayActive,
			gangs: this.gangList(),
			namesRecording: !!this.namesRec,
			namesCount: this.namesCount(),
		}
	}
}
