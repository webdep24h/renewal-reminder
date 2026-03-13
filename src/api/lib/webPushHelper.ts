/**
 * Web Push Helper for Cloudflare Workers
 * Uses fetch() and Web Crypto API instead of web-push npm package
 * (web-push uses Node.js crypto which is not available in CF Workers)
 */

export interface PushSubscription {
  endpoint: string
  keys_p256dh: string
  keys_auth: string
}

export interface VapidConfig {
  vapidPublic: string
  vapidPrivate: string
  vapidSubject: string
  supabase?: any
}

/**
 * Send Web Push notification using VAPID
 * Compatible with Cloudflare Workers (uses Web Crypto API)
 */
export async function sendWebPush(
  subscriptions: PushSubscription[],
  payload: string,
  config: VapidConfig
): Promise<number> {
  let sent = 0
  const { vapidPublic, vapidPrivate, vapidSubject, supabase } = config

  for (const sub of subscriptions) {
    try {
      const result = await sendPushToSubscription(sub, payload, {
        vapidPublic,
        vapidPrivate,
        vapidSubject,
      })
      if (result) sent++
    } catch (err: any) {
      // Remove expired subscriptions (410 Gone, 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404 || err.status === 410 || err.status === 404) {
        if (supabase) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
      console.error('[webpush] Error sending to subscription:', err.message)
    }
  }
  return sent
}

/**
 * Send a push notification to a single subscription
 * Uses the Push API protocol with VAPID authentication
 */
async function sendPushToSubscription(
  subscription: PushSubscription,
  payload: string,
  vapid: { vapidPublic: string; vapidPrivate: string; vapidSubject: string }
): Promise<boolean> {
  const { endpoint, keys_p256dh, keys_auth } = subscription
  const { vapidPublic, vapidPrivate, vapidSubject } = vapid

  // Parse endpoint to get origin for VAPID aud claim
  const endpointUrl = new URL(endpoint)
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`

  // Build VAPID JWT
  const vapidJwt = await buildVapidJwt(vapidPublic, vapidPrivate, vapidSubject, audience)

  // Encrypt the payload using ECDH + AES-GCM
  const encryptedPayload = await encryptPayload(payload, keys_p256dh, keys_auth)

  // Send the push request
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(encryptedPayload.byteLength),
      'TTL': '86400',
      'Authorization': `vapid t=${vapidJwt}, k=${vapidPublic}`,
    },
    body: encryptedPayload,
  })

  if (!response.ok && response.status !== 201) {
    const err: any = new Error(`Push failed: ${response.status}`)
    err.statusCode = response.status
    throw err
  }
  return true
}

/**
 * Build VAPID JWT using Web Crypto API
 */
async function buildVapidJwt(
  publicKey: string,
  privateKey: string,
  subject: string,
  audience: string
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const unsignedToken = `${encode(header)}.${encode(payload)}`

  // Import VAPID private key
  const privKeyBytes = base64UrlDecode(privateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${unsignedToken}.${sigB64}`
}

/**
 * Encrypt push payload using ECDH + AES-128-GCM (RFC 8291 / aes128gcm)
 */
async function encryptPayload(
  payload: string,
  clientPublicKeyB64: string,
  authSecretB64: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(payload)

  // Decode client keys
  const clientPublicKey = base64UrlDecode(clientPublicKeyB64)
  const authSecret = base64UrlDecode(authSecretB64)

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    serverKeyPair.privateKey,
    256
  )

  // Export server public key
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF to derive IKM (input key material)
  const prk = await hkdf(
    new Uint8Array(authSecret),
    new Uint8Array(sharedSecret),
    concat(
      encoder.encode('Content-Encoding: auth\0'),
      new Uint8Array(0)
    ),
    32
  )

  // Derive content encryption key
  const serverPubBytes = new Uint8Array(serverPublicKey)
  const context = concat(
    encoder.encode('P-256\0'),
    new Uint8Array(2),
    clientPublicKey,
    new Uint8Array(2),
    serverPubBytes
  )

  // CEK + nonce derivation using HKDF with salt
  const keyInfoBase = concat(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array(0))
  const nonceInfoBase = concat(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array(0))

  const cekHkdf = await hkdf(salt, prk, keyInfoBase, 16)
  const nonceHkdf = await hkdf(salt, prk, nonceInfoBase, 12)

  // Encrypt with AES-128-GCM
  const cryptoKey = await crypto.subtle.importKey('raw', cekHkdf, { name: 'AES-GCM' }, false, ['encrypt'])

  // Pad and encrypt
  const padded = concat(plaintext, new Uint8Array([2])) // record delimiter
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceHkdf },
    cryptoKey,
    padded
  )

  // Build aes128gcm content-encoding header (RFC 8188)
  const header = new Uint8Array(21 + serverPubBytes.length)
  const dv = new DataView(header.buffer)
  header.set(salt, 0)
  dv.setUint32(16, 4096, false) // record size
  dv.setUint8(20, serverPubBytes.length) // key id length
  header.set(serverPubBytes, 21)

  return concat(header, new Uint8Array(ciphertext))
}

/** HKDF helper */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm))

  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const t = concat(info, new Uint8Array([1]))
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, t))
  return okm.slice(0, length)
}

/** Concatenate Uint8Arrays */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

/** Base64url decode to Uint8Array */
function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
