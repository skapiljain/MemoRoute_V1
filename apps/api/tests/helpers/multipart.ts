export function multipart(
  parts: Array<{
    name: string
    value: string | Buffer
    filename?: string
    type?: string
  }>,
): { body: Buffer; contentType: string } {
  const boundary = '----mindEchoBoundary'
  const chunks: Buffer[] = []

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if (Buffer.isBuffer(part.value)) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? 'explanation.webm'}"\r\nContent-Type: ${part.type ?? 'audio/webm'}\r\n\r\n`,
        ),
      )
      chunks.push(part.value)
      chunks.push(Buffer.from('\r\n'))
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
        ),
      )
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}
