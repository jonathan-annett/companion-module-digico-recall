// Builds a page of buttons as a Companion page export (.companionconfig), for the web
// page's Buttons tab. A module cannot put buttons on a page itself; Companion only offers
// its presets for dragging. An export file is the one way to hand over a whole page:
// the user imports it (Import / Export > Import) and picks this connection.
//
// The buttons are made from the module's own presets, so the page cannot drift from
// them. The file layout follows a page exported from Companion 5.1.1 (export version
// 12, "button-layered" controls); it has not been checked against other versions.

import crypto from 'node:crypto'
import { SCOPES } from './params.js'
import { getPresets } from './presets.js'
import { DEFAULTS } from './config.js'

export const EXPORT_VERSION = 12
const COMPANION_BUILD = '5.1.1+10000-stable-1e2454ae78' // the build whose export this follows

const CAPTURE_KEYS = ['arm', 'capture_touched', 'cancel', 'target']
const scopeKeys = (...ids) => ids.map((id) => `scope_${id}`)

// The Stream Deck sizes, each with a set of keys that leaves a useful number of slots.
// Smaller decks get the capture keys and slots; make a second page for the scope keys.
export const DECKS = [
	{
		id: 'xl',
		label: 'Stream Deck XL (8 × 4, 32 keys)',
		columns: 8,
		rows: 4,
		nav: true,
		keys: [
			...CAPTURE_KEYS,
			'script_record',
			'names_record',
			...scopeKeys('eq', 'geq', 'comp', 'gate', 'level', 'aux', 'gain', 'name'),
		],
	},
	{ id: 'mk2', label: 'Stream Deck MK.2 (5 × 3, 15 keys)', columns: 5, rows: 3, nav: true, keys: CAPTURE_KEYS },
	{ id: 'plus', label: 'Stream Deck + (4 × 2, 8 keys)', columns: 4, rows: 2, nav: false, keys: CAPTURE_KEYS },
	{
		id: 'mini',
		label: 'Stream Deck Mini (3 × 2, 6 keys)',
		columns: 3,
		rows: 2,
		nav: false,
		keys: ['arm', 'capture_touched', 'target'],
	},
	// Companion's web buttons or tablet view, where the grid can be any size: room for everything
	{ id: 'tablet', label: 'Tablet or web buttons (10 × 6, every key)', columns: 10, rows: 6, nav: true, keys: 'all' },
]

/** Keys that can go on the page besides the slots, in the order they are placed. */
export const CONTROL_KEYS = [
	{ id: 'arm', label: 'CAPTURE' },
	{ id: 'capture_touched', label: 'GRAB' },
	{ id: 'cancel', label: 'CANCEL' },
	{ id: 'target', label: 'TO' },
	{ id: 'script_record', label: 'SCRIPT REC' },
	{ id: 'names_record', label: 'SAVE NAMES' },
	{ id: 'names_add_all', label: 'ALL NAMES' },
	{ id: 'audit', label: 'LOG' },
	{ id: 'gain_down', label: 'GAIN −' },
	{ id: 'gain_up', label: 'GAIN +' },
	{ id: 'fader_unity', label: 'UNITY' },
	{ id: 'fader_unity_result', label: 'RESULT' },
]
export const SCOPE_KEYS = SCOPES.map((scope) => ({ id: `scope_${scope.id}`, label: scope.label }))

export const LAYOUT_DEFAULTS = {
	columns: DECKS[0].columns,
	rows: DECKS[0].rows,
	nav: DECKS[0].nav,
	keys: DECKS[0].keys,
	slots: true,
	firstSlot: 1,
	name: 'DiGiCo Recall',
}

