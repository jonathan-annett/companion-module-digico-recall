// The browser page served by the module. One self-contained document; it talks to the
// module through the small JSON API in instance.js using paths relative to its own URL.
// String.raw keeps the backslashes in the embedded script intact. The embedded script
// must not contain backticks or dollar-brace sequences. The one substitution is the setup
// screenshot, placed in the stylesheet.

import { SETUP_IMAGE } from './setup-image.js'

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
.kind { font: 600 10.5px var(--mono); text-transform: uppercase; letter-spacing: .04em; padding: 2px 6px; border-radius: 3px; color: #fff; white-space: nowrap; vertical-align: middle; }
.kind.capture { background: #008c3c; } .kind.script { background: #7832aa; } .kind.names { background: #007887; }
.row.k-capture .num { color: #3fd07c; } .row.k-script .num { color: #c08af0; } .row.k-names .num { color: #39c6d6; }
.row.empty .what { color: var(--dim); }
.detail { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 60px; }
.detail h2 { margin: 0 0 4px; font-size: 18px; }
.sub { color: var(--dim); margin: 0 0 16px; font-size: 13px; }
.livekeys { display: grid; gap: 6px; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.livekey { border-radius: 8px; display: flex; align-items: center; justify-content: center; text-align: center; white-space: pre-line; font-weight: 600; line-height: 1.2; overflow: hidden; cursor: pointer; padding: 2px; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.livekey.down { filter: brightness(1.5); transform: scale(.96); }
.livekey.none { background: transparent; cursor: default; }
.keysview { overflow: auto; }
.keysview a { color: var(--dim); }
body.kiosk header, body.kiosk nav { display: none; }
.pick { margin-right: 10px; white-space: nowrap; }
.deck { display: grid; gap: 6px; margin: 6px 0 14px; }
.deck .key { height: 64px; border-radius: 6px; display: flex; align-items: center; justify-content: center; text-align: center; font: 600 11px var(--sans, sans-serif); background: #282828; color: #fff; padding: 2px; }
.deck .key.slot { background: #1d3b2a; }
.deck .key.nav { background: #111; color: var(--dim); }
.deck .key.empty { background: transparent; border: 1px dashed var(--line, #444); }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
label.f { display: inline-flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--dim); }
input, select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; font: inherit; }
input:focus, select:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
input.n { width: 76px; font-family: var(--mono); }
input.v { width: 130px; font-family: var(--mono); text-align: right; }
input.changed { border-color: var(--accent); }
tr.moved td.k b { color: var(--accent); }
td.now { color: var(--dim); font-size: 12.5px; }
td.now b { color: var(--accent); font-family: var(--mono); font-weight: 600; }
.chip.moved { background: var(--accent); color: var(--accent-ink); margin-left: 8px; }
button.x.act { font-size: 15px; padding: 0 5px; }
.bar.cmp { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; }
.bar.cmp.moved { border-color: var(--accent); }
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
.shot { position: relative; width: calc(545px * var(--k)); height: calc(602px * var(--k)); --k: 1.5; background-image: url(${SETUP_IMAGE}); background-size: 100% 100%; border-radius: 4px; font-family: Arial, Helvetica, sans-serif; margin-bottom: 18px; }
.shot-wrap { overflow-x: auto; }
.shot .at { position: absolute; display: flex; align-items: center; white-space: nowrap; overflow: hidden; font-size: calc(12.5px * var(--k)); padding-left: calc(3px * var(--k)); color: #2c2c7a; }
.shot .cell { background: #bec6cb; }
.shot .foot { background: #aeb3b7; color: #111; }
.shot .name { color: #000; font-weight: 700; }
.shot .tick { background: #bec6cb; color: #0f9a2a; font-weight: 700; justify-content: center; padding: 0; font-size: calc(15px * var(--k)); }
.shot .want { outline: calc(2px * var(--k)) solid #d4380d; background: #fff3c4; font-weight: 700; }
.shot input.at { background: #fff; color: #111; border: calc(1.5px * var(--k)) solid #d4380d; border-radius: 2px; padding: 0 calc(3px * var(--k)); font-family: inherit; }
.shot input.at::placeholder { color: #9a6a5a; }
.shot .hint { position: absolute; color: #b3200a; font-weight: 700; font-size: calc(12px * var(--k)); white-space: nowrap; background: rgba(255, 243, 196, 0.94); border: 1px solid #d4380d; border-radius: 3px; padding: calc(2px * var(--k)) calc(6px * var(--k)); }
.shot .hint.flash { animation: flash 0.9s steps(2, jump-none) infinite; }
@keyframes flash { from { opacity: 1; } to { opacity: 0.15; } }
@media (prefers-reduced-motion: reduce) { .shot .hint.flash { animation: none; } }
@media (max-width: 900px) { .shot { --k: 1; } }
.steps { max-width: 70ch; padding-left: 20px; }
.steps li { margin: 6px 0; }
table.log { border: 1px solid var(--line); border-radius: 6px; }
table.log th { text-align: left; padding: 6px 12px; color: var(--dim); font-weight: 500; font-size: 12px; background: var(--panel); position: sticky; top: 0; }
table.log td { padding: 4px 12px; vertical-align: baseline; }
table.log tr.ev td { color: var(--accent); }
table.log .was { color: var(--dim); }
#logfilter { width: 220px; }
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
	var S = { status: null, lib: null, tab: 'slots', sel: { slots: null }, draft: null, dirty: false,
		names: { section: 'Input_Channels', live: {}, edit: {}, slotId: '' } }
	var TABS = [['keys', 'Keys'], ['slots', 'Slots'], ['names', 'Names'], ['log', 'Log'], ['library', 'Library'], ['buttons', 'Buttons'], ['setup', 'Setup']]

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
	function channelsTitle(channels) {
		if (channels.length === 1) return where(channels[0])
		if (channels.length <= 3) return channels.map(function (c) { return c.name || where(c) }).join(', ')
		return channels.length + ' channels'
	}
	function uniqueChannels(steps) {
		var seen = {}
		return steps.filter(function (st) {
			var key = st.section + '/' + st.index
			if (seen[key]) return false
			seen[key] = true
			return true
		})
	}
	function slotTitle(slot) {
		if (slot.label) return slot.label
		if (slot.kind === 'names' && slot.steps.length > 1) return slot.steps.length + ' names'
		return channelsTitle(uniqueChannels(slot.steps))
	}
	function kindLabel(kind) {
		var k = (S.status.kinds || []).filter(function (x) { return x.id === kind })[0]
		return k ? k.label : kind
	}
	function isNameSuffix(suffix) { return /(^|\/)name$/.test(suffix) }
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
	// ---- comparing with the console ------------------------------------------------

	// While a slot is open, what the console has now for each of its values. A value that
	// differs gets two buttons: put the captured value back on the console, or take the
	// console's value into the capture.
	var CMP = { on: true, id: null, steps: null, sig: '', busy: false }
	function differs(a, b) {
		if (!a || !b || a.a.length !== b.a.length) return false
		for (var i = 0; i < a.a.length; i++) {
			if (typeof a.a[i] === 'number' && typeof b.a[i] === 'number') { if (Math.abs(a.a[i] - b.a[i]) > 0.005) return true }
			else if (String(a.a[i]) !== String(b.a[i])) return true
		}
		return false
	}
	function changedIn(step, i, only) {
		var now = CMP.steps && CMP.id === S.sel.slots && CMP.steps[i] ? CMP.steps[i].now : null
		if (!now) return []
		return Object.keys(step.values).filter(function (sfx) { return (!only || only(sfx)) && differs(step.values[sfx], now[sfx]) })
	}
	function pollCompare(refresh) {
		var id = S.sel.slots
		if (S.tab !== 'slots' || !CMP.on || !id || !S.lib || !S.lib.slots[id] || CMP.busy) return Promise.resolve()
		CMP.busy = true
		return api('api/slot/compare', { id: id, refresh: !!refresh || CMP.id !== id }).then(function (res) {
			CMP.busy = false
			if (S.sel.slots !== id) return
			CMP.id = id; CMP.steps = res.steps
			var sig = id + JSON.stringify(res.steps)
			var typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)
			if (sig !== CMP.sig && !typing) { CMP.sig = sig; render() }
		}, function () { CMP.busy = false })
	}
	// Put captured values back on the console (revert) or take the console's into the capture (adopt)
	function settle(action, jobs) {
		jobs = jobs.filter(function (j) { return j.suffixes.length })
		if (!jobs.length) return
		if (action === 'adopt' && S.dirty) return fail(new Error('Save or discard your own edits first'))
		var id = S.sel.slots, total = 0
		jobs.reduce(function (chain, j) {
			return chain.then(function () { return api('api/slot/' + action, { id: id, step: j.step, suffixes: j.suffixes }) }).then(function (res) { total += res.count })
		}, Promise.resolve()).then(function () {
			toast(action === 'revert' ? 'Put ' + total + (total === 1 ? ' value' : ' values') + ' back on the console' : 'Updated ' + total + (total === 1 ? ' value' : ' values') + ' in the capture')
			return action === 'adopt' ? reload(true) : null
		}).then(function () { setTimeout(function () { pollCompare() }, 250) }).catch(fail)
	}
	function settleButtons(what, jobs) {
		return [
			h('button', { class: 'x act', title: 'Put the captured ' + what + ' back on the console', onclick: function (e) { e.preventDefault(); settle('revert', jobs()) } }, '↺'),
			h('button', { class: 'x act', title: 'Update the capture with the console’s ' + what, onclick: function (e) { e.preventDefault(); settle('adopt', jobs()) } }, '💾'),
		]
	}
	function shown(v) {
		return v.a.map(function (arg, i) { return v.t[i] === 's' ? arg : Math.round(arg * 10000) / 10000 }).join(', ')
	}

	function valueGroups(values, onchange, live) {
		var groups = {}
		Object.keys(values).forEach(function (suffix) {
			var sc = scopeOf(suffix)
			;(groups[sc] = groups[sc] || []).push(suffix)
		})
		return scopeList().filter(function (s) { return groups[s.id] }).map(function (s) {
			var body = h('table', {})
			// values that have moved on the console come first, so they are not lost in a long list
			var isMoved = function (suffix) { return live && differs(values[suffix], live.now[suffix]) ? 0 : 1 }
			groups[s.id].slice().sort(function (x, y) { return isMoved(x) - isMoved(y) }).forEach(function (suffix) {
				var v = values[suffix]
				var parts = suffix.split('/')
				var leaf = parts.pop()
				var moved = live && differs(v, live.now[suffix])
				var tr = h('tr', { class: moved ? 'moved' : '' },
					h('td', { class: 'k' }, parts.length ? parts.join('/') + '/' : '', h('b', {}, leaf)),
					h('td', { class: 'r now' }, moved ? ['console now ', h('b', {}, shown(live.now[suffix])), ' ',
						settleButtons('value', function () { return [{ step: live.step, suffixes: [suffix] }] })] : null),
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
			var movedHere = live ? groups[s.id].filter(function (suffix) { return differs(values[suffix], live.now[suffix]) }) : []
			return h('details', { open: movedHere.length > 0 },
				h('summary', {}, s.label, h('span', { class: 'count' }, groups[s.id].length + ' values'),
					movedHere.length ? [h('span', { class: 'chip moved' }, movedHere.length + ' CHANGED'),
						settleButtons(s.label + ' values', function () { return [{ step: live.step, suffixes: movedHere }] })] : null,
					h('span', { class: 'grow' }),
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
		if (!confirm('Delete slot ' + id + '?')) return
		api(path, { id: id, value: null }).then(function () { S.draft = null; return reload(true) }).then(function () { toast('Deleted') }).catch(fail)
	}

	function slotValueCount(slot) {
		return slot.steps.reduce(function (n, c) { return n + Object.keys(c.values).length }, 0)
	}

	// Every slot is a list of steps. A step either follows the scope toggles when recalled
	// (a captured channel) or is sent in full (a script step, a saved name).
	function viewSlots() {
		var list = h('div', { class: 'list' }, ids('slots', S.status.slotCount).map(function (id) {
			var slot = S.lib.slots[id]
			return h('div', { class: 'row' + (slot ? ' k-' + slot.kind : ' empty') + (S.sel.slots === id ? ' on' : ''), onclick: function () { select('slots', id) } },
				h('span', { class: 'num' }, id),
				h('span', { class: 'what' }, slot ? slotTitle(slot) : 'empty'),
				slot ? h('span', { class: 'kind ' + slot.kind }, kindLabel(slot.kind)) : null)
		}))
		var d = S.draft, id = S.sel.slots, detail
		if (!id) {
			detail = h('div', { class: 'empty-state' }, 'Pick a slot on the left. Anything stored from the Stream Deck shows up here within a few seconds.')
		} else if (!d) {
			detail = h('div', { class: 'empty-state' }, 'Slot ' + id + ' is empty. On the Stream Deck press CAPTURE, SCRIPT REC or SAVE NAMES, do the thing, then press slot ' + id + '.')
		} else {
			var dirty = function () { setDirty(true) }
			var checks = {}
			var present = {}
			var follows = d.steps.filter(function (st) { return !st.fixed })
			follows.forEach(function (st) { Object.keys(st.values).forEach(function (sfx) { present[scopeOf(sfx)] = true }) })
			var copyTo = h('input', { class: 'n', type: 'number', min: 1, max: 999, placeholder: 'slot' })
			var many = d.steps.length > 1
			var move = function (i, by) {
				var j = i + by
				if (j < 0 || j >= d.steps.length) return
				var tmp = d.steps[i]; d.steps[i] = d.steps[j]; d.steps[j] = tmp
				dirty(); render()
			}
			detail = [
				h('h2', {}, 'Slot ' + id + ' · ' + slotTitle(d), ' ', h('span', { class: 'kind ' + d.kind }, kindLabel(d.kind))),
				h('p', { class: 'sub' }, d.steps.length + (many ? ' steps, ' : ' step, ') + slotValueCount(d) + ' values' + (d.when ? ' · stored ' + when(d.when) : '')),
				h('div', { class: 'bar' },
					h('label', { class: 'f' }, 'Button label', h('input', { value: d.label || '', placeholder: slotTitle({ kind: d.kind, steps: d.steps }),
						oninput: function (e) { d.label = e.target.value; dirty() } })),
					h('label', { class: 'f' }, 'Shown as',
						h('select', { onchange: function (e) { d.kind = e.target.value; dirty(); render() } }, (S.status.kinds || []).map(function (k) {
							return h('option', { value: k.id, selected: k.id === d.kind }, k.label)
						})))),
				h('div', { class: 'bar' },
					h('button', { class: 'b', id: 'save', onclick: function () {
						if (!d.steps.length) return fail(new Error('A slot needs at least one step. Use Delete to empty it.'))
						save('slots', 'api/slot')
					} }, 'Save changes'),
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
						api('api/slot/recall', { id: id, scopes: on }).then(function (r) { toast('Sent ' + r.sent + ' values to the console') }).catch(fail)
					} }, 'Send to console now'),
					follows.length ? scopeList().filter(function (sc) { return present[sc.id] }).map(function (sc) {
						checks[sc.id] = h('input', { type: 'checkbox', checked: (S.status.scopes_on || []).indexOf(sc.id) >= 0 })
						return h('label', {}, checks[sc.id], ' ' + sc.label)
					}) : h('span', { class: 'note' }, 'Every step is sent in full.')),
				(function () {
					// Live comparison with the console: what has moved since this was captured
					var jobs = function () { return d.steps.map(function (step, i) { return { step: i, suffixes: changedIn(step, i) } }) }
					var total = jobs().reduce(function (n, j) { return n + j.suffixes.length }, 0)
					var ready = CMP.on && CMP.id === id && CMP.steps
					return h('div', { class: 'bar cmp' + (total ? ' moved' : '') },
						h('label', {}, h('input', { type: 'checkbox', checked: CMP.on, onchange: function (e) { CMP.on = e.target.checked; CMP.sig = ''; if (CMP.on) pollCompare(true); render() } }), ' Compare with the console'),
						!CMP.on ? null : !ready ? h('span', { class: 'note' }, 'Reading the console…')
							: total ? [h('b', {}, total + (total === 1 ? ' value has' : ' values have') + ' changed on the console since this was captured.'),
								h('button', { class: 'b', onclick: function () { settle('revert', jobs()) } }, '↺ Undo changes made on the console'),
								h('button', { class: 'b', onclick: function () { settle('adopt', jobs()) } }, '💾 Update capture from the console')]
								: h('span', { class: 'note' }, 'The console matches this capture.'),
						ready ? h('button', { class: 'x', title: 'Read every value from the console again', onclick: function () { pollCompare(true) } }, '⟳') : null)
				})(),
				d.steps.map(function (step, i) {
					var followBox = h('input', { type: 'checkbox', checked: !step.fixed, onchange: function (e) { step.fixed = !e.target.checked; dirty(); render() } })
					return h('details', { open: !many },
						h('summary', {}, (many ? (i + 1) + '. ' : '') + where(step),
							h('span', { class: 'chip' + (step.fixed ? '' : ' on') }, step.fixed ? 'SENT IN FULL' : 'FOLLOWS SCOPE'),
							h('span', { class: 'count' }, Object.keys(step.values).length + ' values'),
							changedIn(step, i).length ? h('span', { class: 'chip moved' }, changedIn(step, i).length + ' CHANGED') : null,
							h('span', { class: 'grow' }),
							many ? h('button', { class: 'x', title: 'Move up', onclick: function (e) { e.preventDefault(); move(i, -1) } }, '↑') : null,
							many ? h('button', { class: 'x', title: 'Move down', onclick: function (e) { e.preventDefault(); move(i, 1) } }, '↓') : null,
							many ? h('button', { class: 'x', title: 'Remove this step', onclick: function (e) { e.preventDefault(); d.steps.splice(i, 1); dirty(); render() } }, '×') : null),
						h('div', { class: 'bar', style: 'padding: 0 12px' }, targetFields(step, dirty),
							h('label', {}, followBox, ' Only send the scopes that are lit when recalled')),
						h('div', { style: 'padding: 0 12px 4px' }, valueGroups(step.values, dirty, CMP.on && CMP.id === id && CMP.steps && CMP.steps[i] ? { step: i, now: CMP.steps[i].now } : null)))
				}),
				h('p', { class: 'note' }, 'Steps run top to bottom. Values are shown exactly as the console reports them: levels and gains in dB, frequencies in Hz, times in seconds, switches as 0 or 1.'),
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
		var slotBox = h('input', { class: 'n', type: 'number', min: 1, max: 999, placeholder: 'slot', value: N.slotId,
			oninput: function (e) { N.slotId = e.target.value } })
		var slotLabel = h('input', { placeholder: 'button label' })
		var slotNumber = function () {
			var n = String(Math.trunc(Number(slotBox.value)))
			if (!(Number(n) >= 1)) { fail(new Error('Enter a slot number')); return null }
			return n
		}
		var indexes = []
		for (var i = 1; i <= count; i++) indexes.push(String(i))
		Object.keys(live).concat(Object.keys(edit)).forEach(function (k) { if (indexes.indexOf(k) < 0) indexes.push(k) })
		indexes.sort(function (a, b) { return a - b })

		return h('div', { class: 'detail' },
			h('h2', {}, 'Names'),
			h('p', { class: 'sub' }, 'Read the names from the console, edit them here, and send them back. Names can also be stored in a slot and restored from its button.'),
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
				h('label', { class: 'f' }, 'Slot', slotBox),
				h('label', { class: 'f' }, 'Label', slotLabel),
				h('button', { class: 'b', onclick: function () {
					var n = slotNumber(); if (!n) return
					var slot = S.lib.slots[n], found = 0
					if (!slot) return fail(new Error('Slot ' + n + ' is empty'))
					slot.steps.forEach(function (step) {
						Object.keys(step.values).forEach(function (sfx) {
							if (!isNameSuffix(sfx)) return
							;(N.edit[step.section] = N.edit[step.section] || {})[step.index] = String(step.values[sfx].a[0])
							found++
						})
					})
					if (!found) return fail(new Error('Slot ' + n + ' holds no names'))
					toast('Loaded ' + found + ' names into the editor. Nothing is sent until you press Send.'); render()
				} }, 'Load names from slot'),
				h('button', { class: 'b', onclick: function () {
					var n = slotNumber(); if (!n) return
					if (S.lib.slots[n] && !confirm('Slot ' + n + ' is in use. Replace it?')) return
					api('api/names/slot', { id: n, label: slotLabel.value, names: all() }).then(function () { return reload(true) }).then(function () { toast('Saved names to slot ' + n) }).catch(fail)
				} }, 'Save shown names to slot')),
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
			h('p', { class: 'sub' }, (S.status.kinds || []).map(function (k) { var n = Object.keys(S.lib.slots).filter(function (id) { return S.lib.slots[id].kind === k.id }).length; return n + ' ' + k.label.toLowerCase() + (n === 1 ? ' slot' : ' slots') }).join(', ') + '. The library is also saved inside the Companion configuration.'),
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

	// ---- buttons -------------------------------------------------------------------

	// A page of buttons to import into Companion: choose the size and the keys, see where
	// they land, download the file.
	var BTN = { opts: null, plan: null, file: null, filename: '', error: '', busy: false }
	// The choices are kept in this browser, so a tablet opens with its own layout
	function loadOpts() {
		if (BTN.opts) return
		try { BTN.opts = JSON.parse(localStorage.getItem('digico-recall-layout')) } catch (e) { BTN.opts = null }
		if (!BTN.opts || !Array.isArray(BTN.opts.keys)) BTN.opts = clone(S.status.layout.defaults)
	}
	function saveOpts() {
		try { localStorage.setItem('digico-recall-layout', JSON.stringify(BTN.opts)) } catch (e) { /* private browsing: not kept */ }
	}
	function planButtons() {
		BTN.busy = true
		saveOpts()
		return api('api/layout', BTN.opts).then(function (r) {
			BTN.plan = r.plan; BTN.file = r.file; BTN.filename = r.filename; BTN.error = ''
		}, function (e) { BTN.plan = null; BTN.file = null; BTN.error = e.message })
			.then(function () { BTN.busy = false; if (S.tab === 'buttons') render() })
	}
	function viewButtons() {
		var L = S.status.layout
		if (!BTN.plan && !BTN.busy && !BTN.error) {
			loadOpts()
			planButtons()
		}
		var o = BTN.opts
		var set = function (k, v) { o[k] = v; planButtons() }
		var deck = L.decks.filter(function (d) { return d.columns === o.columns && d.rows === o.rows })[0]
		var size = h('select', { onchange: function (e) {
			var d = L.decks.filter(function (x) { return x.id === e.target.value })[0]
			// each deck size comes with a set of keys that suits it
			if (d) { BTN.custom = false; o.columns = d.columns; o.rows = d.rows; o.nav = d.nav; o.keys = d.keys === 'all' ? L.controls.concat(L.scopes).map(function (k) { return k.id }) : d.keys.slice(); planButtons() } else { BTN.custom = true; render() }
		} }, L.decks.map(function (d) { return h('option', { value: d.id, selected: !BTN.custom && deck && deck.id === d.id }, d.label) }),
			h('option', { value: 'custom', selected: BTN.custom || !deck }, 'Other size'))
		var num = function (k, min, max) {
			return h('input', { type: 'number', min: min, max: max, value: o[k], style: 'width:70px', onchange: function (e) { set(k, Number(e.target.value)) } })
		}
		var tick = function (key) {
			var on = o.keys.indexOf(key.id) >= 0
			return h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: on, onchange: function (e) {
				o.keys = o.keys.filter(function (k) { return k !== key.id })
				if (e.target.checked) o.keys.push(key.id)
				planButtons()
			} }), ' ' + key.label)
		}
		var preview = null
		if (BTN.plan) {
			preview = h('div', { class: 'deck', style: 'grid-template-columns: repeat(' + BTN.plan.columns + ', 64px)' },
				[].concat.apply([], BTN.plan.grid.map(function (row) {
					return row.map(function (cell) {
						return h('div', { class: 'key ' + (cell ? cell.kind : 'empty') }, cell ? cell.label : '')
					})
				})))
		}
		var slots = BTN.plan ? BTN.plan.slots : []
		return h('div', { class: 'detail' },
			h('h2', {}, 'Buttons'),
			h('p', { class: 'sub' }, 'Choose a size and the keys you want. The Keys tab shows them live, to use straight from this page; or download them as a page to import into Companion for a Stream Deck.'),
			h('div', { class: 'bar' }, 'Page size ', size,
				BTN.custom || !deck ? h('span', {}, ' ', num('columns', 2, 20), ' across, ', num('rows', 1, 10), ' down') : null,
				h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: o.nav, onchange: function (e) { set('nav', e.target.checked) } }), ' Page up / down keys'),
				h('label', { class: 'pick' }, h('input', { type: 'checkbox', checked: o.slots !== false, onchange: function (e) { set('slots', e.target.checked) } }), ' Fill the rest with slots'),
				o.slots !== false ? h('span', {}, ' starting at slot ', num('firstSlot', 1, S.status.slotCount)) : null),
			h('div', { class: 'bar' }, h('b', {}, 'Keys '), L.controls.map(tick)),
			h('div', { class: 'bar' }, h('b', {}, 'Recall scope '), L.scopes.map(tick)),
			BTN.error ? h('p', { class: 'note', style: 'color:var(--bad)' }, BTN.error) : null,
			preview,
			BTN.plan ? h('p', { class: 'note' }, slots.length ? 'Slots ' + slots[0] + ' to ' + slots[slots.length - 1] + ' fit on this page. For more, make another page starting at slot ' + (slots[slots.length - 1] + 1) + '.' : (BTN.plan.withSlots ? 'No room is left for slots on this page.' : 'A page of keys only.')) : null,
			h('div', { class: 'bar' },
				h('button', { class: 'b go', disabled: !BTN.file, onclick: function () {
					var blob = new Blob([JSON.stringify(BTN.file, null, '\t')], { type: 'application/json' })
					var a = h('a', { href: URL.createObjectURL(blob), download: BTN.filename })
					document.body.appendChild(a); a.click(); a.remove()
				} }, 'Download page file')),
			h('p', { class: 'note' }, 'In Companion: Import / Export, Import, choose the file, pick the page to put it on, and when asked about the connection choose this one ("' + S.status.label + '") rather than making a new one. The file holds buttons only: no console address and none of your captures. Any key can also be dragged from the Presets tab instead.'))
	}

	// ---- keys ----------------------------------------------------------------------

	// The chosen keys, live: drawn from the module's state and pressed from here, so a
	// tablet or laptop needs no Stream Deck and no page in Companion.
	var KEYS = { data: null, sig: '', error: '', down: null, timer: null }
	var kiosk = location.hash === '#keys' // just the keys, for a tablet left on this page
	function keyFont(lines, px) {
		var longest = Math.max.apply(null, lines.map(function (l) { return l.length }).concat([1]))
		// bold sans is about 0.62 em a letter: fit the longest line across, and the lines down
		return Math.max(7, Math.min((px * 0.9) / (longest * 0.62), (px * 0.84) / (lines.length * 1.2), px * 0.24))
	}
	function drawKeys() {
		var box = $('keys')
		if (!box || !KEYS.data) return
		var d = KEYS.data
		var sig = d.columns + 'x' + d.rows + ':' + d.keys.map(function (row) { return row.map(function (k) { return k ? k.id : '' }).join(',') }).join(';')
		var gap = 6
		var top = box.getBoundingClientRect().top
		var px = Math.floor(Math.min((box.clientWidth - gap * (d.columns - 1)) / d.columns, (window.innerHeight - top - 40 - gap * (d.rows - 1)) / d.rows))
		px = Math.max(30, Math.min(px, 220))
		if (sig !== KEYS.sig || box.children.length === 0 || KEYS.px !== px) {
			KEYS.sig = sig; KEYS.px = px
			box.textContent = ''
			box.style.gridTemplateColumns = 'repeat(' + d.columns + ', ' + px + 'px)'
			d.keys.forEach(function (row) {
				row.forEach(function (k) {
					var el = h('div', { class: 'livekey' + (k ? '' : ' none'), style: 'height:' + px + 'px' })
					if (k) {
						el.dataset.key = k.id
						el.addEventListener('pointerdown', function (e) { e.preventDefault(); keyDown(k.id) })
						el.addEventListener('contextmenu', function (e) { e.preventDefault() })
					}
					box.appendChild(el)
				})
			})
		}
		var i = 0
		d.keys.forEach(function (row) {
			row.forEach(function (k) {
				var el = box.children[i++]
				if (!k) return
				var text = k.lines.join('\n')
				if (el.textContent !== text) el.textContent = text
				el.style.background = k.bgcolor
				el.style.color = k.color
				el.style.fontSize = keyFont(k.lines, px) + 'px'
				el.className = 'livekey' + (KEYS.down === k.id ? ' down' : '')
			})
		})
	}
	function keyOf(id) {
		var found = null
		KEYS.data.keys.forEach(function (row) { row.forEach(function (k) { if (k && k.id === id) found = k }) })
		return found
	}
	function showKeys(d) { KEYS.data = d; KEYS.error = ''; drawKeys() }
	function keyDown(id) {
		keyUp()
		KEYS.down = id
		drawKeys()
		api('api/keys/press', { key: id, layout: BTN.opts }).then(showKeys).catch(fail)
		// Like a Stream Deck key: some do more once held (CAPTURE, two seconds, to clear a slot)
		var k = keyOf(id)
		if (k && k.hold.length) {
			KEYS.timer = setTimeout(function () {
				if (KEYS.down === id) api('api/keys/press', { key: id, held: k.hold[0], layout: BTN.opts }).then(showKeys).catch(fail)
			}, k.hold[0])
		}
	}
	function keyUp() {
		if (KEYS.timer) clearTimeout(KEYS.timer)
		KEYS.timer = null
		if (KEYS.down) { KEYS.down = null; drawKeys() }
	}
	window.addEventListener('pointerup', keyUp)
	window.addEventListener('pointercancel', keyUp)
	window.addEventListener('resize', drawKeys)
	function pollKeys() {
		if (S.tab !== 'keys' || !S.status) return Promise.resolve()
		loadOpts()
		return api('api/keys', BTN.opts).then(showKeys, function (e) {
			if (KEYS.error !== e.message) { KEYS.error = e.message; render() }
		})
	}
	function viewKeys() {
		loadOpts()
		setTimeout(function () { drawKeys(); pollKeys() }, 0)
		return h('div', { class: 'detail keysview' },
			kiosk ? null : h('p', { class: 'sub' },
				'Press these as you would the keys on a Stream Deck. Size and keys are chosen on the Buttons tab. ',
				h('a', { href: '#keys', onclick: function () { setTimeout(function () { location.reload() }, 0) } }, 'Show only the keys'),
				' (for a tablet; bookmark that page).'),
			KEYS.error ? h('p', { class: 'note', style: 'color:var(--bad)' }, KEYS.error + ' Change the choices on the Buttons tab.') : null,
			h('div', { id: 'keys', class: 'livekeys' }),
			kiosk ? h('p', { class: 'note' }, h('a', { href: '#', onclick: function () { setTimeout(function () { location.reload() }, 0) } }, 'Show the whole page')) : null)
	}

	// ---- log -----------------------------------------------------------------------

	// The audit trail: every change the console reports, and everything the module does.
	var LOG = { entries: [], seq: 0, enabled: false, filter: '', paused: false, timer: null }
	var METERS = { running: false, captures: [] }

	function logTime(t) {
		var d = new Date(t)
		var p2 = function (n) { return (n < 10 ? '0' : '') + n }
		var ms = d.getMilliseconds()
		return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + (ms < 100 ? '0' : '') + (ms < 10 ? '0' : '') + ms
	}

	function pollLog() {
		if (LOG.paused) return Promise.resolve()
		return api('api/log?since=' + LOG.seq).then(function (r) {
			var changed = r.enabled !== LOG.enabled || r.entries.length > 0
			LOG.enabled = r.enabled
			if (r.seq < LOG.seq) LOG.entries = [] // the module restarted or the log was cleared
			LOG.seq = r.seq
			r.entries.forEach(function (entry) {
				// A fader move keeps updating one entry: replace it instead of adding a new line
				for (var i = LOG.entries.length - 1; i >= 0 && i > LOG.entries.length - 200; i--) {
					if (LOG.entries[i].t === entry.t && LOG.entries[i].address === entry.address) { LOG.entries[i] = entry; return }
				}
				LOG.entries.push(entry)
			})
			if (LOG.entries.length > 5000) LOG.entries.splice(0, LOG.entries.length - 5000)
			if (changed && S.tab === 'log' && !(document.activeElement && document.activeElement.id === 'logfilter')) render()
			else if (changed && S.tab === 'log') drawLogRows()
		})
	}

	function logMatches(entry) {
		if (!LOG.filter) return true
		var hay = (entry.channel + ' ' + entry.parameter + ' ' + entry.to + ' ' + entry.source).toLowerCase()
		return LOG.filter.toLowerCase().split(/\s+/).every(function (word) { return hay.indexOf(word) >= 0 })
	}

	function drawLogRows() {
		var body = $('logrows')
		if (!body) return
		body.textContent = ''
		var shown = LOG.entries.filter(logMatches)
		shown.slice(-500).reverse().forEach(function (entry) {
			var isEvent = entry.type === 'event'
			body.appendChild(h('tr', { class: isEvent ? 'ev' : '' },
				h('td', { class: 'k' }, logTime(entry.t)),
				isEvent ? h('td', { colspan: 3 }, entry.to) : [
					h('td', {}, entry.channel),
					h('td', { class: 'k' }, entry.parameter),
					h('td', {}, entry.from !== '' && entry.from !== entry.to ? [h('span', { class: 'was' }, entry.from), ' \u2192 '] : null, h('b', {}, entry.to))]))
		})
		var note = $('lognote')
		if (note) note.textContent = shown.length + ' entries' + (shown.length > 500 ? ', newest 500 shown' : '') + (LOG.filter ? ' matching the filter' : '') + '. Download gets them all.'
	}

	function viewLog() {
		var view = h('div', { class: 'detail' },
			h('h2', {}, 'Log'),
			h('p', { class: 'sub' }, LOG.enabled
				? 'Recording every change the console reports, and everything this module does. Newest first.'
				: 'The audit log is off. Switch it on here or with the LOG button.'),
			h('div', { class: 'bar' },
				h('button', { class: 'b' + (LOG.enabled ? '' : ' go'), onclick: function () {
					api('api/log/enable', { on: !LOG.enabled }).then(function (r) { LOG.enabled = r.enabled; return pollLog() }).then(render).catch(fail)
				} }, LOG.enabled ? 'Switch log off' : 'Switch log on'),
				h('button', { class: 'b', onclick: function () { LOG.paused = !LOG.paused; render() } }, LOG.paused ? 'Resume display' : 'Pause display'),
				h('input', { id: 'logfilter', placeholder: 'filter, e.g. "in 5 eq"', value: LOG.filter, oninput: function (e) { LOG.filter = e.target.value; drawLogRows() } }),
				h('button', { class: 'b', onclick: function () {
					var q = function (c) { return '"' + String(c === undefined || c === null ? '' : c).replace(/"/g, '""') + '"' }
					var lines = [['time', 'source', 'channel', 'parameter', 'from', 'to', 'messages', 'address'].map(q).join(',')]
					LOG.entries.filter(logMatches).forEach(function (en) {
						lines.push([new Date(en.t).toISOString(), en.source, en.channel, en.parameter, en.from, en.to, en.count, en.address].map(q).join(','))
					})
					var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })
					var a = h('a', { href: URL.createObjectURL(blob), download: 'digico-recall-log.csv' })
					document.body.appendChild(a); a.click(); a.remove()
				} }, 'Download CSV'),
				h('button', { class: 'b danger', onclick: function () {
					if (!confirm('Clear the log shown here? Anything already written to the log file stays.')) return
					api('api/log/clear', {}).then(function () { LOG.entries = []; LOG.seq = 0; render() }).catch(fail)
				} }, 'Clear')),
			h('details', { open: METERS.running || METERS.captures.length > 0 },
				h('summary', {}, 'Meter capture (diagnostic)', h('span', { class: 'count' }, METERS.running ? 'recording\u2026' : METERS.captures.length + ' held')),
				h('div', { style: 'padding: 0 12px 10px' },
					h('p', { class: 'note' }, S.status.relay ? 'The iPad relay is on, so this records everything the iPad and the console say to each other for 10 seconds and sends nothing of its own. Start it, then on the iPad open a channel with signal and look at its meters, the EQ and the dynamics. Download each file and send them to the module\u2019s maintainer.' : 'Records everything meter-related the console sends for 10 seconds, and asks it for the known meter addresses. It only reads; nothing on the console is changed. Run it a few times with signal on the channel you last touched, download each file, and send them to the module\u2019s maintainer so level metering can be built. With a real iPad relayed through the module (see the settings) it records what the iPad app asks for instead, which is better still.'),
					h('div', { class: 'bar' },
						h('button', { class: 'b' + (METERS.running ? '' : ' go'), disabled: METERS.running, onclick: function () {
							api('api/meters/capture', { seconds: 10 }).then(function () { METERS.running = true; render() }).catch(fail)
						} }, METERS.running ? 'Recording for 10 seconds\u2026' : 'Capture meters for 10 seconds')),
					METERS.captures.slice().reverse().map(function (c) {
						return h('div', { class: 'bar' },
							h('span', {}, when(c.when) + ' \u00b7 ' + (c.mode === 'snoop' ? 'iPad snoop \u00b7 ' + c.ipadDatagrams + ' from the iPad, ' + c.datagramsReceived + ' from the console' : c.meterDatagrams + ' meter packets of ' + c.datagramsReceived) + ' \u00b7 ' + c.addressesWithValues + ' addresses carried values'),
							h('button', { class: 'b', onclick: function () {
								api('api/meters?id=' + c.id).then(function (full) {
									var blob = new Blob([JSON.stringify(full)], { type: 'application/json' })
									var a = h('a', { href: URL.createObjectURL(blob), download: 'digico-recall-meters-' + c.when.replace(/[:.]/g, '-') + '.json' })
									document.body.appendChild(a); a.click(); a.remove()
								}).catch(fail)
							} }, 'Download'))
					}))),
			h('p', { class: 'note', id: 'lognote' }, ''),
			h('table', { class: 'log' },
				h('thead', {}, h('tr', {}, ['Time', 'Channel', 'Parameter', 'Change'].map(function (c) { return h('th', {}, c) }))),
				h('tbody', { id: 'logrows' })))
		setTimeout(drawLogRows, 0)
		return view
	}

	// ---- setup ----------------------------------------------------------------------

	// The console's External Control page, with this installation's values drawn on top.
	// The operator types the console's own address (shown on the console's "Local ... IP"
	// line); the module works out which of this computer's addresses the console can reach
	// and shows exactly what to enter in the console's device row.
	var SETUP = { typed: null, result: null, busy: false }

	function validIp(text) {
		var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text).trim())
		return !!m && m.slice(1).every(function (n) { return Number(n) <= 255 })
	}

	function viewSetup() {
		var st = S.status
		if (SETUP.typed === null) SETUP.typed = st.online ? st.setup.consoleIp : ''
		var known = validIp(SETUP.typed)
		var su = known ? (SETUP.result && SETUP.result.consoleIp === SETUP.typed.trim() ? SETUP.result : (st.setup.consoleIp === SETUP.typed.trim() ? st.setup : null)) : null
		if (known && !su && !SETUP.busy) {
			SETUP.busy = true
			api('api/setup/resolve', { ip: SETUP.typed.trim() }).then(function (r) { SETUP.result = r.setup })
				.catch(fail).then(function () { SETUP.busy = false; if (S.tab === 'setup') render() })
		}
		var px = function (x, y, w, hgt) {
			return 'left:calc(' + x + 'px * var(--k));top:calc(' + y + 'px * var(--k));width:calc(' + w + 'px * var(--k));height:calc(' + hgt + 'px * var(--k))'
		}
		var at = function (cls, x, y, w, hgt, text) { return h('div', { class: 'at ' + cls, style: px(x, y, w, hgt) }, text) }
		var hint = function (x, y, text, flash) {
			return h('div', { class: 'hint' + (flash ? ' flash' : ''), style: 'left:calc(' + x + 'px * var(--k));top:calc(' + y + 'px * var(--k))' }, text)
		}
		var input = h('input', { class: 'at', id: 'consoleip', style: px(203, 543, 104, 19), placeholder: 'console ip here', value: SETUP.typed, inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
			oninput: function (e) {
				var was = validIp(SETUP.typed)
				SETUP.typed = e.target.value
				if (validIp(SETUP.typed) || was) render()
			} })
		var saved = known && st.setup.consoleIp === SETUP.typed.trim()
		var shot = h('div', { class: 'shot' },
			at('cell name', 92, 362, 89, 19, 'Companion'),
			at('cell' + (su ? ' want' : ''), 183, 362, 95, 19, su && su.ip ? su.ip : '??'),
			at('cell' + (su ? ' want' : ''), 280, 362, 42, 19, st.setup.send),
			at('cell' + (su ? ' want' : ''), 324, 362, 42, 19, st.setup.rcv),
			at('tick', 368, 362, 39, 19, '✓'),
			at('foot', 66, 543, 119, 20, st.online && saved && st.consoleName ? st.consoleName : '(the Console Name)'),
			input,
			su ? hint(150, 386, '▲ set this on the console', true)
				: hint(203, 518, '▼ type the IP shown here on your console', true),
			su ? h('div', { class: 'hint', style: 'right:calc(8px * var(--k));top:calc(540px * var(--k))' }, '▼ then press load') : null)
		var message
		if (!known) message = 'On the console open Setup > External Control. At the bottom is a line reading "Local: ... IP: ...". Type that IP address into the box on the picture.'
		else if (!su) message = 'Working out this computer’s address…'
		else if (!su.ip) message = 'This computer has no network address. Connect it to the console’s network and try again.'
		else if (!su.ipMatched) message = 'None of this computer’s addresses (' + [su.ip].concat(su.otherIps).join(', ') + ') is on the same network as ' + su.consoleIp + '. ' + su.ip + ' is shown as a guess; check the console address, or put both machines on the same network.'
		else message = 'This computer is ' + su.ip + ' on the console’s network. On the console, press "add device", choose DiGiCo Pad, and enter the highlighted IP Address, Send and Rcv. Then touch Enabled so it shows a tick, and make sure Enable External Control says YES. Finally press "load" next to "commands allowed" and choose the iPad command set (for example ipad_q3 on a Quantum 338). Without a command set loaded the console ignores this module.'

		return h('div', { class: 'detail' },
			h('h2', {}, 'Console setup'),
			h('p', { class: 'sub' }, st.online ? 'Connected' + (st.consoleName ? ' to ' + st.consoleName : '') + ' at ' + st.setup.consoleIp + '.' : 'No reply from the console yet.'),
			h('div', { class: 'shot-wrap' }, shot),
			h('p', { class: 'note', style: 'color:var(--text);font-size:14px' }, message),
			h('div', { class: 'bar' },
				h('button', { class: 'b' + (known && !saved ? ' go' : ''), disabled: !known || saved, onclick: function () {
					api('api/setup/apply', { ip: SETUP.typed.trim() }).then(function () { toast('Saved. Connecting to ' + SETUP.typed.trim()); return loadStatus() })
						.then(render).catch(fail)
				} }, saved ? 'Companion is using this console address' : 'Use this console address in Companion')),
			su && su.otherIps.length && su.ipMatched ? h('p', { class: 'note' }, 'This computer’s other addresses: ' + su.otherIps.join(', ') + '.') : null,
			h('p', { class: 'note' }, 'If the console is not answering, or you have just changed the settings here, set Enable External Control to NO and back to YES on the console: it can stop talking to a device that has been away for a while. Leave "OSC generic" off; this module does not use it. If the console is the DiGiCo offline software on a Windows PC, allow inbound UDP port ' + st.setup.rcv + ' through Windows Firewall, and check that this computer’s own firewall allows incoming connections for Companion.'))
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
				S.draft = t[0] === 'slots' && S.sel.slots && S.lib.slots[S.sel.slots] ? clone(S.lib.slots[S.sel.slots]) : null
				setDirty(false); render()
			} }, t[1]))
		})
		var main = $('main')
		var typingIp = document.activeElement && document.activeElement.id === 'consoleip'
		var typingFilter = document.activeElement && document.activeElement.id === 'logfilter'
		var scroll = {}
		Array.prototype.forEach.call(main.children, function (c, i) { scroll[i] = c.scrollTop })
		main.textContent = ''
		if (!S.status || !S.lib) { add(main, h('div', { class: 'detail' }, h('div', { class: 'empty-state' }, 'Loading…'))); return }
		add(main, S.tab === 'slots' ? viewSlots() : S.tab === 'names' ? viewNames() : S.tab === 'log' ? viewLog() : S.tab === 'setup' ? viewSetup() : S.tab === 'buttons' ? viewButtons() : S.tab === 'keys' ? viewKeys() : viewLibrary())
		Array.prototype.forEach.call(main.children, function (c, i) { if (scroll[i]) c.scrollTop = scroll[i] })
		setDirty(S.dirty)
		if (typingFilter && $('logfilter')) {
			$('logfilter').focus()
			$('logfilter').setSelectionRange($('logfilter').value.length, $('logfilter').value.length)
		}
		if (typingIp && $('consoleip')) {
			// Redrawing replaced the box being typed in: put the cursor back
			$('consoleip').focus()
			$('consoleip').setSelectionRange($('consoleip').value.length, $('consoleip').value.length)
		}
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
			if (S.tab === 'slots' && S.sel.slots) {
				S.draft = lib.slots[S.sel.slots] ? clone(lib.slots[S.sel.slots]) : null
				S.dirty = false
			}
			render()
		})
	}

	if (kiosk) document.body.className = 'kiosk'
	setInterval(function () { pollKeys().catch(function () {}) }, 400)
	setInterval(function () { pollCompare().catch(function () {}) }, 1000)
	loadStatus().then(function () {
		if (kiosk) S.tab = 'keys'
		else if (!S.status.online) S.tab = 'setup' // nothing else is useful until the console answers
		return reload(true)
	}).catch(fail)
	setInterval(function () {
		loadStatus().catch(function () { $('lamp').className = 'lamp'; $('console').textContent = 'Companion not reachable' })
		// Pick up captures made on the Stream Deck, unless an edit is in progress.
		var typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)
		if (!S.dirty && !typing && S.tab !== 'names') reload(false).catch(function () {})
		if (S.tab === 'setup' && !typing) render()
	}, 2500)
	setInterval(function () {
		if (S.tab !== 'log') return
		pollLog().catch(function () {})
		api('api/meters').then(function (r) {
			var changed = r.running !== METERS.running || r.captures.length !== METERS.captures.length
			METERS.running = r.running
			METERS.captures = r.captures
			if (changed && !(document.activeElement && document.activeElement.id === 'logfilter')) render()
		}).catch(function () {})
	}, 1000)
})()
</script>
</body>
</html>
`
