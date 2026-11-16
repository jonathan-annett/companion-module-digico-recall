// The Buttons tab's page file: what goes where on each size of deck, and that the file is
// built from the module's own presets in the form Companion 5.1.1 exports.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
	planLayout,
	buildPageExport,
	DECKS,
	CONTROL_KEYS,
	SCOPE_KEYS,
	LAYOUT_DEFAULTS,
	EXPORT_VERSION,
} from '../src/layout.js'
import { getPresets } from '../src/presets.js'
import { getActions } from '../src/actions.js'
import { getFeedbacks } from '../src/feedbacks.js'
import { DEFAULTS } from '../src/config.js'
import { VERSION } from '../src/version.js'

const labels = (plan) => plan.grid.map((row) => row.map((cell) => (cell ? cell.label : '')))
const connection = { label: 'recall', version: VERSION, config: DEFAULTS }
const controlsOf = (file) => Object.values(file.page.controls).flatMap((row) => Object.values(row))
const textOf = (control) => control.style.layers.find((layer) => layer.type === 'text')

test('Stream Deck XL: navigation on the left, keys along the bottom then up the right, slots everywhere else', () => {
	const plan = planLayout(LAYOUT_DEFAULTS)
	assert.deepEqual(labels(plan), [
		['▲', '1', '2', '3', '4', '5', 'GAIN', 'NAME'],
		['PAGE', '6', '7', '8', '9', '10', 'LEVEL', 'AUX'],
		['▼', '11', '12', '13', '14', '15', 'COMP', 'GATE'],
		['CAPTURE', 'GRAB', 'CANCEL', 'TO', 'SCRIPT REC', 'SAVE NAMES', 'EQ', 'GEQ'],
	])
	assert.deepEqual(plan.slots, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
})

test('every deck size, and a tablet, has a layout that fits and leaves slots', () => {
	const want = {
		xl: [15, 14],
		mk2: [8, 4], // 5 × 3 with page keys: eight slots and the four capture keys
		plus: [4, 4],
		mini: [3, 3],
		tablet: [32, 23], // every key, and all 32 slots with room to spare
	}
	assert.deepEqual(
		DECKS.map((deck) => deck.id),
		Object.keys(want),
	)
	for (const deck of DECKS) {
		const plan = planLayout(deck)
		assert.deepEqual([plan.slots.length, plan.keys.length], want[deck.id], deck.label)
		if (deck.id !== 'tablet')
			assert.equal(plan.grid.flat().filter(Boolean).length, deck.columns * deck.rows, `${deck.label}: no empty keys`)
		assert.equal(
			plan.grid[deck.rows - 1].find((cell) => cell.kind === 'key').label,
			'CAPTURE',
			`${deck.label}: CAPTURE bottom left`,
		)
	}
	assert.deepEqual(labels(planLayout(DECKS.find((d) => d.id === 'mk2'))), [
		['▲', '1', '2', '3', '4'],
		['PAGE', '5', '6', '7', '8'],
		['▼', 'CAPTURE', 'GRAB', 'CANCEL', 'TO'],
	])
	assert.deepEqual(labels(planLayout(DECKS.find((d) => d.id === 'mini'))), [
		['1', '2', '3'],
		['CAPTURE', 'GRAB', 'TO'],
	])
})

test('a second page: scope keys only, or more slots starting where the first page stopped', () => {
	const scopes = planLayout({ columns: 5, rows: 3, nav: true, slots: false, keys: SCOPE_KEYS.map((k) => k.id) })
	assert.deepEqual(labels(scopes), [
		['▲', 'DELAY', 'NAME', 'OTHER', ''],
		['PAGE', 'LEVEL', 'AUX', 'GAIN', 'PAN'],
		['▼', 'EQ', 'GEQ', 'COMP', 'GATE'],
	])
	assert.equal(
		scopes.grid.flat().filter((cell) => cell?.kind === 'key').length,
		11,
		'all eleven scope keys are on the page',
	)
	assert.deepEqual(scopes.slots, [])
	const more = planLayout({ columns: 5, rows: 3, nav: true, keys: [], firstSlot: 9 }, 32)
	assert.deepEqual(more.slots, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
	// Slots stop at the number the connection is set up for
	assert.deepEqual(planLayout({ columns: 8, rows: 4, nav: false, keys: [], firstSlot: 30 }, 32).slots, [30, 31, 32])
})

test('choices are checked: too many keys is refused with a reason, odd values are tidied', () => {
	const all = [...CONTROL_KEYS, ...SCOPE_KEYS].map((k) => k.id)
	assert.throws(() => planLayout({ columns: 3, rows: 2, nav: false, keys: all }), /23 keys do not fit on 3 × 2/)
	const tidy = planLayout({
		columns: 'x',
		rows: 99,
		nav: 0,
		keys: ['arm', 'nonsense', 'arm'],
		firstSlot: -4,
		name: 'n'.repeat(90),
	})
	assert.deepEqual(
		[tidy.columns, tidy.rows, tidy.nav, tidy.keys, tidy.firstSlot, tidy.name.length],
		[8, 10, false, ['arm'], 1, 40],
	)
	// Keys are placed in a fixed order whatever order they were chosen in
	assert.deepEqual(planLayout({ keys: ['scope_eq', 'target', 'arm'] }).keys, ['arm', 'target', 'scope_eq'])
})

test('the file is a Companion page export built from the presets: every action and feedback exists', () => {
	const plan = planLayout(LAYOUT_DEFAULTS)
	const file = buildPageExport(plan, connection)
	assert.deepEqual(Object.keys(file), [
		'version',
		'type',
		'companionBuild',
		'page',
		'instances',
		'connectionCollections',
		'oldPageNumber',
		'imageLibrary',
		'imageLibraryCollections',
	])
	assert.deepEqual([file.version, file.type, file.page.name], [EXPORT_VERSION, 'page', 'DiGiCo Recall'])
	assert.deepEqual(file.page.gridSize, { minRow: 0, maxRow: 3, minColumn: 0, maxColumn: 7 })
	assert.deepEqual(
		[file.page.controls[0][0], file.page.controls[1][0], file.page.controls[2][0]],
		[{ type: 'pageup' }, { type: 'pagenum' }, { type: 'pagedown' }],
	)

	const [connectionId, instance] = Object.entries(file.instances)[0]
	assert.deepEqual([instance.moduleId, instance.label, instance.moduleVersionId], ['digico-recall', 'recall', VERSION])
	const actions = getActions({ engine: null })
	const feedbacks = getFeedbacks({ engine: null })
	const buttons = controlsOf(file).filter((c) => c.type === 'button-layered')
	assert.equal(buttons.length, 29)
	const seen = new Set()
	for (const button of buttons) {
		assert.deepEqual(
			button.style.layers.map((layer) => layer.id),
			['canvas', 'box0', 'image0', 'text0'],
		)
		for (const set of Object.values(button.steps[0].action_sets)) {
			for (const action of set) {
				assert.ok(actions[action.definitionId], action.definitionId)
				assert.equal(action.connectionId, connectionId)
				assert.ok(!seen.has(action.id) && seen.add(action.id), 'ids are unique')
				for (const option of Object.values(action.options))
					assert.deepEqual(Object.keys(option), ['value', 'isExpression'])
			}
		}
		for (const feedback of button.feedbacks) {
			assert.ok(feedbacks[feedback.definitionId], feedback.definitionId)
			assert.equal(feedback.connectionId, connectionId)
			assert.ok(
				feedback.styleOverrides.length > 0 &&
					feedback.styleOverrides.every((o) => ['text0', 'box0'].includes(o.elementId)),
			)
		}
	}
})

test('buttons carry what the presets carry: texts, sizes, colours, and the two-second hold on CAPTURE', () => {
	const file = buildPageExport(planLayout(LAYOUT_DEFAULTS), connection)
	const { presets } = getPresets('recall', DEFAULTS)
	const capture = file.page.controls[3][0]
	assert.equal(textOf(capture).text.value, presets.arm.style.text)
	assert.deepEqual([textOf(capture).fontsize.value, textOf(capture).fontsizeAllowShrink.value], [100, true])
	assert.deepEqual(Object.keys(capture.steps[0].action_sets).sort(), ['2000', 'down', 'up'])
	assert.equal(capture.steps[0].action_sets['2000'][0].definitionId, 'clear_mode')
	assert.deepEqual(capture.steps[0].options.runWhileHeld, [2000])
	assert.deepEqual(
		capture.feedbacks.map((f) => f.options.state.value),
		['armed', 'capturing', 'holding', 'clearing'],
	)

	const eq = file.page.controls[3][6]
	assert.deepEqual(
		[textOf(eq).text.value, textOf(eq).fontsize.value, textOf(eq).fontsizeAllowShrink.value],
		['EQ', 29.4, false],
	)
	assert.deepEqual(eq.steps[0].action_sets.down[0].options, {
		scope: { value: 'eq', isExpression: false },
		mode: { value: 'toggle', isExpression: false },
	})
	assert.deepEqual(eq.steps[0].options.runWhileHeld, [])

	const slot = file.page.controls[0][1]
	assert.equal(textOf(slot).text.value, '1\\n$(recall:slot_1)')
	assert.equal(slot.steps[0].action_sets.down[0].options.slot.value, 1)
	assert.equal(slot.feedbacks.at(-1).definitionId, 'slot_last')
	// The variables follow the connection's own name
	const other = buildPageExport(planLayout(LAYOUT_DEFAULTS), { ...connection, label: 'FOH desk' })
	assert.equal(textOf(other.page.controls[0][1]).text.value, '1\\n$(FOH desk:slot_1)')
})

test('nothing of the user’s goes into the file: no library, no console address', () => {
	const config = {
		...DEFAULTS,
		host: '10.20.30.40',
		library: JSON.stringify({ version: 3, slots: { 1: { label: 'SECRET SONG' } } }),
	}
	const text = JSON.stringify(buildPageExport(planLayout(LAYOUT_DEFAULTS), { ...connection, config }))
	assert.ok(!text.includes('SECRET SONG') && !text.includes('10.20.30.40'))
	assert.equal(JSON.parse(text).instances[Object.keys(JSON.parse(text).instances)[0]].config.library, undefined)
})

test('version.js matches package.json', () => {
	const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
	assert.equal(VERSION, pkg.version)
})
