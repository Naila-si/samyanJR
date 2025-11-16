import * as React from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BUCKET = 'foto-survey'

async function toSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

export default function FotoSurveyCell({ row }) {
  const [urls, setUrls] = React.useState([])

  React.useEffect(() => {
    const run = async () => {
      const paths = row.foto_survey_paths || []
      if (paths.length > 0) {
        const us = await Promise.all(paths.map((p) => toSignedUrl(p)))
        setUrls(us)
      } else {
        // fallback base64 lama
        try {
          const arr = Array.isArray(row.foto_survey)
            ? row.foto_survey
            : JSON.parse(row.foto_survey || '[]')
          setUrls(arr.map((i) => i?.dataURL).filter(Boolean))
        } catch {
          setUrls([])
        }
      }
    }
    run()
  }, [row])

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {urls.map((u, i) => (
        <img
          key={i}
          src={u}
          alt={`foto_${i}`}
          style={{ maxWidth: 120, borderRadius: 8 }}
        />
      ))}
    </div>
  )
}
