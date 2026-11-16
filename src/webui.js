// The browser page served by the module. One self-contained document; it talks to the
// module through the small JSON API in instance.js using paths relative to its own URL.
// String.raw keeps the backslashes in the embedded script intact. The embedded script
// must not contain backticks or dollar-brace sequences.

export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DiGiCo Recall</title>
<style>
:root {
	--bg: #16181b; --panel: #1f2226; --panel2: #272b30; --line: #353a41;
	--text: #e6e8ea; --dim: #8b939c; --accent: #f0a020; --accent-ink: #1a1203;
	--ok: #3fb96b; --bad: #e0523f; --blue: #4a9cf0;
	--mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
header h1 { font-size: 15px; margin: 0; letter-spacing: .08em; text-transform: uppercase; }
.lamp { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); display: inline-block; margin-right: 6px; }
.lamp.on { background: var(--ok); }
.stat { color: var(--dim); font-size: 13px; }
.stat b { color: var(--text); font-weight: 600; }
.chip { font: 600 11px var(--mono); padding: 2px 6px; border-radius: 3px; background: var(--panel2); color: var(--dim); margin-right: 4px; }
.chip.on { background: var(--accent); color: var(--accent-ink); }
nav { display: flex; gap: 2px; padding: 0 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
nav button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dim); padding: 10px 14px; font: inherit; cursor: pointer; }
nav button.on { color: var(--text); border-bottom-color: var(--accent); }
main { flex: 1; min-height: 0; display: flex; }
.list { width: 300px; flex: none; overflow: auto; border-right: 1px solid var(--line); background: var(--panel); }
.row { display: flex; gap: 10px; align-items: baseline; padding: 8px 14px; border-bottom: 1px solid var(--line); cursor: pointer; }
.row:hover { background: var(--panel2); }
.row.on { background: var(--panel2); box-shadow: inset 3px 0 0 var(--accent); }
.row .num { font: 600 13px var(--mono); color: var(--accent); width: 30px; flex: none; text-align: right; }
.row.empty .num { color: var(--line); }
.row .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .meta { color: var(--dim); font-size: 12px; white-space: nowrap; }
.row.empty .what { color: var(--dim); }
.detail { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 60px; }
.detail h2 { margin: 0 0 4px; font-size: 18px; }
.sub { color: var(--dim); margin: 0 0 16px; font-size: 13px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
label.f { display: inline-flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--dim); }
input, select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; font: inherit; }
input:focus, select:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
input.n { width: 76px; font-family: var(--mono); }
input.v { width: 130px; font-family: var(--mono); text-align: right; }
input.changed { border-color: var(--accent); }
button.b { background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.b:hover { border-color: var(--dim); }
button.b.go { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
button.b.danger { color: var(--bad); }
button.x { background: none; border: 0; color: var(--dim); cursor: pointer; font-size: 15px; padding: 2px 6px; }
button.x:hover { color: var(--bad); }
details { border: 1px solid var(--line); border-radius: 6px; margin: 0 0 10px; background: var(--panel); }
summary { padding: 9px 12px; cursor: pointer; font-weight: 600; display: flex; gap: 10px; align-items: center; }
summary .count { color: var(--dim); font-weight: 400; font-size: 12px; }
summary .grow { flex: 1; }
table { border-collapse: collapse; width: 100%; }
td { padding: 3px 12px; border-top: 1px solid var(--line); }
td.k { font-family: var(--mono); font-size: 12.5px; color: var(--dim); }
td.k b { color: var(--text); font-weight: 500; }
td.r { text-align: right; width: 1%; white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; }
.cell { display: flex; align-items: center; gap: 8px; }
.cell span { font: 12.5px var(--mono); color: var(--dim); width: 28px; text-align: right; flex: none; }
.cell input { flex: 1; min-width: 0; }
.note { color: var(--dim); font-size: 12.5px; max-width: 70ch; }
.empty-state { color: var(--dim); padding: 40px 0; max-width: 56ch; }
.dg { background: #b9c2c9; color: #111; border-radius: 4px; padding: 14px 16px 12px; max-width: 640px; font: 13px Arial, Helvetica, sans-serif; }
.dg-title { background: #5d6b78; color: #fff; text-align: center; font-weight: 700; margin: -14px -16px 12px; padding: 5px; border-radius: 4px 4px 0 0; }
.dg-line { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 700; margin-bottom: 14px; }
.dg-yes { background: #c9b8f5; border: 1px solid #333; padding: 3px 14px; font-weight: 700; }
.dg-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 6px; }
.dg-btn { background: #6d6d6d; color: #fff; padding: 3px 14px; font-weight: 700; }
.dg table { background: #dfe3e6; border: 1px solid #555; }
.dg th, .dg td { border: 1px solid #777; padding: 4px 8px; text-align: left; font-size: 13px; }
.dg th { background: #c7cdd2; font-weight: 400; }
.dg td { color: #3a2fb0; font-weight: 700; height: 26px; }
.dg td.tick { color: #159a2c; font-size: 17px; text-align: center; }
.dg-foot { margin-top: 12px; font-size: 12.5px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dg-local { border: 2px solid #d4380d; background: #fff3c4; padding: 3px 8px; border-radius: 3px; white-space: pre; }
.dg-arrow { color: #a8200d; font-weight: 700; }
.steps { max-width: 70ch; padding-left: 20px; }
.steps li { margin: 6px 0; }
#toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--panel2); border: 1px solid var(--line); padding: 8px 14px; border-radius: 6px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: 1; }
#toast.bad { border-color: var(--bad); color: var(--bad); }
@media (max-width: 760px) { main { flex-direction: column; } .list { width: auto; max-height: 34vh; border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
</head>
<body>
<header>
	<h1>DiGiCo Recall</h1>
	<span class="stat"><span class="lamp" id="lamp"></span><b id="console">No console</b></span>
	<span class="stat" id="state"></span>
	<span class="stat" id="touched"></span>
	<span id="scopes"></span>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<div id="toast"></div>
<script>
(function () {
	'use strict'
	var base = location.pathname.replace(/\/?$/, '/')
	var S = { status: null, lib: null, tab: 'slots', sel: { slots: null, scripts: null }, draft: null, dirty: false,
		names: { section: 'Input_Channels', live: {}, edit: {}, setId: '1' } }
	var TABS = [['slots', 'Captures'], ['scripts', 'Scripts'], ['names', 'Names'], ['library', 'Library'], ['setup', 'Setup']]

	function h(tag, attrs) {
		var el = document.createElement(tag)
		for (var k in attrs || {}) {
			var v = attrs[k]
			if (v === null || v === undefined || v === false) continue
			if (k === 'class') el.className = v
			else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v)
			else if (k === 'value') el.value = v
			else if (k === 'checked' || k === 'selected' || k === 'open' || k === 'disabled') el[k] = !!v
			else el.setAttribute(k, v)
		}
		for (var i = 2; i < arguments.length; i++) add(el, arguments[i])
		return el
	}
	function add(el, child) {
		if (child === null || child === undefined || child === false) return
		if (Array.isArray(child)) child.forEach(function (c) { add(el, c) })
		else el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)))
	}
	function $(id) { return document.getElementById(id) }
	function clone(x) { return JSON.parse(JSON.stringify(x)) }

	var toastTimer
	function toast(text, bad) {
		var t = $('toast')
		t.textContent = text
		t.className = 'show' + (bad ? ' bad' : '')
		clearTimeout(toastTimer)
		toastTimer = setTimeout(function () { t.className = '' }, bad ? 5000 : 2200)
	}

	function api(path, body) {
		var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
		return fetch(base + path, opts).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status))
				return data
			})
		})
	}
	function fail(err) { toast(err.message || String(err), true) }

	// ---- helpers ------------------------------------------------------------------

	function sections() { return S.status ? S.status.sections : {} }
	function scopeList() { return S.status ? S.status.scopes : [] }
	function scopeOf(suffix) {
		if (/(^|\/)name$/.test(suffix)) return 'name'
		if (/^Aux_Send\//.test(suffix)) return 'aux'
		if (/^(EQ|Filters)\//.test(suffix) || /^geq_/.test(suffix)) return 'eq'
		if (/^Dynamics\/gate/.test(suffix)) return 'gate'
		if (/^Dynamics\//.test(suffix)) return 'comp'
		if (/^(fader|mute|hard_mute)$/.test(suffix)) return 'level'
		if (/^Panner\//.test(suffix)) return 'pan'
		if (/^Channel_Delay\//.test(suffix)) return 'delay'
		if (/^(Channel_Input|Buss_Trim)\/(analog_gain|trim|input_pad|phase)$/.test(suffix)) return 'gain'
		return 'other'
	}
	function where(item) {
		var s = sections()[item.section]
		return (s ? s.short : item.section) + ' ' + item.index + (item.name ? ' ' + item.name : '')
	}
	function slotTitle(snap) { return snap.label || where(snap) }
	function when(iso) {
		var d = new Date(iso)
		return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	}
	function ids(bucket, count) {
		var seen = {}
		for (var i = 1; i <= count; i++) seen[i] = true
		Object.keys(S.lib[bucket]).forEach(function (k) { seen[k] = true })
		return Object.keys(seen).sort(function (a, b) { return a - b })
	}
	function setDirty(d) { S.dirty = d; var b = $('save'); if (b) b.className = 'b' + (d ? ' go' : '') }

	function targetFields(item, onchange) {
		return [
			h('label', { class: 'f' }, 'Channel type',
				h('select', { onchange: function (e) { item.section = e.target.value; onchange() } },
					Object.keys(sections()).map(function (id) {
						return h('option', { value: id, selected: id === item.section }, sections()[id].label)
					}))),
			h('label', { class: 'f' }, 'Number',
				h('input', { class: 'n', type: 'number', min: 1, value: item.index,
					oninput: function (e) { item.index = Number(e.target.value) || 1; onchange() } })),
		]
	}

	// Value tables, grouped by recall scope. Edits write straight into the draft.
	function valueGroups(values, onchange) {
		var groups = {}
		Object.keys(values).forEach(function (suffix) {
			var sc = scopeOf(suffix)
			;(groups[sc] = groups[sc] || []).push(suffix)
		})
		return scopeList().filter(function (s) { return groups[s.id] }).map(function (s) {
			var body = h('table', {})
			groups[s.id].forEach(function (suffix) {
				var v = values[suffix]
				var parts = suffix.split('/')
				var leaf = parts.pop()
				var tr = h('tr', {},
					h('td', { class: 'k' }, parts.length ? parts.join('/') + '/' : '', h('b', {}, leaf)),
					h('td', { class: 'r' }, v.a.map(function (arg, i) {
						var isText = v.t[i] === 's'
						return h('input', { class: 'v', type: isText ? 'text' : 'number', step: 'any',
							value: isText ? arg : Math.round(arg * 10000) / 10000,
							oninput: function (e) {
								if (isText) v.a[i] = e.target.value
								else if (e.target.value !== '' && isFinite(Number(e.target.value))) v.a[i] = Number(e.target.value)
								e.target.classList.add('changed')
								onchange()
							} })
					})),
					h('td', { class: 'r' }, h('button', { class: 'x', title: 'Remove this value from the capture',
						onclick: function () { delete values[suffix]; tr.remove(); onchange() } }, '×')))
				body.appendChild(tr)
			})
			return h('details', {},
				h('summary', {}, s.label, h('span', { class: 'count' }, groups[s.id].length + ' values'), h('span', { class: 'grow' }),
					h('button', { class: 'x', title: 'Remove all ' + s.label + ' values',
						onclick: function (e) {
							e.preventDefault()
							groups[s.id].forEach(function (suffix) { delete values[suffix] })
							onchange(); render()
						} }, '×')),
				body)
		})
	}

	// ---- captures -------------------------------------------------------------------

	function select(bucket, id) {
		if (S.dirty && !confirm('Discard unsaved changes?')) return
		S.sel[bucket] = id
		S.draft = S.lib[bucket][id] ? clone(S.lib[bucket][id]) : null
		setDirty(false)
		render()
	}

	function save(bucket, path) {
		var id = S.sel[bucket]
		api(path, { id: id, value: S.draft }).then(function () {
			return reload(true)
		}).then(function () { toast('Saved') }).catch(fail)
	}
	function remove(bucket, path) {
		var id = S.sel[bucket]
		if (!confirm('Delete ' + (bucket === 'slots' ? 'capture ' : 'script ') + id + '?')) return
		api(path, { id: id, value: null }).then(function () { S.draft = null; return reload(true) }).then(function () { toast('Deleted') }).catch(fail)
	}

	function viewSlots() {
		var list = h('div', { class: 'list' }, ids('slots', S.status.slotCount).map(function (id) {
			var snap = S.lib.slots[id]
			return h('div', { class: 'row' + (snap ? '' : ' empty') + (S.sel.slots === id ? ' on' : ''), onclick: function () { select('slots', id) } },
				h('span', { class: 'num' }, id),
				h('span', { class: 'what' }, snap ? slotTitle(snap) : 'empty'),
				snap ? h('span', { class: 'meta' }, Object.keys(snap.values).length) : null)
		}))
		var d = S.draft, id = S.sel.slots, detail
		if (!id) {
			detail = h('div', { class: 'empty-state' }, 'Pick a slot on the left. Captures made from the Stream Deck show up here within a few seconds.')
		} else if (!d) {
			detail = h('div', { class: 'empty-state' }, 'Slot ' + id + ' is empty. Arm capture on the Stream Deck, touch a channel, then press slot ' + id + '.')
		} else {
			var dirty = function () { setDirty(true) }
			var checks = {}
			var present = {}
			Object.keys(d.values).forEach(function (s) { present[scopeOf(s)] = true })
			var copyTo = h('input', { class: 'n', type: 'number', min: 1, max: 999, placeholder: 'slot' })
			detail = [
				h('h2', {}, 'Capture ' + id + ' · ' + slotTitle(d)),
				h('p', { class: 'sub' }, 'Read from ' + where(S.lib.slots[id]) + (d.when ? ' on ' + when(d.when) : '')),
				h('div', { class: 'bar' },
					h('label', { class: 'f' }, 'Button label', h('input', { value: d.label || '', placeholder: where(d),
						oninput: function (e) { d.label = e.target.value; dirty() } })),
					targetFields(d, dirty)),
				h('div', { class: 'bar' },
					h('button', { class: 'b', id: 'save', onclick: function () { save('slots', 'api/slot') } }, 'Save changes'),
					copyTo,
					h('button', { class: 'b', onclick: function () {
						var to = String(Math.trunc(Number(copyTo.value)))
						if (!(Number(to) >= 1)) return fail(new Error('Enter a slot number to copy to'))
						if (S.lib.slots[to] && !confirm('Slot ' + to + ' is in use. Replace it?')) return
						api('api/slot', { id: to, value: d }).then(function () { return reload(true) }).then(function () { toast('Copied to slot ' + to) }).catch(fail)
					} }, 'Copy to slot'),
					h('button', { class: 'b danger', onclick: function () { remove('slots', 'api/slot') } }, 'Delete')),
				h('div', { class: 'bar' },
					h('button', { class: 'b', onclick: function () {
						if (S.dirty) return fail(new Error('Save your changes first'))
						var on = Object.keys(checks).filter(function (k) { return checks[k].checked })
						api('api/slot/recall', { id: id, scopes: on }).then(function (r) { toast('Sent ' + r.sent + ' values to ' + where(d)) }).catch(fail)
					} }, 'Send to console now'),
					scopeList().filter(function (s) { return present[s.id] }).map(function (s) {
						checks[s.id] = h('input', { type: 'checkbox', checked: (S.status.scopes_on || []).indexOf(s.id) >= 0 })
						return h('label', {}, checks[s.id], ' ' + s.label)
					})),
				valueGroups(d.values, dirty),
				h('p', { class: 'note' }, 'Values are shown exactly as the console reports them: levels and gains in dB, frequencies in Hz, times in seconds, switches as 0 or 1.'),
			]
		}
		return [list, h('div', { class: 'detail' }, detail)]
	}

	// ---- scripts --------------------------------------------------------------------

	function viewScripts() {
		var list = h('div', { class: 'list' }, ids('scripts', S.status.scriptCount).map(function (id) {
			var sc = S.lib.scripts[id]
			return h('div', { class: 'row' + (sc ? '' : ' empty') + (S.sel.scripts === id ? ' on' : ''), onclick: function () { select('scripts', id) } },
				h('span', { class: 'num' }, id),
				h('span', { class: 'what' }, sc ? (sc.name || sc.steps.map(where).join(', ')) : 'empty'),
				sc ? h('span', { class: 'meta' }, sc.steps.length + ' step' + (sc.steps.length === 1 ? '' : 's')) : null)
		}))
		var d = S.draft, id = S.sel.scripts, detail
		if (!id) {
			detail = h('div', { class: 'empty-state' }, 'Pick a script on the left.')
		} else if (!d) {
			detail = h('div', { class: 'empty-state' }, 'Script ' + id + ' is empty. Press Record Script on the Stream Deck, press the slots you want with the scopes you want, press Record Script again, then press script ' + id + '.')
		} else {
			var dirty = function () { setDirty(true) }
			var move = function (i, by) {
				var j = i + by
				if (j < 0 || j >= d.steps.length) return
				var tmp = d.steps[i]; d.steps[i] = d.steps[j]; d.steps[j] = tmp
				dirty(); render()
			}
			detail = [
				h('h2', {}, 'Script ' + id + (d.name ? ' · ' + d.name : '')),
				h('p', { class: 'sub' }, d.steps.length + ' steps, run top to bottom' + (d.when ? ' · recorded ' + when(d.when) : '')),
				h('div', { class: 'bar' },
					h('label', { class: 'f' }, 'Button label', h('input', { value: d.name || '', oninput: function (e) { d.name = e.target.value; dirty() } }))),
				h('div', { class: 'bar' },
					h('button', { class: 'b', id: 'save', onclick: function () { save('scripts', 'api/script') } }, 'Save changes'),
					h('button', { class: 'b', onclick: function () {
						if (S.dirty) return fail(new Error('Save your changes first'))
						api('api/script/run', { id: id }).then(function (r) { toast('Sent ' + r.sent + ' values') }).catch(fail)
					} }, 'Run now'),
					h('button', { class: 'b danger', onclick: function () { remove('scripts', 'api/script') } }, 'Delete')),
				d.steps.map(function (step, i) {
					return h('details', {},
						h('summary', {}, (i + 1) + '. ' + where(step),
							(step.scopes || []).map(function (s) { return h('span', { class: 'chip on' }, s.toUpperCase()) }),
							h('span', { class: 'count' }, Object.keys(step.values).length + ' values' + (step.from ? ' from slot ' + step.from : '')),
							h('span', { class: 'grow' }),
							h('button', { class: 'x', title: 'Move up', onclick: function (e) { e.preventDefault(); move(i, -1) } }, '↑'),
							h('button', { class: 'x', title: 'Move down', onclick: function (e) { e.preventDefault(); move(i, 1) } }, '↓'),
							h('button', { class: 'x', title: 'Remove step', onclick: function (e) { e.preventDefault(); d.steps.splice(i, 1); dirty(); render() } }, '×')),
						h('div', { class: 'bar', style: 'padding: 0 12px' }, targetFields(step, dirty)),
						h('div', { style: 'padding: 0 12px 4px' }, valueGroups(step.values, dirty)))
				}),
				h('p', { class: 'note' }, 'A script keeps its own copy of every value, so changing or clearing the slots it was built from does not change the script.'),
			]
		}
		return [list, h('div', { class: 'detail' }, detail)]
	}

	// ---- names ----------------------------------------------------------------------

	function viewNames() {
		var N = S.names
		var count = S.status.counts[N.section] || 0
		var live = N.live[N.section] || {}
		var edit = N.edit[N.section] = N.edit[N.section] || {}
		var changedCount = function () {
			var n = 0
			Object.keys(N.edit).forEach(function (sec) {
				Object.keys(N.edit[sec]).forEach(function (i) { if (N.edit[sec][i] !== (N.live[sec] || {})[i]) n++ })
			})
			return n
		}
		var changes = function () {
			var out = {}
			Object.keys(N.edit).forEach(function (sec) {
				Object.keys(N.edit[sec]).forEach(function (i) {
					if (N.edit[sec][i] !== (N.live[sec] || {})[i]) (out[sec] = out[sec] || {})[i] = N.edit[sec][i]
				})
			})
			return out
		}
		var all = function () {
			var out = {}
			Object.keys(sections()).forEach(function (sec) {
				out[sec] = Object.assign({}, N.live[sec] || {}, N.edit[sec] || {})
			})
			return out
		}
		var sendBtn = h('button', { class: 'b' + (changedCount() ? ' go' : ''), onclick: function () {
			var c = changes()
			api('api/names/apply', { names: c }).then(function (r) {
				Object.keys(c).forEach(function (sec) { N.live[sec] = Object.assign({}, N.live[sec], c[sec]) })
				toast('Sent ' + r.sent + ' names'); render()
			}).catch(fail)
		} }, 'Send ' + changedCount() + ' changed to console')
		var setIds = ids('nameSets', S.status.nameSetCount)
		var set = S.lib.nameSets[N.setId]
		var setLabel = h('input', { placeholder: 'label', value: set ? set.name : '' })
		var indexes = []
		for (var i = 1; i <= count; i++) indexes.push(String(i))
		Object.keys(live).concat(Object.keys(edit)).forEach(function (k) { if (indexes.indexOf(k) < 0) indexes.push(k) })
		indexes.sort(function (a, b) { return a - b })

		return h('div', { class: 'detail' },
			h('h2', {}, 'Names'),
			h('p', { class: 'sub' }, 'Read the names from the console, edit them here, and send them back. A name set is a stored copy you can restore from a button.'),
			h('div', { class: 'bar' },
				h('button', { class: 'b', onclick: function () {
					toast('Reading names…')
					api('api/names/fetch', {}).then(function (r) {
						N.live = r.names; N.edit = {}
						var n = 0
						Object.keys(r.names).forEach(function (sec) { n += Object.keys(r.names[sec]).length })
						toast(n ? 'Read ' + n + ' names' : 'The console did not answer', !n); render()
					}).catch(fail)
				} }, 'Read from console'),
				sendBtn,
				h('button', { class: 'b', onclick: function () {
					if (!confirm('Send every name shown, on every tab, to the console?')) return
					var a = all()
					api('api/names/apply', { names: a }).then(function (r) { N.live = a; N.edit = {}; toast('Sent ' + r.sent + ' names'); render() }).catch(fail)
				} }, 'Send all')),
			h('div', { class: 'bar' },
				h('label', { class: 'f' }, 'Name set',
					h('select', { onchange: function (e) { N.setId = e.target.value; render() } }, setIds.map(function (id) {
						var s = S.lib.nameSets[id]
						return h('option', { value: id, selected: id === N.setId }, id + (s ? ' · ' + (s.name || when(s.when)) : ' · empty'))
					}))),
				h('label', { class: 'f' }, 'Set label', setLabel),
				h('button', { class: 'b', disabled: !set, onclick: function () {
					Object.keys(set.names).forEach(function (sec) { N.edit[sec] = Object.assign({}, N.edit[sec], set.names[sec]) })
					toast('Loaded into the editor. Nothing is sent until you press Send.'); render()
				} }, 'Load into editor'),
				h('button', { class: 'b', onclick: function () {
					if (set && !confirm('Replace name set ' + N.setId + '?')) return
					api('api/nameset', { id: N.setId, value: { name: setLabel.value, names: all() } }).then(function () { return reload(true) }).then(function () { toast('Saved name set ' + N.setId) }).catch(fail)
				} }, 'Save editor as set'),
				h('button', { class: 'b danger', disabled: !set, onclick: function () {
					if (!confirm('Delete name set ' + N.setId + '?')) return
					api('api/nameset', { id: N.setId, value: null }).then(function () { return reload(true) }).catch(fail)
				} }, 'Delete set')),
			h('div', { class: 'bar' }, Object.keys(sections()).map(function (id) {
				return h('button', { class: 'b' + (id === N.section ? ' go' : ''), onclick: function () { N.section = id; render() } },
					sections()[id].label + ' (' + (S.status.counts[id] || 0) + ')')
			})),
			h('div', { class: 'grid' }, indexes.map(function (i) {
				var value = edit[i] !== undefined ? edit[i] : (live[i] !== undefined ? live[i] : '')
				return h('div', { class: 'cell' }, h('span', {}, i),
					h('input', { value: value, class: edit[i] !== undefined && edit[i] !== live[i] ? 'changed' : '', maxlength: 32,
						oninput: function (e) {
							edit[i] = e.target.value
							e.target.className = edit[i] !== live[i] ? 'changed' : ''
							var n = changedCount()
							sendBtn.textContent = 'Send ' + n + ' changed to console'
							sendBtn.className = 'b' + (n ? ' go' : '')
						} }))
			})))
	}

	// ---- library --------------------------------------------------------------------

	function viewLibrary() {
		var file = h('input', { type: 'file', accept: '.json,application/json' })
		var learned = S.lib.learned || {}
		return h('div', { class: 'detail' },
			h('h2', {}, 'Library'),
			h('p', { class: 'sub' }, Object.keys(S.lib.slots).length + ' captures, ' + Object.keys(S.lib.scripts).length + ' scripts, ' + Object.keys(S.lib.nameSets).length + ' name sets. The library is also saved inside the Companion configuration.'),
			h('div', { class: 'bar' },
				h('button', { class: 'b', onclick: function () {
					var blob = new Blob([JSON.stringify(S.lib, null, 1)], { type: 'application/json' })
					var a = h('a', { href: URL.createObjectURL(blob), download: 'digico-recall-library.json' })
					document.body.appendChild(a); a.click(); a.remove()
				} }, 'Download library file')),
			h('div', { class: 'bar' }, file,
				h('button', { class: 'b danger', onclick: function () {
					if (!file.files[0]) return fail(new Error('Choose a library file first'))
					if (!confirm('Replace the whole library with this file?')) return
					file.files[0].text().then(function (text) { return api('api/import', { lib: JSON.parse(text) }) })
						.then(function () { return reload(true) }).then(function () { toast('Library replaced') }).catch(fail)
				} }, 'Replace library from file')),
			Object.keys(learned).filter(function (k) { return learned[k].length }).map(function (sec) {
				return h('details', {}, h('summary', {}, 'Learned ' + (sections()[sec] ? sections()[sec].label : sec) + ' parameters',
					h('span', { class: 'count' }, learned[sec].length)),
					h('table', {}, learned[sec].map(function (s) { return h('tr', {}, h('td', { class: 'k' }, s)) })))
			}))
	}

	// ---- setup ----------------------------------------------------------------------

	// A picture of the console's External Control page with the values to enter there.
	function viewSetup() {
		var st = S.status, su = st.setup
		var row = [su.type, su.name, su.ip || '?', su.send, su.rcv]
		var blank = function () { return h('tr', {}, [0, 1, 2, 3, 4, 5].map(function () { return h('td', {}) })) }
		return h('div', { class: 'detail' },
			h('h2', {}, 'Console setup'),
			h('p', { class: 'sub' }, st.online
				? 'Connected' + (st.consoleName ? ' to ' + st.consoleName : '') + '. These are the values the console is using.'
				: 'No reply from the console yet. Make its External Control page look like this.'),
			h('div', { class: 'dg' },
				h('div', { class: 'dg-title' }, 'External Control'),
				h('div', { class: 'dg-line' }, 'Enable External Control:', h('span', { class: 'dg-yes' }, 'YES')),
				h('div', { class: 'dg-head' }, 'External Devices', h('span', { class: 'dg-btn' }, 'add device')),
				h('table', {},
					h('tr', {}, ['Type', 'Name', 'IP Address', 'Send', 'Rcv', 'Enabled'].map(function (c) { return h('th', {}, c) })),
					h('tr', {}, row.map(function (c) { return h('td', {}, c) }), h('td', { class: 'tick' }, '\u2713')),
					blank(), blank()),
				h('div', { class: 'dg-foot' },
					h('span', { class: 'dg-local' }, 'Local: ', st.consoleName || 'console name', '   IP: ', h('b', {}, su.consoleIp || '?')),
					h('span', { class: 'dg-arrow' }, '\u2190 the console\u2019s own address. This is the IP to enter in Companion.'))),
			h('ol', { class: 'steps' },
				h('li', {}, 'On the console open Setup > External Control and set Enable External Control to YES.'),
				h('li', {}, 'Read the "Local ... IP" line at the bottom of that page (highlighted above). That address goes in this connection\u2019s settings in Companion as "Console IP address". It is currently set to ', h('b', {}, su.consoleIp || 'nothing'), '.'),
				h('li', {}, 'Press "add device" and choose the DiGiCo Pad type. Name it anything.'),
				h('li', {}, 'Enter IP Address ', h('b', {}, su.ip || '(this computer\u2019s address)'), ', Send ', h('b', {}, su.send), ', Rcv ', h('b', {}, su.rcv), '.'),
				h('li', {}, 'Touch the Enabled column so it shows a green tick.'),
				h('li', {}, 'Leave "OSC generic" off. This module does not use it.')),
			!su.ipMatched && su.ip ? h('p', { class: 'note' }, 'This computer has no address on the same network as ' + (su.consoleIp || 'the console') + ', so ' + su.ip + ' is a guess. Check the console address in the connection settings.') : null,
			su.otherIps.length ? h('p', { class: 'note' }, 'This computer\u2019s other addresses: ' + su.otherIps.join(', ') + '.') : null,
			h('p', { class: 'note' }, 'If it still does not connect: on a Windows PC running the DiGiCo offline software, allow inbound UDP port ' + su.rcv + ' through Windows Firewall, and check that this computer\u2019s own firewall allows incoming connections for Companion.'))
	}

	// ---- shell ----------------------------------------------------------------------

	function renderHeader() {
		var st = S.status
		if (!st) return
		$('lamp').className = 'lamp' + (st.online ? ' on' : '')
		$('console').textContent = st.online ? (st.consoleName || 'Console connected') : 'No reply from console'
		$('state').textContent = st.state
		$('touched').textContent = st.touchedLabel ? 'Touched: ' + st.touchedLabel : ''
		var sc = $('scopes')
		sc.textContent = ''
		st.scopes.forEach(function (s) {
			sc.appendChild(h('span', { class: 'chip' + (st.scopes_on.indexOf(s.id) >= 0 ? ' on' : '') }, s.label))
		})
	}

	function render() {
		var nav = $('nav')
		nav.textContent = ''
		TABS.forEach(function (t) {
			nav.appendChild(h('button', { class: t[0] === S.tab ? 'on' : '', onclick: function () {
				if (S.dirty && !confirm('Discard unsaved changes?')) return
				S.tab = t[0]
				S.draft = (t[0] === 'slots' || t[0] === 'scripts') && S.sel[t[0]] && S.lib[t[0]][S.sel[t[0]]] ? clone(S.lib[t[0]][S.sel[t[0]]]) : null
				setDirty(false); render()
			} }, t[1]))
		})
		var main = $('main')
		var scroll = {}
		Array.prototype.forEach.call(main.children, function (c, i) { scroll[i] = c.scrollTop })
		main.textContent = ''
		if (!S.status || !S.lib) { add(main, h('div', { class: 'detail' }, h('div', { class: 'empty-state' }, 'Loading…'))); return }
		add(main, S.tab === 'slots' ? viewSlots() : S.tab === 'scripts' ? viewScripts() : S.tab === 'names' ? viewNames() : S.tab === 'setup' ? viewSetup() : viewLibrary())
		Array.prototype.forEach.call(main.children, function (c, i) { if (scroll[i]) c.scrollTop = scroll[i] })
		setDirty(S.dirty)
	}

	function loadStatus() {
		return api('api/status').then(function (st) {
			st.scopes_on = st.scopes
			st.scopes = st.scopeDefs || []
			S.status = st
			renderHeader()
		})
	}

	var libJson = ''
	function reload(force) {
		return api('api/lib').then(function (lib) {
			var json = JSON.stringify(lib)
			if (json === libJson && !force) return
			libJson = json
			S.lib = lib
			var bucket = S.tab
			if ((bucket === 'slots' || bucket === 'scripts') && S.sel[bucket]) {
				S.draft = lib[bucket][S.sel[bucket]] ? clone(lib[bucket][S.sel[bucket]]) : null
				S.dirty = false
			}
			render()
		})
	}

	loadStatus().then(function () {
		if (!S.status.online) S.tab = 'setup' // nothing else is useful until the console answers
		return reload(true)
	}).catch(fail)
	setInterval(function () {
		loadStatus().catch(function () { $('lamp').className = 'lamp'; $('console').textContent = 'Companion not reachable' })
		// Pick up captures made on the Stream Deck, unless an edit is in progress.
		var typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)
		if (!S.dirty && !typing && S.tab !== 'names') reload(false).catch(function () {})
		if (S.tab === 'setup' && !typing) render()
	}, 2500)
})()
</script>
</body>
</html>
`
