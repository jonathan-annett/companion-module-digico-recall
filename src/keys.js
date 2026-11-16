// Live keys for the web page: the same buttons the presets describe, drawn and pressed
// from a browser, so a tablet or laptop can run the module with no Stream Deck and no
// page set up in Companion.
//
// Nothing is re-implemented here. A key's text comes from the preset's text with the
// module's variables filled in, its colours from the preset's feedbacks, and a press runs
// the preset's actions, all through the same functions Companion calls.

import { getPresets } from './presets.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getVariableValues } from './variables.js'
import { planLayout } from './layout.js'

const hex = (n) => `#${(Number(n) & 0xffffff).toString(16).padStart(6, '0')}`

/**
 * The page as it should look right now.
 * @returns {{columns: number, rows: number, keys: (object|null)[][]}}
 */
export function liveKeys(self, options) {
	const label = String(self.label || 'recall')
	// A web page has no Companion pages to turn, so there are no page keys
	const plan = planLayout({ ...options, nav: false }, Number(self.config.slotCount))
	const { presets } = getPresets(label, self.config)
	const values = getVariableValues(self.engine, self.config)
	const feedbacks = getFeedbacks(self)
	const variable = `$(${label}:`
	const keys = plan.grid.map((cells) =>
		cells.map((cell) => {
			if (!cell) return null
			const preset = presets[cell.preset]
			let { color, bgcolor } = preset.style
			for (const f of preset.feedbacks) {
				if (!feedbacks[f.feedbackId]?.callback({ options: f.options })) continue
				if (f.style?.color !== undefined) color = f.style.color
				if (f.style?.bgcolor !== undefined) bgcolor = f.style.bgcolor
			}
			const text = preset.style.text
				.split(variable)
				.map((part, i) => {
					if (i === 0) return part
					const end = part.indexOf(')')
					return String(values[part.slice(0, end)] ?? '') + part.slice(end + 1)
				})
				.join('')
			return {
				id: cell.preset,
				kind: cell.kind,
				lines: text.split('\\n'),
				color: hex(color),
				bgcolor: hex(bgcolor),
				hold: Object.keys(preset.steps[0])
					.filter((key) => /^\d+$/.test(key))
					.map(Number),
			}
		}),
	)
	return { columns: plan.columns, rows: plan.rows, keys }
}

/**
 * Press a key: run its preset's actions. `held` is the hold time in milliseconds for the
 * actions that run after a key has been held that long (CAPTURE's hold to clear).
 */
export async function pressKey(self, presetId, held = 0) {
	const { presets } = getPresets(String(self.label || 'recall'), self.config)
	const preset = presets[String(presetId)]
	if (!preset) throw new Error('No such key')
	const step = preset.steps[0]
	const list = held ? step[String(held)]?.actions : step.down
	if (!list) throw new Error('That key does nothing when held that long')
	const actions = getActions(self)
	for (const a of list) await actions[a.actionId].callback({ options: a.options })
}
