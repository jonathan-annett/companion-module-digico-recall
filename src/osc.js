// Minimal OSC 1.0 encoder/decoder, tolerant of the quirks in DiGiCo's iPad protocol
// (address-only packets, untagged meter payloads, bundles).

function pad(bytes) {
	const out = Buffer.alloc((bytes.length + 4) & ~3)
	bytes.copy(out)
	return out
}

/**
 * @param {string} path
 * @param {string} types  OSC type tags without the leading comma, e.g. "f" or "is"
 * @param {Array<number|string>} args
 */
export function encode(path, types = '', args = []) {
	const parts = [pad(Buffer.from(path, 'utf8')), pad(Buffer.from(',' + types, 'ascii'))]
	for (let i = 0; i < types.length; i++) {
		const t = types[i]
		const v = args[i]
		if (t === 'f') {
			const b = Buffer.alloc(4)
			b.writeFloatBE(Number(v) || 0)
			parts.push(b)
		} else if (t === 'i') {
			const b = Buffer.alloc(4)
			b.writeInt32BE(Math.trunc(Number(v) || 0))
			parts.push(b)
		} else if (t === 's') {
			parts.push(pad(Buffer.from(String(v ?? ''), 'utf8')))
		} else if (t === 'T' || t === 'F' || t === 'N' || t === 'I') {
			// no payload
		} else {
			throw new Error(`Unsupported OSC type tag "${t}" for ${path}`)
		}
	}
	return Buffer.concat(parts)
}

function readString(buf, offset) {
	const end = buf.indexOf(0, offset)
	if (end < 0) return null
	return { value: buf.toString('utf8', offset, end), next: (end + 4) & ~3 }
}

/**
 * @param {Buffer} buf
 * @returns {Array<{path: string, types: string, args: Array<number|string|boolean|null>}>}
 */
export function decode(buf) {
	if (buf.length >= 16 && buf.toString('ascii', 0, 7) === '#bundle') {
		const out = []
		let offset = 16
		while (offset + 4 <= buf.length) {
			const size = buf.readUInt32BE(offset)
			offset += 4
			if (size <= 0 || offset + size > buf.length) break
			out.push(...decode(buf.subarray(offset, offset + size)))
			offset += size
		}
		return out
	}
	const path = readString(buf, 0)
	if (!path || !path.value.startsWith('/')) return []
	if (path.next >= buf.length) return [{ path: path.value, types: '', args: [] }]
	const tags = readString(buf, path.next)
	if (!tags || !tags.value.startsWith(',')) {
		// DiGiCo sends some meter data without a type-tag string. Not needed here.
		return [{ path: path.value, types: '', args: [] }]
	}
	const types = tags.value.slice(1)
	const args = []
	let offset = tags.next
	let ok = ''
	for (const t of types) {
		if (t === 'f') {
			if (offset + 4 > buf.length) break
			args.push(buf.readFloatBE(offset))
			offset += 4
		} else if (t === 'i') {
			if (offset + 4 > buf.length) break
			args.push(buf.readInt32BE(offset))
			offset += 4
		} else if (t === 'd') {
			if (offset + 8 > buf.length) break
			args.push(buf.readDoubleBE(offset))
			offset += 8
		} else if (t === 'h') {
			if (offset + 8 > buf.length) break
			args.push(Number(buf.readBigInt64BE(offset)))
			offset += 8
		} else if (t === 's') {
			const s = readString(buf, offset)
			if (!s) break
			args.push(s.value)
			offset = s.next
		} else if (t === 'b') {
			if (offset + 4 > buf.length) break
			const size = buf.readUInt32BE(offset)
			offset += 4 + ((size + 3) & ~3)
			args.push(null)
		} else if (t === 'T') args.push(true)
		else if (t === 'F') args.push(false)
		else if (t === 'N' || t === 'I') args.push(null)
		else break
		ok += t
	}
	return [{ path: path.value, types: ok, args }]
}
