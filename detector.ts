/**
 * detector.ts
 * Detect whether a string contains enough Chinese (CJK) characters
 * to warrant translation.
 */

/** CJK Unicode ranges */
const CJK_RANGES: [number, number][] = [
	[0x4e00, 0x9fff],   // CJK Unified Ideographs (most common)
	[0x3400, 0x4dbf],   // CJK Extension A
	[0x20000, 0x2a6df], // CJK Extension B
	[0x2a700, 0x2b73f], // CJK Extension C
	[0x2b740, 0x2b81f], // CJK Extension D
	[0xf900, 0xfaff],   // CJK Compatibility Ideographs
	[0x3000, 0x303f],   // CJK Symbols and Punctuation
	[0xff00, 0xffef],   // Fullwidth forms (Chinese punctuation)
];

function isCJK(codePoint: number): boolean {
	return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

export interface DetectionResult {
	isChinese: boolean;
	ratio: number;      // CJK char count / total non-whitespace chars
	cjkCount: number;
}

/**
 * Returns true if the text has enough CJK characters to be considered Chinese.
 * @param text      Input text
 * @param threshold Minimum ratio of CJK chars to total non-whitespace (default 0.2)
 */
export function detectChinese(text: string, threshold = 0.2): DetectionResult {
	const chars = [...text]; // spread handles surrogate pairs
	let cjkCount = 0;
	let nonWhitespace = 0;

	for (const ch of chars) {
		if (/\s/.test(ch)) continue;
		nonWhitespace++;
		if (isCJK(ch.codePointAt(0)!)) cjkCount++;
	}

	const ratio = nonWhitespace === 0 ? 0 : cjkCount / nonWhitespace;
	return {
		isChinese: ratio >= threshold && cjkCount >= 2, // at least 2 CJK chars
		ratio,
		cjkCount,
	};
}
