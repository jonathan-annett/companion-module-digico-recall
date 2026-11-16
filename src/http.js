import { SECTIONS, SECTION_IDS, SCOPES, SCOPE_IDS } from './params.js'
import { cleanSlot, cleanScript, cleanNameSet, cleanNames, cleanLibrary } from './validate.js'
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
 * @param {{engine: import('./engine.js').Engine | null, config: object}} self
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
				setup: consoleSetup(self.config),
				slotCount: Number(self.config.slotCount),
				scriptCount: Number(self.config.scriptCount),
				nameSetCount: Number(self.config.nameSetCount),
			})
		}
		if (method === 'GET' && path === '/api/lib') return json(engine.lib)
		if (method !== 'POST') return json({ error: 'Not found' }, 404)

		let body = {}
		if (request.body) body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
		const id = String(body.id ?? '').trim()
		const needId = () => {
			if (!/^\d{1,3}$/.test(id) || Number(id) < 1) throw new Error('A slot number from 1 to 999 is required')
		}
		const store = (bucket, clean) => {
			needId()
			if (body.value === null || body.value === undefined) delete engine.lib[bucket][id]
			else {
				const value = clean(body.value)
				if (!value) throw new Error('That entry is not valid')
				engine.lib[bucket][id] = value
			}
			engine.persist()
			engine.changed()
			return json({ ok: true })
		}

		const needIp = () => {
			const ip = String(body.ip ?? '').trim()
			const parts = ip.split('.')
			if (parts.length !== 4 || !parts.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)) {
				throw new Error('That is not an IP address')
			}
			return ip
		}

		switch (path) {
			case '/api/setup/resolve':
				// What to enter on the console if its address were this one. Changes nothing.
				return json({ setup: consoleSetup({ ...self.config, host: needIp() }) })
			case '/api/setup/apply':
				await self.setConsoleHost(needIp())
				return json({ ok: true })
			case '/api/slot':
				return store('slots', cleanSlot)
			case '/api/script':
				return store('scripts', cleanScript)
			case '/api/nameset':
				return store('nameSets', cleanNameSet)
			case '/api/names/fetch': {
				const sections = Array.isArray(body.sections) ? body.sections.filter((s) => SECTIONS[s]) : SECTION_IDS
				return json({ names: await engine.fetchNames(sections), online: engine.online })
			}
			case '/api/names/apply':
				return json({ sent: engine.applyNames(cleanNames(body.names)) })
			case '/api/slot/recall': {
				needId()
				const slot = engine.lib.slots[id]
				if (!slot) throw new Error('That slot is empty')
				const scopes = new Set((Array.isArray(body.scopes) ? body.scopes : []).filter((s) => SCOPE_IDS.includes(s)))
				let sent = 0
				for (const c of slot.channels) sent += engine.sendValues(c.section, c.index, c.values, scopes)
				return json({ sent })
			}
			case '/api/script/run': {
				needId()
				const script = engine.lib.scripts[id]
				if (!script) throw new Error('That script is empty')
				let sent = 0
				for (const step of script.steps) sent += engine.sendValues(step.section, step.index, step.values, null)
				return json({ sent })
			}
			case '/api/import':
				engine.lib = cleanLibrary(body.lib)
				engine.persist()
				engine.changed()
				return json({ ok: true })
			default:
				return json({ error: 'Not found' }, 404)
		}
	} catch (err) {
		return json({ error: String(err.message || err) }, 400)
	}
}
