// Rebuild both docx outputs from Nemeth-數學點字教材-CH1-9.md
// Usage: node .build/rebuild.js
// If new braille sequences appear that aren't in braille_map.json, this will
// list them and stop — they need brl2asc() run via the nc engine in a browser
// (see conversation history / project_nemeth_teaching_material memory for the
// method), then add the new entries to .build/braille_map.json and rerun.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_MD = path.join(ROOT, 'Nemeth-數學點字教材-CH1-9.md');
const UNICODE_DOCX = path.join(ROOT, 'Nemeth-數學點字教材-CH1-9(點字版).docx');
const ASCII_DOCX = path.join(ROOT, 'Nemeth-數學點字教材-CH1-9(ASCII+SimBraille版).docx');
const MAP_FILE = path.join(__dirname, 'braille_map.json');
const WORK = path.join(__dirname, '_work');

function sh(cmd) { execSync(cmd, { stdio: 'inherit', cwd: ROOT }); }

// Rezip WORK/ into a target .docx. NOTE: tar.exe's `-a -c -f out.docx` was
// tried here first and silently produced a corrupt/non-standard zip (no
// "End of Central Directory" record — presumably because -a's format
// auto-detect doesn't recognize the .docx extension as zip). PowerShell
// Compress-Archive is the proven-working option, so we shell out to it
// instead — it requires a .zip extension, so we build as .zip then rename.
function rezipWorkInto(targetDocx) {
  fs.rmSync(targetDocx, { force: true });
  const zipTmp = targetDocx.replace(/\.docx$/, '.zip');
  fs.rmSync(zipTmp, { force: true });
  sh(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${WORK}\\*' -DestinationPath '${zipTmp}' -CompressionLevel Optimal"`);
  fs.renameSync(zipTmp, targetDocx);
}

// 1. Unicode docx via pandoc (also generates OMML for $...$ math automatically)
// +east_asian_line_breaks: without this, pandoc's default Markdown reader
// treats every soft line break (source lines manually wrapped for
// readability, no blank line between) as a literal space in the output —
// including between two CJK characters, where no space belongs. That
// produces visible stray spaces and, in Word, an incorrect-looking reflow
// at exactly the source's manual wrap point. This extension makes pandoc
// drop the space when both sides of the break are East Asian wide
// characters, while still keeping a real space where needed (e.g. next to
// ASCII words/symbols).
sh(`pandoc -f markdown+east_asian_line_breaks "${SRC_MD}" -o "${UNICODE_DOCX}" --toc --toc-depth=2`);

// 2. Extract document.xml and check braille coverage
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
sh(`cd "${WORK}" && "C:/Windows/System32/tar.exe" -xf "${UNICODE_DOCX}"`);
// tar.exe (bsdtar, built into Windows) can extract zip/docx directly

// 1.5. Every top-level "# " heading (前言/凡例/CHn/附錄/參考資料) starts its own
// new page — per explicit user request. Pandoc maps every "# " heading to the
// "Heading1" paragraph style (verified by inspecting the built docx: exactly
// as many Heading1 paragraphs as there are "# " lines in the source), so
// adding <w:pageBreakBefore/> to that ONE style definition in styles.xml is
// sufficient — it does not need to be set on each paragraph individually,
// and does not affect "## "/"### " (Heading2/3) subsections, which continue
// to flow normally within a chapter. Must run BEFORE the first
// rezipWorkInto (Unicode/點字版) below so both docx outputs get it — step 3
// (BrailleASCII style insertion) re-reads this same styles.xml file later
// and only ADDS a style, it doesn't touch this one.
// GOTCHA (found via user screenshot: title page had nothing on it but the
// title, TOC pushed to its own page): pandoc's built-in "TOCHeading" style
// (used for the literal "Table of Contents" paragraph in front of the TOC
// field) is `w:basedOn="Heading1"` — it INHERITS pageBreakBefore from the
// same patch above, since its own <w:pPr> override only touches spacing/
// outlineLvl, not this property. Explicitly overriding it back to false
// on TOCHeading itself (child style properties win over basedOn) undoes
// the unwanted inheritance without touching the Heading1 patch itself.
{
  const stylesPathEarly = path.join(WORK, 'word', 'styles.xml');
  let stylesEarly = fs.readFileSync(stylesPathEarly, 'utf8');
  const h1Idx = stylesEarly.indexOf('w:styleId="Heading1"');
  const h1Start = stylesEarly.lastIndexOf('<w:style', h1Idx);
  const h1End = stylesEarly.indexOf('</w:style>', h1Idx) + '</w:style>'.length;
  const h1Block = stylesEarly.slice(h1Start, h1End);
  if (!h1Block.includes('pageBreakBefore')) {
    // <w:keepLines/> is always the child immediately before where
    // pageBreakBefore belongs in the CT_PPrBase schema sequence — inserting
    // right after it (verified present in this style's current <w:pPr>) is
    // schema-order-safe here.
    const patchedH1Block = h1Block.replace('<w:keepLines />', '<w:keepLines /><w:pageBreakBefore />');
    stylesEarly = stylesEarly.slice(0, h1Start) + patchedH1Block + stylesEarly.slice(h1End);
    fs.writeFileSync(stylesPathEarly, stylesEarly, 'utf8');
  }
  const tocIdx = stylesEarly.indexOf('w:styleId="TOCHeading"');
  if (tocIdx !== -1) {
    const tocStart = stylesEarly.lastIndexOf('<w:style', tocIdx);
    const tocEnd = stylesEarly.indexOf('</w:style>', tocIdx) + '</w:style>'.length;
    const tocBlock = stylesEarly.slice(tocStart, tocEnd);
    if (!tocBlock.includes('pageBreakBefore')) {
      // <w:pPr> is the very first child of <w:style> here — pageBreakBefore
      // is first in the CT_PPrBase sequence, so prepending inside <w:pPr>
      // is schema-order-safe.
      const patchedTocBlock = tocBlock.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore w:val="0" />');
      stylesEarly = stylesEarly.slice(0, tocStart) + patchedTocBlock + stylesEarly.slice(tocEnd);
      fs.writeFileSync(stylesPathEarly, stylesEarly, 'utf8');
    }
  }
}

let doc = fs.readFileSync(path.join(WORK, 'word', 'document.xml'), 'utf8');
// Pandoc's --toc always emits the literal English heading "Table of
// Contents" for the TOC field's own title paragraph — replace with the
// Chinese equivalent. Must target only the visible <w:t> text run, NOT
// the identical-looking string inside <w:docPartGallery w:val="Table of
// Contents" /> a few characters earlier in the same <w:sdt> block — that
// attribute is Word's own internal gallery-type identifier for recognizing
// this content control as a built-in TOC and must stay in English, or
// Word may stop treating it as a proper TOC field.
doc = doc.replace(/(<w:t[^>]*>)Table of Contents(<\/w:t>)/, '$1目錄$2');
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const brailleRe = /[\u2800-\u28FF]+/g;
const runRe = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*)<\/w:r>/g;
const found = new Set();
let m;
while ((m = brailleRe.exec(doc))) found.add(m[0]);
const missing = [...found].filter(k => !(k in map));
if (missing.length) {
  console.error('NEW braille sequences not in braille_map.json (need brl2asc() via nc engine in a browser):');
  console.error(JSON.stringify(missing));
  process.exit(1);
}
console.log('braille coverage OK:', found.size, 'unique sequences');

