export default function DokumenPage() {
  const files = [
    { name: "Formulir Klaim", url: "/files/formulir-klaim.pdf" },
    { name: "Panduan Pengisian", url: "/files/panduan-pengisian.pdf" },
    { name: "Surat Pernyataan Ahli Waris", url: "/files/surat-ahli-waris.docx" },
  ];

  return (
    <div className="container">
      <h1>Dokumen</h1>
      <p>Silakan unduh dokumen yang dibutuhkan untuk proses pengajuan klaim.</p>

      <ul className="file-list">
        {files.map((file) => (
          <li key={file.name}>
            <a href={file.url} download className="btn-download">
              📄 {file.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
