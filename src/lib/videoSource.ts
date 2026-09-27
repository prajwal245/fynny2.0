/** True when the URL points at a direct video file (self-hosted in storage) rather than an embed page. */
export function isSelfHostedVideo(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return /\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(clean);
}