// 2.3. Force every "→ [braille]" formula onto its own new line —
// unconditional, per explicit user request (superseding the earlier
// "let Word's natural wrap decide whether it's needed" design): the
// braille always starts fresh on the line after "→", never sharing a
// line with the preceding label text. Step 2.6 below still applies (the
// relational-sign-only break) as the fallback for when the formula is
// STILL too long even given a whole line to itself — but ONLY for the
// Unicode-braille output (see docPristine note below). This step (2.3)
// and step 2.4 (wordWrap) run BEFORE the docPristine snapshot, so BOTH
// outputs get the forced line break — confirmed via user report that the
// ASCII+SimBraille docx was missing it while the Unicode one had it.
// "→" stays attached to the label; only the braille content (and its
// leading space, which is dropped here since the line break itself now
// provides the separation) moves to the new line.
// Two structurally different cases found by inspecting the actual
// rebuilt document.xml, both handled:
//   - "→" sits at the very end of one run/<w:t>, with the braille
//     starting in the NEXT run (pandoc split them apart, e.g. due to an
//     eastAsia font hint on the label run) — insert a bare <w:br/> run
//     between the two existing runs.
//   - "→ [braille]" both live inside the SAME <w:t> (the more common
//     case) — split that run's text at the boundary, inserting a <w:br/>
//     run in between.
// Only "→" immediately followed by " " + an actual braille character is
// treated as a transcription marker — this document also uses the same
// arrow glyph in ordinary prose (e.g. explaining what the arrow means)
// and inside rendered OMML math (m:t, a completely different XML
// namespace/tag that this regex doesn't match at all), neither of which
// should be split.
// SHORT_CHEM_MAX: used by step 2.3b below, not this step — see that step's
// comment. (This step, 2.3, stays unconditional: the braille always starts
// its own new line regardless of length or chapter. An earlier version of
// this step tried to also skip the line break entirely for short CH10
// formulas, sharing the label's line — user feedback: that was wrong, the
// braille must still always get its own line; only whether that one line
// needs a FURTHER split (step 2.3b's inner reaction-arrow break) should be
// length-gated.)
const SHORT_CHEM_MAX = 36;
{
  const passRunBoundary = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([\s\S]*?)→<\/w:t><\/w:r><w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)> ([⠀-⣿][\s\S]*?)<\/w:t><\/w:r>/g;
  doc = doc.replace(passRunBoundary, (full, rPr1, attrs1, textBefore, rPr2, attrs2, brailleText) =>
    `<w:r>${rPr1}<w:t${attrs1}>${textBefore}→</w:t></w:r><w:r>${rPr1}<w:br/></w:r><w:r>${rPr2}<w:t${attrs2}>${brailleText}</w:t></w:r>`
  );
  const passSameRun = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([\s\S]*?)→ ([⠀-⣿][\s\S]*?)<\/w:t><\/w:r>/g;
  doc = doc.replace(passSameRun, (full, rPr, attrs, before, brailleText) =>
    `<w:r>${rPr}<w:t${attrs}>${before}→</w:t></w:r><w:r>${rPr}<w:br/></w:r><w:r>${rPr}<w:t${attrs}>${brailleText}</w:t></w:r>`
  );
  // Third variant: "→ " (arrow + trailing space, both already in the same
  // run) with the braille starting immediately — no leading space — in
  // the very next run. Same fix, just no leading space to drop this time.
  const passRunBoundaryNoLeadSpace = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([\s\S]*?)→ <\/w:t><\/w:r><w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([⠀-⣿][\s\S]*?)<\/w:t><\/w:r>/g;
  doc = doc.replace(passRunBoundaryNoLeadSpace, (full, rPr1, attrs1, textBefore, rPr2, attrs2, brailleText) =>
    `<w:r>${rPr1}<w:t${attrs1}>${textBefore}→</w:t></w:r><w:r>${rPr1}<w:br/></w:r><w:r>${rPr2}<w:t${attrs2}>${brailleText}</w:t></w:r>`
  );
}

