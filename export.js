/* Экспорт журнала: DOCX (Word) и PDF без внешних библиотек. © 2026 Елена Кирсанова */
'use strict';
(function () {
  const enc = new TextEncoder();

  /* ---------------- ZIP (store) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const [name, data] of files) {
      const nb = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nb);
      off += 30 + nb.length + d.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------------- DOCX ---------------- */
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function runs(text, bold, size, color) {
    return String(text || '').split('\n').map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size || 20}"/></w:rPr><w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
  }
  function para(text, opt = {}) { return `<w:p><w:pPr>${opt.center ? '<w:jc w:val="center"/>' : ''}<w:spacing w:after="${opt.after ?? 120}"/></w:pPr>${runs(text, opt.bold, opt.size, opt.color)}</w:p>`; }
  function docx(title, subtitle, head, rows, widths, footer) {
    const total = 15000, tw = widths.map(w => Math.round(w * total));
    /* строка может быть помечена red=true (например, отменённая сессия) — красный фон и текст */
    const cell = (t, i, hdr, red) => `<w:tc><w:tcPr><w:tcW w:w="${tw[i]}" w:type="dxa"/>${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="E3EBE6"/>' : red ? '<w:shd w:val="clear" w:color="auto" w:fill="FDE4E1"/>' : ''}</w:tcPr>${para(t, { bold: hdr, size: 18, after: 0, color: red ? 'B42318' : '' })}</w:tc>`;
    const tbl = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:color="A8B5AE"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>
      <w:tblGrid>${tw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
      <w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, i, true)).join('')}</w:tr>
      ${rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, false, r.red)).join('')}</w:tr>`).join('')}</w:tbl>`;
    const body = para(title, { bold: true, size: 32, after: 60 }) + para(subtitle, { size: 20, after: 200 }) + tbl + para('', {}) + para(footer, { size: 16 });
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['word/document.xml', doc],
      ['word/styles.xml', styles]
    ]);
  }

  /* ---------------- PDF ---------------- */
  function parseTTF(buf) {
    const v = new DataView(buf), n = v.getUint16(4), tables = {};
    for (let i = 0; i < n; i++) { const o = 12 + i * 16; tables[String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))] = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) }; }
    const upm = v.getUint16(tables.head.off + 18);
    const asc = v.getInt16(tables.hhea.off + 4), desc = v.getInt16(tables.hhea.off + 6), nHM = v.getUint16(tables.hhea.off + 34);
    const widths = []; for (let i = 0; i < nHM; i++) widths.push(v.getUint16(tables.hmtx.off + i * 4));
    const cm = tables.cmap.off, nsub = v.getUint16(cm + 2); let f4 = 0;
    for (let i = 0; i < nsub; i++) { const pid = v.getUint16(cm + 4 + i * 8), eid = v.getUint16(cm + 6 + i * 8), so = v.getUint32(cm + 8 + i * 8); if (pid === 3 && eid === 1 && v.getUint16(cm + so) === 4) f4 = cm + so; }
    const segX2 = v.getUint16(f4 + 6), segs = segX2 / 2, endO = f4 + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    const cache = {};
    function gid(cp) {
      if (cache[cp] !== undefined) return cache[cp];
      let g = 0;
      for (let i = 0; i < segs; i++) {
        const end = v.getUint16(endO + i * 2); if (cp > end) continue;
        const start = v.getUint16(startO + i * 2); if (cp < start) break;
        const delta = v.getInt16(deltaO + i * 2), ro = v.getUint16(rangeO + i * 2);
        if (ro === 0) g = (cp + delta) & 0xFFFF; else { const gi = v.getUint16(rangeO + i * 2 + ro + (cp - start) * 2); g = gi ? (gi + delta) & 0xFFFF : 0; }
        break;
      }
      return cache[cp] = g;
    }
    const adv = g => (widths[g < nHM ? g : nHM - 1] * 1000) / upm;
    return { gid, adv, asc: asc * 1000 / upm, desc: desc * 1000 / upm, bytes: new Uint8Array(buf) };
  }

  async function pdf(title, subtitle, head, rows, widths, footer) {
    const font = parseTTF(await fetch('fonts/DejaVuSans.ttf').then(r => r.arrayBuffer()));
    const W = 842, H = 595, M = 36, used = new Map();
    const tw = (s, sz) => { let w = 0; for (const ch of s) { const g = font.gid(ch.codePointAt(0)); used.set(g, ch.codePointAt(0)); w += font.adv(g); } return w * sz / 1000; };
    const hex = s => { let h = ''; for (const ch of s) { const g = font.gid(ch.codePointAt(0)); used.set(g, ch.codePointAt(0)); h += g.toString(16).padStart(4, '0'); } return h; };
    function wrap(text, sz, maxw) {
      const out = [];
      String(text || '').split('\n').forEach(par => {
        let line = '';
        par.split(/(\s+)/).forEach(word => {
          if (!word) return;
          const t = line + word;
          if (tw(t.trimEnd(), sz) <= maxw) { line = t; return; }
          if (line.trim()) out.push(line.trimEnd());
          line = word.trimStart();
          while (tw(line, sz) > maxw) { let k = line.length; while (k > 1 && tw(line.slice(0, k), sz) > maxw) k--; out.push(line.slice(0, k)); line = line.slice(k); }
        });
        out.push(line.trimEnd());
      });
      return out.length ? out : [''];
    }
    const pages = []; let ops = [];
    const text = (s, xx, yy, sz, rgb) => { if (!s) return; ops.push(`BT ${rgb || '0.16 0.16 0.15'} rg /F1 ${sz} Tf ${xx.toFixed(2)} ${yy.toFixed(2)} Td <${hex(s)}> Tj ET`); };
    const rect = (xx, yy, w, h, fill) => ops.push(`${fill ? fill + ' rg ' : ''}${xx.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill ? 'B' : 'S'}`);
    const cw = widths.map(w => w * (W - 2 * M)), FS = 8.5, LH = 11, PAD = 4;
    let y;
    const newPage = first => {
      if (ops.length) pages.push(ops);
      ops = ['0.66 0.71 0.68 RG 0.5 w']; y = H - M;
      if (first) { text(title, M, y - 16, 16); text(subtitle, M, y - 32, 9, '0.42 0.41 0.38'); y -= 46; }
      const hl = head.map((h, i) => wrap(h, FS, cw[i] - 2 * PAD)); const hh = Math.max(...hl.map(l => l.length)) * LH + 2 * PAD;
      let xx = M; head.forEach((h, i) => { rect(xx, y - hh, cw[i], hh, '0.89 0.92 0.90'); hl[i].forEach((ln, k) => text(ln, xx + PAD, y - PAD - (k + 1) * LH + 2.5, FS)); xx += cw[i]; });
      y -= hh;
    };
    newPage(true);
    for (const r of rows) {
      const lines = r.map((c, i) => wrap(c, FS, cw[i] - 2 * PAD));
      let rh = Math.max(...lines.map(l => l.length)) * LH + 2 * PAD;
      if (y - rh < M + 14) newPage(false);
      if (rh > y - M - 14) rh = y - M - 14; // очень длинная запись — обрезается по высоте страницы
      let xx = M;
      r.forEach((c, i) => { rect(xx, y - rh, cw[i], rh, r.red ? '0.99 0.89 0.88' : ''); lines[i].slice(0, Math.floor((rh - 2 * PAD) / LH)).forEach((ln, k) => text(ln, xx + PAD, y - PAD - (k + 1) * LH + 2.5, FS, r.red ? '0.71 0.14 0.09' : '')); xx += cw[i]; });
      y -= rh;
    }
    text(footer, M, M - 14, 7.5, '0.42 0.41 0.38');
    pages.push(ops);

    // assemble PDF
    const objs = []; const add = o => (objs.push(o), objs.length);
    const catalog = add(null), pagesId = add(null), fontId = add(null), cidId = add(null), descId = add(null), fileId = add(null), tuId = add(null);
    const pageIds = [];
    pages.forEach((p, i) => {
      const content = p.join('\n') + `\nBT 0.42 0.41 0.38 rg /F1 7.5 Tf ${(W - M - 30).toFixed(2)} ${(M - 14).toFixed(2)} Td <${hex(String(i + 1) + ' / ' + pages.length)}> Tj ET`;
      const cId = add({ stream: enc.encode(content) });
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${cId} 0 R >>`));
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
    objs[fontId - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSans /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${tuId} 0 R >>`;
    const gids = [...used.keys()].sort((a, b) => a - b);
    objs[cidId - 1] = `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /CIDToGIDMap /Identity /DW 600 /W [${gids.map(g => `${g} [${Math.round(font.adv(g))}]`).join(' ')}] >>`;
    objs[descId - 1] = `<< /Type /FontDescriptor /FontName /DejaVuSans /Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent ${Math.round(font.asc)} /Descent ${Math.round(font.desc)} /CapHeight 729 /StemV 80 /FontFile2 ${fileId} 0 R >>`;
    objs[fileId - 1] = { stream: font.bytes, extra: `/Length1 ${font.bytes.length}` };
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n` +
      chunk(gids, 100).map(c => `${c.length} beginbfchar\n${c.map(g => `<${g.toString(16).padStart(4, '0')}> <${used.get(g).toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar`).join('\n') + `\nendcmap CMapName currentdict /CMap defineresource pop end end`;
    objs[tuId - 1] = { stream: enc.encode(cmap) };
    const out = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]; let pos = out[0].length; const xref = [];
    objs.forEach((o, i) => {
      xref.push(pos);
      let chunkParts;
      if (typeof o === 'string') chunkParts = [enc.encode(`${i + 1} 0 obj\n${o}\nendobj\n`)];
      else chunkParts = [enc.encode(`${i + 1} 0 obj\n<< /Length ${o.stream.length} ${o.extra || ''} >>\nstream\n`), o.stream, enc.encode('\nendstream\nendobj\n')];
      chunkParts.forEach(c => { out.push(c); pos += c.length; });
    });
    const xr = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + xref.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF`;
    out.push(enc.encode(xr));
    return new Blob(out, { type: 'application/pdf' });
  }
  function chunk(a, n) { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }

  window.Exporter = { docx, pdf };
})();
