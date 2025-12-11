import { supabase } from './supabase'
import { getSiteUrl } from './site-config'

export async function signUp(email: string, password: string, username: string) {
  // Check if username is already taken (allow error to be silent if table doesn't allow reads)
  try {
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    if (existingUser) {
      throw new Error('Username already taken')
    }
  } catch (error) {
    // Continue anyway - RLS might be blocking reads
  }

  // 1. Sign up with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      },
      emailRedirectTo: getSiteUrl('/auth/callback'),
    },
  })

  if (authError) {
    throw authError
  }

  // 2. Create user profile in users table
  if (authData.user) {
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert([
        {
          id: authData.user.id,
          username,
          email,
          role: 'user',
        },
      ])
      .select()
      .single()

    if (profileError) {
      // If it's a duplicate key error, the user might already exist (race condition)
      if (profileError.code === '23505') {
        // User profile already exists, continue
      } else {
        // For other errors (like RLS policy issues), throw to show the error
        throw new Error(`Failed to create user profile: ${profileError.message}`)
      }
    }
  }

  return authData
}

export async function signIn(emailOrUsername: string, password: string) {
  // Check if input is an email or username
  const isEmail = emailOrUsername.includes('@')
  
  let email = emailOrUsername
  
  // If it's a username, look up the email
  if (!isEmail) {
    const { data: userData, error: lookupError } = await supabase
      .from('users')
      .select('email')
      .eq('username', emailOrUsername)
      .single()
    
    if (lookupError || !userData) {
      throw new Error('Invalid username or password')
    }
    
    email = userData.email
  }
  
  // Sign in with email
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