// 2.3b. Force a hard break before the INTERNAL chemical reaction arrow
// (reactants on one line, "→ products" on the next) — a different arrow
// from step 2.3 above, which splits the outer "here's the label → here's
// the braille" transcription marker (step 2.3 is unconditional — the
// braille always gets its own line no matter what). This one is INSIDE the
// braille content itself, between reactants and products
// (CaCl2+Na2CO3 → CaCO3+2NaCl), and — per explicit user decision — is
// skipped when the WHOLE formula is short enough (at or under
// SHORT_CHEM_MAX cells, currently 36) to fit on that one line by itself
// without needing a further split; CH10's reaction list has many short
// formulas (e.g. "HCl→H+ + Cl-") where forcing a second split wastes
// vertical space for no benefit. Scoped to CH10 only, like the rest of
// this step. Longer formulas keep matching BANA's own canonical
// presentation exactly
// (Chem 2023 Example 3-36/3-37, Example 9-1/9-2 — every one splits right
// before this arrow) and reuses the same "always force, don't calculate
// page width" philosophy already applied to step 2.3's outer arrow (per
// explicit user decision after an earlier per-width-guess design proved
// unreliable). Replaces reliance on a soft break-CANDIDATE (word-joiner/
// ZWSP based, added earlier, still present as a fallback for reactant/
// product lists independently too long to fit their own line) with a
// guaranteed <w:br/> — no uncertainty about whether Word's line-breaking
// or the ZWSP character actually behaves as intended in a given render.
// Scoped to CH10 only via computeChemFlags (defined below, used by both
// this step and the later "+" candidate step — JS function declarations
// are hoisted, so the earlier position here is fine). Runs BEFORE the
// docPristine snapshot so both outputs get it, like step 2.3/2.4 (a plain
// <w:br/> insertion doesn't fragment the contiguous-braille-run assumption
// that step 4's ASCII lookup depends on — only actual character insertion
// INTO a braille run, like the word-joiner protection below, would).
{
  const chemFlagsArrow = computeChemFlags(doc);
  let paraIdxArrow = 0;
  let chemModeArrow = chemFlagsArrow[0];
  // Reversible arrow (⠫⠒⠕⠫⠪⠒) checked first even though it doesn't share a
  // prefix with the plain yields arrow (⠫⠕) here — kept for defensiveness
  // in case a future symbol addition ever does share a prefix.
  const ARROW_PATTERNS = ['⠀⠫⠒⠕⠫⠪⠒', '⠀⠫⠕'];
  const runOrParaRe = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([\s\S]*?)<\/w:t><\/w:r>|<\/w:p>/g;
  doc = doc.replace(runOrParaRe, (full, rPr, attrs, text) => {
    if (rPr === undefined) { paraIdxArrow++; chemModeArrow = chemFlagsArrow[paraIdxArrow]; return full; }
    if (!chemModeArrow) return full;
    // Measure only the braille portion, not the whole run's text — pandoc
    // sometimes merges the outer "→ " label-arrow into the SAME run as the
    // braille that follows it (confirmed for this exact paragraph), which
    // would otherwise inflate the length by 2 non-braille characters and
    // push a formula that's actually at the threshold over it.
    const brailleOnly = text.match(/[⠀-⣿]+/);
    if (brailleOnly && [...brailleOnly[0]].length <= SHORT_CHEM_MAX) return full;
    for (const pat of ARROW_PATTERNS) {
      const idx = text.indexOf(pat);
      if (idx === -1) continue;
      const before = text.slice(0, idx);
      // Drop the leading blank cell (idx+1, not idx) — the line break
      // itself now provides the separation, same convention as step 2.3
      // dropping the space before "→[braille]".
      const after = text.slice(idx + 1);
      return `<w:r>${rPr}<w:t${attrs}>${before}</w:t></w:r><w:r>${rPr}<w:br/></w:r><w:r>${rPr}<w:t${attrs}>${after}</w:t></w:r>`;
    }
    return full;
  });
}

