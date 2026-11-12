// Prints the secrets docker-compose.yml needs, ready to paste into .env:  node scripts/gen-secrets.mjs
// ANON_KEY / SERVICE_ROLE_KEY are HS256 JWTs signed with JWT_SECRET (what Supabase's own docs ask you to generate).
import { createHmac, randomBytes } from "node:crypto"

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url")
const sign = (payload, secret) => {
  const data = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}`
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`
}

const jwtSecret = randomBytes(32).toString("hex")
const iat = Math.floor(Date.now() / 1000)
const exp = iat + 10 * 365 * 24 * 3600
const key = (role) => sign({ role, iss: "supabase", iat, exp }, jwtSecret)

console.log(`POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`)
console.log(`JWT_SECRET=${jwtSecret}`)
console.log(`ANON_KEY=${key("anon")}`)
console.log(`SERVICE_ROLE_KEY=${key("service_role")}`)
console.log(`DRIVE_TOKEN_KEY=${randomBytes(32).toString("base64")}`)
console.log(`CRON_SECRET=${randomBytes(32).toString("hex")}`)
