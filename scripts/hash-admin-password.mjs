import crypto from "node:crypto";
const password=process.argv[2];
if(!password||password.length<14){
  console.error("Usage: node scripts/hash-admin-password.mjs '<password of at least 14 characters>'");
  process.exit(1);
}
const salt=crypto.randomBytes(16);
const hash=crypto.scryptSync(password,salt,64);
console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