// 2.4. Disable Word's "break anywhere" East Asian line-wrap rule for every
// paragraph that contains braille — also runs before docPristine, so both
// outputs get it. Discovered by inspecting the rebuilt docx directly: even
// with every non-candidate blank cell word-joiner-protected (step 2.6,
// Unicode-only), long braille sequences (e.g.
// "{[(15+8)×3]-12}÷7=8 1/7") were STILL wrapping at arbitrary points
// beyond the one deliberately-left candidate — per user report
// ("維持點字算式的完整性", pointing at screenshots where this was still
// happening). Root cause: this document is heavily CJK, and Word's default
// East Asian typography rules allow a line break at essentially ANY
// character boundary in that mode — braille pattern characters apparently
// get swept into the same "may break anywhere" treatment — a break point
// between two non-blank braille characters was never even considered a
// risk, since the word-joiner protection scheme only ever targeted blank
// cells (the only points that need protecting under ordinary Western
// wrapping rules). Confirmed the fix mechanism already exists in this
// exact document: pandoc's own "Source Code" style already ships with
// `<w:pPr><w:wordWrap w:val="off" /></w:pPr>` to keep code lines from
// wrapping mid-token — same OOXML element, applied here per-paragraph
// instead of via a style, since braille and prose bullets share the same
// "Compact" style and prose SHOULD keep normal CJK wrapping.
// `wordWrap="off"` reverts a paragraph to Western-style wrapping (break
// only at real candidates: spaces, or an explicit break we insert), which
// is exactly what steps 2.3/2.6 assume.
// Every braille-containing paragraph's <w:pPr> in this document is one of
// a handful of simple shapes (pStyle alone, or pStyle+numPr — verified by
// enumerating every unique shape in the rebuilt docx), with nothing from
// later in the CT_PPr schema sequence (spacing/ind/jc/etc.) present, so
// appending wordWrap as the last child right before </w:pPr> is always
// schema-order-safe here — this is NOT a safe general assumption, just a
// verified fact about this specific document's current content.
doc = doc.replace(/<w:p>(<w:pPr>([\s\S]*?)<\/w:pPr>)?([\s\S]*?)<\/w:p>/g, (full, pPrFull, pPrInner, body) => {
  if (!/[⠀-⣿]/.test(body)) return full;
  const newPPr = pPrFull
    ? `<w:pPr>${pPrInner}<w:wordWrap w:val="off" /></w:pPr>`
    : `<w:pPr><w:wordWrap w:val="off" /></w:pPr>`;
  return `<w:p>${newPPr}${body}</w:p>`;
});

// 2.4b. Widen the two braille-comparison columns in the appendix unit
// tables (長度/面積/體積, 密度/速度) — pandoc emits every pipe-table with N
// EQUAL-width columns (confirmed: both tables' <w:tblGrid> came out as five
// identical `w:w="1584"` gridCols) with no awareness of how wide the actual
// rendered content is per column. These two tables have short content in
// 中文/符號/是否相同 but multi-cell braille strings in 本教材/BANA, so the
// equal split visibly wrapped the longer braille onto a second line inside
// its cell (user screenshot: 密度 g/cm³ row). Both tables share the same
// unique header cell text ("本教材（沿用舊慣例）") used here to find them —
// this string does not appear anywhere else in the document. Total width
// is kept at the original 7920 (5×1584) so the table's overall size on the
// page doesn't change, only the proportions between its 5 columns; keeps
// both <w:tblGrid> and each cell's own <w:tcW> in sync since a
// tblLayout="fixed" table's rendering can depend on either being present.
// Runs before docPristine so both outputs get it, same as steps 2.3/2.4.
{
  // 中文/符號/本教材/BANA/是否相同 — widened 中文 and 是否相同 from an earlier
  // pass (800/920) after a user screenshot showed 4-character labels
  // ("平方公分" etc.) and the "是否相同" header itself wrapping to 2 lines
  // inside their cells; the difference came out of 符號 (had visible slack
  // in that same screenshot) and a small trim off 本教材/BANA (their longest
  // content, 7-8 braille cells, still comfortably fits at these widths).
  const COL_WIDTHS = [1150, 800, 2260, 2560, 1150];
  const marker = '本教材（沿用舊慣例）';
  let searchFrom = 0;
  while (true) {
    const markerIdx = doc.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    const tblStart = doc.lastIndexOf('<w:tbl>', markerIdx);
    const tblEnd = doc.indexOf('</w:tbl>', markerIdx) + '</w:tbl>'.length;
    if (tblStart === -1) { searchFrom = markerIdx + marker.length; continue; }
    let tbl = doc.slice(tblStart, tblEnd);
    tbl = tbl.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/,
      '<w:tblGrid>' + COL_WIDTHS.map(w => `<w:gridCol w:w="${w}" />`).join('') + '</w:tblGrid>');
    let colIdx = 0;
    tbl = tbl.replace(/<w:tc><w:tcPr\s*\/>/g, () => {
      const w = COL_WIDTHS[colIdx % COL_WIDTHS.length];
      colIdx++;
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa" /></w:tcPr>`;
    });
    doc = doc.slice(0, tblStart) + tbl + doc.slice(tblEnd);
    searchFrom = tblStart + tbl.length;
  }
}

// Keep a pristine copy for the ASCII-conversion step below (step 4) — its
// braille_map lookup requires unbroken, contiguous braille runs exactly as
// recorded in braille_map.json. Step 2.6 below inserts invisible
// break-point characters INTO the braille runs, which would fragment them
// and break that lookup, so the ASCII+SimBraille docx is built from this
// copy instead (already carrying the forced line-break from step 2.3 and
// the wordWrap fix from step 2.4, but not yet the font-fix or
// word-joiner/relational-sign work below, both Unicode-only).
const docPristine = doc;

