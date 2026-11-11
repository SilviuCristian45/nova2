import { redirect } from "next/navigation"
import { Text } from "@/app/components/language-provider"
import { Message, Screen } from "@/app/components/ui"
import { PHOTO_BUCKET, type PhotoRow } from "@/lib/photos"
import { createClient } from "@/lib/supabase/server"
import PhotoGallery from "./photo-gallery"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Signed links stay valid for an hour; the page is rendered again after every upload or delete.
const LINK_SECONDS = 3600

export default async function PhotosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // At most 200 photos per account (a database policy), so a single query is enough.
  const { data, error } = await supabase.from("progress_photos")
    .select("id, taken_on, pose, note, path, size_bytes").eq("user_id", user.id)
    .order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000)

  const title = <Text ro="Poze de progres" en="Progress photos" />
  if (error) {
    const setup = error.code === "PGRST205" || error.code === "42P01"
    return (
      <Screen title={title}>
        <Message>
          {setup
            ? <Text ro="Rulează migrația 202611110001_progress_photos.sql în Supabase." en="Run the 202611110001_progress_photos.sql migration in Supabase." />
            : <><Text ro="Nu s-au putut încărca pozele:" en="Could not load the photos:" /> {error.message}</>}
        </Message>
      </Screen>
    )
  }

  const rows = (data ?? []) as PhotoRow[]
  const urls = new Map<string, string>()
  if (rows.length > 0) {
    const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((row) => row.path), LINK_SECONDS)
    for (const item of signed.data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  const photos = rows.filter((row) => urls.has(row.path)).map((row) => ({ ...row, url: urls.get(row.path)! }))

  return (
    <Screen title={title}>
      <PhotoGallery userId={user.id} photos={photos} />
    </Screen>
  )
}
