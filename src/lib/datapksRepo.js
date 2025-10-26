import { supabase } from "./supabaseClient";

// mapping camelCase → snake_case
const mapToDb = (r) => ({
  local_id: r.id ?? r.local_id ?? null,
  nama_rs: r.namaRS,
  wilayah: r.wilayah,
  masa_berlaku: Number(r.masaBerlaku),
  tgl_awal: r.tglAwal,
  tgl_akhir: r.tglAkhir,
  no_perjanjian_rs: r.noRS || null,
  no_perjanjian_jr: r.noJR || null,
});

const mapFromDb = (d) => ({
  id: d.local_id || d.id,               // utamakan local_id untuk sinkron UI
  _row_id: d.id,                        // simpan uuid row aslinya kalau perlu
  namaRS: d.nama_rs,
  wilayah: d.wilayah,
  masaBerlaku: d.masa_berlaku,
  tglAwal: d.tgl_awal,
  tglAkhir: d.tgl_akhir,
  noRS: d.no_perjanjian_rs,
  noJR: d.no_perjanjian_jr,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

export async function fetchAllDataPks() {
  const { data, error } = await supabase
    .from("datapks")
    .select("*")
    .order("tgl_akhir", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapFromDb);
}

export async function upsertDataPks(row) {
  const payload = mapToDb(row);
  // pakai onConflict: local_id supaya gampang edit dari app
  const { data, error } = await supabase
    .from("datapks")
    .upsert(payload, { onConflict: "local_id" })
    .select("*")
    .single();

  if (error) throw error;
  return mapFromDb(data);
}

export async function deleteDataPksByLocalId(localId) {
  const { error } = await supabase
    .from("datapks")
    .delete()
    .eq("local_id", localId);
  if (error) throw error;
}

export async function bulkUpsertDataPks(rows) {
  const payload = rows.map(mapToDb);
  const { data, error } = await supabase
    .from("datapks")
    .upsert(payload, { onConflict: "local_id" })
    .select("*");
  if (error) throw error;
  return (data || []).map(mapFromDb);
}