// 2.5. Explicitly set "Segoe UI Symbol" as the font for every run
// containing braille content, in the Unicode-braille (點字版) output only.
// Per user report: some braille characters were rendering in a visibly
// different font than others within the same sequence. Root cause: this
// document never specifies an explicit font for braille runs, only theme
// fonts (minorHAnsi/minorEastAsia) via docDefaults — neither of which has
// Braille Patterns block (U+2800-U+28FF) coverage, so Word silently
// substitutes a fallback font per missing glyph. When more than one
// candidate fallback font is available on the system, different braille
// characters can end up resolved to different fallback fonts, producing
// visibly inconsistent glyph style/size within one sequence. Verified
// "Segoe UI Symbol" (ships with Windows) has complete coverage of the
// entire U+2800-U+28FF block via WPF's GlyphTypeface.CharacterToGlyphMap
// (0 missing codepoints out of 256) — an already-installed system font,
// not a new dependency. This is NOT the same font as "SimBraille" (used
// for the ASCII+SimBraille docx's BrailleASCII style) — SimBraille maps
// plain ASCII characters to braille-cell glyphs (see its "font-ascii" CSS
// class name in the project's other tools), it does not carry glyphs at
// the actual Unicode braille codepoints, so it would not work here.
{
  const brailleRunRe = /<w:r>((?:(?!<w:r>|<\/w:r>)[\s\S])*?)<w:t([^>]*)>([⠀-⣿][\s\S]*?)<\/w:t><\/w:r>/g;
  doc = doc.replace(brailleRunRe, (full, rPr, attrs, text) => {
    const fontTag = '<w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:cs="Segoe UI Symbol" />';
    let newRPr;
    if (!rPr) {
      newRPr = `<w:rPr>${fontTag}</w:rPr>`;
    } else if (/<w:rFonts\b[^>]*\/>/.test(rPr)) {
      // Merge into an existing self-closing <w:rFonts .../> — keep any
      // other attributes (e.g. w:hint="eastAsia") but force ascii/hAnsi/cs
      // to Segoe UI Symbol so the braille glyphs always resolve there.
      newRPr = rPr.replace(/<w:rFonts\b([^>]*)\/>/, (rf, attrsInner) => {
        const cleaned = attrsInner.replace(/\s*w:(ascii|hAnsi|cs)="[^"]*"/g, '');
        return `<w:rFonts${cleaned} w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:cs="Segoe UI Symbol" />`;
      });
    } else {
      // <w:rPr> exists but has no <w:rFonts> child yet — rFonts is first
      // in the CT_RPr schema sequence, so prepending is always safe.
      newRPr = rPr.replace('<w:rPr>', `<w:rPr>${fontTag}`);
    }
    return `<w:r>${newRPr}<w:t${attrs}>${text}</w:t></w:r>`;
  });
}

