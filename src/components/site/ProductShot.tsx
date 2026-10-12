/**
 * A real screenshot of the product, taken on the sample files at /samples.
 * Used on the marketing pages instead of drawn mock-ups, so what a visitor
 * sees is what they get after signing up.
 */
export default function ProductShot({
  src,
  alt,
  caption = "The product on sample files. Try it with the same files after you sign up.",
  eager = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  eager?: boolean;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(23,18,8,.12)",
          boxShadow: "0 30px 60px -30px rgba(42,17,9,.35), 0 8px 20px -12px rgba(42,17,9,.2)",
          background: "#FBF7F0",
        }}
      >
        <img
          src={src}
          alt={alt}
          width={1440}
          height={900}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>
      {caption && (
        <figcaption style={{ fontSize: 12.5, color: "rgba(23,18,8,.6)", marginTop: 10, textAlign: "center" }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
