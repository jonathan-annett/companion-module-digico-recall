import fs from 'node:fs'
import path from 'node:path'

// Audit trail: a timestamped record of every change the console reports and everything
// this module does. Off unless switched on. Kept in memory for the web page's Log tab and,
// if a folder is set, appended to one CSV file per day.

const MERGE_MS = 1500 // a fader move is a stream of values; treat a burst on one address as one change
const MAX_ENTRIES = 5000
const FLUSH_MS = 2000

const two = (n) => String(n).padStart(2, '0')
const dayStamp = (t) => {
	const d = new Date(t)
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** Values as short text: numbers to two decimals, strings as they are. */
export function showValue(args) {
	if (!args) return ''
	return args.map((v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v))).join(' ')
}

const csv = (cells) => cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')

export class AuditLog {
	/** @param {{folder?: string, log?: (level: string, text: string) => void, onChange?: () => void}} opts */
	constructor(opts = {}) {
		this.opts = opts
		this.enabled = false
		this.entries = []
		this.seq = 0
		this.last = new Map() // address -> last known arguments, to show "from" values
		this.timer = null
		this.fileError = ''
	}

	setEnabled(on) {
		on = !!on
		if (on === this.enabled) return
		this.enabled = true // so the on/off note itself is recorded
		this.event(on ? 'Audit log switched on' : 'Audit log switched off')
		this.enabled = on
		if (on && !this.timer) this.timer = setInterval(() => this.flush(false), FLUSH_MS)
		if (!on) this.stop()
		this.opts.onChange?.()
	}

	stop() {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
		this.flush(true)
	}

	/** Remember a value without logging it (query replies, values this module sent). */
	note(address, args) {
		this.last.set(address, args)
	}

	/**
	 * A value changed on the console.
	 * @param {{address: string, channel: string, parameter: string, args: any[], source?: string}} change
	 */
	change({ address, channel, parameter, args, source = 'console' }) {
		const before = this.last.get(address)
		this.last.set(address, args)
		if (!this.enabled) return
		const now = Date.now()
		// Search back a little: other controls may have reported in between
		for (let i = this.entries.length - 1; i >= 0 && now - this.entries[i].t2 < MERGE_MS; i--) {
			const entry = this.entries[i]
			if (entry.address === address && entry.source === source && !entry.written) {
				entry.to = showValue(args)
				entry.t2 = now
				entry.count++
				entry.seq = ++this.seq // so the web page picks up the new value
				this.opts.onChange?.()
				return
			}
		}
		this.push({
			type: 'change',
			source,
			address,
			channel,
			parameter,
			from: before ? showValue(before) : '',
			to: showValue(args),
			count: 1,
		})
	}

	/** Something the module did, or a change of connection state. */
	event(text) {
		if (!this.enabled) return
		this.push({
			type: 'event',
			source: 'module',
			address: '',
			channel: '',
			parameter: '',
			from: '',
			to: text,
			count: 1,
		})
	}

	push(fields) {
		const now = Date.now()
		this.entries.push({ seq: ++this.seq, t: now, t2: now, written: false, ...fields })
		if (this.entries.length > MAX_ENTRIES) {
			this.flush(true)
			this.entries.splice(0, this.entries.length - MAX_ENTRIES)
		}
		this.opts.onChange?.()
	}

	/** Entries the web page hasn't seen yet. */
	since(seq) {
		return this.entries.filter((entry) => entry.seq > seq)
	}

	lastText() {
		const entry = this.entries[this.entries.length - 1]
		if (!entry) return ''
		if (entry.type === 'event') return entry.to
		return `${entry.channel} ${entry.parameter} ${entry.to}`.trim()
	}

	clear() {
		this.flush(true)
		this.entries = []
		this.opts.onChange?.()
	}

	static header() {
		return csv(['time', 'source', 'channel', 'parameter', 'from', 'to', 'messages', 'address'])
	}

	static line(entry) {
		return csv([
			new Date(entry.t).toISOString(),
			entry.source,
			entry.channel,
			entry.parameter,
			entry.from,
			entry.to,
			entry.count,
			entry.address,
		])
	}

	/** Append finished entries to today's file. An entry is finished once its burst has ended. */
	flush(everything) {
		const folder = (this.opts.folder || '').trim()
		if (!folder) return
		const now = Date.now()
		const ready = this.entries.filter((entry) => !entry.written && (everything || now - entry.t2 >= MERGE_MS))
		if (!ready.length) return
		const byDay = new Map()
		for (const entry of ready) {
			const day = dayStamp(entry.t)
			if (!byDay.has(day)) byDay.set(day, [])
			byDay.get(day).push(entry)
			entry.written = true
		}
		try {
			fs.mkdirSync(folder, { recursive: true })
			for (const [day, entries] of byDay) {
				const file = path.join(folder, `digico-recall-log-${day}.csv`)
				const lines = entries.map(AuditLog.line)
				if (!fs.existsSync(file)) lines.unshift(AuditLog.header())
				fs.appendFileSync(file, lines.join('\n') + '\n')
			}
			this.fileError = ''
		} catch (err) {
			if (this.fileError !== err.message)
				this.opts.log?.('error', `Could not write the audit log to ${folder}: ${err.message}`)
			this.fileError = err.message
		}
	}
}