// 2.6. Give Word's line-wrap sensible places to break long braille
// sequences. Applied only to the Unicode-braille (點字版) output — see
// docPristine note above for why the ASCII version is exempt.
//
// Design (rewritten 2026-08-05, replacing the earlier "insert a ZWSP
// before every baseline +/-/fraction-line" approach): per user feedback
// after reviewing many rebuilt examples, that approach still let long
// expressions wrap mid-expression at whichever operator happened to fall
// near the margin, sometimes leaving a tiny orphaned fragment on the next
// line. The desired behavior instead has two tiers, matching how a human
// transcriber would actually do it:
//   1. If moving the WHOLE "→ [braille]" expression onto its own line
//      (instead of sharing the line with the preceding label text) is
//      enough for it to fit without any further wrapping, do that — the
//      expression stays visually intact as one line.
//   2. Only if it's STILL too wide even given a full line to itself,
//      break it — and only at a relational/comparison sign (=, <, >, ≤,
//      ≥, ≠, ≈, ~, ≅, ∝, ≡), per Rule 26.2's top-priority break point,
//      never at a baseline +/- or fraction line anymore.
//
// This does NOT require calculating any actual page width. It falls out
// for free from two existing facts about how Word already lays out this
// content:
//   - The real ASCII space between "→" and the braille (left untouched,
//     confirmed via extracted document.xml — U+0020, not a braille blank
//     cell) is already a natural break point. If the braille that follows
//     has no OTHER break opportunity anywhere inside it, Word can only
//     either fit the whole indivisible chunk after the label or push all
//     of it to a fresh line — exactly tier 1, with no width math needed.
//   - Every blank braille cell (U+2800 — NOT the ASCII space; confirmed
//     via extracted document.xml that Word treats this Unicode symbol
//     character as a break opportunity too, which is why it needed
//     word-joiner protection at all in the first place) is ALREADY a
//     natural break candidate at every word-boundary inside the Nemeth
//     transcription (around "log", around "=", etc.) — far more break
//     points than actually wanted. So this step now does the opposite of
//     the old approach: instead of ADDING new candidates at +/-/fraction-
//     line, it protects (word-joiner-sandwiches) EVERY blank cell by
//     default, and leaves exactly one class of blank cell unprotected:
//     the one immediately before a relational sign (confirmed via nc that
//     every relational sign is emitted as "blank-cell + sign + blank-
//     cell", so the "before" blank cell is always present to use as the
//     break point — matching Rule 26.2(a) and NFB Lesson 15 Example 15-13
//     precisely: the runover line starts WITH the sign, nothing before it
//     carries over).
// Step 2.4 (wordWrap="off") is what makes this protection scheme actually
// hold — see that step's comment for why it was needed in addition to
// this one.
//
// Codepoints (verified against known-correct strings elsewhere in this
// document, not computed by hand — a hand-computed guess for the over/
// under-modifier-start pair was off by 0xC0 the first time this was
// written):
//   ⠣ = over-modifier-start ⠣   ⠩ = under-modifier-start ⠩
//   ⠻ = modifier terminator ⠻   ⠜ = radical open ⠜
//   ⠘ = superscript-start ⠘     ⠰ = subscript-start ⠰
//   ⠐ = baseline-return ⠐       ⠀ = blank braille cell ⠀ (U+2800, NOT the
//       ASCII space U+0020 — an earlier version of this check tested for
//       U+0020, which never matches real braille content at all, so the
//       protection silently did nothing for its intended target)
//   ⠨⠠⠎ = Sigma ⠨⠠⠎   ⠨⠠⠏ = Pi ⠨⠠⠏
//   Relational signs (each confirmed via nc as "blank-cell + sign +
//   blank-cell", sorted longest-match-first below since several share a
//   leading cell — e.g. ≤/≥/≠/≈/≅ each start with the same cell as a
//   shorter sign): ⠈⠱⠈⠱ ≈  ⠈⠱⠨⠅ ≅  ⠐⠅⠱ ≤  ⠨⠂⠱ ≥  ⠌⠨⠅ ≠
//   ⠨⠅ =  ⠐⠅ <  ⠨⠂ >  ⠈⠱ ~  ⠸⠿ ∝  ⠸⠇ ≡
//
// ⠩ is NOT unambiguous on its own: besides Σ/Π's under-limit modifier
// start, this document also uses it — completely unrelated to modifiers
// — as the numerator/denominator separator inside \binom{}{} (delimited
// by ⠷...⠾, which never closes with the modifier terminator ⠻). Treating
// every bare ⠩ as "enter modifier" left that state stuck permanently true
// for the rest of the document the first time a \binom appeared before
// any Σ/Π's ⠻, silently turning later unrelated blank cells into
// protected ones. So ⠩ only opens modifier-protection when it directly
// follows the Σ or Π symbol itself, checked via a trailing 3-character
// buffer carried across run boundaries.
//
// ⠹ (fraction open) is itself overloaded too: it's also the second cell
// of θ (⠨⠹) and Θ (⠨⠠⠹) — found by generating every LaTeX command used in
// this document via nc and scanning outputs for stray ⠹/⠼. A bare ⠹ only
// opens a fraction when NOT immediately preceded by the Greek prefix ⠨
// (lowercase) or ⠨⠠ (uppercase).
//
// Two DISTINCT kinds of "we're inside a construct" state, tracked
// separately because they close differently:
//   - trueModifier (Σ/Π's under/over-limit, vectors, line segments, rays,
//     arcs, radicals — anything opened by ⠣/⠩/⠜): closes ONLY at the
//     explicit terminator ⠻.
//   - inScript (superscript/subscript): per this document's own
//     established rule, no explicit baseline-return indicator is needed
//     when a plain blank cell already follows — closes on EITHER the
//     baseline-return indicator or the first blank cell encountered,
//     whichever comes first.
// fracDepth/groupDepth/absValue (fractions, grouping symbols, absolute
// value) additionally gate whether a relational sign's leading blank cell
// is allowed to break — Rule 26.2's "must not be divided" list covers all
// of these, so a comparison sign that happens to fall inside one of them
// (rare, but possible in e.g. set-builder notation) still may not be used
// as a break point.
// Which paragraphs fall inside the CH10 chemistry chapter — needed below to
// scope the "+" runover candidate (see PLUS_SIGN comment) to chemical
// formulas only, not general algebra. Detected by literal heading text
// rather than pStyle, since that text is unique to the heading paragraph
// itself (verified via grep: appears exactly twice in the built doc — once
// in the bookmark name, once in the heading run — no TOC duplication,
// pandoc's --toc uses a TOC field, not literal repeated heading text).
function computeChemFlags(text) {
  const blocks = text.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  const flags = [];
  let inChem = false;
  for (const block of blocks) {
    if (block.includes('物理定律與公式')) inChem = false; // CH11 heading ends CH10
    const isChemHeading = block.includes('化學式與化學反應式'); // CH10 heading itself
    flags.push(inChem && !isChemHeading);
    if (isChemHeading) inChem = true;
  }
  return flags;
}
{
  const OVER_OPEN = '⠣';
  const UNDER_OPEN = '⠩';
  const RADICAL_OPEN = '⠜';
  const SIGMA_OR_PI_PREFIX = ['⠨⠠⠎', '⠨⠠⠏'];
  const MODIFIER_CLOSE = '⠻';
  const SCRIPT_OPEN = ['⠘', '⠰'];
  const BASELINE_RETURN = '⠐';
  const FRAC_OPEN = '⠹';
  const FRAC_CLOSE = '⠼';
  const GROUP_OPEN = '⠷';
  const GROUP_CLOSE = '⠾';
  const ABS_VALUE = '⠳';
  const BLANK_CELL = '⠀';
  // PLUS_SIGN (⠬, dots 3-4-6): per BANA "Chemical Notation Using the Nemeth
  // Braille Code" 2023 §9.1.2 step b (adapting Rule 26.2), "before a symbol
  // of operation on the baseline" is the second-priority runover site —
  // Example 9-2 shows a real runover breaking exactly there. Chemistry
  // reaction formulas (CaCl2+Na2CO3, no "=" sign at all) often have NO
  // REL_SIGNS candidate anywhere, so without this, Word has nowhere legal
  // to break and falls back to an emergency character-level break mid-word
  // (observed: "...+2NaCl" broke inside "Cl", orphaning the "l"). Scoped to
  // the CH10 chemistry chapter only (chemFlags) — general algebra (CH1-9,
  // CH11) keeps the existing REL_SIGNS-only design per earlier user
  // feedback that operator-based breaks looked messy there. Unlike
  // REL_SIGNS (an existing blank cell that's simply left unprotected),
  // there is no blank cell around "+" between chemical formulas (confirmed
  // against BANA's own Example 9-1: ",CA,C2+2,H,O,H", no space around the
  // "+"), so this needs an inserted zero-width space (not a word-joiner) to
  // create a break OPPORTUNITY that wasn't there before, placed before the
  // sign per Rule 26.2's "before" wording (Example 9-2 confirms the
  // continuation line starts WITH the operator).
  const PLUS_SIGN = '⠬';
  const ZWSP = '​';
  const WJ = '⁠';
  const chemFlags = computeChemFlags(doc);
  let paraIdx = 0;
  // Longest-match-first so e.g. ≤ (⠐⠅⠱) is recognized before its own
  // leading 2 cells get mistaken for a bare < (⠐⠅).
  // ⠫⠕ (the → arrow, dots 1246+135) is included per BANA "Chemical
  // Notation Using the Nemeth Braille Code" 2023 §9.1.2, which explicitly
  // adapts Rule 26.2 for chemistry and lists "before a symbol of
  // comparison" (step a) as covering the reaction/yields arrow — its own
  // Example 9-1 shows a runover breaking exactly there. Safe to add
  // unconditionally (not just inside CH10): every other place this same
  // glyph appears in the document is wrapped in a trueModifier construct
  // (⠣...⠻, the ray/vector arrow — CH3/CH7), which already blocks any
  // REL_SIGNS candidate regardless of this list's contents; verified by
  // grepping every occurrence in the built document before adding this.
  const REL_SIGNS = ['⠈⠱⠈⠱', '⠈⠱⠨⠅', '⠐⠅⠱', '⠨⠂⠱', '⠌⠨⠅', '⠨⠅', '⠐⠅', '⠨⠂', '⠈⠱', '⠸⠿', '⠸⠇', '⠫⠕'];
  let trueModifier = false;
  let inScript = false;
  let fracDepth = 0;
  let groupDepth = 0;
  let absValue = false;
  let trailing = '';
  // Combined regex also matches bare "</w:p>" (paragraph/bullet end) so
  // state can be reset there — Nemeth constructs never span across
  // bullets, so a paragraph boundary is always a safe place to force all
  // flags back to false (guards against any other stuck-state case this
  // reasoning hasn't anticipated).
  let chemMode = chemFlags[0];
  doc = doc.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>|<\/w:p>/g, (full, attrs, text) => {
    if (text === undefined) { trueModifier = false; inScript = false; fracDepth = 0; groupDepth = 0; absValue = false; trailing = ''; paraIdx++; chemMode = chemFlags[paraIdx]; return full; }
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === OVER_OPEN || ch === RADICAL_OPEN) {
        trueModifier = true; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === UNDER_OPEN && SIGMA_OR_PI_PREFIX.includes(trailing)) {
        trueModifier = true; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (SCRIPT_OPEN.includes(ch)) {
        inScript = true; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === MODIFIER_CLOSE) {
        trueModifier = false; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === BASELINE_RETURN) {
        inScript = false; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === FRAC_OPEN && trailing.slice(-1) !== '⠨' && trailing.slice(-2) !== '⠨⠠') {
        fracDepth++; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === FRAC_CLOSE && fracDepth > 0) {
        fracDepth--; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === GROUP_OPEN) {
        groupDepth++; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === GROUP_CLOSE && groupDepth > 0) {
        groupDepth--; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === ABS_VALUE) {
        absValue = !absValue; out += ch; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === BLANK_CELL) {
        // A blank cell always naturally ends a script span (see inScript
        // note above) — close it FIRST, before deciding whether this same
        // blank cell is eligible as a relational-sign break candidate.
        // Evaluating eligibility with the stale (still-true) inScript
        // value was a real bug caught here: "σ² = ..." closes the
        // superscript "2" and immediately precedes "=" via the SAME blank
        // cell, so checking inScript before closing it incorrectly
        // word-joiner-protected the one candidate this whole expression
        // had, leaving it with no break opportunity at all.
        inScript = false;
        const unprotectedConstruct = !trueModifier && fracDepth === 0 && groupDepth === 0 && !absValue;
        const ahead = text.slice(i + 1);
        const beforeRelationalSign = unprotectedConstruct && REL_SIGNS.some(seq => ahead.startsWith(seq));
        if (beforeRelationalSign) {
          // The one deliberately allowed break point: leave this blank
          // cell as a plain, natural candidate. Everything else below
          // gets word-joiner-protected instead.
          out += ch; trailing = (trailing + ch).slice(-3); continue;
        }
        // Sandwich with word-joiners instead of substituting a different
        // "space" character: this suppresses the line-break opportunity
        // here while leaving the blank braille cell's own glyph
        // untouched, so cell-width alignment with the surrounding
        // dot-patterns isn't affected (unlike swapping in e.g. NBSP, a
        // visually different character).
        out += WJ + ch + WJ; trailing = (trailing + ch).slice(-3); continue;
      }
      if (ch === PLUS_SIGN && chemMode && !trueModifier && fracDepth === 0 && groupDepth === 0 && !absValue && !inScript) {
        // inScript excluded: a "+" still inside a superscript is a charge
        // symbol (Na^+), not a baseline operator between formulas — not a
        // valid runover site (Rule 26.2's script-content restriction).
        out += ZWSP + ch; trailing = (trailing + ch).slice(-3); continue;
      }
      out += ch;
      trailing = (trailing + ch).slice(-3);
    }
    return `<w:t${attrs}>${out}</w:t>`;
  });
}
fs.writeFileSync(path.join(WORK, 'word', 'document.xml'), doc, 'utf8');