const whole = (value, fallback, min, max) => {
	const n = Math.round(Number(value))
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/**
 * Decide what goes where.
 *
 * Page navigation (up, number, down) takes the left column, as Companion's own pages do.
 * The chosen keys go along the bottom row from the left, capture keys first, then the
 * scope keys; whatever does not fit there stacks up the right-hand side. Every other
 * cell is a slot, numbered in reading order (or left empty, for a page of keys only).
 *
 * @returns {{columns, rows, nav, name, firstSlot, keys: string[], grid: (object|null)[][], slots: number[]}}
 */
export function planLayout(options = {}, slotCount = DEFAULTS.slotCount) {
	const columns = whole(options.columns, LAYOUT_DEFAULTS.columns, 2, 20)
	const rows = whole(options.rows, LAYOUT_DEFAULTS.rows, 1, 10)
	const nav = options.nav === undefined ? LAYOUT_DEFAULTS.nav : !!options.nav
	const firstSlot = whole(options.firstSlot, 1, 1, slotCount)
	const withSlots = options.slots === undefined ? true : !!options.slots
	const name = String(options.name ?? LAYOUT_DEFAULTS.name).slice(0, 40)
	const known = [...CONTROL_KEYS, ...SCOPE_KEYS]
	const wanted = new Set(Array.isArray(options.keys) ? options.keys.map(String) : LAYOUT_DEFAULTS.keys)
	// in placing order, unknown ids dropped; 'all' is every key there is
	const keys = options.keys === 'all' ? known : known.filter((key) => wanted.has(key.id))

	const grid = Array.from({ length: rows }, () => Array(columns).fill(null))
	if (nav) {
		const types = ['pageup', 'pagenum', 'pagedown'].slice(0, rows)
		types.forEach(
			(type, row) =>
				(grid[row][0] = { kind: 'nav', type, label: { pageup: '▲', pagenum: 'PAGE', pagedown: '▼' }[type] }),
		)
	}
	const free = (row, column) => grid[row][column] === null
	// Where the keys go: the bottom row from the left, then a block against the right edge
	const places = []
	const bottom = rows - 1
	for (let column = 0; column < columns; column++) if (free(bottom, column)) places.push([bottom, column])
	const overflow = keys.length - places.length
	if (overflow > 0 && bottom > 0) {
		const width = Math.min(columns, Math.ceil(overflow / bottom))
		for (let row = bottom - 1; row >= 0; row--) {
			for (let column = columns - width; column < columns; column++) if (free(row, column)) places.push([row, column])
		}
	}
	if (keys.length > places.length) {
		throw new Error(`${keys.length} keys do not fit on ${columns} × ${rows}. Choose fewer keys or a larger page.`)
	}
	keys.forEach((key, i) => {
		const [row, column] = places[i]
		grid[row][column] = { kind: 'key', preset: key.id, label: key.label }
	})
	const slots = []
	let slot = firstSlot
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			if (!withSlots || !free(row, column) || slot > slotCount) continue
			grid[row][column] = { kind: 'slot', preset: `slot_${slot}`, label: String(slot) }
			slots.push(slot++)
		}
	}
	return { columns, rows, nav, name, firstSlot, withSlots, keys: keys.map((key) => key.id), grid, slots }
}

const newId = () => crypto.randomBytes(16).toString('base64url').slice(0, 21)
const plain = (value) => ({ value, isExpression: false })
const wrapOptions = (options) => Object.fromEntries(Object.entries(options ?? {}).map(([k, v]) => [k, plain(v)]))

const layer = (id, name, type, pinned, fields) => ({
	id,
	name,
	usage: 'auto',
	type,
	pinnedProperties: pinned,
	enabled: plain(true),
	opacity: plain(100),
	x: plain(0),
	y: plain(0),
	width: plain(100),
	height: plain(100),
	rotation: plain(0),
	...fields,
})

