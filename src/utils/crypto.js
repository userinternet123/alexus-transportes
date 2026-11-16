/*metodo de encryptado para payload y response*/

const ALGORITHM = "AES-GCM";
 
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
 
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
 
  return bytes;
}
 
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
 
async function getKey() {
  const keyHex = import.meta.env.VITE_ENCRYPTION_KEY;
 
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("encriptacion inválida.");
  }
 
  const keyBytes = hexToBytes(keyHex);
 
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: ALGORITHM
    },
    false,
    ["encrypt"]
  );
}
 
export async function encryptData(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey();
  const jsonData = JSON.stringify(data);
  const encodedData = new TextEncoder().encode(jsonData);
 
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv
    },
    key,
    encodedData
  );
 
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const tag = encryptedBytes.slice(encryptedBytes.length - 16);
  const payload = encryptedBytes.slice(0, encryptedBytes.length - 16);
 
  return {
    payload: bytesToHex(payload),
    iv: bytesToHex(iv),
    tag: bytesToHex(tag)
  };
}

export async function decryptData({ payload, iv, tag }) {
  const keyHex = import.meta.env.VITE_ENCRYPTION_KEY;
 
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("encriptacion inválida..");
  }
 
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
 
  const payloadBytes = hexToBytes(payload);
  const tagBytes = hexToBytes(tag);
  const ivBytes = hexToBytes(iv);
  const encryptedWithTag = new Uint8Array(payloadBytes.length + tagBytes.length);

  encryptedWithTag.set(payloadBytes);
  encryptedWithTag.set(tagBytes, payloadBytes.length);
 
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes
    },
    key,
    encryptedWithTag
  );
 
  const decryptedText = new TextDecoder().decode(decryptedBuffer);
 
  return JSON.parse(decryptedText);
} 

export async function encryptUrlParam(value) {
  const encrypted = await encryptData(value);
 
  const encryptedString = `${encrypted.payload}.${encrypted.iv}.${encrypted.tag}`;
 
  return encodeURIComponent(encryptedString);
}
 