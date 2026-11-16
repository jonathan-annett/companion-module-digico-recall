import { SECTIONS } from './params.js'

// Shape checks for anything that arrives from the web page, an imported file or a stored
// library, so a bad edit can't put something in the library that later produces a
// malformed OSC packet. Also converts libraries written by earlier versions.

const KIND_IDS = ['capture', 'script', 'names']

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

function cleanStep(step, fixed) {
	const index = Math.trunc(Number(step?.index))
	if (!step || !SECTIONS[step.section] || !(index >= 1)) return null
	return {
		section: step.section,
		index,
		name: String(step.name ?? ''),
		fixed: typeof step.fixed === 'boolean' ? step.fixed : fixed,
		values: cleanValues(step.values),
	}
}

function isNameValue(suffix) {
	return /(^|\/)name$/.test(suffix)
}

/** What a list of steps amounts to, when nothing says. */
function guessKind(steps) {
	if (steps.some((step) => !step.fixed)) return 'capture'
	const onlyNames = steps.every((step) => Object.keys(step.values).every(isNameValue))
	return onlyNames ? 'names' : 'script'
}

/**
 * A slot: { label, when, kind, steps: [{ section, index, name, fixed, values }] }.
 * Also accepts what earlier versions stored and converts it:
 *   0.1.0 capture   { section, index, name, values }          one channel directly on the slot
 *   0.1.x capture   { channels: [...] }
 *   0.1.x script    { name, steps: [...] }                     steps were always sent in full
 */
export function cleanSlot(slot) {
	if (!slot || typeof slot !== 'object') return null
	let source
	let fixed
	if (Array.isArray(slot.steps)) {
		source = slot.steps
		fixed = true // steps with no "fixed" flag come from 0.1.x scripts
	} else {
		source = Array.isArray(slot.channels) ? slot.channels : [slot]
		fixed = false
	}
	const steps = source.map((step) => cleanStep(step, fixed)).filter(Boolean)
	if (!steps.length) return null
	return {
		label: String(slot.label ?? slot.name ?? ''),
		when: String(slot.when ?? new Date().toISOString()),
		kind: KIND_IDS.includes(slot.kind) ? slot.kind : guessKind(steps),
		steps,
	}
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

/** { section: { number: name } } as the steps of a names slot. */
export function namesToSteps(names) {
	const steps = []
	for (const [section, byIndex] of Object.entries(cleanNames(names))) {
		for (const [index, name] of Object.entries(byIndex)) {
			steps.push({
				section,
				index: Number(index),
				name,
				fixed: true,
				values: { [SECTIONS[section].name]: { t: 's', a: [name] } },
			})
		}
	}
	return steps
}

export function cleanLibrary(input) {
	const lib = { version: 3, slots: {}, learned: {} }
	if (!input || typeof input !== 'object') return lib
	for (const [id, slot] of Object.entries(input.slots ?? {})) {
		const clean = /^\d{1,3}$/.test(id) ? cleanSlot(slot) : null
		if (clean) lib.slots[id] = clean
	}

	// Before 0.2.0 scripts and name sets had their own numbered lists. Move them into the
	// first free slots so nothing is lost.
	const firstFree = () => {
		let n = 1
		while (lib.slots[String(n)]) n++
		return String(n)
	}
	for (const [id, script] of Object.entries(input.scripts ?? {})) {
		const clean = cleanSlot({ ...script, kind: 'script' })
		if (!clean) continue
		if (!clean.label) clean.label = `Script ${id}`
		lib.slots[firstFree()] = clean
	}
	for (const [id, set] of Object.entries(input.nameSets ?? {})) {
		const steps = namesToSteps(set?.names)
		if (!steps.length) continue
		lib.slots[firstFree()] = {
			label: String(set.name || `Names ${id}`),
			when: String(set.when ?? new Date().toISOString()),
			kind: 'names',
			steps,
		}
	}

	for (const [section, list] of Object.entries(input.learned ?? {})) {
		if (SECTIONS[section] && Array.isArray(list)) {
			lib.learned[section] = list.filter((s) => typeof s === 'string' && /^[A-Za-z0-9_\-/]+$/.test(s))
		}
	}
	return lib
}
