export function validatePracticeFile(base64: string, mimeType: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Invalid file encoding");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 5242880) throw new Error("Maximum file size is 5 MB");
  if (mimeType === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Invalid PDF");
  if (mimeType === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("Invalid PNG");
  if (mimeType === "image/jpeg" && bytes.subarray(0, 3).toString("hex") !== "ffd8ff")
    throw new Error("Invalid JPEG");
  if (
    mimeType === "text/csv" &&
    (bytes.includes(0) || bytes.subarray(0, 1024).toString().trimStart().startsWith("<"))
  )
    throw new Error("Invalid CSV");
  return bytes;
}
