import React, { useMemo, useRef, useState, useEffect} from "react";

/* =========================================================
   THEME & UTIL
   ========================================================= */
const THEME = {
  accent: "#F7C7C4",
  accentStrong: "#E59E9A",
  ring: "#FBE6E5",
  ring2: "#F3D1CF",
};
const DEFAULT_TTD = "/andi-ttd.jpeg"; // pastikan ada di /public

const JENIS_SURVEI = [
  { value: "keterjaminan", label: "Keterjaminan Korban" },
  { value: "keabsahan_waris", label: "Keabsahan Ahli Waris" },
  { value: "keabsahan_biaya", label: "Keabsahan Biaya Perawatan" },
  { value: "lainnya", label: "Lainnya" },
];

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
async function fileToDataURL(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function toDataURL(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("not found");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}
function openPrintIframe(srcdoc) {
  const ifr = document.createElement("iframe");
  ifr.style.position = "fixed";
  ifr.style.right = "0";
  ifr.style.bottom = "0";
  ifr.style.width = "0";
  ifr.style.height = "0";
  ifr.style.border = "0";
  document.body.appendChild(ifr);
  ifr.onload = () => {
    setTimeout(() => {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
      setTimeout(() => document.body.removeChild(ifr), 600);
    }, 250);
  };
  ifr.srcdoc = srcdoc;
}
function downloadAs(filename, mime, data) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/* =========================================================
   MIC (Speech-to-Text)
   ========================================================= */
function Mic({ onText, title = "Dikte" }) {
  const recRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung Speech Recognition.");
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
    const r = new SR();
    r.lang = "id-ID";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onText?.(e.results[0][0].transcript);
    r.onend = () => (recRef.current = null);
    recRef.current = r;
    r.start();
  };
  return (
    <button type="button" className="btn mic" onClick={start} title={title} aria-label="Dikte">
      🎤
    </button>
  );
}

/* =========================================================
   HALAMAN: HASIL SURVEI
   ========================================================= */
