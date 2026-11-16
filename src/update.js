// Tells the user when a newer build has been released on GitHub and offers the package.
//
// For the time before the module is in Companion's own store, which will then do this
// itself. The check is made by the browser showing the web page, not by the module, so it
// works from any device that has internet access and does nothing on one that has none.
// It only reads the public list of releases; nothing is sent, and nothing is installed:
// the user downloads the package and imports it into Companion as before.

export const REPO = 'jonathan-annett/companion-module-digico-recall'

/**
 * The newest release that is newer than the running version and has a package attached.
 * Written without anything newer than ES5 and with no outside references, because the
 * same function is placed in the web page as text.
 * @param {object[]} releases  as returned by GitHub's "list releases" API
 * @param {string} current  the running version, e.g. "0.2.11"
 * @returns {{version: string, url: string, notes: string, prerelease: boolean} | null}
 */
export function pickRelease(releases, current) {
	function parse(text) {
		var m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text || '').trim())
		return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
	}
	function newer(a, b) {
		for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
		return false
	}
	var have = parse(current)
	var best = null
	if (!have || !Array.isArray(releases)) return null
	releases.forEach(function (release) {
		var version = release && !release.draft ? parse(release.tag_name) : null
		if (!version || !newer(version, have)) return
		var packages = (release.assets || []).filter(function (asset) {
			return /\.tgz$/.test(String(asset.name || '')) && /^https:\/\//.test(String(asset.browser_download_url || ''))
		})
		if (!packages.length) return
		if (best && !newer(version, best.parts)) return
		best = {
			parts: version,
			version: version.join('.'),
			url: packages[0].browser_download_url,
			notes: String(release.html_url || ''),
			prerelease: !!release.prerelease,
		}
	})
	if (best) delete best.parts
	return best
}

/** The part of the web page's script that does the check. Uses the page's own h(). */
export function updateScript(version) {
	return `
	// ---- newer version on GitHub? ---------------------------------------------------
	var UPDATE = { version: ${JSON.stringify(version)}, repo: ${JSON.stringify(REPO)}, found: null, state: '' }
	${pickRelease.toString()}
	function showUpdate() {
		var old = document.getElementById('update')
		if (old) old.remove()
		var f = UPDATE.found
		if (!f || location.hash === '#keys') return
		var bar = h('div', { id: 'update', style: 'padding:8px 16px;background:var(--accent);color:var(--accent-ink);display:flex;gap:14px;align-items:center;flex-wrap:wrap' },
			h('b', {}, 'Version ' + f.version + ' is available' + (f.prerelease ? ' (test release)' : '') + '.'),
			h('span', {}, 'You have ' + UPDATE.version + '.'),
			h('a', { href: f.url, style: 'color:inherit;font-weight:600' }, 'Download the package'),
			f.notes ? h('a', { href: f.notes, target: '_blank', rel: 'noopener', style: 'color:inherit' }, 'What changed') : null,
			h('span', {}, 'Then in Companion: Modules, Import module package, and choose the new version on the connection.'),
			h('button', { style: 'margin-left:auto;background:none;border:0;color:inherit;font-size:16px;cursor:pointer', title: 'Hide', onclick: function () { bar.remove() } }, '×'))
		document.querySelector('header').after(bar)
	}
	// Asks GitHub at most every six hours unless told to; remembers the answer in this browser
	function checkUpdate(force) {
		var key = 'update-check-' + UPDATE.repo, saved = null
		try { saved = JSON.parse(localStorage.getItem(key)) } catch (e) { saved = null }
		if (!force && saved && saved.for === UPDATE.version && Date.now() - saved.at < 6 * 3600 * 1000) {
			UPDATE.found = saved.found; UPDATE.state = 'checked'; showUpdate()
			return Promise.resolve(saved.found)
		}
		UPDATE.state = 'checking'
		return fetch('https://api.github.com/repos/' + UPDATE.repo + '/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json' } })
			.then(function (res) { if (!res.ok) throw new Error('GitHub answered ' + res.status); return res.json() })
			.then(function (list) {
				UPDATE.found = pickRelease(list, UPDATE.version); UPDATE.state = 'checked'
				try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), for: UPDATE.version, found: UPDATE.found })) } catch (e) { /* not kept */ }
				showUpdate()
				return UPDATE.found
			}, function (e) { UPDATE.state = 'failed'; if (force) throw e; return null })
	}
	function updateLine() {
		return h('p', { class: 'note' }, 'This is version ' + UPDATE.version + '. ',
			h('a', { href: '#', onclick: function (e) {
				e.preventDefault()
				checkUpdate(true).then(function (f) { toast(f ? 'Version ' + f.version + ' is available' : 'No newer version has been released') },
					function () { toast('Could not reach GitHub from this device', true) })
			} }, 'Check for a newer one'),
			' (looks at the releases on GitHub; needs internet access on this device).')
	}
	setTimeout(function () { checkUpdate(false) }, 1500)
`
}
