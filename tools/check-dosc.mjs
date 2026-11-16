// Compares this module's address list with a console's own iPad command set.
//
//   node tools/check-dosc.mjs <path to a .DOSC file>
//
// The DiGiCo software keeps each iPad command set (the choices behind "load" on the
// External Control page) as a .DOSC file, for example IPAD_Q3.DOSC for Quantum 338. This
// reads one and reports:
//   - anything the module captures that the console's list does not have
//   - settings the console's list has that the module does not capture
// The .DOSC files belong to DiGiCo and are not included in this repository.
//
// File layout, as far as it is understood: a length-prefixed title, then one record per
// command. In a record, byte 3 is the section, byte 6 the block within it, byte 10 the
// value type (0 switch or choice, 1 number, 3 meter, 4 text), bytes 11-18 the minimum and
// maximum as little-endian floats, and from byte 27 the label as 01 00 <length> <text>.

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { captureSuffixes, meterSuffixes, SECTIONS } from '../src/params.js'

const SECTION_CODES = {
	1: 'Input_Channels',
	5: 'Aux_Outputs',
	6: 'Group_Outputs',
	10: 'Control_Groups',
	16: 'Matrix_Outputs',
	17: 'Graphic_EQ',
}
const BLOCK_PREFIX = {
	1: 'Channel_Input/',
	2: 'Aux_Send/#/',
	3: 'Group_Send/#/',
	4: 'EQ/',
	5: 'Dynamics/',
	7: 'Filters/',
	8: 'Insert/',
	9: 'Channel_Delay/',
	11: 'Buss_Trim/',
	12: '',
	13: 'Panner/',
	14: 'Output/',
	15: '',
	16: '',
}
const TYPES = { 0: 'switch', 1: 'number', 3: 'meter', 4: 'text' }

export function parseDosc(data) {
	const titleLength = data.readUInt16LE(0)
	const title = data.toString('latin1', 2, 2 + titleLength).replace(/\0+$/, '')
	const records = []
	for (let offset = 0; offset + 3 < data.length; offset++) {
		if (data[offset] !== 1 || data[offset + 1] !== 0) continue
		const length = data[offset + 2]
		if (length === 0 || length >= 80 || offset + 3 + length > data.length) continue
		const label = data.subarray(offset + 3, offset + 3 + length)
		if (!label.every((byte) => byte >= 0x20 && byte <= 0x7e)) continue
		const start = offset - 27
		if (start < 2 + titleLength || start + 64 > data.length) continue
		records.push({
			section: data[start + 3],
			block: data[start + 6],
			type: data[start + 10],
			min: data.readFloatLE(start + 11),
			max: data.readFloatLE(start + 15),
			label: label.toString('ascii'),
		})
		offset += length + 2
	}
	return { title, records }
}

/** Records as { section, suffix, type } using the module's address names. */
export function doscAddresses(records) {
	const out = []
	for (const record of records) {
		const section = SECTION_CODES[record.section]
		if (!section || BLOCK_PREFIX[record.block] === undefined) continue
		out.push({
			section,
			suffix: BLOCK_PREFIX[record.block] + record.label.replace(/ /g, '_'),
			type: TYPES[record.type] ?? `type ${record.type}`,
			min: record.min,
			max: record.max,
		})
	}
	return out
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
const file = isMain ? process.argv[2] : undefined
if (file) {
	const { title, records } = parseDosc(fs.readFileSync(file))
	const addresses = doscAddresses(records)
	console.log(`${title}: ${records.length} commands, ${addresses.length} of them channel parameters\n`)
	const generic = (suffix) => suffix.replace(/^(Aux_Send|Group_Send)\/\d+\//, '$1/#/')
	let problems = 0
	for (const section of Object.keys(SECTIONS)) {
		const theirs = addresses.filter((a) => a.section === section)
		if (!theirs.length) {
			console.log(`${SECTIONS[section].label}: not in this command set\n`)
			continue
		}
		const have = new Set(theirs.map((a) => a.suffix))
		const captured = [...new Set(captureSuffixes(section, 1).map(generic))]
		const unknown = captured.filter((suffix) => !have.has(suffix))
		const meters = meterSuffixes(section).filter((suffix) => !have.has(suffix))
		const notCaptured = theirs.filter((a) => a.type !== 'meter' && !captured.includes(a.suffix))
		console.log(
			`${SECTIONS[section].label}: the console lists ${theirs.length}, the module captures ${captured.length}`,
		)
		if (unknown.length)
			console.log(`  CAPTURED BUT NOT IN THE CONSOLE'S LIST (will go unanswered): ${unknown.join(', ')}`)
		if (meters.length) console.log(`  METER ADDRESSES NOT IN THE CONSOLE'S LIST: ${meters.join(', ')}`)
		if (notCaptured.length)
			console.log(`  in the console's list, not captured: ${notCaptured.map((a) => a.suffix).join(', ')}`)
		console.log('')
		problems += unknown.length + meters.length
	}
	console.log(
		problems
			? `${problems} address(es) the module uses are not in this command set.`
			: 'Every address the module uses is in this command set.',
	)
} else if (isMain) {
	console.log('Usage: node tools/check-dosc.mjs <path to a .DOSC file>')
}
