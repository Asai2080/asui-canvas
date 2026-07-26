type NormalizeVideoReferenceSourceOptions = {
  fetchSource?: (source: string) => Promise<Response>
  resolveLocalAsset?: (source: string) => Promise<string | null>
  toDataUrl?: (blob: Blob) => Promise<string>
}

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("本地参考图片读取失败"))
    }
    reader.onerror = () => reject(reader.error ?? new Error("本地参考图片读取失败"))
    reader.readAsDataURL(blob)
  })

export async function normalizeVideoReferenceSource(
  source: string,
  options: NormalizeVideoReferenceSourceOptions = {}
) {
  let resolvedSource = source
  if (resolvedSource.startsWith("asset:")) {
    if (!options.resolveLocalAsset) {
      throw new Error("画布中的本地参考图片尚未解析，请重新选择视频节点后再试")
    }
    resolvedSource = (await options.resolveLocalAsset(resolvedSource)) ?? ""
    if (!resolvedSource) {
      throw new Error("画布中的本地参考图片读取失败，请重新放入图片后再试")
    }
  }

  if (!resolvedSource.startsWith("blob:")) return resolvedSource

  const fetchSource = options.fetchSource ?? ((value: string) => fetch(value))
  const response = await fetchSource(resolvedSource)
  if (!response.ok) {
    throw new Error("画布中的本地参考图片读取失败，请重新放入图片后再试")
  }

  const blob = await response.blob()
  return (options.toDataUrl ?? readBlobAsDataUrl)(blob)
}