// 2.7. Rezip this Unicode-braille (with line breaks, no ASCII conversion)
// version into the final 點字版 docx. Previously UNICODE_DOCX was left as
// pandoc's raw untouched output — none of the post-processing below ever
// wrote back to it, only to the ASCII+SimBraille copy. Fixed here so both
// outputs go through the same pipeline.
rezipWorkInto(UNICODE_DOCX);

// Restore the pristine copy for the ASCII-conversion step below.
doc = docPristine;
fs.writeFileSync(path.join(WORK, 'word', 'document.xml'), doc, 'utf8');

// 3. Insert BrailleASCII character style into styles.xml
const stylesPath = path.join(WORK, 'word', 'styles.xml');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('BrailleASCII')) {
  const anchor = 'w:styleId="SectionNumber"';
  const idx = styles.indexOf(anchor);
  const tagStart = styles.lastIndexOf('<w:style', idx);
  const insert = '<w:style w:type="character" w:customStyle="1" w:styleId="BrailleASCII"><w:name w:val="BrailleASCII"/><w:basedOn w:val="BodyTextChar"/><w:rPr><w:rFonts w:ascii="SimBraille" w:hAnsi="SimBraille" w:cs="SimBraille"/><w:sz w:val="28"/></w:rPr></w:style>';
  styles = styles.slice(0, tagStart) + insert + styles.slice(tagStart);
  fs.writeFileSync(stylesPath, styles, 'utf8');
}

