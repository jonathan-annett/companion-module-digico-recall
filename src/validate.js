import { SECTIONS } from './params.js'

// Shape checks for anything that arrives from the web page or an imported file, so a bad
// edit can't put something in the library that later produces a malformed OSC packet.

function cleanValues(values) {
	const out = {}
	if (!values || typeof values !== 'object') return out
	for (const [suffix, v] of Object.entries(values)) {
		if (!/^[A-Za-z0-9_\-/]+$/.test(suffix) || !v || typeof v.t !== 'string' || !Array.isArray(v.a)) continue
		if (!/^[fis]+$/.test(v.t) || v.a.length !== v.t.length) continue
		const a = v.a.map((x, i) => (v.t[i] === 's' ? String(x ?? '') : Number(x)))
		if (a.some((x) => typeof x === 'number' && !Number.isFinite(x))) continue
		out[suffix] = { t: v.t, a }
	}
	return out
}

function cleanTarget(obj) {
	const index = Math.trunc(Number(obj?.index))
	if (!obj || !SECTIONS[obj.section] || !(index >= 1)) return null
	return { section: obj.section, index }
}

function cleanChannel(channel) {
	const target = cleanTarget(channel)
	if (!target) return null
	return { ...target, name: String(channel.name ?? ''), values: cleanValues(channel.values) }
}

/**
 * A slot: { label, when, channels: [...] }. Libraries from 0.1.0 stored one channel per
 * slot directly on the slot; those are accepted and wrapped.
 */
export function cleanSlot(slot) {
	if (!slot || typeof slot !== 'object') return null
	const source = Array.isArray(slot.channels) ? slot.channels : [slot]
	const channels = source.map(cleanChannel).filter(Boolean)
	if (!channels.length) return null
	return {
		label: String(slot.label ?? ''),
		when: String(slot.when ?? new Date().toISOString()),
		channels,
	}
}

export function cleanScript(script) {
	if (!script || !Array.isArray(script.steps)) return null
	const steps = []
	for (const step of script.steps) {
		const target = cleanTarget(step)
		if (!target) continue
		steps.push({
			...target,
			name: String(step.name ?? ''),
			from: String(step.from ?? ''),
			scopes: Array.isArray(step.scopes) ? step.scopes.map(String) : [],
			values: cleanValues(step.values),
		})
	}
	return { name: String(script.name ?? ''), when: String(script.when ?? new Date().toISOString()), steps }
}

export function cleanNames(names) {
	const out = {}
	if (!names || typeof names !== 'object') return out
	for (const [section, byIndex] of Object.entries(names)) {
		if (!SECTIONS[section] || !byIndex || typeof byIndex !== 'object') continue
		out[section] = {}
		for (const [index, name] of Object.entries(byIndex)) {
			if (/^\d+$/.test(index) && typeof name === 'string') out[section][index] = name
		}
	}
	return out
}

export function cleanNameSet(set) {
	if (!set || typeof set !== 'object') return null
	return {
		name: String(set.name ?? ''),
		when: String(set.when ?? new Date().toISOString()),
		names: cleanNames(set.names),
	}
}

export function cleanLibrary(input) {
	const lib = { version: 2, slots: {}, scripts: {}, nameSets: {}, learned: {} }
	if (!input || typeof input !== 'object') return lib
	for (const [id, snap] of Object.entries(input.slots ?? {})) {
		const clean = cleanSlot(snap)
		if (clean) lib.slots[id] = clean
	}
	for (const [id, script] of Object.entries(input.scripts ?? {})) {
		const clean = cleanScript(script)
		if (clean) lib.scripts[id] = clean
	}
	for (const [id, set] of Object.entries(input.nameSets ?? {})) {
		const clean = cleanNameSet(set)
		if (clean) lib.nameSets[id] = clean
	}
	for (const [section, list] of Object.entries(input.learned ?? {})) {
		if (SECTIONS[section] && Array.isArray(list)) {
			lib.learned[section] = list.filter((s) => typeof s === 'string' && /^[A-Za-z0-9_\-/]+$/.test(s))
		}
	}
	return lib
}