export default function HasilSurvey({ data = {}, setData, next, back, playBeep }) {
  useEffect(() => {
    localStorage.clear();
    console.log("LocalStorage dikosongkan saat halaman dimuat");
  }, []);

  // ambil isian global dari parent (Step2/Step3)
  const set = (k) => (e) => setData?.({ ...data, [k]: e.target.value });

  // tanda tangan & preferensi
  const ttdMode = data.ttdModeSurvey || "image"; // "image" | "none"
  const setTtdMode = (m) => setData?.({ ...data, ttdModeSurvey: m });

  // Sumber Informasi dinamis
  const [sumbers, setSumbers] = useState(
    data.sumbers || [{ id: Date.now(), identitas: "", ttd: "" }]
  );
  const addRow = () => setSumbers((r) => [...r, { id: Date.now(), identitas: "", ttd: "" }]);
  const delRow = (id) => setSumbers((r) => r.filter((x) => x.id !== id));
  const setRow = (id, key, val) =>
    setSumbers((r) => r.map((x) => (x.id === id ? { ...x, [key]: val } : x)));

  // lampiran
  const att = data.attachSurvey || {};
  const setAtt = (obj) => setData?.({ ...data, attachSurvey: { ...(data.attachSurvey || {}), ...obj } });
  const pushFotos = async (files) => {
    const list = Array.from(files || []);
    const arr = (att.fotoSurvey || []).slice();
    for (const f of list) arr.push({ name: f.name, file: f, url: await fileToDataURL(f) });
    setAtt({ fotoSurvey: arr });
  };

  useEffect(() => {
    const filesNeeded = [
      { key: "ktp", label: "KTP Korban" },
      { key: "kk", label: "Kartu Keluarga (KK)" },
      { key: "bukuTabungan", label: "Buku Tabungan Korban" },
      { key: "formPengajuan", label: "Formulir Pengajuan Santunan Jasaraharja" },
      { key: "formKeteranganAW", label: "Formulir Keterangan Ahli Waris" },
      { key: "skKematian", label: "Surat Keterangan Kematian" },
      { key: "aktaKelahiran", label: "Akta Kelahiran" },
      // { key: "lhsFile", label: "Laporan Hasil Survei" },
    ];

    filesNeeded.forEach(f => {
      console.log(`Cek dokumen ${f.label}:`, att[f.key] ? "✔ Terunggah" : "⛔ Belum diunggah");
    });

    localStorage.setItem("hasilSurveyData", JSON.stringify(att));

    console.log("Cek fotoSurveyList:", (att.fotoSurvey || []).length ? "✔ Terunggah" : "⛔ Belum diunggah");
  }, [att]);


  const sifatCidera = data.sifatCidera || ""; // "MD" | "LL"
  const jenisSurvei = data.jenisSurvei || ""; // dari Step2

  const v = {
    // header
    noPL: data.noPL || "",
    hariTanggal: data.hariTanggal || "", // date
    petugasSurvei: data.petugas || data.petugasSurvei || "",
    jenisSurvei,
    jenisSurveiLainnya: data.jenisSurveiLainnya || "",
    // korban
    namaKorban: data.korban || "",
    noBerkas: data.noBerkas || "",
    alamatKorban: data.alamatKorban || "",
    tempatKecelakaan: data.tempatKecelakaan || data.lokasiKecelakaan || "",
    tanggalKecelakaan: data.tanggalKecelakaan || "",
    // Dukcapil check
    hubunganSesuai: data.hubunganSesuai ?? "",
    uraian: data.uraianSurvei || "",
    kesimpulan: data.kesimpulanSurvei || "",

    // Mengetahui
    pejabatMengetahuiName: data.pejabatMengetahuiName || "Andi Raharja, S.A.B",
    pejabatMengetahuiJabatan: data.pejabatMengetahuiJabatan || "Kepala Bagian Operasional",
    pejabatMengetahuiTtd: data.pejabatMengetahuiTtd || "",
  };

  // validasi dasar untuk “Selanjutnya”
  const canNext = useMemo(() => {
    const base =
      v.petugasSurvei.trim() &&
      (v.hariTanggal || "").toString().length > 0 &&
      v.namaKorban.trim() &&
      v.tempatKecelakaan.trim();
    // lampiran wajib
    if (sifatCidera === "MD") {
      const needed = [
        "ktp",
        "bukuTabungan",
        "formPengajuan",
        "formKeteranganAW",
        "skKematian",
        "kk",
        "aktaKelahiran",
        // "lhsFile",
      ];
      const ok = needed.every((k) => !!att[k]) && (att.fotoSurvey || []).length > 0;
      return base && ok;
    }
    if (sifatCidera === "LL") {
      return base && (att.fotoSurvey || []).length > 0;
    }
    return base;
  }, [v, att, sifatCidera, sumbers]);

  const onUploadTtd = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataURL = await fileToDataURL(f);
    setData?.({ ...data, pejabatMengetahuiTtd: dataURL, ttdModeSurvey: "image" });
  };

  /* =================== CETAK & DOWNLOAD =================== */
  const buildHTML = async (mode = "print") => {
    let ttdData = null;
    if (ttdMode === "image") {
      ttdData =
        v.pejabatMengetahuiTtd ||
        (await toDataURL(DEFAULT_TTD).catch(() => null));
    }

    const forPrint = { ...v, ttdSrc: ttdData || null, sumbers, sifatCidera };
    return mode === "print" ? makePrintHTML(forPrint) : makeDocHTML(forPrint);
  };

  const handlePrint = async () => {
    try {
      playBeep?.();
      const srcdoc = await buildHTML("print");
      openPrintIframe(srcdoc);
    } catch (e) {
      console.error(e);
      alert("Gagal menyiapkan PDF: " + e.message);
    }
  };

  const handleDownloadDoc = async () => {
    try {
      const html = await buildHTML("doc");
      downloadAs("Laporan_Hasil_Survei_AW.doc", "application/msword;charset=utf-8", html);
    } catch (e) {
      console.error(e);
      alert("Gagal menyiapkan dokumen: " + e.message);
    }
  };

  const handleNext = () => {
    if (!canNext) return alert("Lengkapi isian & lampiran wajib terlebih dahulu.");
    // simpan row sumber ke parent
    setData?.({ ...data, sumbers });
    playBeep?.();
    next?.();
  };

  // useEffect(() => {
  //   setData((prev) => ({ ...prev, uraianSurvei: prev.uraian }));
  // }, [data.uraian]);

  /* =================== RENDER =================== */
  return (
    <div className="sv-wrap container">
      <div className="head">
        <div>
          <h2 className="title">Laporan Hasil Survei (Ahli Waris)</h2>
          <div className="chips">
            <span className="chip">Langkah 3/5</span>
            <span className="chip alt">Sifat Cidera: {sifatCidera || "—"}</span>
            <span className="chip alt">
              Jenis Survei:{" "}
              {JENIS_SURVEI.find((j) => j.value === jenisSurvei)?.label ||
                (data.jenisSurveiLainnya ? `Lainnya: ${data.jenisSurveiLainnya}` : "—")}
            </span>
          </div>
        </div>
        {/* <div className="right-controls">
          <button type="button" className="btn ghost" onClick={handleDownloadDoc}>Download Dokumen</button>
          <button type="button" className="btn ghost" onClick={handlePrint}>Cetak PDF</button>
        </div> */}
      </div>

      {/* HEADER FORM (No, Tanggal, Petugas, Jenis Survei) */}
      <section className="card">
        <div className="row">
          <div>
            <label className="label">No. LP</label>
            <input className="input" value={v.noPL} onChange={set("noPL")} placeholder="LP/...." />
          </div>
          <div>
            <label className="label">Hari/Tanggal Survei</label>
            <input
              type="date"
              className="input"
              value={v.hariTanggal}
              onChange={set("hariTanggal")}
            />
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Petugas Survei <small className="hint">• Dikte</small></label>
            <div className="with-mic">
              <input className="input" value={v.petugasSurvei} onChange={set("petugasSurvei")} />
              <Mic onText={(t) => setData?.({ ...data, petugasSurvei: `${v.petugasSurvei} ${t}`.trim() })} />
            </div>
          </div>
          <div>
            <label className="label">Jenis Survei</label>
            <div className="seg">
              {JENIS_SURVEI.map((j) => (
                <label key={j.value} className={`pill ${jenisSurvei === j.value ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="jenis"
                    checked={jenisSurvei === j.value}
                    onChange={() =>
                      setData?.({
                        ...data,
                        jenisSurvei: j.value,
                        jenisSurveiLainnya: j.value === "lainnya" ? data.jenisSurveiLainnya || "" : "",
                      })
                    }
                  />
                  <span>{j.label}</span>
                </label>
              ))}
            </div>
            {jenisSurvei === "lainnya" && (
              <input
                className="input"
                placeholder="Tuliskan jenis survei lainnya…"
                value={data.jenisSurveiLainnya || ""}
                onChange={set("jenisSurveiLainnya")}
              />
            )}
          </div>
        </div>
      </section>

      {/* DATA KORBAN */}
      <section className="card">
        {/* Baris 1: Nama & No. Berkas */}
        <div className="row-auto-2">
          <div>
            <label className="label">
              Nama Korban <small className="hint">• Dikte</small>
            </label>
            <div className="with-mic">
              <input
                className="input"
                value={v.namaKorban}
                onChange={set("namaKorban")}
              />
              <Mic
                onText={(t) =>
                  setData?.({
                    ...data,
                    namaKorban: `${v.namaKorban} ${t}`.trim(),
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="label">No. Berkas</label>
            <input
              className="input"
              value={v.noBerkas}
              onChange={set("noBerkas")}
            />
          </div>
        </div>

        {/* Baris 2: Alamat full width */}
        <div className="row-auto-1">
          <div>
            <label className="label">
              Alamat Korban <small className="hint">• Dikte</small>
              {/* Ikon info */}
              <span
                className="info-icon cursor-pointer text-blue-500"
                title={`Mohon tuliskan alamat sejelas mungkin, meliputi:\n\n- Nama jalan\n- Kelurahan & Kecamatan\n- Titik koordinat`}
              >
                ℹ️
              </span>
            </label>
            <div className="with-mic">
              <textarea
                className="textarea"
                rows={3}
                value={v.alamatKorban}
                onChange={set("alamatKorban")}
              />
              <Mic
                onText={(t) =>
                  setData?.({
                    ...data,
                    alamatKorban: `${v.alamatKorban} ${t}`.trim(),
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Baris 3: Tempat, Tanggal, Kesesuaian – auto-fit */}
        <div className="row-auto-3">
          <div>
            <label className="label">
              Tempat Kecelakaan <small className="hint">• Dikte</small>
              {/* Ikon info */}
              <span
                className="info-icon cursor-pointer text-blue-500"
                title={`Mohon tuliskan alamat sejelas mungkin, meliputi:\n\n- Nama jalan\n- Dekat toko/gedung terkenal\n- Kelurahan & Kecamatan\n- Titik koordinat`}
              >
                ℹ️
              </span>
            </label>
            <div className="with-mic">
              <textarea
                className="textarea"
                rows={3}
                value={v.tempatKecelakaan}
                onChange={set("tempatKecelakaan")}
              />
              <Mic
                onText={(t) =>
                  setData?.({
                    ...data,
                    tempatKecelakaan: `${v.tempatKecelakaan} ${t}`.trim(),
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="label">Tanggal Kecelakaan</label>
            <input
              type="date"
              className="input"
              value={data.tanggalKecelakaan}
              onChange={set("tanggalKecelakaan")}
            />
          </div>

          <div>
            <label className="label">Kesesuaian Hubungan AW</label>
            <select
              className="select"
              value={v.hubunganSesuai === "" ? "" : v.hubunganSesuai ? "sesuai" : "tidak"}
              onChange={(e) =>
                setData?.({
                  ...data,
                  hubunganSesuai: e.target.value === "sesuai",
                })
              }
            >
              <option value="">— Pilih —</option>
              <option value="sesuai">Sesuai</option>
              <option value="tidak">Tidak Sesuai</option>
            </select>
          </div>
        </div>
      </section>

      {/* SUMBER INFORMASI */}
      <section className="card">
        <div className="label">Sumber Informasi</div>
        <div className="table-like">
          <div className="th">No</div>
          <div className="th">Identitas/Detil Sumber Informasi & Metode Perolehan</div>
          <div className="th">Foto (Survei / Saksi Mata)</div>

          {sumbers.map((r, idx) => (
            <React.Fragment key={r.id}>
              <div className="td no">{idx + 1}</div>

              <div className="td">
                <textarea
                  className="textarea"
                  rows={2}
                  value={r.identitas}
                  onChange={(e) => setRow(r.id, "identitas", e.target.value)}
                />
              </div>

              <div className="td">
                {/* Upload foto */}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    Promise.all(
                      files.map(
                        (f) =>
                          new Promise((res) => {
                            const reader = new FileReader();
                            reader.onload = () => res(reader.result);
                            reader.onerror = () => res("");
                            reader.readAsDataURL(f);
                          })
                      )
                    ).then((list) => setRow(r.id, "foto", list.filter(Boolean)));
                  }}
                />

                {/* Preview foto (jika ada) */}
                {r.foto && Array.isArray(r.foto) && r.foto.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {r.foto.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`foto-${i}`}
                        style={{ width: "80px", height: "auto", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    ))}
                  </div>
                )}

                {sumbers.length > 1 && (
                  <button
                    className="btn small"
                    onClick={() => delRow(r.id)}
                    style={{ marginTop: 6 }}
                  >
                    Hapus
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn ghost" onClick={addRow}>
            + Tambah Baris
          </button>
        </div>
      </section>

      {/* URAIAN & KESIMPULAN */}
      <section className="card">
        <label className="label">
          Uraian & Kesimpulan Hasil Survei <small className="hint">• Dikte</small>
          {/* Ikon info */}
          <span
            className="info-icon cursor-pointer text-blue-500"
            title={`Tuliskan hasil survei secara ringkas dan jelas, meliputi:\n\n• Nomor polisi / plat kendaraan yang terlibat\n• Nama lokasi kejadian (jalan, kelurahan, kecamatan)\n• Nama pengendara dan korban\n• Jenis kendaraan yang terlibat\n• Kronologi singkat kejadian\n• Hasil pemeriksaan atau keterangan RS (bila ada)\n• Kesimpulan akhir apakah korban terjamin atau tidak`}
          >
            ℹ️
          </span>
        </label>
        <div className="with-mic">
          <textarea
            className="textarea"
            rows={6}
            value={v.uraian}
            onChange={(e) =>
              setData(prev => ({
                ...prev,
                uraian: e.target.value,
                uraianSurvei: e.target.value,
              }))
            }
          />
          <Mic
            onText={(t) =>
              setData((prev) => ({
                ...prev,
                uraian: `${prev.uraian || ""} ${t}`.trim(),
                uraianSurvei: `${prev.uraianSurvei || ""} ${t}`.trim(), // kalau kamu tetap mau simpan juga
              }))
            }
          />
        </div>
      </section>

      {/* LAMPIRAN */}
      <section className="card">
        <div className="label">Lampiran</div>
        {sifatCidera === "MD" && (
          <div className="grid-attach">
            <FilePick label="KTP" onPick={(f) => setAtt({ ...att, ktp: f })} file={att.ktp} />
            <FilePick label="Buku Tabungan" onPick={(f) => setAtt({ ...att, bukuTabungan: f })} file={att.bukuTabungan} />
            <FilePick label="Formulir Pengajuan Santunan" onPick={(f) => setAtt({ ...att, formPengajuan: f })} file={att.formPengajuan} />
            <FilePick label="Formulir Keterangan Ahli Waris" onPick={(f) => setAtt({ ...att, formKeteranganAW: f })} file={att.formKeteranganAW} />
            <FilePick label="Surat Keterangan Kematian" onPick={(f) => setAtt({ ...att, skKematian: f })} file={att.skKematian} />
            <FilePick label="Kartu Keluarga (KK)" onPick={(f) => setAtt({ ...att, kk: f })} file={att.kk} />
            <FilePick label="Akta Kelahiran" onPick={(f) => setAtt({ ...att, aktaKelahiran: f })} file={att.aktaKelahiran} />
            {/* <FilePick label="Laporan Hasil Survei (file)" onPick={(f) => setAtt({ ...att, lhsFile: f })} file={att.lhsFile} /> */}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <label className="label">Foto Survey (boleh banyak, tanpa batas)</label>
          <input type="file" accept="image/*" multiple onChange={(e) => pushFotos(e.target.files)} />
          {!!(att.fotoSurvey || []).length && (
            <div className="thumbs">
              {(att.fotoSurvey || []).map((x, i) => (
                <img key={i} src={x.url} alt={x.name} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TTD & PEJABAT
      <section className="card">
        <div className="row">
          <div>
            <label className="label">Pejabat Mengetahui</label>
            <div className="row">
              <div>
                <label className="label">Nama</label>
                <input className="input" value={v.pejabatMengetahuiName} onChange={set("pejabatMengetahuiName")} />
              </div>
              <div>
                <label className="label">Jabatan</label>
                <input className="input" value={v.pejabatMengetahuiJabatan} onChange={set("pejabatMengetahuiJabatan")} />
              </div>
            </div>
          </div>
        </div>
      </section> */}

      {/* AKSI */}
      <div className="actions">
        <button className="btn ghost" onClick={back}>Kembali</button>
        <button className="btn rose" onClick={handleNext} disabled={!canNext}>Selanjutnya</button>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* =========================================================
   KOMPONEN BANTUAN
   ========================================================= */
function FilePick({ label, onPick, file }) {
  return (
    <div className="filepick">
      <div className="label">{label}</div>
      <input type="file" onChange={(e) => onPick(e.target.files?.[0] || null)} />
      {file && <div className="helper">• {file.name}</div>}
    </div>
  );
}

/* =========================================================
   BUILDER HTML CETAK & WORD
   ========================================================= */
function makePrintHTML(v) {
  const tableRows = v.sumbers
    .map(
      (r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${escapeHtml(r.identitas || "")}</td>
        <td>${escapeHtml(r.ttd || "")}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
  @page { size: A4; margin: 12mm; }
  body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; margin:0;
        font-family: "Times New Roman", Times, serif; color:#000; }
  h1{ font-size: 18pt; margin:0 0 2mm; text-align:center; }
  h2{ font-size: 12pt; margin:0 0 6mm; text-align:center; }
  .kv{ display:grid; grid-template-columns: 54mm 6mm 1fr; row-gap:2mm; column-gap:2mm; margin-bottom:6mm; font-size:11pt }
  .box{ border:0.3mm solid #000; padding:2.4mm; white-space:pre-wrap; min-height:18mm }
  table{ width:100%; border-collapse:collapse; margin:4mm 0 6mm; font-size:11pt }
  td,th{ border:0.3mm solid #000; padding:2mm 2.4mm; vertical-align:top }
  .signs{ display:grid; grid-template-columns:1fr 1fr; column-gap:28mm; margin-top:10mm }
  .lbl{ margin-bottom: 10mm }
  .space{ height: 28mm }
  .sign-img{ max-height: 28mm }
  .name{ font-weight:bold; text-decoration:underline; }
  </style></head><body>
  <h1>LAPORAN HASIL SURVEI</h1>
  <h2>APLIKASI MOBILE PELAYANAN</h2>

  <div class="kv">
    <div>No. PL</div><div>:</div><div>${escapeHtml(v.noPL || "-")}</div>
    <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(fmtDate(v.hariTanggal))}</div>
    <div>Petugas Survei</div><div>:</div><div>${escapeHtml(v.petugasSurvei || "-")}</div>
    <div>Jenis Survei</div><div>:</div><div>${escapeHtml(v.jenisSurvei || "")} ${escapeHtml(v.jenisSurvei === "lainnya" ? (v.jenisSurveiLainnya || "") : "")}</div>

    <div>Nama Korban</div><div>:</div><div>${escapeHtml(v.namaKorban || "-")}</div>
    <div>No. Berkas</div><div>:</div><div>${escapeHtml(v.noBerkas || "-")}</div>
    <div>Alamat Korban</div><div>:</div><div>${escapeHtml(v.alamatKorban || "-")}</div>
    <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(v.tempatKecelakaan || "-")} / ${escapeHtml(fmtDate(v.tanggalKecelakaan))}</div>
    <div>Kesesuaian Hubungan AW</div><div>:</div><div>${v.hubunganSesuai === "" ? "-" : (v.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")}</div>
  </div>

  <div style="font-weight:bold;margin:0 0 2mm">Sumber Informasi :</div>
  <table>
    <thead><tr><th style="width:10mm">No</th><th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th><th style="width:35mm">Tanda Tangan</th></tr></thead>
    <tbody>${tableRows || '<tr><td style="text-align:center">1</td><td></td><td></td></tr>'}</tbody>
  </table>

  <div style="font-weight:bold;margin:0 0 2mm">Uraian & Kesimpulan Hasil Survei :</div>
  <div class="box">${escapeHtml(v.uraian || "")}</div>

  <p style="margin:6mm 0 10mm;font-size:11pt">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </p>

  <div class="signs">
    <div>
      <div class="lbl">Mengetahui,</div>
      <div class="space"></div>
      <div class="name">${escapeHtml(v.pejabatMengetahuiName)}</div>
      <div>${escapeHtml(v.pejabatMengetahuiJabatan)}</div>
    </div>
    <div>
      <div class="lbl">Petugas Survei,</div>
      <div class="space"></div>
      <div class="name">${escapeHtml(v.petugasSurvei || "........................................")}</div>
    </div>
  </div>
  </body></html>`;
}

function makeDocHTML(v) {
  const esc = (x = "") => escapeHtml(x);
  const kvRow = (label, value) => `
    <tr>
      <td style="width:170pt;padding:3pt 4pt;vertical-align:top">${label}</td>
      <td style="width:10pt;padding:3pt 0;vertical-align:top">:</td>
      <td style="padding:3pt 4pt;vertical-align:top;border-bottom:0.6pt dotted #000">${value}</td>
    </tr>`;

  const kv = [
    kvRow("No. PL", esc(v.noPL || "-")),
    kvRow("Hari/Tanggal Survei", esc(fmtDate(v.hariTanggal))),
    kvRow("Petugas Survei", esc(v.petugasSurvei || "-")),
    kvRow(
      "Jenis Survei",
      esc(v.jenisSurvei === "lainnya"
        ? `Lainnya: ${v.jenisSurveiLainnya || ""}`
        : (v.jenisSurvei || "-"))
    ),
    kvRow("Nama Korban", esc(v.namaKorban || "-")),
    kvRow("No. Berkas", esc(v.noBerkas || "-")),
    kvRow("Alamat Korban", esc(v.alamatKorban || "-")),
    kvRow("Tempat/Tgl. Kecelakaan", `${esc(v.tempatKecelakaan || "-")} / ${esc(fmtDate(v.tanggalKecelakaan))}`),
    kvRow("Kesesuaian Hubungan AW", v.hubunganSesuai === "" ? "-" : (v.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")),
  ].join("");

  const sumberRows = (v.sumbers?.length ? v.sumbers : [{identitas:"",ttd:""}])
    .map((r, i) => `
      <tr>
        <td style="border:0.6pt solid #000;padding:4pt;text-align:center;width:22pt">${i + 1}</td>
        <td style="border:0.6pt solid #000;padding:4pt">${esc(r.identitas || "")}</td>
        <td style="border:0.6pt solid #000;padding:4pt;width:120pt">${esc(r.ttd || "")}</td>
      </tr>
    `).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Laporan Hasil Survei (DOC)</title>
  <style>
    /* CSS sederhana yang disukai Microsoft Word */
    body{ font-family:"Times New Roman",serif; font-size:11pt; color:#000; margin:0 }
    .page{ width: 180mm; margin: 12mm auto }
    h1{ margin:0; font-size:16pt; text-align:center; font-weight:bold }
    h2{ margin:2pt 0 8pt; font-size:12pt; text-align:center }
    table{ border-collapse:collapse; width:100% }
    .kv td{ padding:3pt 4pt; vertical-align:top }
    .tbl th,.tbl td{ border:0.6pt solid #000; padding:4pt; vertical-align:top }
    .box{ border:0.6pt solid #000; min-height:110pt; padding:4pt; white-space:pre-wrap }
    .signRow td{ vertical-align:top; width:50% }
    .signLbl{ margin:10pt 0 16pt }
    .ttdBox{ height:85pt }
    .ttdImg{ max-height:85pt }
    .name{ font-weight:bold; text-decoration:underline }
  </style>
</head>
<body>
  <div class="page">
    <h1>LAPORAN HASIL SURVEI</h1>
    <h2>APLIKASI MOBILE PELAYANAN</h2>

    <table class="kv">
      ${kv}
    </table>

    <div style="font-weight:bold;margin:8pt 0 4pt">Sumber Informasi :</div>
    <table class="tbl">
      <thead>
        <tr>
          <th style="width:22pt">No</th>
          <th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th>
          <th style="width:120pt">Tanda Tangan</th>
        </tr>
      </thead>
      <tbody>
        ${sumberRows}
      </tbody>
    </table>

    <div style="font-weight:bold;margin:10pt 0 4pt">Uraian & Kesimpulan Hasil Survei :</div>
    <div class="box">${esc(v.uraian || "")}</div>

    <p style="margin:10pt 0">
      Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
    </p>

    <table class="signRow">
      <tr>
        <td>
          <div class="signLbl">Mengetahui,</div>
          <div class="ttdBox">
            ${v.ttdSrc ? `<img class="ttdImg" src="${v.ttdSrc}" />` : "&nbsp;"}
          </div>
          <div class="name">${esc(v.pejabatMengetahuiName)}</div>
          <div>${esc(v.pejabatMengetahuiJabatan)}</div>
        </td>
        <td>
          <div class="signLbl">Petugas Survei,</div>
          <div class="ttdBox"></div>
          <div class="name">${esc(v.petugasSurvei || "")}</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/* =========================================================
   CSS SCREEN (kawaii + responsif)
   ========================================================= */
const css = `
/* ---------- base ---------- */
.sv-wrap{
  --accent:${THEME.accent}; --accent-strong:${THEME.accentStrong};
  --ring:${THEME.ring}; --ring-2:${THEME.ring2}; --ink:#2b2326; --muted:#776b71;
  color:var(--ink);
  overflow-x: clip; /* anti geser kanan-kiri di HP */
}
.sv-wrap, .sv-wrap *{ box-sizing: border-box }

/* container padding agar pas di HP */
.sv-wrap.container{ padding-inline: clamp(10px,3.6vw,18px) }

/* ---------- header ---------- */
.head{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap }
.title{ margin:0; font-size:20px; font-weight:900; color:var(--accent-strong) }
.chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:6px }
.chip{ background:#FFF1F0; border:1.5px solid var(--ring-2); border-radius:999px; padding:6px 10px; font-weight:800; font-size:12px }
.chip.alt{ background:#FFE9E7 }
.right-controls{ display:flex; gap:8px; flex-wrap:wrap; margin-left:auto }

/* ---------- cards & grid ---------- */
.card{
  background:#fff; border:2px solid var(--ring-2); border-radius:16px;
  padding:clamp(14px,2.2vw,18px); margin-bottom:12px;
  box-shadow:0 10px 28px rgba(247,199,196,.25);
  overflow:hidden;
}
.card > *{ min-width:0 } /* penting supaya anak grid nggak memaksa melebar */

:root{
  --sv-gap: clamp(10px, 3vw, 16px);
  --sv-col-2-min: clamp(240px, 90vw, 340px); /* lebih kecil biar muat HP */
  --sv-col-3-min: clamp(180px, 44vw, 240px);
}

.row{
  display:grid;
  grid-auto-flow: row dense;
  grid-template-columns: repeat(auto-fit, minmax(var(--sv-col-2-min), 1fr));
  gap: var(--sv-gap);
  align-items: start;
}
.row-3{
  display:grid;
  grid-auto-flow: row dense;
  grid-template-columns: repeat(auto-fit, minmax(var(--sv-col-3-min), 1fr));
  gap: var(--sv-gap);
  align-items: start;
}
.row-auto-1{ display:grid; grid-template-columns:1fr; gap:var(--sv-gap) }
.row-auto-2{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:var(--sv-gap) }
.row-auto-3{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:var(--sv-gap) }

/* ---------- form controls ---------- */
.label{ font-weight:800; margin-bottom:8px; display:block }
.hint{ color:#c06; font-weight:800 }
.input,.select,.textarea{
  width:100%; padding:12px 14px; border-radius:12px; border:2px solid var(--ring-2);
  background:#FFF6F5; outline:none; font-size:15px; color:var(--ink); min-width:0;
}
.input:focus,.select:focus,.textarea:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--ring) }

/* mic di kanan input */
.with-mic{ display:grid; grid-template-columns:1fr 44px; gap:10px; align-items:center }
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:.4rem; border-radius:14px; padding:10px 14px; font-weight:800; cursor:pointer; border:2px solid transparent }
.btn.ghost{ background:#FFE9E7; border-color:#F3B6B2; color:#6b2a35 }
.btn.rose{ background:#F7C7C4; border-color:#F3B6B2; color:#3b0a1a }
.btn.small{ padding:6px 10px; font-size:12px }
.btn.mic{ background:#fff; border:2px solid var(--ring-2) }

/* ---------- tabel sumber info (responsif) ---------- */
.table-like{ display:grid; grid-template-columns:56px 1fr minmax(170px,240px); border:2px solid var(--ring-2); border-radius:12px; overflow:hidden }
.th,.td{ padding:10px; border-bottom:1px solid #efefef; background:#fff }
.th{ font-weight:900; background:#FFF4F4 }
.td.no{ text-align:center }

@media (max-width:720px){
  .table-like{ display:block }
  .th{ display:none }
  .td{ display:block; border-bottom:1px solid #efefef }
  .td.no::before{ content:"No"; display:block; font-weight:900; margin-bottom:6px }
  .td:nth-child(3)::before{ content:"Tanda Tangan"; display:block; font-weight:900; margin-bottom:6px }
}

/* ---------- lampiran ---------- */
.grid-attach{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap:12px;
}
.filepick{ min-width:0 } /* cegah overflow */
.filepick input[type="file"]{ max-width:100% } /* tombol file tidak memaksa lebar */
.filepick .helper{ font-size:12px; color:#6b6b6b; margin-top:6px; word-break: break-word }

.thumbs{ display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
.thumbs img{ width:clamp(72px, 9vw, 96px); height:clamp(72px, 9vw, 96px); object-fit:cover; border-radius:8px; border:1px solid #eee }

/* ---------- pill ---------- */
.seg{ display:flex; gap:10px; flex-wrap:wrap }
.pill{ display:inline-flex; align-items:center; gap:8px; border:2px solid var(--ring-2); padding:8px 12px; border-radius:999px; background:#fff; cursor:pointer }
.pill input{ accent-color:#c45 }
.pill.active{ background:#FFE9EF; border-color:#F3B6B2 }

/* ---------- misc ---------- */
.ttd-preview img{ height:56px; margin-top:6px }
.actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:10px; flex-wrap:wrap }

/* =======================================================
   MOBILE FIRST OVERRIDES
   ======================================================= */
@media (max-width:768px){
  .row,.row-3,.row-auto-1,.row-auto-2,.row-auto-3{
    grid-template-columns:1fr !important;
    gap:var(--sv-gap);
  }
  .with-mic{ grid-template-columns:1fr; gap:8px }
  .btn.mic{ width:44px; height:44px; justify-self:end }
  .input,.select,.textarea{ font-size:16px; min-height:44px; padding:12px 14px } /* anti-zoom mobile */
  .textarea{ min-height:96px; resize:vertical }
  .label{ font-size:clamp(13px,3.6vw,15px) }
  .actions{ justify-content:space-between; gap:12px }
}

/* tablet */
@media (min-width:769px) and (max-width:1024px){
  .row{ grid-template-columns:repeat(2,minmax(0,1fr)) }
  .row-3{ grid-template-columns:repeat(3,minmax(0,1fr)) }
}

/* very small phones */
@media (max-width:360px){
  .input,.select,.textarea{ padding:11px 12px }
}
`;

