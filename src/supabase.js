import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lmkjhwwaatnxjcbkudnc.supabase.co'
const supabaseKey = 'sb_publishable_azMt_u-sadnmlGDWX42ofw_3RQifb36'

export const supabase = createClient(supabaseUrl, supabaseKey)