import { SECTIONS, SECTION_IDS, SCOPES, SCOPE_IDS } from './params.js'
import { KINDS } from './engine.js'
import { cleanSlot, cleanNames, cleanLibrary, namesToSteps } from './validate.js'
import { PAGE } from './webui.js'
import { consoleSetup } from './network.js'

// The web page and its JSON API. Companion serves this at
//   http://<companion>:<port>/instance/<connection label>/
// and passes the part of the path after the label in request.path.

const json = (data, status = 200) => ({
	status,
	headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	body: JSON.stringify(data),
})

/**
 * @param {{engine: import('./engine.js').Engine | null, config: object, setConsoleHost: (ip: string) => Promise<void>}} self
 * @param {{method: string, path: string, body?: string}} request
 */
export async function handleHttp(self, request) {
	const engine = self.engine
	const path = String(request.path || '/').replace(/\/+$/, '') || '/'
	const method = String(request.method || 'GET').toUpperCase()
	try {
		if (method === 'GET' && path === '/') {
			return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: PAGE }
		}
		if (!engine) return json({ error: 'Module is not running' }, 503)
		if (method === 'GET' && path === '/api/status') {
			return json({
				...engine.status(),
				sections: SECTIONS,
				scopeDefs: SCOPES,
				kinds: KINDS,
				setup: consoleSetup(self.config),
				slotCount: Number(self.config.slotCount),
			})
		}
		if (method === 'GET' && path === '/api/lib') return json(engine.lib)
		if (method === 'GET' && path === '/api/meters') {
			const id = String(request.query?.id ?? '')
			if (id) {
				const capture = engine.meterCaptures.find((c) => c.id === id)
				return capture ? json(capture) : json({ error: 'That capture is no longer held' }, 404)
			}
			return json({ running: !!engine.meterCap, captures: engine.meterCaptureList() })
		}
		if (method === 'GET' && path === '/api/log') {
			// Entries newer than the last one the page has. seq also moves when a burst grows.
			const since = Number(request.query?.since) || 0
			return json({ enabled: engine.audit.enabled, seq: engine.audit.seq, entries: engine.audit.since(since) })
		}
		if (method !== 'POST') return json({ error: 'Not found' }, 404)

		let body = {}
		if (request.body) body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
		const id = String(body.id ?? '').trim()
		const needId = () => {
			if (!/^\d{1,3}$/.test(id) || Number(id) < 1) throw new Error('A slot number from 1 to 999 is required')
		}
		const needIp = () => {
			const ip = String(body.ip ?? '').trim()
			const parts = ip.split('.')
			if (parts.length !== 4 || !parts.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)) {
				throw new Error('That is not an IP address')
			}
			return ip
		}
		const saved = () => {
			engine.persist()
			engine.changed()
			return json({ ok: true })
		}

		switch (path) {
			case '/api/setup/resolve':
				// What to enter on the console if its address were this one. Changes nothing.
				return json({ setup: consoleSetup({ ...self.config, host: needIp() }) })
			case '/api/setup/apply':
				await self.setConsoleHost(needIp())
				return json({ ok: true })
			case '/api/slot': {
				// Store an edited slot, or delete it when value is null
				needId()
				if (body.value === null || body.value === undefined) delete engine.lib.slots[id]
				else {
					const slot = cleanSlot(body.value)
					if (!slot) throw new Error('That slot is not valid: it needs at least one step')
					engine.lib.slots[id] = slot
				}
				return saved()
			}
			case '/api/slot/recall': {
				// Send a slot to the channels it was made from. Steps that follow the scope
				// toggles use the scopes ticked on the page, not the ones lit on the buttons.
				needId()
				const slot = engine.lib.slots[id]
				if (!slot) throw new Error('That slot is empty')
				const scopes = new Set((Array.isArray(body.scopes) ? body.scopes : []).filter((s) => SCOPE_IDS.includes(s)))
				let sent = 0
				for (const step of slot.steps) {
					sent += engine.sendValues(step.section, step.index, step.values, step.fixed ? null : scopes)
				}
				return json({ sent })
			}
			case '/api/names/fetch': {
				const sections = Array.isArray(body.sections) ? body.sections.filter((s) => SECTIONS[s]) : SECTION_IDS
				return json({ names: await engine.fetchNames(sections), online: engine.online })
			}
			case '/api/names/apply':
				return json({ sent: engine.applyNames(cleanNames(body.names)) })
			case '/api/names/slot': {
				// Store names from the page's editor as a names slot
				needId()
				const steps = namesToSteps(body.names)
				if (!steps.length) throw new Error('There are no names to save')
				engine.lib.slots[id] = {
					label: String(body.label ?? ''),
					when: new Date().toISOString(),
					kind: 'names',
					steps,
				}
				return saved()
			}
			case '/api/meters/capture':
				if (!engine.startMeterCapture(Number(body.seconds) || 10)) throw new Error('A meter capture is already running')
				return json({ ok: true })
			case '/api/log/enable':
				engine.audit.setEnabled(!!body.on)
				return json({ enabled: engine.audit.enabled })
			case '/api/log/clear':
				engine.audit.clear()
				return json({ ok: true })
			case '/api/import':
				engine.lib = cleanLibrary(body.lib)
				return saved()
			default:
				return json({ error: 'Not found' }, 404)
		}
	} catch (err) {
		return json({ error: String(err.message || err) }, 400)
	}
}