// 4. Split runs: braille segments get the BrailleASCII style + ASCII text
function xmlEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
doc = doc.replace(runRe, (full, inner) => {
  const tMatch = inner.match(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/);
  if (!tMatch) return full;
  const text = tMatch[2];
  brailleRe.lastIndex = 0;
  if (!brailleRe.test(text)) return full;
  brailleRe.lastIndex = 0;
  const parts = [];
  let lastIndex = 0, mm;
  while ((mm = brailleRe.exec(text))) {
    if (mm.index > lastIndex) parts.push({ t: 'text', v: text.slice(lastIndex, mm.index) });
    parts.push({ t: 'braille', v: map[mm[0]] });
    lastIndex = mm.index + mm[0].length;
  }
  if (lastIndex < text.length) parts.push({ t: 'text', v: text.slice(lastIndex) });
  return parts.map(p => p.v.length === 0 ? '' :
    p.t === 'braille'
      ? `<w:r><w:rPr><w:rStyle w:val="BrailleASCII"/></w:rPr><w:t xml:space="preserve">${xmlEscape(p.v)}</w:t></w:r>`
      : `<w:r><w:t xml:space="preserve">${xmlEscape(p.v)}</w:t></w:r>`
  ).join('');
});
fs.writeFileSync(path.join(WORK, 'word', 'document.xml'), doc, 'utf8');

// 4.5. Same "+" runover candidate as Unicode step 2.6 (see its comment for
// the BANA §9.1.2 justification), reimplemented for the ASCII+SimBraille
// text since that output gets NONE of step 2.6's protection (docPristine
// note above — word-joiners there would fragment the braille_map lookup
// this file's step 4 just did). This is the version that actually fixed
// the user-reported bug: a chemistry reaction with no "=" sign had no
// legal Word break point at all, and Word's fallback broke mid-letter
// (inside "Cl", orphaning the "l"). ZWSP (not word-joiner) is used because
// there's no existing blank cell around chemistry "+" to leave unprotected
// — this creates a break OPPORTUNITY that wasn't there before. Only
// BrailleASCII-styled runs are touched (the fixed-shape template step 4
// always emits), and only the "+" character itself (nc's own ASCII plus
// sign) — excluding one preceded by "^" (a charge like Na^+, not a
// baseline operator between formulas, Rule 26.2's script-content
// restriction). No fraction/group/abs-value exclusion here unlike step
// 2.6: CH10's chemistry formulas are flat (no nested fractions/radicals),
// so those states never arise in this content.
{
  const chemFlagsAscii = computeChemFlags(doc);
  let paraIdx2 = 0;
  let chemMode2 = chemFlagsAscii[0];
  const ZWSP = '​';
  doc = doc.replace(/<w:r><w:rPr><w:rStyle w:val="BrailleASCII"\/><\/w:rPr><w:t([^>]*)>([\s\S]*?)<\/w:t><\/w:r>|<\/w:p>/g, (full, attrs, text) => {
    if (text === undefined) { paraIdx2++; chemMode2 = chemFlagsAscii[paraIdx2]; return full; }
    if (!chemMode2 || text.indexOf('+') === -1) return full;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += (ch === '+' && text[i - 1] !== '^') ? ZWSP + ch : ch;
    }
    return `<w:r><w:rPr><w:rStyle w:val="BrailleASCII"/></w:rPr><w:t${attrs}>${out}</w:t></w:r>`;
  });
  fs.writeFileSync(path.join(WORK, 'word', 'document.xml'), doc, 'utf8');
}

// 5. Rezip into the ASCII+SimBraille docx.
rezipWorkInto(ASCII_DOCX);

fs.rmSync(WORK, { recursive: true, force: true });
console.log('Done:');
console.log(' -', UNICODE_DOCX);
console.log(' -', ASCII_DOCX);