/** One preset as an exported "button-layered" control. */
function control(presetId, preset, connectionId) {
	const { text, size, color, bgcolor } = preset.style
	const auto = size === 'auto'
	const action = (a) => ({
		type: 'action',
		id: newId(),
		connectionId,
		definitionId: a.actionId,
		options: wrapOptions(a.options),
		upgradeIndex: -1,
	})
	const step = preset.steps[0]
	const sets = {}
	const held = []
	for (const [key, value] of Object.entries(step)) {
		if (key === 'down' || key === 'up') continue
		// "after this many milliseconds held" sets, as in the CAPTURE key's hold to clear
		sets[key] = value.actions.map(action)
		if (value.options?.runWhileHeld) held.push(Number(key))
	}
	sets.down = step.down.map(action)
	sets.up = step.up.map(action)
	return {
		type: 'button-layered',
		style: {
			layers: [
				{
					id: 'canvas',
					name: 'Canvas',
					usage: 'auto',
					type: 'canvas',
					decoration: plain('default'),
					showStatusIcons: plain('default'),
				},
				layer('box0', 'Background', 'box', ['color'], {
					color: plain(bgcolor),
					cornerRadius: plain(0),
					borderWidth: plain(0),
					borderColor: plain(0),
					borderPosition: plain('inside'),
				}),
				layer('image0', 'Image', 'image', ['base64Image', 'halign', 'valign'], {
					base64Image: plain(null),
					halign: plain('center'),
					valign: plain('center'),
					fillMode: plain('fit'),
				}),
				layer('text0', 'Text', 'text', ['text', 'fontsize', 'fontsizeAllowShrink', 'color', 'halign', 'valign'], {
					text: plain(text),
					color: plain(color),
					halign: plain('center'),
					valign: plain('center'),
					// Companion stores a fixed preset size of 14 as 29.4, and "auto" as 100 with shrinking
					fontsize: plain(auto ? 100 : Math.round(Number(size) * 21) / 10),
					fontsizeAllowShrink: plain(auto),
					font: plain('companion-sans'),
					weight: plain('normal'),
					styles: plain([]),
					outlineColor: plain(4278190080),
				}),
			],
		},
		options: {
			stepProgression: 'auto',
			stepExpression: '',
			rotaryActions: false,
			canModifyStyleInApis: false,
			notes: '',
		},
		feedbacks: preset.feedbacks.map((f, i) => ({
			type: 'feedback',
			id: newId(),
			connectionId,
			definitionId: f.feedbackId,
			options: wrapOptions(f.options),
			isInverted: plain(false),
			upgradeIndex: -1,
			styleOverrides: [
				...(f.style?.color === undefined
					? []
					: [
							{
								overrideId: `${presetId}_${i}_text`,
								elementId: 'text0',
								elementProperty: 'color',
								override: plain(f.style.color),
							},
						]),
				...(f.style?.bgcolor === undefined
					? []
					: [
							{
								overrideId: `${presetId}_${i}_box`,
								elementId: 'box0',
								elementProperty: 'color',
								override: plain(f.style.bgcolor),
							},
						]),
			],
		})),
		steps: { 0: { action_sets: sets, options: { runWhileHeld: held } } },
		localVariables: [],
	}
}

/**
 * The page as a Companion export.
 * @param {object} plan  from planLayout
 * @param {{label: string, version: string, config: object}} connection  this connection
 */
export function buildPageExport(plan, { label, version, config }) {
	const { presets } = getPresets(label, config)
	const connectionId = newId()
	const controls = {}
	plan.grid.forEach((cells, row) => {
		cells.forEach((cell, column) => {
			if (!cell) return
			const made = cell.kind === 'nav' ? { type: cell.type } : control(cell.preset, presets[cell.preset], connectionId)
			;(controls[row] ??= {})[column] = made
		})
	})
	// The connection travels with the page so Companion can offer "link to an existing
	// connection" on import. Its settings here are the defaults, with no library: nothing
	// of the console's address or the stored captures goes into the file.
	const { library, ...settings } = { ...DEFAULTS }
	void library
	return {
		version: EXPORT_VERSION,
		type: 'page',
		companionBuild: COMPANION_BUILD,
		page: {
			id: newId(),
			name: plan.name,
			controls,
			gridSize: { minRow: 0, maxRow: plan.rows - 1, minColumn: 0, maxColumn: plan.columns - 1 },
			pageVariables: [],
		},
		instances: {
			[connectionId]: {
				moduleInstanceType: 'connection',
				moduleId: 'digico-recall',
				moduleVersionId: version,
				updatePolicy: 'stable',
				sortOrder: 0,
				label,
				isFirstInit: false,
				config: settings,
				secrets: {},
				lastUpgradeIndex: -1,
				enabled: true,
			},
		},
		connectionCollections: [],
		oldPageNumber: 1,
		imageLibrary: [],
		imageLibraryCollections: [],
	}
}
