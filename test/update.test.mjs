// The "newer version on GitHub" notice: which release, if any, is offered.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { pickRelease, updateScript, REPO } from '../src/update.js'
import { PAGE } from '../src/webui.js'
import { VERSION } from '../src/version.js'

const release = (tag, extra = {}) => ({
	tag_name: tag,
	draft: false,
	prerelease: false,
	html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
	assets: [
		{
			name: `module-${tag.replace(/^v/, '')}.tgz`,
			browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/module.tgz`,
		},
	],
	...extra,
})

test('offers the newest release that is newer than the running version and has a package', () => {
	const list = [
		release('v0.2.0'),
		release('v0.3.1'),
		release('v0.3.0'),
		release('v0.10.0', { prerelease: true }),
		release('v0.2.9'),
	]
	assert.deepEqual(pickRelease(list, '0.2.5'), {
		version: '0.10.0', // compared as numbers: 0.10 is newer than 0.3
		url: `https://github.com/${REPO}/releases/download/v0.10.0/module.tgz`,
		notes: `https://github.com/${REPO}/releases/tag/v0.10.0`,
		prerelease: true,
	})
	assert.equal(pickRelease(list, '0.10.0'), null, 'the same version is not an update')
	assert.equal(pickRelease(list, '1.0.0'), null, 'nor is an older one')
	assert.equal(pickRelease([release('0.3.0')], '0.2.5').version, '0.3.0', 'a tag without the v is understood')
})

test('ignores drafts, releases with no package, odd tags and odd answers', () => {
	const list = [
		release('v9.0.0', { draft: true }),
		release('v8.0.0', { assets: [] }),
		release('v7.0.0', { assets: [{ name: 'notes.txt', browser_download_url: 'https://example.test/notes.txt' }] }),
		release('v6.0.0', { assets: [{ name: 'module.tgz', browser_download_url: 'javascript:alert(1)' }] }),
		release('nightly'),
		release('v5.0.0-beta.1'),
		null,
		release('v0.3.0'),
	]
	assert.equal(pickRelease(list, '0.2.5').version, '0.3.0')
	for (const bad of [null, undefined, {}, 'rate limited', { message: 'API rate limit exceeded' }])
		assert.equal(pickRelease(bad, '0.2.5'), null)
	assert.equal(pickRelease(list, 'not a version'), null)
})

test('the web page carries the same function, this version and this repository', () => {
	const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
	assert.equal(VERSION, pkg.version)
	assert.ok(pkg.repository.url.includes(REPO))
	assert.ok(PAGE.includes(pickRelease.toString()), 'the tested function is the one in the page')
	assert.ok(PAGE.includes(`version: "${VERSION}", repo: "${REPO}"`))
	assert.ok(PAGE.includes(`'https://api.github.com/repos/' + UPDATE.repo + '/releases?per_page=30'`))
	// The function really is free-standing: it works when rebuilt from its own text
	const rebuilt = new Function(`${pickRelease.toString()}; return pickRelease`)()
	assert.equal(rebuilt([release('v0.3.0')], '0.2.5').version, '0.3.0')
	assert.ok(updateScript('1.2.3').includes('version: "1.2.3"'))
})
